use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct RawCryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: String,
    smtp_url: String,
    smtp_port: u16,
    smtp_credentials: Option<(String, String)>,
    allowed_origins: String,
    pkg_url: String,
    chunk_size: Option<u64>,
    s3_endpoint: Option<String>,
    s3_access_key: Option<String>,
    s3_secret_key: Option<String>,
    s3_bucket: Option<String>,
    s3_region: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "RawCryptifyConfig")]
pub struct CryptifyConfig {
    server_url: String,
    data_dir: String,
    email_from: lettre::message::Mailbox,
    smtp_url: String,
    smtp_port: u16,
    smtp_credentials: Option<(String, String)>,
    allowed_origins: String,
    pkg_url: String,
    chunk_size: u64,

    s3_endpoint: Option<String>,
    s3_access_key: Option<String>,
    s3_secret_key: Option<String>,
    s3_bucket: Option<String>,
    s3_region: Option<String>,
}

impl From<RawCryptifyConfig> for CryptifyConfig {
    fn from(mut config: RawCryptifyConfig) -> Self {
        // deoption chunk_size to default value if not set
        let chunk_size = config.chunk_size.take().unwrap_or(1024 * 1024); // 1 MB default for backward compatibility with older configs and front-ends
        
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
            allowed_origins: config.allowed_origins,
            pkg_url: config.pkg_url,
            chunk_size,
            s3_endpoint: config.s3_endpoint,
            s3_access_key: config.s3_access_key,
            s3_secret_key: config.s3_secret_key,
            s3_bucket: config.s3_bucket,
            s3_region: config.s3_region,
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

    pub fn allowed_origins(&self) -> &str {
        &self.allowed_origins
    }

    pub fn pkg_url(&self) -> &str {
        &self.pkg_url
    }
    
    pub fn chunk_size(&self) -> u64 {
        self.chunk_size
    }

    pub fn s3_endpoint(&self) -> Option<&str> {
        self.s3_endpoint.as_deref()
    }

    pub fn s3_access_key(&self) -> Option<&str> {
        self.s3_access_key.as_deref()
    }

    pub fn s3_secret_key(&self) -> Option<&str> {
        self.s3_secret_key.as_deref()
    }

    pub fn s3_bucket(&self) -> Option<&str> {
        self.s3_bucket.as_deref()
    }
    pub fn s3_region(&self) -> Option<&str> {
        self.s3_region.as_deref()
    }
}
