use std::path::Path;

use rocket::tokio::{fs::File, io::AsyncReadExt, io::AsyncWriteExt};
use serde::{Deserialize, Serialize};

use crate::config::CryptifyConfig;

#[derive(Serialize, Deserialize)]
pub struct Metadata {
    pub date: i64,
    pub expires: i64,
}

impl Metadata {
    pub async fn save(&self, config: &CryptifyConfig, uuid: &str) -> Result<(), rocket::tokio::io::Error> {
        let data = serde_json::to_vec(self)?;
        let mut file = File::create(Path::new(config.metadata_dir()).join(uuid)).await?;
        file.write(&data).await?;
        Ok(())
    }

    pub async fn load(
        config: &CryptifyConfig,
        uuid: String,
    ) -> Result<Metadata, rocket::tokio::io::Error> {
        let mut file = File::open(Path::new(config.metadata_dir()).join(uuid)).await?;
        let mut data = vec![];
        file.read_to_end(&mut data).await?;
        Ok(serde_json::from_slice::<Metadata>(&data)?)
    }
}
