use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct RawCryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: String,
    smtp_url: String,
    smtp_port: u16,
    smtp_username: Option<String>,
    smtp_password: Option<String>,
    smtp_tls: Option<bool>,
    allowed_origins: String,
    pkg_url: String,
    chunk_size: Option<u64>,
    session_ttl_secs: Option<u64>,
    staging_mode: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(from = "RawCryptifyConfig")]
pub struct CryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: lettre::message::Mailbox,
    smtp_url: String,
    smtp_port: u16,
    smtp_username: Option<String>,
    smtp_password: Option<String>,
    smtp_tls: bool,
    allowed_origins: String,
    pkg_url: String,
    chunk_size: u64,
    session_ttl_secs: u64,
    staging_mode: bool,
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
            smtp_username: config.smtp_username,
            smtp_password: config.smtp_password,
            smtp_tls: config.smtp_tls.unwrap_or(true),
            allowed_origins: config.allowed_origins,
            pkg_url: config.pkg_url,
            chunk_size: config.chunk_size.unwrap_or(5_000_000),
            session_ttl_secs: config.session_ttl_secs.unwrap_or(3600),
            staging_mode: config.staging_mode.unwrap_or(false),
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

    pub fn smtp_username(&self) -> Option<&str> {
        self.smtp_username.as_deref()
    }

    pub fn smtp_password(&self) -> Option<&str> {
        self.smtp_password.as_deref()
    }

    pub fn smtp_tls(&self) -> bool {
        self.smtp_tls
    }

    pub fn allowed_origins(&self) -> &str {
        &self.allowed_origins
    }

    pub fn pkg_url(&self) -> &str {
        &self.pkg_url
    }

    pub fn chunk_size(&self) -> u64 {
        self.chunk_size
    }

    pub fn session_ttl_secs(&self) -> u64 {
        self.session_ttl_secs
    }

    pub fn staging_mode(&self) -> bool {
        self.staging_mode
    }

    #[cfg(test)]
    pub(crate) fn for_test(server_url: &str, staging_mode: bool) -> Self {
        CryptifyConfig {
            server_url: server_url.to_owned(),
            data_dir: "/tmp".to_owned(),
            email_from: "noreply@test.invalid".parse().unwrap(),
            smtp_url: "localhost".to_owned(),
            smtp_port: 25,
            smtp_username: None,
            smtp_password: None,
            smtp_tls: false,
            allowed_origins: String::new(),
            pkg_url: String::new(),
            chunk_size: 5_000_000,
            session_ttl_secs: 3600,
            staging_mode,
        }
    }
}
