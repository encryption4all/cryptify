import Lang from './Lang';

export default getTranslation;

function getTranslation(l: Lang): Translation {
  switch (l) {
  case Lang.EN:
    return english;
  case Lang.NL:
    return dutch;
  }
}

type Translation = {
  // generic
  estimate: string;
  cancel: string;
  error: string;
  tryAgain: string;
  timeremaining: (remaining: number) => string;

  // cryptFileInput
  cryptFileInput_dropFiles: string;
  cryptFileInput_clickFiles: string;
  cryptFileInput_sendUpto: string;
  cryptFileInput_addFileBtn: string;

  // cryptFileList
  cryptFileList_addMoreFiles: string;
  cryptFileList_tooLarge: string;
  cryptFileList_filesAdded: (n: number, fileSize: string) => string;

  // decryptPanel
  decryptPanel_header: string
  decryptPanel_downloadDecrypt: string;
  decryptPanel_irmaInstructionHeaderQr: string;
  decryptPanel_irmaInstructionHeaderMobile: string;
  decryptPanel_irmaInstructionQr: string;
  decryptPanel_irmaInstructionMobile: string;
  decryptPanel_noIrma: string;
  decryptPanel_decrypting: string;
  decryptPanel_succes: string;
  decryptPanel_askDownload: string;
  decryptPanel_askDownloadText: string;

  // encryptPanel
  encryptPanel_header: string,
  encryptPanel_emailRecipient: string;
  encryptPanel_emailSender: string;
  encryptPanel_message: string;
  encryptPanel_messageAnonymous: string;
  encryptPanel_encryptSend: string;
  encryptPanel_encrypting: string;
  encryptPanel_encryptingInfo: string;
  encryptPanel_succes: string;
  encryptPanel_succesInfo: string;
  encryptPanel_another: string;
  encryptPanel_irmaInstructionHeaderQr: string;
  encryptPanel_irmaInstructionHeaderMobile: string;
  encryptPanel_irmaInstructionQr: string;
  encryptPanel_irmaInstructionMobile: string;
  encryptPanel_encryptSendAnonymous: string;

  // infoPanel
  infoPanel_help: string;
  infoPanel_privacyPolicy: string;
  infoPanel_about: string;
  infoPanel_aboutHeader: string;
  infoPanel_aboutContent: string;
  infoPanel_aboutIrmaInfo: string;
  infoPanel_helpHeader: string;
  infoPanel_helpShareHeader: string;
  infoPanel_helpShareIntro: string;
  infoPanel_helpShareStep1: string;
  infoPanel_helpShareStep2: string;
  infoPanel_helpShareStep3: string;
  infoPanel_helpShareStep4: string;
  infoPanel_helpShareStep5: string;
  infoPanel_helpShareOutro: string;
  infoPanel_helpReceivedHeader: string;
  infoPanel_helpReceivedInstallIrmaIntro: string;
  infoPanel_helpReceivedInstallStep1: string;
  infoPanel_helpReceivedInstallStep2: string;
  infoPanel_helpReceivedInstallIrmaOutro: string;
  infoPanel_helpReceivedUseIrma: string;
  infoPanel_helpReceivedUseStep1: string;
  infoPanel_helpReceivedUseStep2: string;
  infoPanel_helpReceivedUseStep3: string;
  infoPanel_helpReceivedUseStep4: string;
  infoPanel_helpReceivedUseStep5: string;
  infoPanel_privacyPolicyHeader: string;
  infoPanel_privacyPolicyContent: string;
}



const english: Translation = {
  // generic
  estimate: "Estimating...",
  cancel: "Cancel",
  error: "Oops... We are really sorry but something went wrong. Please try again.",
  tryAgain: "Try again",
  timeremaining: (remaining: number) => {
    if (remaining < 1000 * 10) {
      return "A few seconds left.";
    }
    else if (remaining > 10 * 1000 && remaining <= 60 * 1000) {
      return `Less then a minute left.`;
    }
    else if (remaining > 60 * 1000 && remaining <= 60 * 60 * 1000) {
      const minutes = Math.round(remaining / (60 * 1000));
      return `Approximately ${minutes} minutes left.`;
    }
    else if (remaining > 60 * 60 * 1000 && remaining <= 24 * 60 * 60 * 1000) {
      const hours = Math.round(remaining / (60 * 60 * 1000));
      return `Approximately ${hours} hours left.`;
    }
    else {
      return `More then one day left.`;
    }
  },

  // cryptFileInput
  cryptFileInput_dropFiles: "Drag & drop files",
  cryptFileInput_clickFiles: "Or click the button below",
  cryptFileInput_sendUpto: "2GB maximum",
  cryptFileInput_addFileBtn: "Upload files",

  // cryptFileList
  cryptFileList_addMoreFiles: "Add more files",
  cryptFileList_tooLarge: "File sizes exceed 2GB",
  cryptFileList_filesAdded: (n: number, fs: string) => `${n} file(s) added - ${fs} left`,

  // decryptPanel
  decryptPanel_header: "Decrypt your files",
  decryptPanel_downloadDecrypt: "Downloading & Decrypting...",
  decryptPanel_irmaInstructionHeaderQr: "Scan QR-code with IRMA",
  decryptPanel_irmaInstructionHeaderMobile: "Prove your identity with IRMA",
  decryptPanel_irmaInstructionQr: "Decrypt the files by verifying your e-mail address. Please scan the QR-code below with the identification app IRMA.",
  decryptPanel_irmaInstructionMobile: "Decrypt the files by verifying your e-mail address. Please click the button below to open the IRMA-app.",
  decryptPanel_noIrma: "Don't have the IRMA-app yet?",
  decryptPanel_decrypting: "Your files are being downloaded and decrypted afterwards.",
  decryptPanel_succes: "Successfully downloaded and decrypted",
  decryptPanel_askDownload: "Download",
  decryptPanel_askDownloadText: "Press the button below to start decrypting and downloading your files",

  // encryptPanel
  encryptPanel_header: "ENCRYPT & UPLOAD",
  encryptPanel_emailRecipient: "Email recipient",
  encryptPanel_emailSender: "Your email",
  encryptPanel_message: "Message",
  encryptPanel_messageAnonymous: "Attention! This message is send anonymously so please be careful when downloading and opening the files.",
  encryptPanel_encryptSend: "Encrypt & send",
  encryptPanel_encrypting: "Encrypting & uploading...",
  encryptPanel_encryptingInfo: "Your files are being encrypted first and afterwards are send to: ",
  encryptPanel_succes: "Successfully encrypted and uploaded",
  encryptPanel_succesInfo: "Your encrypted files have been encrypted and uploaded. An email with a download link has been sent to: ",
  encryptPanel_another: "Send another",
  encryptPanel_irmaInstructionHeaderQr: "Show who you are by scanning the QR-code with IRMA",
  encryptPanel_irmaInstructionHeaderMobile: "Prove your identity with IRMA",
  encryptPanel_irmaInstructionQr: "Encrypt the files by verifying your e-mail address. Please scan the QR-code below with the identification app IRMA.",
  encryptPanel_irmaInstructionMobile: "Encrypt the files by verifying your e-mail address. Please click the button below to open the IRMA-app.",
  encryptPanel_encryptSendAnonymous: "Or send anonymously",

  // infoPanel
  infoPanel_about: "CRYPTIFY",
  infoPanel_help: "HELP",
  infoPanel_privacyPolicy: "PRIVACY POLICY",
  infoPanel_aboutHeader: "Private and secure file sharing",
  infoPanel_aboutContent: "With Cryptify you can safely send files in a privacy-friendly manner. Every file is encrypted specifically for the receiver. Only that person can decrypt that file. To do that the email address must be shown. For this the identification app <b><a href=\"https://irma.app/\">IRMA</u></a> is used.",
  infoPanel_aboutIrmaInfo: "Want to know more about the IRMA-app?",
  infoPanel_helpHeader: "Help",
  infoPanel_helpShareHeader: "I want to share a file",
  infoPanel_helpShareIntro: "Follow these steps to share your files securely via Cryptify: ",
  infoPanel_helpShareStep1: "On the webpage cryptify.nl, select the files that you wish to share and drag them to the dedicated area at the webpage.",
  infoPanel_helpShareStep2: "Enter the email address of the recipient",
  infoPanel_helpShareStep3: "Enter your own email address.",
  infoPanel_helpShareStep4: "Optionally enter an explanation message for the recipient.",
  infoPanel_helpShareStep5: "Click \"Encrypt & send\" and wait for the process to complete; and a confirmation is then displayed.",
  infoPanel_helpShareOutro: "The recipient will receive an email informing them that you have shared a file with them; the email also contains instructions on how to proceed. If you have provided a message, it will be included in the email. By using Cryptify you assume that the receiver already uses the IRMA app, or is willing to install the app and use it for the purpose of receiving your files.",
  infoPanel_helpReceivedHeader: "A file has been shared with me",
  infoPanel_helpReceivedInstallIrmaIntro: "To download and decrypt the file, you need the IRMA app. With the IRMA app, you can prove that you are the intended recipient and decrypt the files:",
  infoPanel_helpReceivedInstallStep1: "Install the free IRMA app (available on the <a href=\"https://apps.apple.com/app/irma-authenticatie/id1294092994\">App Store</a> on IOS. <a href=\"https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=en\">Google Play Store</a> and <a href=\"https://f-droid.org/en/packages/org.irmacard.cardemu/\">F-Droid</a> on Android)",
  infoPanel_helpReceivedInstallStep2: "Add your email address as a card into your IRMA app. You can do this <a href=\"https://sidnemailissuer.irmaconnect.nl/uitgifte/email/\">here</a>.",
  infoPanel_helpReceivedInstallIrmaOutro: "Installing and setting up IRMA only needs to be done once!",
  infoPanel_helpReceivedUseIrma: "If you have IRMA installed, you can download and decrypt the files: ",
  infoPanel_helpReceivedUseStep1: "Click the link (to your file) in the email from Cryptify. The Cryptify website opens.",
  infoPanel_helpReceivedUseStep2: "If you are using a computer, scan the QR code on the Cryptify website with your IRMA app. If you are using a mobile phone, click the button to open the IRMA app.",
  infoPanel_helpReceivedUseStep3: "The IRMA app asks you whether you wish to disclose your email address to Cryptify. This is necessary to prove that you are the intended recipient.",
  infoPanel_helpReceivedUseStep4: "After disclosing your email address, the file is automatically downloaded and decrypted. Wait until the process is complete.",
  infoPanel_helpReceivedUseStep5: "You can find the decrypted file in the download folder of your browser.",
  infoPanel_privacyPolicyHeader: "Privacy policy",
  infoPanel_privacyPolicyContent: "<p>Cryptify is a platform for sharing (large) files securely and easily between two users. Files shared via Cryptify are encrypted. Users must first use the IRMA app (irma.app) to prove that they are the intended recipient before they can decrypt the files. This is the essence of Cryptify. Cryptify is offered for free, as a social service, to make encrypted file sharing easy for everyone. Cryptify was developed with support from <a href=\"https://www.sidnfonds.nl/\">SIDN fonds</a>.</p><p>The Cryptify service is offered in collaboration between the company <a href=\"https://www.procolix.com/\">ProcoliX</a> and the <a href=\"https://privacybydesign.foundation/\">Privacy by Design Foundation</a>. ProcoliX and the foundation are jointly responsible for data processing. ProcoliX and the Privacy by Design Foundation are both data controllers, and each processes part of the data, as described in more detail below. Only data that is necessary for the Cryptify service is processed.</p><p>ProcoliX temporarily stores the encrypted files provided by users. ProcoliX cannot see the contents of these files because they are encrypted. Each file is accompanied by the email address of the intended recipient. The email address of the recipient and the encrypted files are kept for a maximum of 2 weeks and then are automatically deleted. ProcoliX processes email addresses to notify recipients by email about the files that have been uploaded for them. Both the sender's email address and the recipient's email address are used for this notification. Sent emails and email addresses are not stored by ProcoliX. Other technical personal data, such as IP addresses, are stored and deleted according to <a href=\"https://www.procolix.com/wp-content/uploads/2021/06/Algemene-voorwaarden-ProcoliX-v2.2.pdf\">ProcoliX's general policy</a>. When everything is running normally, this data is deleted after two days.</p><p>The Privacy by Design Foundation only processes the email addresses of recipients. These are needed to enable encryption and decryption via Cryptify. The processing of email addresses is done before the decryption. To decrypt files, a recipient must reveal his/her email address with the IRMA app, thus proving that he/she is the intended recipient. The server to which the visitor reveals his/her email address is managed by the Privacy by Design Foundation. When a user reveals his/her email address with IRMA, a private key associated with the email address is supplied by the server. That key is used to decrypt the files in the user's web browser. The visitor's email address is then immediately deleted by the server at the foundation. In particular, the foundation does not keep a log of email addresses. Other technical personal data, such as IP addresses, are also not stored.</p><p>ProcoliX temporarily stores the encrypted files but does not have access to the cryptographic keys (private keys) required for decryption. The Privacy by Design Foundation generates the private keys but does not have access to the encrypted files. ProcoliX and the foundation do not conspire to jointly decrypt files behind the backs of users.</p><p>Technical changes to the Cryptify system, or any new services, may result in modification of this privacy policy. ProcoliX and the Privacy by Design Foundation reserve the right to make such changes and will announce the new privacy policy as soon as possible via this page.</p><p>For any questions, comments, or complaints about this processing by ProcoliX and the Privacy by Design Foundation for Cryptify, please contactthe Cryptify team at <a href=\"mailto:info@cryptify.nl\">info@cryptify.nl</a>. or complaints about the processingof data by ProcoliX, the Authority for the Protection of Personal Data can also be contacted.</p>",
};

const dutch: Translation = {
  // generic
  estimate: "schatten...",
  cancel: "Annuleren",
  error: "Oeps... Excuses, er is iets fout gegaan. Probeer het nog een keer.",
  tryAgain: "Opnieuw proberen",
  
  timeremaining: (remaining: number) => {
    if (remaining < 1000 * 10) {
      return "Nog enkele seconden.";
    }
    else if (remaining > 10 * 1000 && remaining <= 60 * 1000) {
      return `Nog enkele minuten.`;
    }
    else if (remaining > 60 * 1000 && remaining <= 60 * 60 * 1000) {
      const minutes = Math.round(remaining / (60 * 1000));
      return `Nog ongeveer ${minutes} minuten.`;
    }
    else if (remaining > 60 * 60 * 1000 && remaining <= 24 * 60 * 60 * 1000) {
      const hours = Math.round(remaining / (60 * 60 * 1000));
      return `Nog ongeveer ${hours} uren.`;
    }
    else {
      return `Nog meer dan een dag.`;
    }
  },

  cryptFileInput_dropFiles: "Drag & drop bestanden",
  cryptFileInput_clickFiles: "Of klik op de knop hieronder",
  cryptFileInput_sendUpto: "maximaal 2GB",
  cryptFileInput_addFileBtn: "Bestanden toevoegen",
  
  // cryptFileList
  cryptFileList_addMoreFiles: "Voeg meer bestanden toe",
  cryptFileList_tooLarge: "Bestanden zijn groter dan 2GB",
  cryptFileList_filesAdded: (n: number, fs: string) => `${n} bestand(en) toegevoegd - ${fs} over`,

  // decryptPanel
  decryptPanel_header: "DOWNLOAD & ONTSLEUTEL",
  decryptPanel_downloadDecrypt: "Downloading & ontsleutelen...",
  decryptPanel_irmaInstructionHeaderQr: "Scan QR-code met IRMA",
  decryptPanel_irmaInstructionHeaderMobile: "Bewijs identiteit met IRMA",
  decryptPanel_irmaInstructionQr: "Ontsleutel het bestand door je e-mailadres te tonen. Scan daarvoor de onderstaande QR-code met de identificatie app IRMA.",
  decryptPanel_irmaInstructionMobile: "Ontsleutel het bestand door je e-mailadres te tonen. Click daarvoor op de onderstaande knop om naar de identificatie app IRMA te gaan.",
  decryptPanel_noIrma: "Nog geen IRMA-app?",
  decryptPanel_decrypting: "Jouw bestand wordt gedownload en vervolgens ontsleuteld.",
  decryptPanel_succes: "Succesvol gedownload en ontsleuteld",
  decryptPanel_askDownload: "Download",
  decryptPanel_askDownloadText: "Druk op onderstaande knop om de bestanden te ontsleutelen en downloaden.",

  // encryptPanel
  encryptPanel_header: "VERSLEUTEL & VERZEND",
  encryptPanel_emailRecipient: "E-mailadres ontvanger",
  encryptPanel_emailSender: "Jouw e-mailadres",
  encryptPanel_message: "Bericht",
  encryptPanel_messageAnonymous: "Let op! Dit bericht is anoniem verzonden dus kijk goed uit bij het downloaden en openen van de bestanden.",
  encryptPanel_encryptSend: "Versleutel & verzend",
  encryptPanel_encrypting: "Versleutelen & verzenden...",
  encryptPanel_encryptingInfo: "Jouw bestanden worden versleuteld en daarna verzonden naar: ",
  encryptPanel_succes: "Succesvol versleuteld en verzonden",
  encryptPanel_succesInfo: "Jouw bestanden zijn versleuteld en verzonden. Een e-mail met een download link is verstuurd naar: ",
  encryptPanel_another: "Nog iets versturen",
  encryptPanel_irmaInstructionHeaderQr: "Laat zien wie je bent door de QR-code te scannen met IRMA",
  encryptPanel_irmaInstructionHeaderMobile: "Bewijs identiteit met IRMA",
  encryptPanel_irmaInstructionQr: "Versleutel de bestanden door je e-mailadres te verifieren. Scan daarvoor de onderstaande QR-code met de identificatie app IRMA.",
  encryptPanel_irmaInstructionMobile: "Versleutel de bestanden door je e-mailadres te verifieren. Click daarvoor op de onderstaande knop om naar de identificatie app IRMA te gaan.",
  encryptPanel_encryptSendAnonymous: "Of verzend anoniem",

  // infoPanel
  infoPanel_about: "CRYPTIFY",
  infoPanel_help: "HELP",
  infoPanel_privacyPolicy: "PRIVACYBELEID",
  infoPanel_aboutHeader: "Veilig en privacy-vriendelijk bestanden delen",
  infoPanel_aboutContent: "Met Cryptify kun je veilig en privacy-vriendelijk bestanden versturen. Ieder bestand wordt persoonlijk versleuteld, voor de ontvanger. Alleen die persoon kan het bestand ontsleutelen. Daarvoor moet het eigen mobiele nummer getoond worden. Hiervoor wordt de identificatie app  <b><a href=\"https://irma.app/\">IRMA</u></a> gebruikt.",
  infoPanel_aboutIrmaInfo: "meer weten over de IRMA-app?",
  infoPanel_helpHeader: "Help",
  infoPanel_helpShareHeader: "Ik wil een bestand delen",
  infoPanel_helpShareIntro: "Volg deze stappen om je bestanden veilig te delen:",
  infoPanel_helpShareStep1: "Selecteer de bestanden die u wilt delen en sleep ze naar het daarvoor bestemde vlak op de pagina.",
  infoPanel_helpShareStep2: "Voer het e-mailadres van de ontvanger in.",
  infoPanel_helpShareStep3: "Voer uw eigen e-mailadres in.",
  infoPanel_helpShareStep4: "Voeg optioneel een bericht met toelichting voor de ontvanger toe.",
  infoPanel_helpShareStep5: "Klik op \"Versleutelen & verzenden\" en wacht to het proces is voltooid en een bevestiging wordt getoond.",
  infoPanel_helpShareOutro: "De ontvanger ontvangt een e-mail met de melding dat u een bestand met hem/haar hebt gedeeld. Als u een bericht heeft toegevoegd, zal dit in de e-mail worden opgenomen. Door Cryptify te gebruiken gaat u er van uit dat de ontvanger de IRMA app heeft, of de app will installeren en gebruiken om uw files te ontvangen.",
  infoPanel_helpReceivedHeader: "Er is een bestand met mij gedeeld",
  infoPanel_helpReceivedInstallIrmaIntro: "Om het bestand te downloaden en te ontsleutelen, heb je de IRMA app nodig. Met de IRMA-app kan je bewijzen dat jij de bedoelde ontvanger bent en de bestanden ontsleutelen:",
  infoPanel_helpReceivedInstallStep1: "Installeer de gratis IRMA-app (beschikbaar voor <a href=\"https://apps.apple.com/nl/app/irma-authenticatie/id1294092994\">App Store</a> op IOS. <a href=\"https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=nl\">Google Play Store</a> en <a href=\"https://f-droid.org/nl/packages/org.irmacard.cardemu/\">F-Droid</a> op Android.)",
  infoPanel_helpReceivedInstallStep2: "Voeg uw e-mailadres toe aan uw IRMA-app. U kunt dit <a href=\"https://sidnemailissuer.irmaconnect.nl/uitgifte/email/\">hier</a> doen.",
  infoPanel_helpReceivedInstallIrmaOutro: "Het installeren en instellen van IRMA hoeft maar één keer te gebeuren!",
  infoPanel_helpReceivedUseIrma: "Als u IRMA heeft geïnstalleerd, kunt u de bestanden downloaden en ontsleutelen:",
  infoPanel_helpReceivedUseStep1: "Klik op de link (voor je bestand) in de e-mail van Cryptify. De Cryptify website wordt geopend.",
  infoPanel_helpReceivedUseStep2: "Als u een computer gebruikt, scan dan de QR-code op de Cryptify-website met de IRMA-app. Als u een mobiele telefoon gebruikt, klik dan op de knop om de IRMA app te openen.",
  infoPanel_helpReceivedUseStep3: "De IRMA-app vraagt of u uw e-mailadres wilt doorgeven aan Cryptify. Dit is nodig om te bewijzen dat u de beoogde ontvanger bent.",
  infoPanel_helpReceivedUseStep4: "Na het doorgeven van uw e-mailadres, wordt het bestand automatisch gedownload en ontsleuteld. Wacht tot het proces is voltooid.",
  infoPanel_helpReceivedUseStep5: "U vindt uwhet nieuwe bestand in de downloadmap van uw browser.",
  infoPanel_privacyPolicyHeader: "Privacybeleid",
  infoPanel_privacyPolicyContent: "<p>Cryptify is een platform om (grote) bestanden op een veilige en makkelijke manier te delen tussen twee gebruikers. Bestanden die via Cryptify gedeeld worden zijn versleuteld. Gebruikers moeten met de app IRMA (irma.app) eerst aantonen dat ze de beoogde ontvanger zijn om daarna pas de bestanden te kunnen ontsleutelen. Dit is de essentie van Cryptify. Cryptify wordt gratis aangeboden, als maatschappelijke dienstverlening, om het versleuteld delen vanbestanden voor iedereen makkelijk mogelijk te maken. Cryptify is ontwikkeld met steun van <a href=\"https://www.sidnfonds.nl/\">SIDN fonds</a>.</p> <p>De Cryptify dienst wordt in samenwerking tussen het bedrijf <a href=\"https://www.procolix.com/\">ProcoliX</a> en de <a href=\"https://privacybydesign.foundation/\">stichting Privacy by Design</a> aangeboden. ProcoliX en de stichting zijn gezamenlijkverantwoordelijk voor de gegevensverwerking. De ProcoliX en de stichting zijn allebei verwerkingsverantwoordelijken en verwerken samen ieder een deel van de gegevens, zoals hieronder in meer detail beschreven wordt. Alleen gegevens die voor de Cryptify dienst noodzakelijk zijn worden verwerkt.</p> <p>ProcoliX slaat versleutelde bestanden die door gebruikers aangeleverd worden tijdelijk op. ProcoliX kan de inhoud van deze bestanden niet zien, omdat ze versleuteld zijn. Aan ieder bestand is het e-mailadres van de beoogde ontvanger gekoppeld. Het e-mailadres van de ontvanger en de versleutelde bestanden worden maximaal 2 weken bewaard en dan automatisch verwijderd. ProcoliX verwerkt e-mailaddressen om ontvangers via e-mail te informeren over de bestanden die voor hen zijn geüpload. Voor dit bericht wordt zowel het e-mailadres van de verzender als ook het e-mailadres van de ontvanger gebruikt. Verstuurde e-mails en e-mailadressen worden door ProcoliX niet bewaard. Andere, technische persoonsgegevens, zoals IP-adressen worden opgeslagen en verwijderd volgens het <a href=\"https://www.procolix.com/wp-content/uploads/2021/06/Algemene-voorwaarden-ProcoliX-v2.2.pdf\">Algemene beleid van ProcoliX</a>. Wanneer alles normaal verloopt worden deze gegevens na 2 dagen verwijderd.</p> <p>De stichting Privacy by Design verwerkt enkel e-mailadressen van ontvangers. Die zijn nodig om de versleuteling en ontsleuteling via Cryptify mogelijk te maken. Het verwerken van e-mailadressen gebeurt voorafgaand aan het ontsleutelen. Om bestanden te kunnen ontsleutelen moet een ontvanger met IRMA zijn/haar e-mailadres onthullen, via de IRMA app, en zo aantonen dat hij/zij de beoogde ontvanger is. De server waaraan de bezoeker zijn/haar e-mailadres onthult wordt beheerd door de stichting Privacy by Design. Als een gebruiker zijn/haar e-mailadres onthult met IRMA, wordt door de server een private key die bij het email-adres hoort aangeleverd. Met die sleutel worden de bestanden in de webbrowser van de gebruiker ontsleuteld. Het e-mailadres van de bezoeker wordt dan direct verwijderd door de server bij de stichting. In het bijzonder houdt de stichting geen log bij van e-mailadressen. Andere, technische persoonsgegevens, zoals IP-adressen worden ook niet opgeslagen.</p> <p>Procolix slaat de versleutelde bestanden tijdelijk op, maar heeft geen toegang tot de cryptografische sleutels (private keys) die nodig zijn voor ontsleuteling. De stichting Privacy by Design genereert de private keys, maar heeft geen toegang tot de versleutelde bestanden. ProcoliX en de stichting spannen niet samen om gezamenlijk, buiten gebruikers om, bestanden te ontsleutelen.</p> <p>Technische veranderingen in het Cryptify systeem, of eventuele nieuwe diensten, kunnen leiden tot een aanpassing van deze privacy policy. ProcoliX en de stichting Privacy by Design behouden zich het recht voor om dergelijke wijzigingen door te voeren en zullen de nieuwe privacy policy zo snel mogelijk via deze pagina bekend maken.</p> <p>Voor eventuele vragen, opmerkingen, of klachten over deze verwerkingen door ProcoliX en de stichting Privacy by Design ten behoeve van Cryptify kan contact opgenomen worden met het Cryptify team op <a href=\"mailto:info@cryptify.nl\">info@cryptify.nl</a>. Voor klachten over de verwerking van gegevens door ProcoliX kan ook contact opgenomen worden met de Autoriteit Persoonsgegevens.</p>",
};
