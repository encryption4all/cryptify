//! Usage metrics for Grafana scraping.
//!
//! Exposes a Prometheus text-format `/metrics` endpoint covering:
//!   - uploads completed, split by traffic source ("channel")
//!   - bytes uploaded, split by channel
//!   - current on-disk storage bytes and active file count (sampled
//!     periodically by a background task)
//!
//! See `docs/grafana/` for the reference dashboard JSON.

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::Path;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use rocket::http::HeaderMap;

/// Channel label used when no other source information is present.
pub const CHANNEL_UNKNOWN: &str = "unknown";

/// Header clients can set to identify themselves (`outlook`, `thunderbird`,
/// `api`, ...). Leading whitespace is trimmed and the value is lowercased
/// and restricted to `[a-z0-9_-]` so it cannot inject Prometheus syntax.
pub const SOURCE_HEADER: &str = "X-Cryptify-Source";

#[derive(Default)]
pub struct Metrics {
    uploads: Mutex<BTreeMap<String, u64>>,
    upload_bytes: Mutex<BTreeMap<String, u64>>,
    storage_bytes: AtomicI64,
    active_files: AtomicI64,
    expired_files: AtomicU64,
}

impl Metrics {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a successfully finalized upload.
    pub fn record_upload(&self, channel: &str, bytes: u64) {
        let channel = sanitize_label(channel);
        let mut uploads = self.uploads.lock().unwrap();
        *uploads.entry(channel.clone()).or_insert(0) += 1;
        let mut bytes_map = self.upload_bytes.lock().unwrap();
        *bytes_map.entry(channel).or_insert(0) += bytes;
    }

    /// Record an upload that expired / was purged without finalizing.
    pub fn record_expired(&self) {
        self.expired_files.fetch_add(1, Ordering::Relaxed);
    }

    /// Update the current on-disk storage sample.
    pub fn set_storage(&self, bytes: i64, active_files: i64) {
        self.storage_bytes.store(bytes, Ordering::Relaxed);
        self.active_files.store(active_files, Ordering::Relaxed);
    }

    /// Render all metrics in Prometheus text-exposition format.
    pub fn render(&self) -> String {
        let mut out = String::new();

        let _ = writeln!(
            out,
            "# HELP cryptify_uploads_total Total finalized uploads per channel."
        );
        let _ = writeln!(out, "# TYPE cryptify_uploads_total counter");
        let uploads = self.uploads.lock().unwrap();
        if uploads.is_empty() {
            let _ = writeln!(
                out,
                "cryptify_uploads_total{{channel=\"{}\"}} 0",
                CHANNEL_UNKNOWN
            );
        } else {
            for (channel, count) in uploads.iter() {
                let _ = writeln!(
                    out,
                    "cryptify_uploads_total{{channel=\"{}\"}} {}",
                    channel, count
                );
            }
        }
        drop(uploads);

        let _ = writeln!(
            out,
            "# HELP cryptify_upload_bytes_total Total bytes uploaded per channel."
        );
        let _ = writeln!(out, "# TYPE cryptify_upload_bytes_total counter");
        let bytes = self.upload_bytes.lock().unwrap();
        if bytes.is_empty() {
            let _ = writeln!(
                out,
                "cryptify_upload_bytes_total{{channel=\"{}\"}} 0",
                CHANNEL_UNKNOWN
            );
        } else {
            for (channel, b) in bytes.iter() {
                let _ = writeln!(
                    out,
                    "cryptify_upload_bytes_total{{channel=\"{}\"}} {}",
                    channel, b
                );
            }
        }
        drop(bytes);

        let _ = writeln!(
            out,
            "# HELP cryptify_storage_bytes Current bytes of uploads held on disk."
        );
        let _ = writeln!(out, "# TYPE cryptify_storage_bytes gauge");
        let _ = writeln!(
            out,
            "cryptify_storage_bytes {}",
            self.storage_bytes.load(Ordering::Relaxed)
        );

        let _ = writeln!(
            out,
            "# HELP cryptify_active_files Number of upload files currently on disk."
        );
        let _ = writeln!(out, "# TYPE cryptify_active_files gauge");
        let _ = writeln!(
            out,
            "cryptify_active_files {}",
            self.active_files.load(Ordering::Relaxed)
        );

        let _ = writeln!(
            out,
            "# HELP cryptify_expired_files_total Uploads that expired before being finalized."
        );
        let _ = writeln!(out, "# TYPE cryptify_expired_files_total counter");
        let _ = writeln!(
            out,
            "cryptify_expired_files_total {}",
            self.expired_files.load(Ordering::Relaxed)
        );

        out
    }
}

/// Derive the channel label for a request from its headers.
///
/// Priority:
///   1. `X-Cryptify-Source` explicit header.
///   2. API auth (`Authorization: Bearer …` or `X-Api-Key`) → `api`.
///   3. `Origin` → `staging-website` / `website`.
///   4. `User-Agent` substring for Outlook / Thunderbird.
///   5. `unknown`.
pub fn detect_channel(headers: &HeaderMap<'_>) -> String {
    if let Some(raw) = headers.get_one(SOURCE_HEADER) {
        let cleaned = sanitize_label(raw);
        if !cleaned.is_empty() && cleaned != CHANNEL_UNKNOWN {
            return cleaned;
        }
    }
    if headers.get_one("X-Api-Key").is_some()
        || headers
            .get_one("Authorization")
            .map(|v| v.trim_start().to_ascii_lowercase().starts_with("bearer "))
            .unwrap_or(false)
    {
        return "api".to_string();
    }
    if let Some(origin) = headers.get_one("Origin") {
        let o = origin.to_ascii_lowercase();
        if o.contains("staging.postguard") || o.contains("staging-postguard") {
            return "staging-website".to_string();
        }
        if o.contains("postguard.") {
            return "website".to_string();
        }
    }
    if let Some(ua) = headers.get_one("User-Agent") {
        let ua = ua.to_ascii_lowercase();
        if ua.contains("outlook") {
            return "outlook".to_string();
        }
        if ua.contains("thunderbird") {
            return "thunderbird".to_string();
        }
    }
    CHANNEL_UNKNOWN.to_string()
}

/// Reduce an arbitrary string to a safe Prometheus label value:
/// lower-case, `[a-z0-9_-]`, max 32 chars, non-empty (falls back to
/// `unknown`). This prevents clients from injecting label syntax or
/// exploding cardinality with arbitrary inputs.
fn sanitize_label(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' | '-' | '_' => c,
            _ => '-',
        })
        .take(32)
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() {
        CHANNEL_UNKNOWN.to_string()
    } else {
        trimmed
    }
}

/// Walk `data_dir` once and return `(total_bytes, file_count)`. Symlinks
/// and subdirectories are ignored — the upload directory is a flat
/// directory of files named by UUID.
pub fn sample_storage(data_dir: &Path) -> std::io::Result<(i64, i64)> {
    let mut total: i64 = 0;
    let mut count: i64 = 0;
    match std::fs::read_dir(data_dir) {
        Ok(rd) => {
            for entry in rd.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total = total.saturating_add(meta.len() as i64);
                        count += 1;
                    }
                }
            }
            Ok((total, count))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok((0, 0)),
        Err(e) => Err(e),
    }
}

/// Periodically sample `data_dir` and push the numbers onto `metrics`.
pub async fn storage_sampler(
    metrics: std::sync::Arc<Metrics>,
    data_dir: std::path::PathBuf,
    interval: Duration,
) {
    loop {
        match sample_storage(&data_dir) {
            Ok((bytes, count)) => metrics.set_storage(bytes, count),
            Err(e) => log::warn!("metrics: storage sampling failed for {:?}: {}", data_dir, e),
        }
        rocket::tokio::time::sleep(interval).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocket::http::Header;

    fn headers(pairs: &[(&'static str, &'static str)]) -> rocket::http::HeaderMap<'static> {
        let mut h = rocket::http::HeaderMap::new();
        for (k, v) in pairs {
            h.add(Header::new(*k, *v));
        }
        h
    }

    #[test]
    fn channel_explicit_header_wins() {
        let h = headers(&[
            ("X-Cryptify-Source", "OUTLOOK"),
            ("Origin", "https://postguard.eu"),
        ]);
        assert_eq!(detect_channel(&h), "outlook");
    }

    #[test]
    fn channel_bearer_is_api() {
        let h = headers(&[("Authorization", "Bearer abc123")]);
        assert_eq!(detect_channel(&h), "api");
    }

    #[test]
    fn channel_api_key_is_api() {
        let h = headers(&[("X-Api-Key", "s3cret")]);
        assert_eq!(detect_channel(&h), "api");
    }

    #[test]
    fn channel_origin_staging() {
        let h = headers(&[("Origin", "https://staging.postguard.eu")]);
        assert_eq!(detect_channel(&h), "staging-website");
    }

    #[test]
    fn channel_origin_production() {
        let h = headers(&[("Origin", "https://postguard.eu")]);
        assert_eq!(detect_channel(&h), "website");
    }

    #[test]
    fn channel_user_agent_outlook() {
        let h = headers(&[("User-Agent", "Mozilla Outlook/16.0")]);
        assert_eq!(detect_channel(&h), "outlook");
    }

    #[test]
    fn channel_user_agent_thunderbird() {
        let h = headers(&[("User-Agent", "Thunderbird/115.0")]);
        assert_eq!(detect_channel(&h), "thunderbird");
    }

    #[test]
    fn channel_defaults_to_unknown() {
        let h = headers(&[]);
        assert_eq!(detect_channel(&h), "unknown");
    }

    #[test]
    fn sanitize_strips_unsafe_chars_and_caps_length() {
        assert_eq!(sanitize_label("Outlook\n\"}"), "outlook");
        assert_eq!(sanitize_label(""), "unknown");
        assert_eq!(sanitize_label("   "), "unknown");
        let long = "a".repeat(100);
        assert_eq!(sanitize_label(&long).len(), 32);
    }

    #[test]
    fn render_emits_zero_counters_when_empty() {
        let m = Metrics::new();
        let text = m.render();
        assert!(text.contains("cryptify_uploads_total{channel=\"unknown\"} 0"));
        assert!(text.contains("cryptify_upload_bytes_total{channel=\"unknown\"} 0"));
        assert!(text.contains("cryptify_storage_bytes 0"));
        assert!(text.contains("cryptify_active_files 0"));
        assert!(text.contains("cryptify_expired_files_total 0"));
    }

    #[test]
    fn render_aggregates_by_channel() {
        let m = Metrics::new();
        m.record_upload("website", 1_000);
        m.record_upload("website", 500);
        m.record_upload("outlook", 250);
        m.record_expired();
        m.set_storage(9_999, 3);
        let text = m.render();
        assert!(text.contains("cryptify_uploads_total{channel=\"website\"} 2"));
        assert!(text.contains("cryptify_uploads_total{channel=\"outlook\"} 1"));
        assert!(text.contains("cryptify_upload_bytes_total{channel=\"website\"} 1500"));
        assert!(text.contains("cryptify_upload_bytes_total{channel=\"outlook\"} 250"));
        assert!(text.contains("cryptify_storage_bytes 9999"));
        assert!(text.contains("cryptify_active_files 3"));
        assert!(text.contains("cryptify_expired_files_total 1"));
    }

    #[test]
    fn sample_storage_missing_dir_is_zero() {
        let tmp = std::env::temp_dir().join("cryptify-metrics-missing-xyz");
        let (bytes, count) = sample_storage(&tmp).unwrap();
        assert_eq!((bytes, count), (0, 0));
    }

    #[test]
    fn sample_storage_counts_files() {
        let tmp = std::env::temp_dir().join(format!("cryptify-metrics-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("a"), b"hello").unwrap();
        std::fs::write(tmp.join("b"), b"world!").unwrap();
        let (bytes, count) = sample_storage(&tmp).unwrap();
        assert_eq!(count, 2);
        assert_eq!(bytes, 11);
        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
