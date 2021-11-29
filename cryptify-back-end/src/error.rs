
#[derive(Debug)]
pub enum Error {
    BadRequest(Option<String>),
    UnprocessableEntity(Option<String>),
    InternalServerError(Option<String>),
}

impl<'r, 'o: 'r> rocket::response::Responder<'r, 'o> for Error {
    fn respond_to(self, request: &'r rocket::Request<'_>) -> rocket::response::Result<'o> {
        match self {
            Error::BadRequest(e) => rocket::response::status::BadRequest(e).respond_to(request),
            // response::status::Custom apparently doesn't support Option<R>
            Error::UnprocessableEntity(e) =>
                rocket::response::status::Custom::<String>(
                    rocket::http::Status::UnprocessableEntity, e.unwrap_or("".to_owned()),
                ).respond_to(request),
            Error::InternalServerError(e) =>
                rocket::response::status::Custom::<String>(
                    rocket::http::Status::InternalServerError, e.unwrap_or("".to_owned()),
                ).respond_to(request)
        }
    }
}
