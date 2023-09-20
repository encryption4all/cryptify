use crate::config::CryptifyConfig;
use crate::store::FileState;

use askama::Template;

use chrono::{format::Locale, TimeZone};

use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Message,
    SmtpTransport, Transport,
};

use serde::{Deserialize, Serialize};
use url::Url;

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
    header_confirm: &'a str,
    subject_confirm: &'a str,
    confirm: &'a str,
}

const NL_STRINGS: MailStrings = MailStrings {
    subject_str: "heeft je een bestand gestuurd via PostGuard",
    sender_str: "heeft je bestanden gestuurd",
    expires_str: "Verloopt op",
    download_str: "Download jouw bestanden",
    link_str: "Download link",
    header_confirm: "Je hebt het volgende gestuurd aan",
    subject_confirm: "Je bestanden zijn verstuurd via PostGuard",
    confirm: "Je kunt nog steeds bij je bestanden",
};

const EN_STRINGS: MailStrings = MailStrings {
    subject_str: "sent you files via PostGuard",
    sender_str: "sent you files",
    expires_str: "Expires on",
    download_str: "Download your files",
    link_str: "Download link",
    header_confirm: "You sent files to",
    subject_confirm: "Your files have been sent via PostGuard",
    confirm: "You can still access your files",
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
    header: &'a str,
    subheader: &'a str,
    expires_str: &'a str,
    download_str: &'a str,
    link_str: &'a str,
    file_size: &'a str,
    expiry_date: &'a str,
    html_content: &'a str,
    url: &'a str,
    confirm: &'a str,
}

fn format_file_size(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "kB", "MB", "GB", "TB"];
    let i = ((size as f64).log10() / (1024_f64).log10()).floor();
    format!(
        "{:.1} {}",
        (size as f64 / (1024_f64).powi(i as i32)),
        UNITS[i as usize]
    )
}

fn format_date(date: i64, lang: &Language) -> String {
    let dt = chrono::Utc.timestamp_opt(date, 0).unwrap();
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

    let sender_str = state.sender.clone().unwrap_or("Someone".to_string());
    let email = EmailTemplate {
        header: &sender_str,
        subheader: strings.sender_str,
        expires_str: strings.expires_str,
        download_str: strings.download_str,
        link_str: strings.link_str,
        file_size: &format_file_size(state.uploaded),
        expiry_date: &format_date(state.expires, &state.mail_lang),
        html_content: &state.mail_content,
        confirm: "",
        url,
    };
    let subject = SubjectTemplate {
        subject_str: strings.subject_str,
        sender: &sender_str,
    };
    (email.to_string(), subject.to_string())
}

fn email_confirm(state: &FileState, url: &str) -> (String, String) {
    let strings = match state.mail_lang {
        Language::En => EN_STRINGS,
        Language::Nl => NL_STRINGS,
    };

    let email = EmailTemplate {
        header: strings.header_confirm,
        subheader: &state.recipients.to_string(),
        expires_str: strings.expires_str,
        link_str: strings.link_str,
        file_size: &format_file_size(state.uploaded),
        expiry_date: &format_date(state.expires, &state.mail_lang),
        html_content: &state.mail_content,
        download_str: strings.download_str,
        confirm: strings.confirm,
        url,
    };

    let subject = SubjectTemplate {
        subject_str: strings.subject_confirm,
        sender: "",
    };

    (email.to_string(), subject.to_string())
}

pub async fn send_email(
    config: &CryptifyConfig,
    state: &FileState,
    uuid: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    // setup SMTP connection
    let mut mailer_builder = if cfg!(debug_assertions) {
        SmtpTransport::builder_dangerous(config.smtp_url()).port(config.smtp_port())
    } else {
        SmtpTransport::starttls_relay(config.smtp_url())?.port(config.smtp_port())
    };

    // add credentials, if present
    if let Some((username, password)) = config.smtp_credentials() {
        let credentials = Credentials::new(username.to_owned(), password.to_owned());
        mailer_builder = mailer_builder.credentials(credentials);
    }

    for recipient in state.recipients.iter() {
        // combine URL with mail variables into template
        let mut url = Url::parse(config.server_url())?;
        url.query_pairs_mut()
            .append_pair("download", uuid)
            .append_pair("recipient", &format!("{}", recipient.email));
        url.set_fragment(Some("filesharing"));

        let (email, subject) = email_templates(state, url.as_str());
        let email = Message::builder()
            .header(ContentType::TEXT_HTML)
            .from(config.email_from()) // checked in config
            .to(recipient.clone())
            .subject(subject)
            .body(email)?;

        // send email
        let mailer = mailer_builder.clone().build();
        mailer.send(&email)?;
    }

    if state.confirm {
        // also send confirmation email to sender
        let mut url = Url::parse(config.server_url())?;
        url.query_pairs_mut()
            .append_pair("download", uuid)
            .append_pair("recipient", &state.sender.clone().unwrap());
        url.set_fragment(Some("filesharing"));

        let (email, subject) = email_confirm(state, url.as_str());
        let email = Message::builder()
            .header(ContentType::TEXT_HTML)
            .from(config.email_from())
            .to(state.sender.clone().unwrap().parse()?)
            .subject(subject)
            .body(email)?;

        let mailer = mailer_builder.build();
        mailer.send(&email)?;
    }

    Ok("Email successfully sent".to_owned())
}
