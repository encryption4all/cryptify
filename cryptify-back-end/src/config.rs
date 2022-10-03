use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct RawCryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: String,
    smtp_url: String,
    smtp_port: u16,
    smtp_credentials: Option<(String, String)>,
    irma_server: String,
    allowed_origins: String,
}

#[derive(Debug, Deserialize)]
#[serde(from = "RawCryptifyConfig")]
pub struct CryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: lettre::message::Mailbox,
    smtp_url: String,
    smtp_port: u16,
    smtp_credentials: Option<(String, String)>,
    irma_server: String,
    allowed_origins: String,
}

impl From<RawCryptifyConfig> for CryptifyConfig {
    fn from(config: RawCryptifyConfig) -> Self {
        CryptifyConfig {
            server_url: config.server_url,
            data_dir: config.data_dir,
            email_from: config.email_from.parse().unwrap_or_else(|e| {
                log::error!("Could not parse Mailbox from email_form: {}", e);
                panic!("Could not parse Mailbox from email_form: {}", e)
            }),
            smtp_url: config.smtp_url,
            smtp_port: config.smtp_port,
            smtp_credentials: config.smtp_credentials,
            irma_server: config.irma_server,
            allowed_origins: config.allowed_origins,
        }
    }
}

impl CryptifyConfig {
    pub fn server_url(&self) -> &str {
        &self.server_url
    }

    pub fn data_dir(&self) -> &str {
        &self.data_dir
    }

    pub fn email_from(&self) -> lettre::message::Mailbox {
        self.email_from.clone()
    }

    pub fn smtp_url(&self) -> &str {
        &self.smtp_url
    }

    pub fn smtp_port(&self) -> u16 {
        self.smtp_port
    }

    pub fn smtp_credentials(&self) -> Option<&(String, String)> {
        self.smtp_credentials.as_ref()
    }

    pub fn irma_server(&self) -> &str {
        &self.irma_server
    }

    pub fn allowed_origins(&self) -> &str {
        &self.allowed_origins
    }
}
