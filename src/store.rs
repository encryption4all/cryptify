use crate::email;

use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    sync::Arc,
    time::Duration,
};

use rocket::tokio::{sync::Notify, time::Instant};

pub const PER_UPLOAD_LIMIT: u64 = 5 * 1024 * 1024 * 1024;
pub const ROLLING_LIMIT: u64 = 15 * 1024 * 1024 * 1024;
pub const ROLLING_WINDOW_SECS: i64 = 14 * 24 * 60 * 60;

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
}

#[derive(Clone, Copy, Debug)]
struct UploadRecord {
    timestamp: i64,
    bytes: u64,
}

struct StoreState {
    files: HashMap<String, Arc<rocket::tokio::sync::Mutex<FileState>>>,
    expirations: BTreeMap<(Instant, u64), String>,
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
        let removal_instant = Instant::now() + Duration::from_secs(60 * 15);
        state.expirations.insert((removal_instant, removal_id), id);
        self.shared.notify.notify_one()
    }

    pub fn get(&self, id: &str) -> Option<Arc<rocket::tokio::sync::Mutex<FileState>>> {
        let state = self.shared.state.lock().unwrap(); // this will only panic if we already panicked elsewhere while holding the mutex, which is fine.
        state.files.get(id).cloned()
    }

    pub fn remove(&self, id: &str) {
        let mut state = self.shared.state.lock().unwrap();
        state.files.remove(id);
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
