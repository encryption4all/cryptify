use crate::email;

use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    sync::Arc,
    time::Duration,
};

use rocket::tokio::{sync::Notify, time::Instant};

pub const PER_UPLOAD_LIMIT: u64 = 5_000_000_000;
pub const ROLLING_LIMIT: u64 = 5_000_000_000;
pub const API_KEY_PER_UPLOAD_LIMIT: u64 = 100_000_000_000;
pub const API_KEY_ROLLING_LIMIT: u64 = 100_000_000_000;
pub const ROLLING_WINDOW_SECS: i64 = 14 * 24 * 60 * 60;

/// Idle window for an in-memory upload session. Each successful chunk PUT
/// resets it; if no activity is seen for this long the session is evicted
/// (the on-disk file is left alone — `FileState.expires` covers that).
pub const UPLOAD_SESSION_IDLE_TIMEOUT_SECS: u64 = 60 * 60;

pub struct FileState {
    pub uploaded: u64,
    pub cryptify_token: String,
    pub expires: i64,
    pub recipients: lettre::message::Mailboxes,
    pub mail_content: String,
    pub mail_lang: email::Language,
    pub sender: Option<String>,
    pub sender_attributes: Vec<(String, String)>,
    pub confirm: bool,
    pub is_api_key: bool,
}

#[derive(Clone, Copy, Debug)]
struct UploadRecord {
    timestamp: i64,
    bytes: u64,
}

struct StoreState {
    files: HashMap<String, Arc<rocket::tokio::sync::Mutex<FileState>>>,
    expirations: BTreeMap<(Instant, u64), String>,
    /// Reverse index: file id → its current `(deadline, removal_id)` entry in
    /// `expirations`. Lets `touch` extend the deadline without scanning.
    expiration_keys: HashMap<String, (Instant, u64)>,
    usage: HashMap<String, VecDeque<UploadRecord>>,
    next_id: u64,
    shutdown: bool,
}

struct SharedState {
    state: std::sync::Mutex<StoreState>,
    notify: Notify,
}

pub struct Store {
    shared: Arc<SharedState>,
}

impl Store {
    pub fn new() -> Self {
        let result = Store {
            shared: Arc::new(SharedState {
                state: std::sync::Mutex::new(StoreState {
                    files: HashMap::new(),
                    expirations: BTreeMap::new(),
                    expiration_keys: HashMap::new(),
                    usage: HashMap::new(),
                    next_id: 0,
                    shutdown: false,
                }),
                notify: Notify::new(),
            }),
        };

        rocket::tokio::spawn(purge_task(result.shared.clone()));
        result
    }

    pub fn create(&self, id: String, filestate: FileState) {
        let mut state = self.shared.state.lock().unwrap(); // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.
        state.files.insert(
            id.clone(),
            Arc::new(rocket::tokio::sync::Mutex::new(filestate)),
        );
        let removal_id = state.next_id;
        state.next_id += 1;
        let removal_instant =
            Instant::now() + Duration::from_secs(UPLOAD_SESSION_IDLE_TIMEOUT_SECS);
        state
            .expirations
            .insert((removal_instant, removal_id), id.clone());
        state
            .expiration_keys
            .insert(id, (removal_instant, removal_id));
        self.shared.notify.notify_one()
    }

    pub fn get(&self, id: &str) -> Option<Arc<rocket::tokio::sync::Mutex<FileState>>> {
        let state = self.shared.state.lock().unwrap(); // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.
        state.files.get(id).cloned()
    }

    /// Reset the idle-eviction deadline for `id` to "now + idle timeout".
    /// Called from `upload_chunk` after a successful chunk PUT so an upload
    /// that takes longer than the idle window is not killed mid-flight.
    pub fn touch(&self, id: &str) {
        let mut state = self.shared.state.lock().unwrap();
        let Some(&(old_when, removal_id)) = state.expiration_keys.get(id) else {
            return;
        };
        state.expirations.remove(&(old_when, removal_id));
        let new_when = Instant::now() + Duration::from_secs(UPLOAD_SESSION_IDLE_TIMEOUT_SECS);
        state
            .expirations
            .insert((new_when, removal_id), id.to_owned());
        state
            .expiration_keys
            .insert(id.to_owned(), (new_when, removal_id));
        self.shared.notify.notify_one();
    }

    pub fn remove(&self, id: &str) {
        let mut state = self.shared.state.lock().unwrap();
        state.files.remove(id);
        if let Some((when, removal_id)) = state.expiration_keys.remove(id) {
            state.expirations.remove(&(when, removal_id));
        }
    }

    pub fn record_upload(&self, email: String, bytes: u64, now: i64) {
        let mut state = self.shared.state.lock().unwrap();
        let entry = state.usage.entry(email).or_default();
        prune_records(entry, now);
        entry.push_back(UploadRecord {
            timestamp: now,
            bytes,
        });
    }

    pub fn get_usage(&self, email: &str, now: i64) -> UsageSnapshot {
        let mut state = self.shared.state.lock().unwrap();
        match state.usage.get_mut(email) {
            Some(entry) => {
                prune_records(entry, now);
                let used_bytes = entry.iter().map(|r| r.bytes).sum();
                let oldest_expires_at = entry.front().map(|r| r.timestamp + ROLLING_WINDOW_SECS);
                UsageSnapshot {
                    used_bytes,
                    oldest_expires_at,
                }
            }
            None => UsageSnapshot {
                used_bytes: 0,
                oldest_expires_at: None,
            },
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct UsageSnapshot {
    pub used_bytes: u64,
    pub oldest_expires_at: Option<i64>,
}

fn prune_records(records: &mut VecDeque<UploadRecord>, now: i64) {
    let cutoff = now - ROLLING_WINDOW_SECS;
    while let Some(front) = records.front() {
        if front.timestamp < cutoff {
            records.pop_front();
        } else {
            break;
        }
    }
}

impl Drop for Store {
    fn drop(&mut self) {
        if Arc::strong_count(&self.shared) == 2 {
            self.shared.state.lock().unwrap().shutdown = true; // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.
            self.shared.notify.notify_one()
        }
    }
}

impl SharedState {
    fn purge_expired(&self) -> Option<Instant> {
        let mut state = self.state.lock().unwrap(); // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.

        if state.shutdown {
            return None;
        }

        let state = &mut *state; // needed for borrow checker

        let now = Instant::now();
        while let Some((&(when, removal_id), id)) = state.expirations.iter().next() {
            if when > now {
                return Some(when);
            }

            state.files.remove(id);
            state.expiration_keys.remove(id);
            state.expirations.remove(&(when, removal_id));
        }

        None
    }

    fn is_shutdown(&self) -> bool {
        self.state.lock().unwrap().shutdown // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.
    }
}

async fn purge_task(shared: Arc<SharedState>) {
    while !shared.is_shutdown() {
        if let Some(when) = shared.purge_expired() {
            rocket::tokio::select! {
                _ = rocket::tokio::time::sleep_until(when) => {}
                _ = shared.notify.notified() => {}
            }
        } else {
            shared.notify.notified().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[rocket::async_test]
    async fn usage_is_zero_for_unknown_email() {
        let store = Store::new();
        assert_eq!(
            store.get_usage("unknown@example.com", 1_000_000).used_bytes,
            0
        );
    }

    #[rocket::async_test]
    async fn usage_sums_records_in_window() {
        let store = Store::new();
        let now: i64 = 2_000_000;
        store.record_upload("a@example.com".into(), 1_000_000_000, now - 3600);
        store.record_upload("a@example.com".into(), 2_000_000_000, now - 60);
        let snap = store.get_usage("a@example.com", now);
        assert_eq!(snap.used_bytes, 3_000_000_000);
        assert_eq!(
            snap.oldest_expires_at,
            Some(now - 3600 + ROLLING_WINDOW_SECS)
        );
    }

    #[rocket::async_test]
    async fn usage_excludes_records_outside_window() {
        let store = Store::new();
        let now: i64 = 2_000_000;
        store.record_upload(
            "b@example.com".into(),
            5_000_000_000,
            now - ROLLING_WINDOW_SECS - 1,
        );
        store.record_upload("b@example.com".into(), 1_000_000_000, now - 60);
        assert_eq!(
            store.get_usage("b@example.com", now).used_bytes,
            1_000_000_000
        );
    }

    #[rocket::async_test]
    async fn usage_is_isolated_per_email() {
        let store = Store::new();
        let now: i64 = 2_000_000;
        store.record_upload("a@example.com".into(), 1_000, now);
        store.record_upload("b@example.com".into(), 2_000, now);
        assert_eq!(store.get_usage("a@example.com", now).used_bytes, 1_000);
        assert_eq!(store.get_usage("b@example.com", now).used_bytes, 2_000);
    }

    fn dummy_filestate() -> FileState {
        FileState {
            uploaded: 0,
            cryptify_token: String::new(),
            expires: 0,
            recipients: lettre::message::Mailboxes::new(),
            mail_content: String::new(),
            mail_lang: email::Language::En,
            sender: None,
            sender_attributes: Vec::new(),
            confirm: false,
            is_api_key: false,
        }
    }

    #[rocket::async_test]
    async fn touch_extends_eviction_deadline() {
        let store = Store::new();
        store.create("u1".into(), dummy_filestate());

        let original = {
            let s = store.shared.state.lock().unwrap();
            s.expiration_keys.get("u1").copied().unwrap()
        };

        // tokio::time::Instant has millisecond resolution on most platforms;
        // sleep enough for the deadline to be strictly later.
        rocket::tokio::time::sleep(Duration::from_millis(10)).await;
        store.touch("u1");

        let updated = {
            let s = store.shared.state.lock().unwrap();
            s.expiration_keys.get("u1").copied().unwrap()
        };

        assert_eq!(original.1, updated.1, "removal_id should be stable");
        assert!(
            updated.0 > original.0,
            "touch should push the deadline forward"
        );

        let s = store.shared.state.lock().unwrap();
        assert!(!s.expirations.contains_key(&original));
        assert_eq!(s.expirations.get(&updated).map(String::as_str), Some("u1"));
    }

    #[rocket::async_test]
    async fn touch_on_unknown_id_is_noop() {
        let store = Store::new();
        store.touch("nope");
        let s = store.shared.state.lock().unwrap();
        assert!(s.expirations.is_empty());
        assert!(s.expiration_keys.is_empty());
    }

    #[rocket::async_test]
    async fn remove_cleans_up_expirations() {
        let store = Store::new();
        store.create("u2".into(), dummy_filestate());
        store.remove("u2");
        let s = store.shared.state.lock().unwrap();
        assert!(s.files.is_empty());
        assert!(s.expirations.is_empty());
        assert!(s.expiration_keys.is_empty());
    }

    #[rocket::async_test]
    async fn pruning_removes_only_expired_records() {
        let store = Store::new();
        let now: i64 = 2_000_000;
        store.record_upload(
            "c@example.com".into(),
            1_000,
            now - ROLLING_WINDOW_SECS - 10,
        );
        store.record_upload("c@example.com".into(), 2_000, now - 10);
        assert_eq!(store.get_usage("c@example.com", now).used_bytes, 2_000);
        store.record_upload("c@example.com".into(), 3_000, now);
        assert_eq!(store.get_usage("c@example.com", now).used_bytes, 5_000);
    }
}
