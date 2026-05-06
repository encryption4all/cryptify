mod config;
mod email;
mod error;
mod store;

use crate::config::{validate_api_key, CryptifyConfig};
use crate::email::send_email;
use crate::error::{Error, PayloadTooLargeBody};
use crate::store::{
    API_KEY_PER_UPLOAD_LIMIT, API_KEY_ROLLING_LIMIT, PER_UPLOAD_LIMIT, ROLLING_LIMIT,
    ROLLING_WINDOW_SECS,
};

use std::path::Path;
use std::str::FromStr;

use pg_core::api::Parameters;
use pg_core::artifacts::VerifyingKey;
use pg_core::client::rust::stream::UnsealerStreamConfig;
use pg_core::client::Unsealer;

use tokio_util::compat::TokioAsyncReadCompatExt;

use sha2::Digest;
use std::fmt::Write;

use rocket::fs::FileServer;
use rocket::tokio::{
    fs::{File, OpenOptions},
    io::{AsyncSeekExt, AsyncWriteExt},
};
use rocket::{
    data::ToByteUnit, fairing::AdHoc, get, http::Header, launch, post, put, request::FromRequest,
    response::Responder, routes, serde::json::Json, Data, State,
};

use rocket::http::Method;
use rocket_cors::{AllowedOrigins, CorsOptions};

use serde::{Deserialize, Serialize};
use store::{FileState, Store};

#[derive(Serialize, Deserialize)]
struct InitBody {
    recipient: String,
    #[serde(rename = "mailContent")]
    mail_content: String,
    #[serde(rename = "mailLang")]
    mail_lang: email::Language,
    confirm: bool,
    /// Whether to email each recipient with a download link. Optional;
    /// defaults to `true` to preserve existing client behaviour. Set to
    /// `false` when the encrypted payload reaches the recipients through
    /// another channel (e.g. an email add-in delivering the message from
    /// the user's own mailbox) and a Cryptify-sent notification would be
    /// a duplicate. The recipient list itself is still validated and
    /// stored — only the SMTP delivery is skipped.
    #[serde(rename = "notifyRecipients", default = "default_true")]
    notify_recipients: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize)]
#[serde(rename = "camelCase")]
struct InitResponse {
    uuid: String,
}

struct CryptifyToken(String);

impl From<CryptifyToken> for Header<'static> {
    fn from(token: CryptifyToken) -> Header<'static> {
        Header::new("cryptifytoken", token.0)
    }
}

#[derive(Responder)]
struct InitResponder {
    inner: Json<InitResponse>,
    cryptify_token: CryptifyToken,
}

#[get("/health")]
fn health() -> &'static str {
    "OK"
}

/// Validated `X-Api-Key`. `Some(tenant)` only when the header value matches
/// a configured key in `CryptifyConfig::api_keys` (compared by sha256 hash).
/// A missing, empty, or unrecognised value yields `None` and the caller is
/// treated as the default (lower-quota) tier.
struct ApiKey(Option<String>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApiKey {
    type Error = ();
    async fn from_request(req: &'r rocket::Request<'_>) -> rocket::request::Outcome<Self, ()> {
        let header = req.headers().get_one("X-Api-Key");
        let configured = req
            .rocket()
            .state::<CryptifyConfig>()
            .map(|c| c.api_keys())
            .unwrap_or(&[]);
        let tenant = validate_api_key(header, configured);
        rocket::request::Outcome::Success(ApiKey(tenant))
    }
}

#[post("/fileupload/init", data = "<request>")]
async fn upload_init(
    config: &State<CryptifyConfig>,
    store: &State<Store>,
    api_key: ApiKey,
    request: Json<InitBody>,
) -> Result<InitResponder, Error> {
    let current_time = chrono::offset::Utc::now().timestamp();
    let uuid = uuid::Uuid::new_v4().hyphenated().to_string();

    match File::create(Path::new(config.data_dir()).join(&uuid)).await {
        Ok(v) => v,
        Err(e) => {
            log::error!("{}", e);
            return Err(Error::InternalServerError(None));
        }
    };

    let init_cryptify_token = bytes_to_hex(&rand::random::<[u8; 32]>());

    match request.recipient.parse() {
        Ok(recipient) => {
            store.create(
                uuid.clone(),
                FileState {
                    cryptify_token: init_cryptify_token.clone(),
                    uploaded: 0,
                    expires: current_time + 1_209_600,
                    recipients: recipient,
                    mail_content: request.mail_content.clone(),
                    mail_lang: request.mail_lang.clone(),
                    sender: None,
                    sender_attributes: Vec::new(),
                    confirm: request.confirm,
                    notify_recipients: request.notify_recipients,
                    api_key_tenant: api_key.0,
                },
            );

            Ok(InitResponder {
                inner: Json(InitResponse { uuid }),
                cryptify_token: CryptifyToken(init_cryptify_token),
            })
        }
        Err(e) => Err(Error::BadRequest(Some(format!(
            "Could not parse e-mail address: {}",
            e
        )))),
    }
}

struct ContentRange {
    size: Option<u64>,
    start: Option<u64>,
    end: Option<u64>,
}

impl FromStr for ContentRange {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut parts = s.split_whitespace();
        let unit = parts.next().ok_or("Missing unit")?;
        let range = parts.next().ok_or("Missing range")?;
        if parts.next().is_some() {
            return Err("Excess data".into());
        }
        if unit != "bytes" {
            return Err(format!("Unknown unit {}", unit));
        }
        let mut rangeparts = range.split('/');
        let range = rangeparts
            .next()
            .ok_or("Missing lower-upper part of range")?;
        let size = rangeparts.next().ok_or("Missing size part of range")?;
        if rangeparts.next().is_some() {
            return Err("Excess data in range".into());
        }
        let size = if size != "*" {
            Some(size.parse::<u64>().map_err(|e| e.to_string())?)
        } else {
            None
        };
        if range != "*" {
            let mut rangeparts = range.split('-');
            let start = rangeparts
                .next()
                .ok_or("Missing start of range")?
                .parse::<u64>()
                .map_err(|e| e.to_string())?;
            let end = rangeparts
                .next()
                .ok_or("Missing end of range")?
                .parse::<u64>()
                .map_err(|e| e.to_string())?;
            Ok(ContentRange {
                size,
                start: Some(start),
                end: Some(end),
            })
        } else {
            Ok(ContentRange {
                size,
                start: None,
                end: None,
            })
        }
    }
}

struct UploadHeaders {
    cryptify_token: String,
    content_range: ContentRange,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for UploadHeaders {
    type Error = String;

    async fn from_request(
        request: &'r rocket::Request<'_>,
    ) -> rocket::request::Outcome<Self, Self::Error> {
        let cryptify_token = match request.headers().get_one("CryptifyToken") {
            Some(cryptify_token) => cryptify_token,
            None => {
                return rocket::request::Outcome::Error((
                    rocket::http::Status::BadRequest,
                    "Missing Cryptify Token header".into(),
                ))
            }
        }
        .to_string();
        let content_range = match request.headers().get_one("Content-Range") {
            Some(content_range) => content_range,
            None => {
                return rocket::request::Outcome::Error((
                    rocket::http::Status::BadRequest,
                    "Missing content range".into(),
                ))
            }
        }
        .parse::<ContentRange>();
        let content_range = match content_range {
            Ok(v) => v,
            Err(e) => {
                return rocket::request::Outcome::Error((rocket::http::Status::BadRequest, e))
            }
        };

        rocket::request::Outcome::Success(UploadHeaders {
            cryptify_token,
            content_range,
        })
    }
}

#[derive(Responder)]
struct UploadResponder {
    body: (),
    cryptify_token: CryptifyToken,
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(2 * bytes.len());
    for byte in bytes {
        write!(s, "{:02x}", byte).unwrap();
    }
    s
}

fn compute_hash(cryptify_token: &[u8], data: &[u8]) -> String {
    let mut hash = sha2::Sha256::new();
    hash.update(cryptify_token);
    hash.update(data);
    bytes_to_hex(&hash.finalize())
}

fn check_cryptify_token(header: &str, expected: &str) -> Result<(), Error> {
    if header != expected {
        return Err(Error::BadRequest(Some(
            "Cryptify Token header does not match".to_owned(),
        )));
    }
    Ok(())
}

#[put("/fileupload/<uuid>", data = "<data>")]
async fn upload_chunk(
    config: &State<CryptifyConfig>,
    store: &State<Store>,
    uuid: &str,
    headers: UploadHeaders,
    data: Data<'_>,
) -> Result<Option<UploadResponder>, Error> {
    let state = match store.get(uuid) {
        Some(v) => v,
        None => return Ok(None),
    };
    let mut state = state.lock().await;

    if uuid::Uuid::parse_str(uuid).is_err() {
        return Ok(None);
    }

    let start = headers
        .content_range
        .start
        .ok_or_else(|| Error::BadRequest(Some("Could not read Content-Range start".to_owned())))?;
    let end = headers
        .content_range
        .end
        .ok_or_else(|| Error::BadRequest(Some("Could not read Content-Range start".to_owned())))?;

    if start >= end || state.uploaded != start {
        return Err(Error::BadRequest(Some(
            "Incorrect Content-Range header".to_owned(),
        )));
    }

    if end - start > config.chunk_size() {
        return Err(Error::BadRequest(Some(format!(
            "File chunk too large; the maximum is {} bytes",
            config.chunk_size()
        ))));
    }

    let per_upload_limit = if state.api_key_tenant.is_some() {
        API_KEY_PER_UPLOAD_LIMIT
    } else {
        PER_UPLOAD_LIMIT
    };
    if end > per_upload_limit {
        return Err(Error::PayloadTooLarge(PayloadTooLargeBody {
            error: format!(
                "Upload exceeds the per-upload limit of {} bytes",
                per_upload_limit
            ),
            limit: "per_upload",
            used_bytes: state.uploaded,
            limit_bytes: per_upload_limit,
            resets_at: None,
        }));
    }

    check_cryptify_token(&headers.cryptify_token, &state.cryptify_token)?;

    let mut file = match OpenOptions::new()
        .write(true)
        .open(Path::new(config.data_dir()).join(uuid))
        .await
    {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    file.seek(std::io::SeekFrom::Start(start))
        .await
        .map_err(|_| Error::InternalServerError(Some("Could not write file".to_owned())))?;

    let data = data
        .open((end - start).bytes())
        .into_bytes()
        .await
        .map_err(|_| Error::BadRequest(Some("Could not read data from request".to_owned())))?;
    if !data.is_complete() || data.len() as u64 != end - start {
        return Err(Error::BadRequest(Some("Data not complete".to_owned())));
    }

    let data = data.into_inner();
    file.write_all(&data)
        .await
        .map_err(|_| Error::InternalServerError(Some("Could not write file".to_owned())))?;

    let shasum = compute_hash(&headers.cryptify_token.into_bytes(), &data);
    state.cryptify_token = shasum.clone();

    state.uploaded += end - start;

    Ok(Some(UploadResponder {
        body: (),
        cryptify_token: CryptifyToken(shasum),
    }))
}

struct FinalizeHeaders {
    cryptify_token: String,
    content_range: ContentRange,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for FinalizeHeaders {
    type Error = String;

    async fn from_request(
        request: &'r rocket::Request<'_>,
    ) -> rocket::request::Outcome<Self, Self::Error> {
        let cryptify_token = match request.headers().get_one("CryptifyToken") {
            Some(cryptify_token) => cryptify_token,
            None => {
                return rocket::request::Outcome::Error((
                    rocket::http::Status::BadRequest,
                    "Missing Cryptify Token header".into(),
                ))
            }
        }
        .to_string();

        let content_range = match request.headers().get_one("Content-Range") {
            Some(content_range) => content_range,
            None => {
                return rocket::request::Outcome::Error((
                    rocket::http::Status::BadRequest,
                    "Missing content range".into(),
                ))
            }
        };

        let content_range = match content_range.parse::<ContentRange>() {
            Ok(v) => v,
            Err(e) => {
                return rocket::request::Outcome::Error((rocket::http::Status::BadRequest, e))
            }
        };
        rocket::request::Outcome::Success(FinalizeHeaders {
            cryptify_token,
            content_range,
        })
    }
}

#[post("/fileupload/finalize/<uuid>")]
async fn upload_finalize(
    config: &State<CryptifyConfig>,
    store: &State<Store>,
    vk: &State<Parameters<VerifyingKey>>,
    headers: FinalizeHeaders,
    uuid: &str,
) -> Result<Option<()>, Error> {
    let state = match store.get(uuid) {
        Some(v) => v,
        None => return Ok(None),
    };
    let mut state = state.lock().await;

    check_cryptify_token(&headers.cryptify_token, &state.cryptify_token)?;

    if headers.content_range.size != Some(state.uploaded) {
        return Err(Error::UnprocessableEntity(None));
    }

    let mut file = File::open(Path::new(config.data_dir()).join(uuid))
        .await
        .map_err(|_| Error::InternalServerError(Some("could not open file".to_string())))?
        .compat();

    let attributes = Unsealer::<_, UnsealerStreamConfig>::new(&mut file, &vk.public_key)
        .await
        .map_err(|_| Error::InternalServerError(Some("couldn't read postguard file".to_string())))?
        .pub_id
        .con;

    let sender = attributes
        .iter()
        .find(|x| x.atype == "pbdf.sidn-pbdf.email.email")
        .ok_or(Error::InternalServerError(Some(
            "no email attribute".to_string(),
        )))?
        .value
        .clone();

    let sender_attributes: Vec<(String, String)> = attributes
        .into_iter()
        .filter(|x| x.atype != "pbdf.sidn-pbdf.email.email")
        .filter_map(|x| {
            let atype = x.atype;
            x.value.map(|v| (atype, v))
        })
        .collect();

    let rolling_limit = if state.api_key_tenant.is_some() {
        API_KEY_ROLLING_LIMIT
    } else {
        ROLLING_LIMIT
    };
    let now_secs = chrono::offset::Utc::now().timestamp();
    // Rolling-window accounting key: when a validated API-key tenant is
    // present we account per tenant (`api-key:<tenant>`) so a single
    // tenant cannot evade quota by varying sender attributes. Otherwise
    // we fall back to per-sender email as before.
    let accounting_key = state
        .api_key_tenant
        .as_deref()
        .map(|t| format!("api-key:{}", t))
        .or_else(|| sender.clone());
    if let Some(key) = accounting_key.as_deref() {
        let usage = store.get_usage(key, now_secs);
        log::info!(
            "Rolling limit check for {} (api_key_tenant={:?}): used={} + current={} vs limit={}",
            key,
            state.api_key_tenant,
            usage.used_bytes,
            state.uploaded,
            rolling_limit
        );
        if usage.used_bytes.saturating_add(state.uploaded) > rolling_limit {
            drop(state);
            store.remove(uuid);
            let _ = rocket::tokio::fs::remove_file(Path::new(config.data_dir()).join(uuid)).await;
            let resets_at = usage
                .oldest_expires_at
                .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
                .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
            return Err(Error::PayloadTooLarge(PayloadTooLargeBody {
                error: format!(
                    "Sender has exceeded the {}-day rolling limit of {} bytes",
                    ROLLING_WINDOW_SECS / 86_400,
                    rolling_limit
                ),
                limit: "rolling_window",
                used_bytes: usage.used_bytes,
                limit_bytes: rolling_limit,
                resets_at,
            }));
        }
    }

    state.sender = sender.clone();
    state.sender_attributes = sender_attributes;

    send_email(config, &state, uuid).await.map_err(|e| {
        log::error!("{}", e);
        Error::InternalServerError(Some("could not send email".to_owned()))
    })?;

    if let Some(key) = accounting_key {
        store.record_upload(key, state.uploaded, now_secs);
    }

    Ok(Some(()))
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct UsageResponse {
    email: String,
    used_bytes: u64,
    limit_bytes: u64,
    window_days: u64,
    per_upload_limit_bytes: u64,
    resets_at: Option<String>,
}

#[get("/usage?<email>")]
fn usage(store: &State<Store>, api_key: ApiKey, email: String) -> Json<UsageResponse> {
    let (rolling_limit, per_upload_limit) = if api_key.0.is_some() {
        (API_KEY_ROLLING_LIMIT, API_KEY_PER_UPLOAD_LIMIT)
    } else {
        (ROLLING_LIMIT, PER_UPLOAD_LIMIT)
    };
    let now = chrono::offset::Utc::now().timestamp();
    // For API-key callers the rolling window is accounted per tenant, not
    // per sender email — query the same key the finalize path records under.
    let lookup_key = match api_key.0.as_deref() {
        Some(tenant) => format!("api-key:{}", tenant),
        None => email.clone(),
    };
    let usage = store.get_usage(&lookup_key, now);
    let resets_at = usage
        .oldest_expires_at
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
    Json(UsageResponse {
        email,
        used_bytes: usage.used_bytes,
        limit_bytes: rolling_limit,
        window_days: (ROLLING_WINDOW_SECS / 86_400) as u64,
        per_upload_limit_bytes: per_upload_limit,
        resets_at,
    })
}

#[launch]
async fn rocket() -> _ {
    // Extract config first so we can use chunk_size for Rocket's body-size limits.
    let config = rocket::Config::figment()
        .extract::<CryptifyConfig>()
        .expect("Missing configuration");

    // Raise Rocket's default body-size limits so chunked uploads up to
    // chunk_size do not trip "Data limit reached while reading the request
    // body". `data.open((end - start).bytes())` already caps the per-request
    // read; this lifts the framework-level cap that runs before it.
    // A small headroom above chunk_size leaves room for HTTP overhead.
    let chunk_size = config.chunk_size();
    let limits = rocket::data::Limits::default()
        .limit("bytes", (chunk_size + 1024 * 1024).bytes())
        .limit("data-form", (chunk_size + 1024 * 1024).bytes())
        .limit("file", (chunk_size + 1024 * 1024).bytes());

    let figment = rocket::Config::figment().merge(("limits", limits));
    let rocket = rocket::custom(figment);

    let pkg_params_url = format!("{}/v2/sign/parameters", config.pkg_url());
    let response = minreq::get(&pkg_params_url)
        .with_timeout(10)
        .send()
        .unwrap_or_else(|e| panic!("Failed to reach PKG at {}: {}", pkg_params_url, e));

    let vk = response
        .json::<Parameters<VerifyingKey>>()
        .unwrap_or_else(|e| {
            panic!(
                "Failed to parse verification key from {}: {}",
                pkg_params_url, e
            )
        });

    let cors = CorsOptions::default()
        .allowed_origins(AllowedOrigins::some_regex(&[config.allowed_origins()]))
        .allowed_methods(
            vec![Method::Get, Method::Post, Method::Put]
                .into_iter()
                .map(From::from)
                .collect(),
        )
        .expose_headers(["cryptifytoken"].iter().map(ToString::to_string).collect())
        .max_age(Some(86400))
        .to_cors()
        .expect("unable to configure CORS");

    rocket
        .attach(cors)
        .mount(
            "/",
            routes![health, upload_init, upload_chunk, upload_finalize, usage],
        )
        .mount("/filedownload", FileServer::from(config.data_dir()))
        .attach(AdHoc::config::<CryptifyConfig>())
        .manage(Store::new())
        .manage(vk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocket::http::{Header, Status};
    use rocket::local::asynchronous::Client;

    // Test-only route exercising the FinalizeHeaders extractor in isolation.
    // Echoes the extracted fields so the test can verify successful parsing.
    #[post("/__test/finalize_headers")]
    fn finalize_headers_echo(h: FinalizeHeaders) -> String {
        format!("{}|{}", h.cryptify_token, h.content_range.size.unwrap_or(0))
    }

    async fn headers_client() -> Client {
        let r = rocket::build().mount("/", routes![finalize_headers_echo]);
        Client::tracked(r).await.expect("valid rocket")
    }

    #[rocket::async_test]
    async fn finalize_headers_reject_missing_cryptify_token() {
        let client = headers_client().await;
        let res = client
            .post("/__test/finalize_headers")
            .header(Header::new("Content-Range", "bytes 0-99/100"))
            .dispatch()
            .await;
        assert_eq!(res.status(), Status::BadRequest);
    }

    #[rocket::async_test]
    async fn finalize_headers_reject_missing_content_range() {
        let client = headers_client().await;
        let res = client
            .post("/__test/finalize_headers")
            .header(Header::new("CryptifyToken", "abc123"))
            .dispatch()
            .await;
        assert_eq!(res.status(), Status::BadRequest);
    }

    #[rocket::async_test]
    async fn finalize_headers_reject_malformed_content_range() {
        let client = headers_client().await;
        let res = client
            .post("/__test/finalize_headers")
            .header(Header::new("CryptifyToken", "abc123"))
            .header(Header::new("Content-Range", "not a real range"))
            .dispatch()
            .await;
        assert_eq!(res.status(), Status::BadRequest);
    }

    #[rocket::async_test]
    async fn finalize_headers_extract_both_headers() {
        let client = headers_client().await;
        let res = client
            .post("/__test/finalize_headers")
            .header(Header::new("CryptifyToken", "deadbeef"))
            .header(Header::new("Content-Range", "bytes 0-99/100"))
            .dispatch()
            .await;
        assert_eq!(res.status(), Status::Ok);
        assert_eq!(res.into_string().await.as_deref(), Some("deadbeef|100"));
    }

    #[test]
    fn content_range_parses_well_formed_range() {
        let cr: ContentRange = "bytes 0-99/100".parse().unwrap();
        assert_eq!(cr.start, Some(0));
        assert_eq!(cr.end, Some(99));
        assert_eq!(cr.size, Some(100));
    }

    #[test]
    fn content_range_accepts_wildcard_range() {
        let cr: ContentRange = "bytes */100".parse().unwrap();
        assert_eq!(cr.start, None);
        assert_eq!(cr.end, None);
        assert_eq!(cr.size, Some(100));
    }

    #[test]
    fn content_range_accepts_wildcard_size() {
        let cr: ContentRange = "bytes 0-99/*".parse().unwrap();
        assert_eq!(cr.start, Some(0));
        assert_eq!(cr.end, Some(99));
        assert_eq!(cr.size, None);
    }

    #[test]
    fn content_range_rejects_wrong_unit() {
        assert!("items 0-99/100".parse::<ContentRange>().is_err());
    }

    #[test]
    fn content_range_rejects_empty_string() {
        assert!("".parse::<ContentRange>().is_err());
    }

    #[test]
    fn check_cryptify_token_accepts_matching_token() {
        assert!(check_cryptify_token("abc123", "abc123").is_ok());
    }

    #[test]
    fn check_cryptify_token_rejects_mismatched_token() {
        let result = check_cryptify_token("wrong", "expected");
        match result {
            Err(Error::BadRequest(Some(msg))) => {
                assert_eq!(msg, "Cryptify Token header does not match");
            }
            other => panic!("expected BadRequest, got {:?}", other),
        }
    }

    #[test]
    fn check_cryptify_token_rejects_empty_header_when_token_expected() {
        assert!(matches!(
            check_cryptify_token("", "expected"),
            Err(Error::BadRequest(_))
        ));
    }

    #[test]
    fn check_cryptify_token_is_case_sensitive() {
        assert!(matches!(
            check_cryptify_token("ABC123", "abc123"),
            Err(Error::BadRequest(_))
        ));
    }

    #[test]
    fn compute_hash_is_deterministic() {
        let h1 = compute_hash(b"token", b"data");
        let h2 = compute_hash(b"token", b"data");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn compute_hash_differs_for_different_tokens() {
        assert_ne!(
            compute_hash(b"token-a", b"data"),
            compute_hash(b"token-b", b"data")
        );
    }
}
