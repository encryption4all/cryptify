#![allow(clippy::enum_variant_names)]

use rocket::http::ContentType;
use rocket::response::{self, Responder};
use rocket::serde::json::Json;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PayloadTooLargeBody {
    pub error: String,
    pub limit: &'static str,
    pub used_bytes: u64,
    pub limit_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadSessionNotFoundBody {
    pub error: &'static str,
    pub uuid: String,
    pub reason: &'static str,
}

#[derive(Debug)]
pub enum Error {
    BadRequest(Option<String>),
    UnprocessableEntity(Option<String>),
    InternalServerError(Option<String>),
    PayloadTooLarge(PayloadTooLargeBody),
    /// 503 — pg-pkg was unreachable for the full retry budget while
    /// validating an API key. Returned when the upload exceeds the default
    /// tier and we couldn't confirm the caller is entitled to the higher
    /// tier. Smaller uploads degrade silently to the default tier.
    ServiceUnavailable(Option<String>),
    UploadSessionNotFound(UploadSessionNotFoundBody),
}

impl Error {
    pub fn upload_session_not_found(uuid: impl Into<String>, reason: &'static str) -> Self {
        Error::UploadSessionNotFound(UploadSessionNotFoundBody {
            error: "upload_session_not_found",
            uuid: uuid.into(),
            reason,
        })
    }
}

impl<'r, 'o: 'r> Responder<'r, 'o> for Error {
    fn respond_to(self, request: &'r rocket::Request<'_>) -> response::Result<'o> {
        match self {
            Error::BadRequest(e) => response::status::BadRequest(e).respond_to(request),
            // response::status::Custom apparently doesn't support Option<R>
            Error::UnprocessableEntity(e) => response::status::Custom::<String>(
                rocket::http::Status::UnprocessableEntity,
                e.unwrap_or_else(|| "".to_owned()),
            )
            .respond_to(request),
            Error::InternalServerError(e) => response::status::Custom::<String>(
                rocket::http::Status::InternalServerError,
                e.unwrap_or_else(|| "".to_owned()),
            )
            .respond_to(request),
            Error::PayloadTooLarge(body) => {
                response::Response::build_from(Json(body).respond_to(request)?)
                    .status(rocket::http::Status::PayloadTooLarge)
                    .header(ContentType::JSON)
                    .ok()
            }
            Error::ServiceUnavailable(e) => response::status::Custom::<String>(
                rocket::http::Status::ServiceUnavailable,
                e.unwrap_or_else(|| "".to_owned()),
            )
            .respond_to(request),
            Error::UploadSessionNotFound(body) => {
                response::Response::build_from(Json(body).respond_to(request)?)
                    .status(rocket::http::Status::NotFound)
                    .header(ContentType::JSON)
                    .ok()
            }
        }
    }
}
