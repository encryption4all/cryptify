use crate::config::CryptifyConfig;
use crate::store::FileState;

use askama::Template;

use chrono::{format::Locale, TimeZone};

use lettre::{
    message::{
        header::{ContentType, Header, HeaderName, HeaderValue},
        Attachment, Mailbox, MultiPart, SinglePart,
    },
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

const X_POSTGUARD_VERSION: &str = env!("PG_CORE_VERSION");

/// `Auto-Submitted: auto-generated` per RFC 3834. Signals to receiving MTAs
/// and mail clients that this is a machine-generated transactional message,
/// suppresses vacation-responder loops, and is one of the deliverability
/// signals Gmail's bulk-sender heuristics look for.
#[derive(Clone, Debug)]
struct AutoSubmitted;

impl Header for AutoSubmitted {
    fn name() -> HeaderName {
        HeaderName::new_from_ascii_str("Auto-Submitted")
    }

    fn parse(_s: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Ok(AutoSubmitted)
    }

    fn display(&self) -> HeaderValue {
        HeaderValue::new(Self::name(), "auto-generated".to_owned())
    }
}

/// Suffix that identifies the signer's full-name attribute across IRMA
/// schemes — prod (`pbdf.gemeente.personalData.fullname`) and demo
/// (`irma-demo.gemeente.personalData.fullname`) both end with this. When
/// such an attribute appears in `FileState.sender_attributes` we render
/// the disclosed name in place of the bare email everywhere the sender
/// is shown in the body.
const FULLNAME_ATYPE_SUFFIX: &str = ".gemeente.personalData.fullname";

/// Per-credential suffixes for the `(firstName, lastName)` pairs the
/// signer may disclose instead of the gemeente fullname (postguard#239
/// follow-up). Each entry's `.firstName` / `.lastName` pair, when both
/// are present and non-empty, is concatenated into a single display name.
/// Suffix-matching catches both `pbdf.pbdf.*` and `irma-demo.pbdf.*`.
const NAME_PAIR_CREDENTIAL_SUFFIXES: &[&str] =
    &[".pbdf.passport", ".pbdf.idcard", ".pbdf.drivinglicence"];

fn is_fullname_atype(atype: &str) -> bool {
    atype.ends_with(FULLNAME_ATYPE_SUFFIX)
}

/// If `attrs` contains `<cred>.firstName` and `<cred>.lastName` for one of
/// the supported credentials and both are non-empty, remove them and
/// return `"<firstName> <lastName>"`. Otherwise leave `attrs` untouched.
fn take_firstname_lastname_pair(attrs: &mut Vec<(String, String)>) -> Option<String> {
    for cred in NAME_PAIR_CREDENTIAL_SUFFIXES {
        let first_suffix = format!("{}.firstName", cred);
        let last_suffix = format!("{}.lastName", cred);

        let first_idx = attrs.iter().position(|(t, _)| t.ends_with(&first_suffix));
        let last_idx = attrs.iter().position(|(t, _)| t.ends_with(&last_suffix));

        if let (Some(fi), Some(li)) = (first_idx, last_idx) {
            let first_val = attrs[fi].1.clone();
            let last_val = attrs[li].1.clone();
            if !first_val.is_empty() && !last_val.is_empty() {
                // Remove the higher index first so the second remove is
                // still valid.
                let (hi, lo) = if fi > li { (fi, li) } else { (li, fi) };
                attrs.remove(hi);
                attrs.remove(lo);
                return Some(format!("{} {}", first_val, last_val));
            }
        }
    }
    None
}

/// Embedded PostGuard logo, served inline via a `Content-ID: <pg-logo>`
/// MIME part rather than fetched from postguard.eu. Removes the
/// HTML-only-plus-remote-image spam signal flagged in postguard#197.
const LOGO_PNG: &[u8] = include_bytes!("../templates/email/pg_logo.png");

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
    subject_str: "heeft je bestanden gestuurd",
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
    subject_str: "sent you files",
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

#[derive(Template)]
#[template(path = "email/email.txt", escape = "none")]
struct EmailTextTemplate<'a> {
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

/// Assemble the MIME body: a `multipart/alternative` whose HTML branch is
/// itself a `multipart/related` carrying the HTML part plus the PostGuard
/// logo as an inline image referenced via `cid:pg-logo`. This shape avoids
/// the HTML-only + remote-image spam signal flagged in postguard#197 while
/// keeping graceful degradation for text-only clients.
fn build_body(html: String, text: String) -> Result<MultiPart, Box<dyn std::error::Error>> {
    let logo = Attachment::new_inline("pg-logo".to_string())
        .body(LOGO_PNG.to_vec(), "image/png".parse::<ContentType>()?);

    let related = MultiPart::related()
        .singlepart(SinglePart::html(html))
        .singlepart(logo);

    Ok(MultiPart::alternative()
        .singlepart(SinglePart::plain(text))
        .multipart(related))
}

/// Resolve the display string and remaining attribute pills for the
/// sender. When the signer disclosed a name it is used as the display;
/// the name attribute is removed from the pill list so it doesn't render
/// twice. An empty disclosed value is treated as not disclosed. When no
/// name is available the display falls back to "PostGuard".
fn sender_display(state: &FileState) -> (String, Vec<(String, String)>) {
    let mut attrs = state.sender_attributes.clone();

    // 1. Prefer gemeente.personalData.fullname (Dutch municipality credential).
    let name = attrs
        .iter()
        .position(|(t, _)| is_fullname_atype(t))
        .map(|i| attrs.remove(i).1)
        .filter(|n| !n.is_empty())
        // 2. Otherwise concatenate firstName + lastName from passport / id /
        //    driving licence (postguard#239 follow-up).
        .or_else(|| take_firstname_lastname_pair(&mut attrs));

    let display = name.unwrap_or_else(|| "PostGuard".to_string());
    (display, attrs)
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

fn email_templates(state: &FileState, url: &str) -> (String, String, String) {
    let strings = match state.mail_lang {
        Language::En => EN_STRINGS,
        Language::Nl => NL_STRINGS,
    };

    let (display, attrs) = sender_display(state);
    let file_size = format_file_size(state.uploaded);
    let expiry_date = format_date(state.expires, &state.mail_lang);

    let html = EmailTemplate {
        header: &display,
        subheader: strings.sender_str,
        expires_str: strings.expires_str,
        download_str: strings.download_str,
        link_str: strings.link_str,
        file_size: &file_size,
        expiry_date: &expiry_date,
        html_content: &state.mail_content,
        confirm: "",
        files_from: strings.files_from,
        sender_email: &display,
        sender_attributes: &attrs,
        url,
    };
    let text = EmailTextTemplate {
        header: &display,
        subheader: strings.sender_str,
        expires_str: strings.expires_str,
        download_str: strings.download_str,
        link_str: strings.link_str,
        file_size: &file_size,
        expiry_date: &expiry_date,
        html_content: &state.mail_content,
        confirm: "",
        files_from: strings.files_from,
        sender_email: &display,
        sender_attributes: &attrs,
        url,
    };
    let subject = SubjectTemplate {
        subject_str: strings.subject_str,
        sender: &display,
    };
    (html.to_string(), text.to_string(), subject.to_string())
}

fn email_confirm(state: &FileState, url: &str) -> (String, String, String) {
    let strings = match state.mail_lang {
        Language::En => EN_STRINGS,
        Language::Nl => NL_STRINGS,
    };

    let (display, attrs) = sender_display(state);
    let file_size = format_file_size(state.uploaded);
    let expiry_date = format_date(state.expires, &state.mail_lang);
    let recipients = state.recipients.to_string();

    let html = EmailTemplate {
        header: strings.header_confirm,
        subheader: &recipients,
        expires_str: strings.expires_str,
        link_str: strings.link_str,
        file_size: &file_size,
        expiry_date: &expiry_date,
        html_content: &state.mail_content,
        download_str: strings.download_str,
        confirm: strings.confirm,
        files_from: strings.files_from,
        sender_email: &display,
        sender_attributes: &attrs,
        url,
    };
    let text = EmailTextTemplate {
        header: strings.header_confirm,
        subheader: &recipients,
        expires_str: strings.expires_str,
        link_str: strings.link_str,
        file_size: &file_size,
        expiry_date: &expiry_date,
        html_content: &state.mail_content,
        download_str: strings.download_str,
        confirm: strings.confirm,
        files_from: strings.files_from,
        sender_email: &display,
        sender_attributes: &attrs,
        url,
    };

    let subject = SubjectTemplate {
        subject_str: strings.subject_confirm,
        sender: "",
    };

    (html.to_string(), text.to_string(), subject.to_string())
}

pub async fn send_email(
    config: &CryptifyConfig,
    state: &FileState,
    uuid: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    if config.staging_mode() {
        return Ok(staging_log_email(config, state, uuid));
    }

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

            let (html, text, subject) = email_templates(state, url.as_str());
            let mut builder = Message::builder()
                .header(XPostGuard(X_POSTGUARD_VERSION.to_owned()))
                .header(AutoSubmitted)
                .from(config.email_from()) // checked in config
                .to(recipient.clone())
                .subject(subject);
            if let Some(sender) = state.sender.as_deref() {
                match sender.parse::<Mailbox>() {
                    Ok(mailbox) => builder = builder.reply_to(mailbox),
                    Err(e) => log::warn!(
                        "Skipping Reply-To: sender `{}` did not parse as Mailbox: {}",
                        sender,
                        e
                    ),
                }
            }
            let email = builder.multipart(build_body(html, text)?)?;

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
            .append_pair("recipient", &sender);

        let (html, text, subject) = email_confirm(state, url.as_str());
        let email = Message::builder()
            .header(XPostGuard(X_POSTGUARD_VERSION.to_owned()))
            .header(AutoSubmitted)
            .from(config.email_from())
            .to(sender.parse()?)
            .subject(subject)
            .multipart(build_body(html, text)?)?;

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

/// Staging-mode replacement for actual SMTP delivery. Logs a clearly
/// marked record of the email that *would* have been sent (recipients,
/// sender, attributes, expiry, download URL) so operators of a staging
/// deployment can observe the full flow without contacting an SMTP
/// server. Returns a summary string in the same `Result::Ok` shape as
/// real sends.
fn staging_log_email(config: &CryptifyConfig, state: &FileState, uuid: &str) -> String {
    let sender = state.sender.as_deref().unwrap_or("<unknown>");
    let lang = match state.mail_lang {
        Language::En => "EN",
        Language::Nl => "NL",
    };
    let recipients: Vec<String> = state
        .recipients
        .iter()
        .map(|m| m.email.to_string())
        .collect();
    let attrs: Vec<String> = state
        .sender_attributes
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect();

    let base = Url::parse(config.server_url()).ok();
    let download_url = base
        .and_then(|b| b.join("/download").ok())
        .map(|mut u| {
            u.query_pairs_mut().append_pair("uuid", uuid);
            u.to_string()
        })
        .unwrap_or_else(|| format!("(unparseable server_url={})", config.server_url()));

    let summary = format!(
        "[STAGING] Email NOT sent (staging_mode=true). Would have notified recipients={:?} \
         from sender={} (attributes=[{}]) lang={} expires={} confirm={} notify_recipients={} \
         download_url={} uuid={}",
        recipients,
        sender,
        attrs.join(", "),
        lang,
        state.expires,
        state.confirm,
        state.notify_recipients,
        download_url,
        uuid,
    );

    log::info!("{}", summary);
    summary
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x_postguard_header_name_matches_outlook_filter() {
        assert_eq!(format!("{}", XPostGuard::name()), "X-PostGuard");
    }

    #[test]
    fn auto_submitted_header_emits_auto_generated() {
        use lettre::message::Mailbox;
        let msg = Message::builder()
            .from("noreply@example.com".parse::<Mailbox>().unwrap())
            .to("to@example.com".parse::<Mailbox>().unwrap())
            .subject("t")
            .header(AutoSubmitted)
            .body(String::from("hi"))
            .expect("build");
        let raw = String::from_utf8(msg.formatted()).expect("utf8");
        assert!(
            raw.contains("Auto-Submitted: auto-generated"),
            "expected Auto-Submitted header, got: {}",
            raw
        );
    }

    #[test]
    fn sender_display_promotes_disclosed_name() {
        let state = filestate_with_attrs(vec![
            (
                "pbdf.gemeente.personalData.fullname".to_owned(),
                "Jan Jansen".to_owned(),
            ),
            ("orgName".to_owned(), "Acme".to_owned()),
        ]);
        let (display, remaining) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
        assert_eq!(remaining, vec![("orgName".to_owned(), "Acme".to_owned())]);
    }

    #[test]
    fn sender_display_promotes_disclosed_name_from_demo_scheme() {
        let state = filestate_with_attrs(vec![(
            "irma-demo.gemeente.personalData.fullname".to_owned(),
            "Jan Jansen".to_owned(),
        )]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
    }

    #[test]
    fn sender_display_treats_empty_disclosed_name_as_not_disclosed() {
        let state = filestate_with_attrs(vec![(
            "pbdf.gemeente.personalData.fullname".to_owned(),
            String::new(),
        )]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "PostGuard");
    }

    #[test]
    fn sender_display_falls_back_to_postguard_when_no_name_disclosed() {
        let state = filestate_with_attrs(vec![("orgName".to_owned(), "Acme".to_owned())]);
        let (display, remaining) = sender_display(&state);
        assert_eq!(display, "PostGuard");
        assert_eq!(remaining, vec![("orgName".to_owned(), "Acme".to_owned())]);
    }

    #[test]
    fn sender_display_concatenates_firstname_lastname_from_passport() {
        let state = filestate_with_attrs(vec![
            ("pbdf.pbdf.passport.firstName".to_owned(), "Jan".to_owned()),
            (
                "pbdf.pbdf.passport.lastName".to_owned(),
                "Jansen".to_owned(),
            ),
            ("orgName".to_owned(), "Acme".to_owned()),
        ]);
        let (display, remaining) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
        assert_eq!(
            remaining,
            vec![("orgName".to_owned(), "Acme".to_owned())],
            "both name attrs consumed; unrelated attrs kept"
        );
    }

    #[test]
    fn sender_display_concatenates_firstname_lastname_from_idcard() {
        let state = filestate_with_attrs(vec![
            ("pbdf.pbdf.idcard.firstName".to_owned(), "Jan".to_owned()),
            ("pbdf.pbdf.idcard.lastName".to_owned(), "Jansen".to_owned()),
        ]);
        let (display, remaining) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
        assert!(remaining.is_empty());
    }

    #[test]
    fn sender_display_concatenates_firstname_lastname_from_drivinglicence() {
        let state = filestate_with_attrs(vec![
            (
                "pbdf.pbdf.drivinglicence.firstName".to_owned(),
                "Jan".to_owned(),
            ),
            (
                "pbdf.pbdf.drivinglicence.lastName".to_owned(),
                "Jansen".to_owned(),
            ),
        ]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
    }

    #[test]
    fn sender_display_concatenates_firstname_lastname_from_demo_scheme() {
        let state = filestate_with_attrs(vec![
            (
                "irma-demo.pbdf.passport.firstName".to_owned(),
                "Jan".to_owned(),
            ),
            (
                "irma-demo.pbdf.passport.lastName".to_owned(),
                "Jansen".to_owned(),
            ),
        ]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "Jan Jansen");
    }

    #[test]
    fn sender_display_prefers_gemeente_fullname_over_passport_pair() {
        // If both are disclosed (unlikely in practice), gemeente wins
        // because that path runs first.
        let state = filestate_with_attrs(vec![
            (
                "pbdf.gemeente.personalData.fullname".to_owned(),
                "Marie Smit".to_owned(),
            ),
            ("pbdf.pbdf.passport.firstName".to_owned(), "Jan".to_owned()),
            (
                "pbdf.pbdf.passport.lastName".to_owned(),
                "Jansen".to_owned(),
            ),
        ]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "Marie Smit");
    }

    #[test]
    fn sender_display_falls_through_when_firstname_present_without_lastname() {
        let state = filestate_with_attrs(vec![(
            "pbdf.pbdf.passport.firstName".to_owned(),
            "Jan".to_owned(),
        )]);
        let (display, remaining) = sender_display(&state);
        // No lastName → no concatenation; the orphan firstName stays as a
        // pill so the recipient at least sees it instead of having it
        // silently dropped.
        assert_eq!(display, "PostGuard");
        assert_eq!(
            remaining,
            vec![("pbdf.pbdf.passport.firstName".to_owned(), "Jan".to_owned())]
        );
    }

    #[test]
    fn sender_display_treats_empty_firstname_lastname_as_not_disclosed() {
        let state = filestate_with_attrs(vec![
            ("pbdf.pbdf.passport.firstName".to_owned(), String::new()),
            (
                "pbdf.pbdf.passport.lastName".to_owned(),
                "Jansen".to_owned(),
            ),
        ]);
        let (display, _) = sender_display(&state);
        assert_eq!(display, "PostGuard");
    }

    #[test]
    fn sender_display_uses_postguard_when_no_name_disclosed() {
        let mut state = filestate_with_attrs(vec![]);
        state.sender = None;
        let (display, remaining) = sender_display(&state);
        assert_eq!(display, "PostGuard");
        assert!(remaining.is_empty());
    }

    #[test]
    fn x_postguard_header_round_trips() {
        let parsed = XPostGuard::parse(X_POSTGUARD_VERSION).expect("parse");
        assert_eq!(parsed.0, X_POSTGUARD_VERSION);
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
        let expected = format!("X-PostGuard: {}", X_POSTGUARD_VERSION);
        assert!(
            raw.contains(&expected),
            "expected `{}` header in message, got: {}",
            expected,
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

    fn filestate_with_attrs(attrs: Vec<(String, String)>) -> FileState {
        let mut state = staging_filestate();
        state.sender_attributes = attrs;
        state
    }

    fn staging_filestate() -> FileState {
        use lettre::message::{Mailbox, Mailboxes};
        let mut mboxes = Mailboxes::new();
        mboxes.push("alice@example.com".parse::<Mailbox>().unwrap());
        mboxes.push("bob@example.com".parse::<Mailbox>().unwrap());
        FileState {
            uploaded: 1234,
            cryptify_token: String::new(),
            expires: 1_700_000_000,
            recipients: mboxes,
            mail_content: String::new(),
            mail_lang: Language::En,
            sender: Some("sender@example.com".to_owned()),
            sender_attributes: vec![
                ("orgName".to_owned(), "Acme".to_owned()),
                ("phone".to_owned(), "+31123".to_owned()),
            ],
            confirm: true,
            source_channel: String::new(),
            notify_recipients: true,
            api_key_tenant: None,
            api_key_validation_failed: false,
            last_chunk: None,
            recovery_token: String::new(),
        }
    }

    #[rocket::async_test]
    async fn staging_mode_skips_smtp_and_returns_summary() {
        let config = CryptifyConfig::for_test("https://staging.example.com/", true);
        let state = staging_filestate();
        let res = send_email(&config, &state, "uuid-abc")
            .await
            .expect("staging mode should return Ok without contacting SMTP");
        assert!(res.starts_with("[STAGING]"), "got: {}", res);
        assert!(res.contains("alice@example.com"), "got: {}", res);
        assert!(res.contains("bob@example.com"), "got: {}", res);
        assert!(res.contains("sender@example.com"), "got: {}", res);
        assert!(res.contains("orgName=Acme"), "got: {}", res);
        assert!(res.contains("uuid=uuid-abc"), "got: {}", res);
        assert!(
            res.contains("https://staging.example.com/download?uuid=uuid-abc"),
            "got: {}",
            res
        );
    }

    #[test]
    fn format_file_size_clamps_above_tb() {
        // u64 max is ~16 EB, far beyond TB — previously UNITS[i] would panic.
        // The clamp keeps us at TB and produces a sensible large-TB number.
        let result = format_file_size(u64::MAX);
        assert!(result.ends_with(" TB"), "got {}", result);
    }
}
