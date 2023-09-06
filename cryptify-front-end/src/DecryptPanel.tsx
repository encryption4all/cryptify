import "./DecryptPanel.css";
import React from "react";
import CryptFileList from "./CryptFileList";
import createProgressReporter from "./ProgressReporter";
import streamSaver from "streamsaver";
import Lang from "./Lang";
import getTranslation from "./Translations";
import yiviLogo from "./resources/yivi-logo.svg";
import appleAppStoreEN from "./resources/apple-appstore-en.svg";
import googlePlayStoreEN from "./resources/google-playstore-en.svg";
import appleAppStoreNL from "./resources/apple-appstore-nl.svg";
import googlePlayStoreNL from "./resources/google-playstore-nl.svg";
import checkmark from "./resources/checkmark.svg";

import { SMOOTH_TIME, PKG_URL, METRICS_HEADER } from "./Constants";
import { getFileLoadStream } from "./FileProvider";
import { withTransform } from "./utils";

import YiviCore from "@privacybydesign/yivi-core";
import YiviWeb from "@privacybydesign/yivi-web";
import YiviClient from "@privacybydesign/yivi-client";

//import "@privacybydesign/yivi-css";
import { IPolicy } from "@e4a/pg-wasm";

streamSaver.mitm = `${process.env.PUBLIC_URL}/mitm.html?version=2.0.0`;

enum DecryptionState {
  IrmaSession = 1,
  AskDownload,
  Decrypting,
  Done,
  Error,
}

type StreamDecryptInfo = {
  unsealer: any;
  usk: string;
  id: string;
};

type DecryptState = {
  decryptionState: DecryptionState;
  fakeFile: File | null;
  decryptInfo: StreamDecryptInfo | null;
  percentage: number;
  done: boolean;
  abort: AbortController;
  selfAborted: boolean;
  decryptStartTime: number;
  modPromise: Promise<any>;
  vkPromise: Promise<string>;
  senderPublic: string;
  senderPrivate?: IPolicy;
};

type DecryptProps = {
  lang: Lang;
  downloadUuid: string;
  recipient: string;
};

async function getVerificationKey(): Promise<string> {
  let resp = await fetch(`${PKG_URL}/v2/sign/parameters`, {
    headers: METRICS_HEADER,
  });
  let params = await resp.json();
  return params.publicKey;
}

const defaultDecryptState: DecryptState = {
  decryptionState: DecryptionState.IrmaSession,
  fakeFile: null,
  decryptInfo: null,
  percentage: 0,
  done: false,
  abort: new AbortController(),
  selfAborted: false,
  decryptStartTime: 0,
  modPromise: import("@e4a/pg-wasm"),
  vkPromise: getVerificationKey(),
  senderPublic: "",
};

export default class DecryptPanel extends React.Component<
  DecryptProps,
  DecryptState
> {
  constructor(props: DecryptProps) {
    super(props);
    this.state = defaultDecryptState;
  }

  // Based on:https://gitlab.science.ru.nl/irma/github-mirrors/irma-frontend-packages/-/blob/master/irma-core/user-agent.js
  isMobile(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    // IE11 doesn't have window.navigator, test differently
    // https://stackoverflow.com/questions/21825157/internet-explorer-11-detection
    // @ts-ignore
    if (!!window.MSInputMethodContext && !!document.documentMode) {
      return false;
    }

    if (/Android/i.test(window.navigator.userAgent)) {
      return true;
    }

    // https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      return true;
    }

    // https://stackoverflow.com/questions/57776001/how-to-detect-ipad-pro-as-ipad-using-javascript
    if (
      /Macintosh/.test(navigator.userAgent) &&
      navigator.maxTouchPoints &&
      navigator.maxTouchPoints > 2
    ) {
      return true;
    }

    // Neither Android nor iOS, assuming desktop
    return false;
  }

  async componentDidMount() {
    await this.onDecrypt();
  }

  async onDecrypt() {
    this.setState({
      decryptionState: DecryptionState.IrmaSession,
      selfAborted: false,
      decryptStartTime: Date.now(),
    });

    try {
      await this.applyDecryption();
    } catch (e) {
      console.error("Error occured during decryption");
      console.error(e);
      this.setState({
        decryptionState: DecryptionState.Error,
      });
    }
  }

  async applyDecryption() {
    const [streamSize, encrypted] = await getFileLoadStream(
      this.state.abort.signal,
      this.props.downloadUuid
    );

    const name = `cryptify-${this.props.downloadUuid.split("-")[0]}.zip`;
    const fakeFile: File = {
      name: name,
      size: streamSize,
    } as File;

    this.setState({
      decryptionState: DecryptionState.IrmaSession,
      fakeFile: fakeFile,
    });

    const vk = await this.state.vkPromise;
    const mod = await this.state.modPromise;
    const unsealer = await mod.StreamUnsealer.new(encrypted, vk);

    const recipients = unsealer.inspect_header();
    const sender = unsealer.public_identity();

    // there is always only one sender
    this.setState({ senderPublic: sender.con[0].v });

    const { ts: timestamp, con } = recipients.get(this.props.recipient);

    const kr = {
      con: con.map(({ t, v }) => {
        if (t === "pbdf.sidn-pbdf.email.email") return { t, v: this.props.recipient };
        if (v.includes("*") || v === "") return { t };
        return { t, v };
      }),
    };

    const session = {
      url: PKG_URL,
      start: {
        url: (o) => `${o.url}/v2/request/start`,
        method: "POST",
        headers: { "Content-Type": "application/json", ...METRICS_HEADER },
        body: JSON.stringify(kr),
      },
      result: {
        url: (o, { sessionToken }) => `${o.url}/v2/request/jwt/${sessionToken}`,
        headers: METRICS_HEADER,
        parseResponse: (r) => {
          return r
            .text()
            .then((jwt) =>
              fetch(`${PKG_URL}/v2/request/key/${timestamp.toString()}`, {
                headers: {
                  Authorization: `Bearer ${jwt}`,
                  ...METRICS_HEADER,
                },
              })
            )
            .then((r) => r.json())
            .then((json) => {
              if (json.status !== "DONE" || json.proofStatus !== "VALID")
                throw new Error("not done and valid");
              return json.key;
            })
            .catch((e) => console.log("error: ", e));
        },
      },
    };

    const yivi = new YiviCore({
      element: ".crypt-irma-qr",
      session: session,
      state: {
        serverSentEvents: false,
        polling: {
          endpoint: "status",
          interval: 500,
          startState: "INITIALIZED",
        },
      },
      language: (this.props.lang as string).toLowerCase(),
    });

    yivi.use(YiviWeb);
    yivi.use(YiviClient);
    const usk = await yivi.start();

    this.setState({
      decryptionState: DecryptionState.AskDownload,
      decryptInfo: {
        unsealer,
        usk,
        id: this.props.recipient,
      },
    });
  }

  async onCancelDecrypt(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    this.state.abort.abort();
    // Wait until abort occured...
    window.setTimeout(() => {
      this.setState({
        decryptionState: DecryptionState.IrmaSession,
        decryptInfo: null,
        fakeFile: null,
        percentage: 0,
        done: false,
        abort: new AbortController(),
        selfAborted: true,
      });
      this.onDecrypt();
    }, 1000);
  }

  async onDownload() {
    if (this.state.decryptInfo === null || this.state.fakeFile === null) {
      this.setState({
        decryptionState: DecryptionState.Error,
        decryptInfo: null,
        percentage: 0,
      });
      return;
    }

    const rawFileStream = streamSaver.createWriteStream(
      this.state.fakeFile.name,
      { size: this.state.fakeFile.size }
    );
    const fileStream = rawFileStream as WritableStream<Uint8Array>;

    const { unsealer, usk, id }: { unsealer: any; usk: string; id: string } =
      this.state.decryptInfo;

    const finished = new Promise<void>(async (resolve, _) => {
      const progress = createProgressReporter((processed, done) => {
        const fakeFile = this.state.fakeFile as File;
        this.setState({
          decryptionState: DecryptionState.Decrypting,
          percentage: (100 * processed) / fakeFile.size,
        });

        if (done) {
          window.setTimeout(() => {
            this.setState({
              decryptionState: DecryptionState.Decrypting,
              percentage: 100,
              done: true,
            });
            resolve();
          }, 1000 * SMOOTH_TIME);
        }
      }) as TransformStream<Uint8Array, Uint8Array>;

      const verified = await unsealer.unseal(
        id,
        usk,
        withTransform(fileStream, progress, this.state.abort.signal)
      );
      this.setState({ senderPrivate: verified.private });
    });

    await finished;

    this.setState({
      decryptionState: DecryptionState.Done,
      percentage: 100,
      done: true,
    });
  }

  renderSenderIdentity() {
    return (
      <div className="crypt-panel-header">
        <h3>
          <img
            className="checkmark-icon"
            src={checkmark}
            alt="checkmark-icon"
            style={{ height: "0.85em" }}
          />
          {getTranslation(this.props.lang).decryptPanel_verifiedEmail}:{" "}
          {this.state.senderPublic}
        </h3>
      </div>
    );
  }

  renderfilesField() {
    const files = this.state.fakeFile === null ? [] : [this.state.fakeFile];
    return (
      <div>
        <CryptFileList
          lang={this.props.lang}
          onAddFiles={null}
          onRemoveFile={null}
          files={files}
          forUpload={false}
          percentages={[this.state.percentage]}
          done={[this.state.done]}
        ></CryptFileList>
      </div>
    );
  }

  renderIrmaSession() {
    const isMobile = this.isMobile();
    let iosBtn = "";
    let iosHref = "";
    let androidBtn = "";
    let androidHref = "";
    switch (this.props.lang) {
      case Lang.EN:
        iosBtn = appleAppStoreEN;
        iosHref = "https://apps.apple.com/app/irma-authenticatie/id1294092994";
        androidBtn = googlePlayStoreEN;
        androidHref =
          "https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=en";
        break;
      case Lang.NL:
        iosBtn = appleAppStoreNL;
        iosHref =
          "https://apps.apple.com/nl/app/irma-authenticatie/id1294092994";
        androidBtn = googlePlayStoreNL;
        androidHref =
          "https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=nl";
        break;
    }

    return (
      <div className="crypt-progress-container">
        <h3>
          {isMobile
            ? getTranslation(this.props.lang)
                .decryptPanel_irmaInstructionHeaderMobile
            : getTranslation(this.props.lang)
                .decryptPanel_irmaInstructionHeaderQr}
        </h3>
        <p>
          {isMobile
            ? getTranslation(this.props.lang).decryptPanel_irmaInstructionMobile
            : getTranslation(this.props.lang).decryptPanel_irmaInstructionQr}
        </p>
        <div className="crypt-irma-qr"></div>
        <div className="get-irma-here-anchor">
          <img className="irma-logo" src={yiviLogo} alt="irma-logo" />
          <div
            className="get-irma-text"
            style={{
              display: "inline-block",
              verticalAlign: "middle",
              height: "45pt",
              marginLeft: "5pt",
              marginBottom: "calc(1em/2)",
            }}
          >
            {getTranslation(this.props.lang).decryptPanel_noIrma}
          </div>
          <div className="get-irma-buttons">
            <a
              href={iosHref}
              style={{
                display: "inline-block",
                height: "38pt",
                marginRight: "15pt",
              }}
            >
              <img
                style={{ height: "100%" }}
                className="irma-appstore-button"
                src={iosBtn}
                alt="apple-appstore"
              />
            </a>
            <a
              href={androidHref}
              style={{ display: "inline-block", height: "38pt" }}
            >
              <img
                style={{ height: "100%" }}
                className="irma-appstore-button"
                src={androidBtn}
                alt="google-playstore"
              />
            </a>
          </div>
        </div>
      </div>
    );
  }

  renderAskDownload() {
    return (
      <div className="crypt-progress-container">
        <h3>{getTranslation(this.props.lang).decryptPanel_askDownload}</h3>
        <p>{getTranslation(this.props.lang).decryptPanel_askDownloadText}</p>
        <button
          className={"crypt-btn-main crypt-btn"}
          onClick={(e) => this.onDownload()}
          type="button"
        >
          {"Download"}
        </button>
      </div>
    );
  }

  renderProgress() {
    const deltaT = Date.now() - this.state.decryptStartTime;

    const totalProgress = this.state.percentage;

    let timeEstimateRepr = getTranslation(this.props.lang).estimate;
    if (deltaT > 1000 && totalProgress > 1) {
      const remainingProgress = 100 - totalProgress;
      const estimatedT = remainingProgress * (deltaT / totalProgress);
      timeEstimateRepr = getTranslation(this.props.lang).timeremaining(
        estimatedT
      );
    }

    return (
      <div className="crypt-progress-container">
        <h3>{getTranslation(this.props.lang).decryptPanel_downloadDecrypt}</h3>
        <p>{getTranslation(this.props.lang).decryptPanel_decrypting}</p>
        <p>{timeEstimateRepr}</p>

        <button
          className={"crypt-btn crypt-btn-secondary crypt-btn-cancel"}
          onClick={(e) => this.onCancelDecrypt(e)}
          type="button"
        >
          {getTranslation(this.props.lang).cancel}
        </button>
      </div>
    );
  }

  renderDone() {
    return (
      <div className="crypt-progress-container">
        <h3>{getTranslation(this.props.lang).decryptPanel_succes}</h3>
        <h3>
          <img
            className="checkmark-icon"
            src={checkmark}
            alt="checkmark-icon"
            style={{ height: "0.85em" }}
          />
          {getTranslation(this.props.lang).decryptPanel_verifiedEmail}:{" "}
          {this.state.senderPublic}
        </h3>
        {this.state.senderPrivate?.con ? (
          <h3>
            {getTranslation(this.props.lang).decryptPanel_verifiedExtra}:
            <ul>
              {this.state.senderPrivate?.con.map(({ t, v }) => (
                <li key={t}>
                  <img
                    className="checkmark-icon"
                    src={checkmark}
                    alt="checkmark-icon"
                    style={{ height: "0.85em" }}
                  />
                  {getTranslation(this.props.lang)[t]}: {v}
                </li>
              ))}
            </ul>
          </h3>
        ) : null}
      </div>
    );
  }

  renderError() {
    return (
      <div className="crypt-progress-container">
        <h3 className="crypt-progress-error">{"Error occured"}</h3>
        <div
          dangerouslySetInnerHTML={{
            __html: getTranslation(this.props.lang).error,
          }}
        />
        <button
          className={"crypt-btn-main crypt-btn"}
          onClick={(e) => this.onDecrypt()}
          type="button"
        >
          {getTranslation(this.props.lang).tryAgain}
        </button>
      </div>
    );
  }

  render() {
    if (this.state.decryptionState === DecryptionState.IrmaSession) {
      return (
        <div>
          {this.renderSenderIdentity()}
          {this.renderfilesField()}
          {this.renderIrmaSession()}
        </div>
      );
    }
    if (this.state.decryptionState === DecryptionState.AskDownload) {
      return (
        <div>
          {this.renderfilesField()}
          {this.renderAskDownload()}
        </div>
      );
    } else if (this.state.decryptionState === DecryptionState.Decrypting) {
      return (
        <div>
          {this.renderfilesField()}
          {this.renderProgress()}
        </div>
      );
    } else if (this.state.decryptionState === DecryptionState.Done) {
      return (
        <div>
          {this.renderfilesField()}
          {this.renderDone()}
        </div>
      );
    } else if (this.state.decryptionState === DecryptionState.Error) {
      return (
        <div>
          {this.renderfilesField()}
          {this.renderError()}
        </div>
      );
    }
  }
}
