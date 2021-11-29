use crate::config::CryptifyConfig;
use crate::store::FileState;

use askama::Template;

use chrono::{TimeZone, format::Locale};

use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Message,
    SmtpTransport, Transport,
};

use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub enum Language {
    #[serde(rename = "EN")]
    En,
    #[serde(rename = "NL")]
    Nl,
}

struct MailStrings<'a> {
    subject_str: &'a str,
    sender_str: &'a str,
    expires_str: &'a str,
    download_str: &'a str,
    link_str: &'a str,
}

const NL_STRINGS: MailStrings = MailStrings {
    subject_str: "heeft je een bestand gestuurd via Cryptify",
    sender_str: "heeft je bestanden gestuurd",
    expires_str: "Verloopt op",
    download_str: "Download jouw bestanden",
    link_str: "Download link",
};

const EN_STRINGS: MailStrings = MailStrings {
    subject_str: "sent you files via Cryptify",
    sender_str: "sent you files",
    expires_str: "Expires on",
    download_str: "Download your files",
    link_str: "Download link",
};

#[derive(Template)]
#[template(path = "email/subject.txt")]
struct SubjectTemplate<'a> {
    subject_str: &'a str,
    sender: &'a str,
}

#[derive(Template)]
#[template(path = "email/email.html")]
struct EmailTemplate<'a> {
    sender_str: &'a str,
    expires_str: &'a str,
    download_str: &'a str,
    link_str: &'a str,
    sender: &'a str,
    file_size: &'a str,
    expiry_date: &'a str,
    html_content: &'a str,
    url: &'a str,
}

fn format_file_size(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "kB", "MB", "GB", "TB"];
    let i = ((size as f64).log10() / (1024 as f64).log10()).floor();
    format!("{:.1} {}", (size as f64 / (1024 as f64).powi(i as i32)), UNITS[i as usize])
}

fn format_date(date: i64, lang: &Language) -> String {
    let dt = chrono::Utc.timestamp(date, 0);
    let locale = match lang {
        Language::En => Locale::en_GB,
        Language::Nl => Locale::nl_NL,
    };
    dt.format_localized("%e %B %Y", locale).to_string()
}

fn email_templates(state: &FileState, url: &str) -> (String, String) {
    let strings = match state.mail_lang {
        Language::En => EN_STRINGS,
        Language::Nl => NL_STRINGS,
    };
    let email = EmailTemplate {
        sender_str: strings.sender_str,
        expires_str: strings.expires_str,
        download_str: strings.download_str,
        link_str: strings.link_str,
        sender: &state.sender,
        file_size: &format_file_size(state.uploaded),
        expiry_date: &format_date(state.expires, &state.mail_lang),
        html_content: &state.mail_content,
        url,
    };
    let subject = SubjectTemplate {
        subject_str: strings.subject_str,
        sender: &state.sender,
    };
    (email.to_string(), subject.to_string())
}

pub async fn send_email(
    config: &CryptifyConfig,
    state: &FileState,
    uuid: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    // combine URL with mail variables into template
    let url = format!("{}?download={}", config.server_url(), uuid);
    let (email, subject) = email_templates(state, &url);
    let email = Message::builder()
        .header(ContentType::TEXT_HTML)
        .from(config.email_from()) // checked in config
        .to(state.recipient.clone()) // checked in init
        .subject(subject)
        .body(email)?;

    // setup SMTP connection
    let mut mailer_builder =
        SmtpTransport::builder_dangerous(config.smtp_url()).port(config.smtp_port());
    if let Some((username, password)) = config.smtp_credentials() {
        let credentials = Credentials::new(username.to_owned(), password.to_owned());
        mailer_builder = mailer_builder.credentials(credentials);
    }

    // send email
    let mailer = mailer_builder.build();
    mailer.send(&email)?;
    Ok("Email successfully sent".to_owned())
}
