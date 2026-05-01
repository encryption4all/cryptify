use crate::config::CryptifyConfig;
use crate::store::FileState;

use askama::Template;

use chrono::{format::Locale, TimeZone};

use lettre::{
    message::header::{ContentType, Header, HeaderName, HeaderValue},
    transport::smtp::authentication::Credentials,
    Message, SmtpTransport, Transport,
};

/// `X-PostGuard: <version>` header. Set on every outgoing notification so the
/// Outlook add-in's `OnMessageRead` launch event (which filters on this
/// header name) fires for PostGuard mail. See encryption4all/cryptify#52.
#[derive(Clone, Debug)]
struct XPostGuard(String);

impl Header for XPostGuard {
    fn name() -> HeaderName {
        HeaderName::new_from_ascii_str("X-PostGuard")
    }

    fn parse(s: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Ok(XPostGuard(s.to_owned()))
    }

    fn display(&self) -> HeaderValue {
        HeaderValue::new(Self::name(), self.0.clone())
    }
}

const X_POSTGUARD_VERSION: &str = "0.1.0";

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
    files_from: &'a str,
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
    files_from: "De bestanden komen van",
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
    files_from: "The files come from",
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
    files_from: &'a str,
    sender_email: &'a str,
    sender_attributes: &'a [(String, String)],
}

fn format_file_size(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "kB", "MB", "GB", "TB"];
    if size == 0 {
        return "0 B".to_owned();
    }
    let i = ((size as f64).log10() / (1024_f64).log10()).floor() as usize;
    let i = i.min(UNITS.len() - 1);
    format!(
        "{:.1} {}",
        (size as f64 / (1024_f64).powi(i as i32)),
        UNITS[i]
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
        files_from: strings.files_from,
        sender_email: &sender_str,
        sender_attributes: &state.sender_attributes,
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

    let sender_str = state.sender.clone().unwrap_or("Someone".to_string());
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
        files_from: strings.files_from,
        sender_email: &sender_str,
        sender_attributes: &state.sender_attributes,
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
    log::info!(
        "Setting up SMTP: host={}, port={}, tls={}, credentials={}",
        config.smtp_url(),
        config.smtp_port(),
        config.smtp_tls(),
        config.smtp_username().is_some()
    );
    let mut mailer_builder = if config.smtp_tls() {
        SmtpTransport::starttls_relay(config.smtp_url())?.port(config.smtp_port())
    } else {
        SmtpTransport::builder_dangerous(config.smtp_url()).port(config.smtp_port())
    };

    mailer_builder = mailer_builder.timeout(Some(std::time::Duration::from_secs(10)));

    // add credentials, if present
    if let (Some(username), Some(password)) = (config.smtp_username(), config.smtp_password()) {
        let credentials = Credentials::new(username.to_owned(), password.to_owned());
        mailer_builder = mailer_builder.credentials(credentials);
    }

    if state.notify_recipients {
        for recipient in state.recipients.iter() {
            // combine URL with mail variables into template
            let base = Url::parse(config.server_url())?;
            let mut url = base.join("/download")?;
            url.query_pairs_mut()
                .append_pair("uuid", uuid)
                .append_pair("recipient", &format!("{}", recipient.email));

            let (email, subject) = email_templates(state, url.as_str());
            let email = Message::builder()
                .header(ContentType::TEXT_HTML)
                .header(XPostGuard(X_POSTGUARD_VERSION.to_owned()))
                .from(config.email_from()) // checked in config
                .to(recipient.clone())
                .subject(subject)
                .body(email)?;

            // send email
            log::info!("Sending email to {}", recipient.email);
            let mailer = mailer_builder.clone().build();
            mailer.send(&email).map_err(|e| {
                log::error!("Failed to send email to {}: {}", recipient.email, e);
                e
            })?;
            log::info!("Email sent to {}", recipient.email);
        }
    } else {
        log::info!(
            "notify_recipients disabled — skipping notification mail for {} recipient(s) on upload {}",
            state.recipients.iter().count(),
            uuid
        );
    }

    if state.confirm {
        // also send confirmation email to sender
        let sender = state.sender.clone().unwrap();

        let base = Url::parse(config.server_url())?;
        let mut url = base.join("/download")?;
        url.query_pairs_mut()
            .append_pair("uuid", uuid)
            .append_pair("recipient", &format!("{}", &sender));

        let (email, subject) = email_confirm(state, url.as_str());
        let email = Message::builder()
            .header(ContentType::TEXT_HTML)
            .header(XPostGuard(X_POSTGUARD_VERSION.to_owned()))
            .from(config.email_from())
            .to(sender.parse()?)
            .subject(subject)
            .body(email)?;

        log::info!("Sending confirmation email to {}", sender);
        let mailer = mailer_builder.build();
        mailer.send(&email).map_err(|e| {
            log::error!("Failed to send confirmation email to {}: {}", sender, e);
            e
        })?;
        log::info!("Confirmation email sent to {}", sender);
    }

    Ok("Email successfully sent".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x_postguard_header_name_matches_outlook_filter() {
        assert_eq!(format!("{}", XPostGuard::name()), "X-PostGuard");
    }

    #[test]
    fn x_postguard_header_round_trips() {
        let parsed = XPostGuard::parse("0.1.0").expect("parse");
        assert_eq!(parsed.0, "0.1.0");
    }

    #[test]
    fn x_postguard_header_serialises_into_message() {
        use lettre::message::Mailbox;
        let msg = Message::builder()
            .from("noreply@example.com".parse::<Mailbox>().unwrap())
            .to("to@example.com".parse::<Mailbox>().unwrap())
            .subject("t")
            .header(XPostGuard(X_POSTGUARD_VERSION.to_owned()))
            .body(String::from("hi"))
            .expect("build");
        let raw = String::from_utf8(msg.formatted()).expect("utf8");
        assert!(
            raw.contains("X-PostGuard: 0.1.0"),
            "expected X-PostGuard header in message, got: {}",
            raw
        );
    }

    #[test]
    fn format_file_size_zero() {
        assert_eq!(format_file_size(0), "0 B");
    }

    #[test]
    fn format_file_size_bytes() {
        assert_eq!(format_file_size(1), "1.0 B");
        assert_eq!(format_file_size(1023), "1023.0 B");
    }

    #[test]
    fn format_file_size_kibibytes() {
        assert_eq!(format_file_size(1024), "1.0 kB");
        assert_eq!(format_file_size(1536), "1.5 kB");
    }

    #[test]
    fn format_file_size_mebibytes() {
        assert_eq!(format_file_size(1024 * 1024), "1.0 MB");
    }

    #[test]
    fn format_file_size_gibibytes() {
        assert_eq!(format_file_size(1024 * 1024 * 1024), "1.0 GB");
    }

    #[test]
    fn format_file_size_tebibytes() {
        assert_eq!(format_file_size(1024_u64.pow(4)), "1.0 TB");
    }

    #[test]
    fn format_file_size_clamps_above_tb() {
        // u64 max is ~16 EB, far beyond TB — previously UNITS[i] would panic.
        // The clamp keeps us at TB and produces a sensible large-TB number.
        let result = format_file_size(u64::MAX);
        assert!(result.ends_with(" TB"), "got {}", result);
    }
}
