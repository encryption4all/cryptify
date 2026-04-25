mod config;
mod email;
mod error;
mod store;

use crate::config::CryptifyConfig;
use crate::email::send_email;
use crate::error::{Error, PayloadTooLargeBody};
use crate::store::{
    PER_UPLOAD_LIMIT, ROLLING_LIMIT, API_KEY_PER_UPLOAD_LIMIT, API_KEY_ROLLING_LIMIT,
    ROLLING_WINDOW_SECS,
};

use std::path::Path;
use std::str::FromStr;

use pg_core::api::Parameters;
use pg_core::artifacts::VerifyingKey;
use pg_core::client::rust::stream::UnsealerStreamConfig;
use pg_core::client::Unsealer;

use tokio_util::compat::TokioAsyncReadCompatExt;

use rand::Rng;
use sha2::Digest;
use std::fmt::Write;

use rocket::fs::FileServer;
use rocket::tokio::{
    fs::{File, OpenOptions},
    io::{AsyncSeekExt, AsyncWriteExt},
};
use rocket::{
    data::ToByteUnit, fairing::AdHoc, figment::Figment, http::Header, launch, get, post, put,
    request::FromRequest, response::Responder, routes, serde::json::Json, Build, Data, Rocket,
    State,
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

/// Presence of an X-Api-Key header (value not validated here — PKG handles that).
struct ApiKeyPresent(bool);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApiKeyPresent {
    type Error = ();
    async fn from_request(req: &'r rocket::Request<'_>) -> rocket::request::Outcome<Self, ()> {
        let present = req.headers().get_one("X-Api-Key").is_some();
        rocket::request::Outcome::Success(ApiKeyPresent(present))
    }
}

#[post("/fileupload/init", data = "<request>")]
async fn upload_init(
    config: &State<CryptifyConfig>,
    store: &State<Store>,
    api_key: ApiKeyPresent,
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

    let init_cryptify_token = bytes_to_hex(&rand::rng().random::<[u8; 32]>());

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
                    is_api_key: api_key.0,
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
    format!("{:x}", hash.finalize())
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
        return Err(Error::BadRequest(Some(
            format!("File chunk too large; the maximum is {} bytes", config.chunk_size()),
        )));
    }

    let per_upload_limit = if state.is_api_key { API_KEY_PER_UPLOAD_LIMIT } else { PER_UPLOAD_LIMIT };
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

    let rolling_limit = if state.is_api_key { API_KEY_ROLLING_LIMIT } else { ROLLING_LIMIT };
    let now_secs = chrono::offset::Utc::now().timestamp();
    if let Some(sender_email) = sender.as_deref() {
        let usage = store.get_usage(sender_email, now_secs);
        log::info!(
            "Rolling limit check for {} (api_key={}): used={} + current={} vs limit={}",
            sender_email, state.is_api_key, usage.used_bytes, state.uploaded, rolling_limit
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

    if let Some(sender_email) = sender {
        store.record_upload(sender_email, state.uploaded, now_secs);
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
fn usage(store: &State<Store>, api_key: ApiKeyPresent, email: String) -> Json<UsageResponse> {
    let (rolling_limit, per_upload_limit) = if api_key.0 {
        (API_KEY_ROLLING_LIMIT, API_KEY_PER_UPLOAD_LIMIT)
    } else {
        (ROLLING_LIMIT, PER_UPLOAD_LIMIT)
    };
    let now = chrono::offset::Utc::now().timestamp();
    let usage = store.get_usage(&email, now);
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

/// Base Rocket figment shared by the production launch path and the integration
/// test harness. Body-size limits are applied later in [`build_rocket`] once
/// the merged config has been extracted (chunk_size is now configurable via
/// TOML, so it isn't known at this point in the test path).
pub fn default_figment() -> Figment {
    rocket::Config::figment()
}

/// Build a Rocket instance from a pre-loaded config figment and verifying key.
///
/// Extracted so integration tests can inject their own figment (temp data_dir,
/// stubbed email sending) and their own `VerifyingKey` (from
/// `pg_core::test::TestSetup`) without needing a live PKG at startup.
pub fn build_rocket(figment: Figment, vk: Parameters<VerifyingKey>) -> Rocket<Build> {
    let config = figment
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

    let rocket = rocket::custom(figment.merge(("limits", limits)));

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
        .mount("/", routes![health, upload_init, upload_chunk, upload_finalize, usage])
        .mount("/filedownload", FileServer::from(config.data_dir()))
        .attach(AdHoc::config::<CryptifyConfig>())
        .manage(Store::new())
        .manage(vk)
}

#[launch]
async fn rocket() -> _ {
    let figment = default_figment();
    let config = figment
        .extract::<CryptifyConfig>()
        .expect("Missing configuration");

    let pkg_params_url = format!("{}/v2/sign/parameters", config.pkg_url());
    let response = minreq::get(&pkg_params_url)
        .with_timeout(10)
        .send()
        .unwrap_or_else(|e| panic!("Failed to reach PKG at {}: {}", pkg_params_url, e));

    let vk = response
        .json::<Parameters<VerifyingKey>>()
        .unwrap_or_else(|e| panic!("Failed to parse verification key from {}: {}", pkg_params_url, e));

    build_rocket(figment, vk)
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
        format!(
            "{}|{}",
            h.cryptify_token,
            h.content_range.size.unwrap_or(0)
        )
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

/// End-to-end integration tests for the upload pipeline
/// (`POST /fileupload/init` → `PUT /fileupload/<uuid>` →
/// `POST /fileupload/finalize/<uuid>`).
///
/// These tests boot a full Rocket instance via [`build_rocket`] with an
/// injected `VerifyingKey` from `pg_core::test::TestSetup`, so they exercise
/// the real extractors, state machine, token chain, and `Unsealer`-based
/// attribute extraction. SMTP is short-circuited by `email_stub = true` so
/// the finalize happy-path does not require a live mail server.
#[cfg(test)]
mod integration {
    use super::*;
    use pg_core::client::rust::stream::SealerStreamConfig;
    use pg_core::client::Sealer;
    use pg_core::test::TestSetup;
    use rocket::http::{ContentType, Header, Status};
    use rocket::local::asynchronous::Client;

    // One of the test policies from `pg_core::test::TestSetup` includes
    // `pbdf.sidn-pbdf.email.email = "bob@example.com"`, and the encryption
    // policy seals for Bob & Charlie. Finalize's attribute extraction looks
    // for exactly this attribute type.
    const SENDER_EMAIL: &str = "bob@example.com";

    /// Build a figment that points at a freshly-created temp `data_dir` and
    /// disables outgoing email. Each test gets its own directory so they can
    /// run in parallel without clobbering each other's files.
    fn test_figment() -> (rocket::figment::Figment, std::path::PathBuf) {
        let dir = std::env::temp_dir()
            .join(format!("cryptify-it-{}", uuid::Uuid::new_v4().hyphenated()));
        std::fs::create_dir_all(&dir).expect("create temp data_dir");

        let figment = default_figment()
            .merge(("server_url", "http://localhost:8000"))
            .merge(("data_dir", dir.to_string_lossy().to_string()))
            .merge(("email_from", "test@example.com"))
            .merge(("smtp_url", "localhost"))
            .merge(("smtp_port", 2525u16))
            .merge(("smtp_tls", false))
            .merge(("email_stub", true))
            .merge(("allowed_origins", ".*"))
            .merge(("pkg_url", "http://localhost:8080"));

        (figment, dir)
    }

    /// Seal `payload` for the encryption policy from `TestSetup`, producing a
    /// byte stream that `Unsealer` (and therefore `upload_finalize`) accepts.
    async fn seal_payload(setup: &TestSetup, payload: &[u8]) -> Vec<u8> {
        let mut rng = rand08::thread_rng();
        let signing_key = &setup.signing_keys[2]; // Bob: email + name
        let mut input = futures::io::Cursor::new(payload.to_vec());
        let mut sealed = Vec::new();
        Sealer::<_, SealerStreamConfig>::new(
            &setup.ibe_pk,
            &setup.policy,
            signing_key,
            &mut rng,
        )
        .expect("build sealer")
        .seal(&mut input, &mut sealed)
        .await
        .expect("seal payload");
        sealed
    }

    /// Boot Rocket with the test figment and a verifying key from `TestSetup`.
    async fn test_client(setup: &TestSetup) -> (Client, std::path::PathBuf) {
        let (figment, dir) = test_figment();
        let vk = Parameters {
            format_version: 0,
            public_key: VerifyingKey(setup.ibs_pk.0.clone()),
        };
        let rocket = build_rocket(figment, vk);
        let client = Client::tracked(rocket).await.expect("valid rocket");
        (client, dir)
    }

    fn init_body_json(recipient: &str) -> String {
        serde_json::json!({
            "recipient": recipient,
            "mailContent": "hello",
            "mailLang": "EN",
            "confirm": false,
        })
        .to_string()
    }

    async fn do_init(client: &Client, recipient: &str) -> (String, String, Status) {
        let res = client
            .post("/fileupload/init")
            .header(ContentType::JSON)
            .body(init_body_json(recipient))
            .dispatch()
            .await;
        let status = res.status();
        let token = res
            .headers()
            .get_one("cryptifytoken")
            .map(|s| s.to_string())
            .unwrap_or_default();
        let body = res.into_string().await.unwrap_or_default();
        let uuid = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("uuid").and_then(|u| u.as_str().map(|s| s.to_string())))
            .unwrap_or_default();
        (uuid, token, status)
    }

    /// PUT one chunk and return the response status plus the advanced token.
    async fn do_chunk(
        client: &Client,
        uuid: &str,
        token: &str,
        chunk: &[u8],
        start: u64,
    ) -> (Status, String) {
        let end = start + chunk.len() as u64;
        let res = client
            .put(format!("/fileupload/{}", uuid))
            .header(Header::new("CryptifyToken", token.to_string()))
            .header(Header::new(
                "Content-Range",
                format!("bytes {}-{}/*", start, end),
            ))
            .body(chunk)
            .dispatch()
            .await;
        let status = res.status();
        let next = res
            .headers()
            .get_one("cryptifytoken")
            .map(|s| s.to_string())
            .unwrap_or_default();
        (status, next)
    }

    async fn do_finalize(
        client: &Client,
        uuid: &str,
        token: &str,
        total: u64,
    ) -> Status {
        client
            .post(format!("/fileupload/finalize/{}", uuid))
            .header(Header::new("CryptifyToken", token.to_string()))
            .header(Header::new(
                "Content-Range",
                format!("bytes */{}", total),
            ))
            .dispatch()
            .await
            .status()
    }

    #[rocket::async_test]
    async fn upload_happy_path_init_chunk_finalize() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let sealed = seal_payload(&setup, b"hello integration test").await;

        let (client, dir) = test_client(&setup).await;

        let (uuid, mut token, status) = do_init(&client, SENDER_EMAIL).await;
        assert_eq!(status, Status::Ok);
        assert!(!uuid.is_empty());
        assert!(!token.is_empty());

        // Upload in a single chunk (payload is well under CHUNK_SIZE).
        let (chunk_status, next) = do_chunk(&client, &uuid, &token, &sealed, 0).await;
        assert_eq!(chunk_status, Status::Ok);
        token = next;

        let final_status = do_finalize(&client, &uuid, &token, sealed.len() as u64).await;
        assert_eq!(final_status, Status::Ok);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_happy_path_multi_chunk() {
        // Two chunks >1 MiB to exercise the rolling token chain across
        // multiple PUTs. Keeps payload well under CHUNK_SIZE.
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let payload: Vec<u8> = (0..(2 * 1024 * 1024 + 17)).map(|i| (i % 251) as u8).collect();
        let sealed = seal_payload(&setup, &payload).await;

        let (client, dir) = test_client(&setup).await;

        let (uuid, mut token, _) = do_init(&client, SENDER_EMAIL).await;

        let split = sealed.len() / 2;
        let (s1, next1) = do_chunk(&client, &uuid, &token, &sealed[..split], 0).await;
        assert_eq!(s1, Status::Ok);
        token = next1;

        let (s2, next2) = do_chunk(
            &client,
            &uuid,
            &token,
            &sealed[split..],
            split as u64,
        )
        .await;
        assert_eq!(s2, Status::Ok);
        token = next2;

        let final_status = do_finalize(&client, &uuid, &token, sealed.len() as u64).await;
        assert_eq!(final_status, Status::Ok);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_init_rejects_invalid_email() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let (client, dir) = test_client(&setup).await;

        let res = client
            .post("/fileupload/init")
            .header(ContentType::JSON)
            .body(init_body_json("not-a-valid-email"))
            .dispatch()
            .await;
        assert_eq!(res.status(), Status::BadRequest);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_chunk_rejects_wrong_cryptify_token() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let (client, dir) = test_client(&setup).await;
        let (uuid, _token, _) = do_init(&client, SENDER_EMAIL).await;

        let (status, _) = do_chunk(&client, &uuid, "bogus-token", b"xxxx", 0).await;
        assert_eq!(status, Status::BadRequest);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_chunk_unknown_uuid_returns_404() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let (client, dir) = test_client(&setup).await;

        let fake = uuid::Uuid::new_v4().hyphenated().to_string();
        let (status, _) = do_chunk(&client, &fake, "any-token", b"xxxx", 0).await;
        assert_eq!(status, Status::NotFound);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_finalize_rejects_wrong_cryptify_token() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let sealed = seal_payload(&setup, b"hello").await;
        let (client, dir) = test_client(&setup).await;

        let (uuid, token, _) = do_init(&client, SENDER_EMAIL).await;
        let (_, new_token) = do_chunk(&client, &uuid, &token, &sealed, 0).await;
        assert!(!new_token.is_empty());

        // Finalize with a bogus token — must be rejected before Unsealer runs.
        let status = do_finalize(&client, &uuid, "not-the-token", sealed.len() as u64).await;
        assert_eq!(status, Status::BadRequest);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_finalize_rejects_size_mismatch() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let sealed = seal_payload(&setup, b"hello").await;
        let (client, dir) = test_client(&setup).await;

        let (uuid, token, _) = do_init(&client, SENDER_EMAIL).await;
        let (_, new_token) = do_chunk(&client, &uuid, &token, &sealed, 0).await;

        // Claim the wrong total size in Content-Range.
        let wrong_total = (sealed.len() as u64).saturating_sub(1);
        let status = do_finalize(&client, &uuid, &new_token, wrong_total).await;
        assert_eq!(status, Status::UnprocessableEntity);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_finalize_unknown_uuid_returns_404() {
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let (client, dir) = test_client(&setup).await;

        let fake = uuid::Uuid::new_v4().hyphenated().to_string();
        let status = do_finalize(&client, &fake, "any-token", 0).await;
        assert_eq!(status, Status::NotFound);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[rocket::async_test]
    async fn upload_chunk_rejects_content_range_misalignment() {
        // Start must equal state.uploaded (currently 0).
        let mut rng = rand08::thread_rng();
        let setup = TestSetup::new(&mut rng);
        let (client, dir) = test_client(&setup).await;
        let (uuid, token, _) = do_init(&client, SENDER_EMAIL).await;

        let (status, _) = do_chunk(&client, &uuid, &token, b"xxxx", 100).await;
        assert_eq!(status, Status::BadRequest);

        let _ = std::fs::remove_dir_all(dir);
    }
}
