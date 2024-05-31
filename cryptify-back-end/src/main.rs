mod config;
mod email;
mod error;
mod store;

use crate::config::CryptifyConfig;
use crate::email::send_email;
use crate::error::Error;

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
    data::ToByteUnit, fairing::AdHoc, http::Header, launch, post, put, request::FromRequest,
    response::Responder, routes, serde::json::Json, Data, State,
};

use rocket::http::Method;
use rocket_cors::{AllowedOrigins, CorsOptions};

use serde::{Deserialize, Serialize};
use store::{FileState, Store};

const CHUNK_SIZE: u64 = 1024 * 1024; // 1 MB

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

#[post("/fileupload/init", data = "<request>")]
async fn upload_init(
    config: &State<CryptifyConfig>,
    store: &State<Store>,
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

    let init_cryptify_token = bytes_to_hex(&rand::thread_rng().gen::<[u8; 32]>());

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
                    confirm: request.confirm,
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
                return rocket::request::Outcome::Failure((
                    rocket::http::Status::BadRequest,
                    "Missing Cryptify Token header".into(),
                ))
            }
        }
        .to_string();
        let content_range = match request.headers().get_one("Content-Range") {
            Some(content_range) => content_range,
            None => {
                return rocket::request::Outcome::Failure((
                    rocket::http::Status::BadRequest,
                    "Missing content range".into(),
                ))
            }
        }
        .parse::<ContentRange>();
        let content_range = match content_range {
            Ok(v) => v,
            Err(e) => {
                return rocket::request::Outcome::Failure((rocket::http::Status::BadRequest, e))
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

    if end - start > CHUNK_SIZE {
        return Err(Error::BadRequest(Some(
            "File chunk too large; the maximum is 1 MB".to_owned(),
        )));
    }

    if headers.cryptify_token != state.cryptify_token {
        return Err(Error::BadRequest(Some(
            "Cryptify Token header does not match".to_owned(),
        )));
    }

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
    content_range: ContentRange,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for FinalizeHeaders {
    type Error = String;

    async fn from_request(
        request: &'r rocket::Request<'_>,
    ) -> rocket::request::Outcome<Self, Self::Error> {
        let content_range = match request.headers().get_one("Content-Range") {
            Some(content_range) => content_range,
            None => {
                return rocket::request::Outcome::Failure((
                    rocket::http::Status::BadRequest,
                    "Missing content range".into(),
                ))
            }
        };

        let content_range = match content_range.parse::<ContentRange>() {
            Ok(v) => v,
            Err(e) => {
                return rocket::request::Outcome::Failure((rocket::http::Status::BadRequest, e))
            }
        };
        rocket::request::Outcome::Success(FinalizeHeaders { content_range })
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

    if headers.content_range.size != Some(state.uploaded) {
        return Err(Error::UnprocessableEntity(None));
    }

    let mut file = File::open(Path::new(config.data_dir()).join(uuid))
        .await
        .map_err(|_| Error::InternalServerError(Some("could not open file".to_string())))?
        .compat();

    let sender = Unsealer::<_, UnsealerStreamConfig>::new(&mut file, &vk.public_key)
        .await
        .map_err(|_| Error::InternalServerError(Some("couldn't read postguard file".to_string())))?
        .pub_id
        .con
        .into_iter()
        .find(|x| x.atype == "pbdf.sidn-pbdf.email.email")
        .ok_or(Error::InternalServerError(Some(
            "no email attribute".to_string(),
        )))?
        .value;

    state.sender = sender;

    send_email(config, &state, uuid).await.map_err(|e| {
        log::error!("{}", e);
        Error::InternalServerError(Some("could not send email".to_owned()))
    })?;

    Ok(Some(()))
}

#[launch]
async fn rocket() -> _ {
    let rocket = rocket::build();
    let config = rocket
        .figment()
        .extract::<CryptifyConfig>()
        .expect("Missing configuration");

    let response = minreq::get(format!("{}/v2/sign/parameters", config.pkg_url())).send();

    let vk = response
        .expect("could not get global verification key")
        .json::<Parameters<VerifyingKey>>()
        .expect("no verification key");

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
        .mount("/", routes![upload_init, upload_chunk, upload_finalize,])
        .mount("/filedownload", FileServer::from(config.data_dir()))
        .attach(AdHoc::config::<CryptifyConfig>())
        .manage(Store::new())
        .manage(vk)
}
