use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ApiKeyEntry {
    /// Hex-encoded sha256 of the raw API key value sent in the `X-Api-Key`
    /// header. Storing the hash (rather than the raw key) means an attacker
    /// who reads the deployed config file cannot recover the key.
    pub hash: String,
    /// Stable tenant identifier used for per-tenant rolling-window quota
    /// accounting. Choose a short, opaque slug — it must not be guessable
    /// from outside, since callers identify themselves by the key value
    /// (not by tenant id), but it appears in server logs.
    pub tenant: String,
}

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
    #[serde(default)]
    api_keys: Vec<ApiKeyEntry>,
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
    api_keys: Vec<ApiKeyEntry>,
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
            api_keys: config.api_keys,
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

    pub fn api_keys(&self) -> &[ApiKeyEntry] {
        &self.api_keys
    }
}

/// Return the tenant identifier for an `X-Api-Key` header value, or `None`
/// when the value is missing, empty, or does not match any configured key.
///
/// The configured `hash` field is interpreted as hex-encoded sha256 of the
/// raw key. Comparison is constant-time per candidate to avoid leaking
/// which prefix matched via timing — even though the candidate set is
/// small, an attacker who controls many requests could otherwise probe
/// for partial matches.
pub fn validate_api_key(header_value: Option<&str>, configured: &[ApiKeyEntry]) -> Option<String> {
    let value = header_value?;
    if value.is_empty() {
        return None;
    }
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for byte in digest.iter() {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", byte);
    }

    let hex_bytes = hex.as_bytes();
    let mut matched: Option<&ApiKeyEntry> = None;
    for entry in configured {
        let entry_bytes = entry.hash.as_bytes();
        if entry_bytes.len() != hex_bytes.len() {
            continue;
        }
        let mut diff: u8 = 0;
        for (a, b) in entry_bytes.iter().zip(hex_bytes.iter()) {
            // Lowercase both sides for the comparison so configured hashes
            // can be written in either case without bypass risk.
            let a = if a.is_ascii_uppercase() { a + 32 } else { *a };
            let b = if b.is_ascii_uppercase() { b + 32 } else { *b };
            diff |= a ^ b;
        }
        if diff == 0 {
            matched = Some(entry);
        }
    }
    matched.map(|e| e.tenant.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(hash: &str, tenant: &str) -> ApiKeyEntry {
        ApiKeyEntry {
            hash: hash.into(),
            tenant: tenant.into(),
        }
    }

    // Computed with: printf 'secret-key-value' | sha256sum
    const SECRET_HASH: &str = "79bc72d042dbd44d111a583bfb0c58b696ed19d5f8c0f9165943aed5b1ddcb55";
    const SECRET_VALUE: &str = "secret-key-value";

    #[test]
    fn unset_header_returns_none() {
        assert_eq!(
            validate_api_key(None, &[entry(SECRET_HASH, "tenant-a")]),
            None
        );
    }

    #[test]
    fn empty_header_returns_none() {
        assert_eq!(
            validate_api_key(Some(""), &[entry(SECRET_HASH, "tenant-a")]),
            None
        );
    }

    #[test]
    fn presence_only_no_longer_grants_access() {
        // Pre-fix behaviour: any non-empty header was accepted. This test
        // pins the new behaviour: arbitrary values must not match.
        assert_eq!(
            validate_api_key(Some("anything"), &[entry(SECRET_HASH, "tenant-a")]),
            None
        );
        assert_eq!(
            validate_api_key(Some("x"), &[entry(SECRET_HASH, "tenant-a")]),
            None
        );
    }

    #[test]
    fn empty_allowlist_rejects_all_values() {
        assert_eq!(validate_api_key(Some(SECRET_VALUE), &[]), None);
    }

    #[test]
    fn matching_value_returns_tenant() {
        assert_eq!(
            validate_api_key(Some(SECRET_VALUE), &[entry(SECRET_HASH, "tenant-a")]),
            Some("tenant-a".into())
        );
    }

    #[test]
    fn hash_match_is_case_insensitive() {
        let upper = SECRET_HASH.to_ascii_uppercase();
        assert_eq!(
            validate_api_key(Some(SECRET_VALUE), &[entry(&upper, "tenant-a")]),
            Some("tenant-a".into())
        );
    }

    #[test]
    fn value_match_is_case_sensitive() {
        // Same hash, but the header value differs by a single byte.
        assert_eq!(
            validate_api_key(
                Some(&SECRET_VALUE.to_ascii_uppercase()),
                &[entry(SECRET_HASH, "tenant-a")]
            ),
            None
        );
    }

    #[test]
    fn second_entry_in_allowlist_matches() {
        let entries = [
            entry(
                "0000000000000000000000000000000000000000000000000000000000000000",
                "tenant-z",
            ),
            entry(SECRET_HASH, "tenant-a"),
        ];
        assert_eq!(
            validate_api_key(Some(SECRET_VALUE), &entries),
            Some("tenant-a".into())
        );
    }
}
