use crate::email;
use crate::metrics::Metrics;

use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
    time::Duration,
};

use rocket::tokio::{sync::Notify, time::Instant};

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
    /// Traffic source this upload originated from ("website", "outlook",
    /// "thunderbird", "api", ...). Used only for metrics labelling.
    pub source_channel: String,
}

struct StoreState {
    files: HashMap<String, Arc<rocket::tokio::sync::Mutex<FileState>>>,
    expirations: BTreeMap<(Instant, u64), String>,
    next_id: u64,
    shutdown: bool,
}

struct SharedState {
    state: std::sync::Mutex<StoreState>,
    notify: Notify,
    metrics: Arc<Metrics>,
}

pub struct Store {
    shared: Arc<SharedState>,
}

impl Store {
    pub fn new(metrics: Arc<Metrics>) -> Self {
        let result = Store {
            shared: Arc::new(SharedState {
                state: std::sync::Mutex::new(StoreState {
                    files: HashMap::new(),
                    expirations: BTreeMap::new(),
                    next_id: 0,
                    shutdown: false,
                }),
                notify: Notify::new(),
                metrics,
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

            let id = id.clone();
            if let Some(entry) = state.files.remove(&id) {
                // An entry that still had no `sender` set was never finalized.
                // (`sender` is populated by `upload_finalize` once the file has
                // been unsealed.)
                let was_unfinalized = entry.try_lock().map(|g| g.sender.is_none()).unwrap_or(false);
                if was_unfinalized {
                    self.metrics.record_expired();
                }
            }
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
