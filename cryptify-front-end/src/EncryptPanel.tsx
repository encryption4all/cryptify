import "./EncryptPanel.css";

import React from "react";
import CryptFileInput from "./CryptFileInput";
import CryptFileList from "./CryptFileList";

//IRMA Packages/dependencies
import yiviLogo from "./resources/yivi-logo.svg";
import appleAppStoreEN from "./resources/apple-appstore-en.svg";
import googlePlayStoreEN from "./resources/google-playstore-en.svg";
import appleAppStoreNL from "./resources/apple-appstore-nl.svg";
import googlePlayStoreNL from "./resources/google-playstore-nl.svg";

import { Writer } from "@transcend-io/conflux";
import checkmark from "./resources/checkmark.svg";
import { createFileReadable, getFileStoreStream } from "./FileProvider";
import Lang from "./Lang";
import getTranslation from "./Translations";

import {
  MAX_UPLOAD_SIZE,
  UPLOAD_CHUNK_SIZE,
  PKG_URL,
  SMOOTH_TIME,
  METRICS_HEADER,
} from "./Constants";
import Chunker from "./utils";
import { withTransform } from "./utils";
import type { AttributeCon, ISealOptions, ISigningKey } from "@e4a/pg-wasm";

import YiviCore from "@privacybydesign/yivi-core";
import YiviWeb from "@privacybydesign/yivi-web";
import YiviClient from "@privacybydesign/yivi-client";

//import "@privacybydesign/yivi-css";

type AttType =
  | "pbdf.sidn-pbdf.mobilenumber.mobilenumber"
  | "pbdf.gemeente.personalData.fullname"
  | "pbdf.gemeente.personalData.dateofbirth";

const ATTRIBUTES: Array<AttType> = [
  "pbdf.sidn-pbdf.mobilenumber.mobilenumber",
  "pbdf.gemeente.personalData.fullname",
  "pbdf.gemeente.personalData.dateofbirth",
];

async function getParameters(): Promise<String> {
  let resp = await fetch(`${PKG_URL}/v2/parameters`, {
    headers: METRICS_HEADER,
  });
  let params = await resp.json();
  return params.publicKey;
}

enum EncryptionState {
  FileSelection = 1,
  Encrypting,
  Done,
  Error,
  Sign,
}

type EncryptState = {
  recipients: { email: string; extra: AttributeCon }[];
  sender: string;
  message: string;
  files: File[];
  percentages: number[];
  done: boolean[];
  encryptionState: EncryptionState;
  abort: AbortController;
  selfAborted: boolean;
  encryptStartTime: number;
  modPromise: Promise<any>;
  pkPromise: Promise<any>;
  pubSignKey?: ISigningKey;
  privSignKey?: ISigningKey;
  senderAttributes: AttributeCon;
};

type EncryptProps = {
  lang: Lang;
};

const defaultEncryptState: EncryptState = {
  recipients: [{ email: "", extra: [] }],
  sender: "",
  senderAttributes: [],
  message: "",
  files: [],
  percentages: [],
  done: [],
  encryptionState: EncryptionState.FileSelection,
  abort: new AbortController(),
  selfAborted: false,
  encryptStartTime: 0,
  modPromise: import("@e4a/pg-wasm"),
  pkPromise: getParameters(),
};

export default class EncryptPanel extends React.Component<
  EncryptProps,
  EncryptState
> {
  constructor(props: EncryptProps) {
    super(props);
    this.state = defaultEncryptState;
  }

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

  onFile(files: FileList) {
    const fileArr = Array.from(files);

    this.setState((state) => ({
      files: state.files.concat(fileArr),
      percentages: state.percentages.concat(fileArr.map((_) => 0)),
      done: state.done.concat(fileArr.map((_) => false)),
    }));
  }

  onRemoveFile(index: number) {
    this.setState((state) => ({
      files: state.files.filter((_, i) => i !== index),
      percentages: state.percentages.filter((_, i) => i !== index),
      done: state.done.filter((_, i) => i !== index),
    }));
  }

  onChangeRecipient(ev: React.ChangeEvent<HTMLInputElement>, i: number) {
    const copy = [...this.state.recipients];
    copy[i].email = ev.target.value.toLowerCase().replace(/ /g, "");

    this.setState({
      recipients: copy,
    });
  }

  onChangeSender(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      sender: ev.target.value.toLowerCase().replace(/ /g, ""),
    });
  }

  onChangeMessage(ev: React.ChangeEvent<HTMLTextAreaElement>) {
    this.setState({
      message: ev.target.value,
    });
  }

  reportProgress(resolve: () => void, uploaded: number, done: boolean) {
    let offset = 0;
    let percentages = this.state.percentages.map((p) => p);
    let timeouts: number[] | undefined[] = this.state.percentages.map(
      (_) => undefined
    );

    this.state.files.forEach((f, i) => {
      const startFile = offset;
      const endFile = offset + f.size;
      if (uploaded < startFile) {
        percentages[i] = 0;
      } else if (uploaded >= endFile) {
        // We update to done after some time
        // To allow smoothing of progress.
        if (timeouts[i] === undefined) {
          timeouts[i] = window.setTimeout(() => {
            const dones = this.state.done.map((d) => d);
            dones[i] = true;
            this.setState({
              done: dones,
            });
          }, 1000 * SMOOTH_TIME);
        }
        percentages[i] = 100;
      } else {
        const uploadedOfFile = (uploaded - startFile) / f.size;
        percentages[i] = Math.round(100 * uploadedOfFile);
      }

      offset = endFile;
    });

    this.setState({
      percentages: percentages,
    });

    if (done) {
      window.setTimeout(() => resolve(), 1000 * SMOOTH_TIME);
    }
  }

  async applyEncryption() {
    if (!this.canEncrypt()) return;

    // make sure these are fulfilled
    const pk = await this.state.pkPromise;
    const { sealStream } = await this.state.modPromise;

    const ts = Math.round(Date.now() / 1000);
    const enc_policy = {};

    this.state.recipients.forEach(({ email, extra }) => {
      enc_policy[email] = {
        ts,
        con: [{ t: "pbdf.sidn-pbdf.email.email", v: email }, ...extra],
      };
    });

    if (!this.state.pubSignKey) {
      this.setState({ encryptionState: EncryptionState.Error });
      return;
    }

    const options: ISealOptions = {
      policy: enc_policy,
      pubSignKey: this.state.pubSignKey,
      ...(this.state.privSignKey && { privSignKey: this.state.privSignKey }),
    };

    const uploadChunker = new Chunker(UPLOAD_CHUNK_SIZE) as TransformStream;

    // Create streams that takes all input files and zips them into an output stream.
    const zipTf = new Writer();
    const readable = zipTf.readable as ReadableStream;
    const writeable = zipTf.writable;

    const writer = writeable.getWriter();

    this.state.files.forEach((f, i) => {
      const s = createFileReadable(f);

      writer.write({
        name: f.name,
        lastModified: f.lastModified,
        stream: () => s,
      });
    });

    writer.close();

    // This is not 100% accurate due to zip and irmaseal
    // header but it's close enough for the UI.
    const finished = new Promise<void>(async (resolve, reject) => {
      const [fileStream, sender] = getFileStoreStream(
        this.state.abort,
        this.state.sender,
        this.state.recipients.map(({ email }) => email).join(", "),
        this.state.message,
        this.props.lang,
        (n, last) => this.reportProgress(resolve, n, last)
      ) as [WritableStream, string];

      this.setState({ sender });

      sealStream(
        pk,
        options,
        readable,
        withTransform(fileStream, uploadChunker, this.state.abort.signal)
      );
    });

    await finished;
  }

  async onEncrypt() {
    // TODO: Simplify this error handling logic.
    // For some reason stream errors are not caught
    // Which means when the user aborts
    // exceptions spill into the console...

    this.setState({
      encryptionState: EncryptionState.Encrypting,
      encryptStartTime: Date.now(),
    });

    try {
      await this.applyEncryption();
      this.setState({
        encryptionState: EncryptionState.Done,
        selfAborted: false,
      });
    } catch (e) {
      console.error("Error occured during encryption: ", e);
      if (this.state.selfAborted === false) {
        this.setState({
          encryptionState: EncryptionState.Error,
        });
      } else {
        this.setState({
          percentages: this.state.percentages.map((_) => 0),
          done: this.state.percentages.map((_) => false),
          encryptionState: EncryptionState.FileSelection,
          selfAborted: false,
          encryptStartTime: 0,
        });
      }
    }
  }

  async retrieveSignKey(pol: any): Promise<any> {
    const session = {
      url: PKG_URL,
      start: {
        url: (o) => `${o.url}/v2/request/start`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pol),
      },
      result: {
        url: (o, { sessionToken }) => `${o.url}/v2/request/jwt/${sessionToken}`,
        parseResponse: (r) => {
          return r
            .text()
            .then((jwt) =>
              fetch(`${PKG_URL}/v2/irma/sign/key`, {
                headers: {
                  Authorization: `Bearer ${jwt}`,
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
      debugging: false,
      element: ".crypt-irma-qr",
      session,
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

    const signKey = await yivi
      .start()
      .catch((e) => console.error("failed IRMA session: ", e));

    return signKey;
  }

  async onSign() {
    this.setState(
      {
        encryptionState: EncryptionState.Sign,
      },
      async () => {
        // retrieve signing keys
        const sign_policy = {
          con: [{ t: "pbdf.sidn-pbdf.email.email", v: this.state.sender }],
        };

        const pubSignKey = await this.retrieveSignKey(sign_policy);

        if (this.state.senderAttributes.length > 0) {
          const privSignKey = await this.retrieveSignKey({
            con: this.state.senderAttributes,
          });

          this.setState({ privSignKey });
        }

        this.setState({ pubSignKey }, () => this.onEncrypt());
      }
    );
  }

  onCancel(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    this.state.abort.abort();
    this.setState({
      percentages: this.state.percentages.map((_) => 0),
      done: this.state.percentages.map((_) => false),
      encryptionState: EncryptionState.FileSelection,
      abort: new AbortController(),
      selfAborted: false,
      encryptStartTime: 0,
    });
  }

  onAnother(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    this.setState(defaultEncryptState);
  }

  canEncrypt() {
    const totalSize = this.state.files
      .map((f) => f.size)
      .reduce((a, b) => a + b, 0);

    // See: https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
    const regex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    const addressesValid =
      this.state.recipients.every(({ email }) => regex.test(email)) &&
      regex.test(this.state.sender);

    const canEncrypt =
      totalSize < MAX_UPLOAD_SIZE &&
      this.state.recipients.length > 0 &&
      addressesValid &&
      this.state.files.length > 0;

    return canEncrypt;
  }

  renderFilesField() {
    if (this.state.files.length === 0) {
      return (
        <div className="crypt-file-upload-box">
          <CryptFileInput
            lang={this.props.lang}
            onFile={(f) => this.onFile(f)}
            multiple={true}
            required={true}
          />
        </div>
      );
    } else {
      return (
        <div className="crypt-file-upload-box">
          <CryptFileList
            lang={this.props.lang}
            onAddFiles={
              this.state.encryptionState === EncryptionState.FileSelection
                ? (f: FileList) => this.onFile(f)
                : null
            }
            onRemoveFile={
              this.state.encryptionState === EncryptionState.FileSelection
                ? (i) => this.onRemoveFile(i)
                : null
            }
            files={this.state.files}
            forUpload={true}
            percentages={this.state.percentages}
            done={this.state.done}
          ></CryptFileList>
        </div>
      );
    }
  }

  createExtras(prop: "recipients" | "senderAttributes", i: number) {
    const parent = this;

    const email =
      prop === "recipients"
        ? this.state.recipients[i].email
        : this.state.sender;
    const attributes =
      prop === "recipients" ? this.state.recipients[i].extra : this.state[prop];

    // ugly fix since TS does not allow computed properties
    const update =
      prop === "recipients"
        ? (newAttrs: AttributeCon) => {
            const copy = [...this.state.recipients];
            copy[i].extra = newAttrs;
            parent.setState({ recipients: copy });
          }
        : (newAttrs: AttributeCon) =>
            parent.setState({ senderAttributes: newAttrs });

    function onAddField(field: AttType) {
      update([...attributes, { t: field, v: "" }]);
    }

    function onAttributesChanged(j: number, v: string) {
      const updated = [...attributes];
      updated[j].v = v;
      update(updated);
    }

    function removeExtraAttribute(j: number) {
      const updated = attributes.filter((_, k) => j !== k);
      update(updated);
    }

    const renderButtons = () => {
      const filtered = ATTRIBUTES.filter(
        (att) => !attributes.some(({ t, v }) => t === att)
      );
      return filtered.map((x) => {
        return (
          <button
            className="add-attribute-btn"
            key={x}
            onClick={(e) => onAddField(x)}
          >
            + {getTranslation(parent.props.lang)[x]}
          </button>
        );
      });
    };

    const renderFields = () => {
      const prefix =
        prop === "senderAttributes"
          ? getTranslation(parent.props.lang)
              .encryptPanel_emailSenderAttributePrefix
          : `${email}${email !== "" ? "'s" : ""}`;
      return attributes.map(({ t, v }, j) => {
        return (
          <div className="attribute-field">
            <input
              placeholder={`${prefix} ${getTranslation(parent.props.lang)[t]}`}
              required
              value={v}
              onChange={(e) => onAttributesChanged(j, e.target.value)}
            />
            <button
              className="btn-delete"
              onClick={(e) => removeExtraAttribute(j)}
            >
              x
            </button>
          </div>
        );
      });
    };

    return [renderFields, renderButtons];
  }

  addRecipient() {
    this.setState({
      recipients: [...this.state.recipients, { email: "", extra: [] }],
    });
  }

  removeRecipient(i: number) {
    this.setState({
      recipients:
        this.state.recipients.length === 1
          ? [{ email: "", extra: [] }]
          : this.state.recipients.filter((_, j) => i !== j),
    });
  }

  renderRecipients() {
    const ret = this.state.recipients.map((r, i) => {
      const [renderEncFields, renderEncButtons] = this.createExtras(
        "recipients",
        i
      );

      return (
        <li className="crypt-recipient">
          <input
            placeholder={
              getTranslation(this.props.lang).encryptPanel_emailRecipient
            }
            type="email"
            required
            value={this.state.recipients[i].email}
            onChange={(e) => this.onChangeRecipient(e, i)}
          />
          <button
            className="btn-delete"
            onClick={(e) => {
              e.preventDefault();
              this.removeRecipient(i);
            }}
          >
            x
          </button>
          {renderEncFields()}
          {renderEncButtons()}
        </li>
      );
    });
    return (
      <div className="crypt-select-protection-input-box">
        <h3>
          {getTranslation(this.props.lang).encryptPanel_RecipientsHeading}
        </h3>{" "}
        <h4>
          {getTranslation(this.props.lang).encryptPanel_RecipientsSubHeading}
        </h4>
        <p>{getTranslation(this.props.lang).encryptPanel_RecipientsText}</p>
        <ul className="crypt-recipient-list">{ret}</ul>
        <button
          className="add-recipient-btn"
          onClick={(e) => {
            e.preventDefault();
            this.addRecipient();
          }}
        >
          + {getTranslation(this.props.lang).encryptPanel_addRecipient}
        </button>
      </div>
    );
  }

  renderSenderInputs() {
    const [renderSignFields, renderSignButtons] = this.createExtras(
      "senderAttributes",
      -1
    );

    return (
      <div className="crypt-select-protection-input-box">
        <h3>
          {getTranslation(this.props.lang).encryptPanel_emailSenderHeading}
        </h3>
        <h4>
          {getTranslation(this.props.lang).encryptPanel_emailSenderSubHeading}
        </h4>
        <p>{getTranslation(this.props.lang).encryptPanel_emailSenderText}</p>
        <input
          placeholder={getTranslation(this.props.lang).encryptPanel_emailSender}
          type="email"
          required
          value={this.state.sender}
          onChange={(e) => this.onChangeSender(e)}
        />
        {renderSignFields()}
        {renderSignButtons()}
      </div>
    );
  }

  renderMessageInput() {
    return (
      <div className="crypt-select-protection-input-box">
        <h3>{getTranslation(this.props.lang).encryptPanel_messageHeading}</h3>
        <p>{getTranslation(this.props.lang).encryptPanel_messageText}</p>
        <textarea
          placeholder={
            getTranslation(this.props.lang).encryptPanel_messagePlaceholder
          }
          required={false}
          rows={4}
          value={this.state.message}
          onChange={(e) => this.onChangeMessage(e)}
        />
      </div>
    );
  }

  renderSendButton() {
    return (
      <button
        className={
          "crypt-btn-main crypt-btn yivi-btn-logo" +
          (this.canEncrypt() ? "" : " crypt-btn-disabled")
        }
        onClick={(e) => {
          if (this.canEncrypt()) {
            this.onSign();
          }
        }}
      >
        <img src={yiviLogo} alt="yivi-logo" width={36} height={20} />
        {getTranslation(this.props.lang).encryptPanel_encryptSend}
      </button>
    );
  }

  renderVerification() {
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
                .encryptPanel_irmaInstructionHeaderMobile
            : getTranslation(this.props.lang)
                .encryptPanel_irmaInstructionHeaderQr}
        </h3>
        <p>
          {isMobile
            ? getTranslation(this.props.lang).encryptPanel_irmaInstructionMobile
            : getTranslation(this.props.lang).encryptPanel_irmaInstructionQr}
        </p>

        <div className="crypt-irma-qr"></div>

        <div className="get-irma-here-anchor">
          <img className="irma-logo" src={yiviLogo} alt="yivi-logo" />
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

  renderProgress() {
    const deltaT = Date.now() - this.state.encryptStartTime;
    const totalSize = this.state.files
      .map((f) => f.size)
      .reduce((a, b) => a + b, 0);

    const totalProgress = this.state.files
      .map((f, i) => (this.state.percentages[i] * f.size) / totalSize)
      .reduce((a, b) => a + b, 0);

    let timeEstimateRepr = getTranslation(this.props.lang).estimate;
    if (deltaT > 1000 && totalProgress > 1) {
      const remainingProgress = 100 - totalProgress;
      const estimatedT = remainingProgress * (deltaT / totalProgress);
      timeEstimateRepr = getTranslation(this.props.lang).timeremaining(
        estimatedT
      );
    }

    const to = this.state.recipients.map(({ email }) => email).join(", ");

    return (
      <div className="crypt-progress-container">
        <h3>{getTranslation(this.props.lang).encryptPanel_encrypting}</h3>
        <p>
          {getTranslation(this.props.lang).encryptPanel_encryptingInfo}
          <a href={`mailto:${to}`}>{to}</a>
        </p>
        <p>{timeEstimateRepr}</p>

        <button
          className={"crypt-btn crypt-btn-secondary crypt-btn-cancel"}
          onClick={(e) => this.onCancel(e)}
          type="button"
        >
          {getTranslation(this.props.lang).cancel}
        </button>
      </div>
    );
  }

  renderDone() {
    const to = this.state.recipients.map(({ email }) => email).join(", ");
    return (
      <div className="crypt-progress-container">
        <h3>
          <img
            className="checkmark-icon"
            src={checkmark}
            alt="checkmark-icon"
            style={{ height: "0.85em" }}
          />
          {getTranslation(this.props.lang).encryptPanel_succes}
        </h3>
        <p>
          <span>{getTranslation(this.props.lang).encryptPanel_succesInfo}</span>
          <a href={`mailto:${to}`}>{to}</a>
        </p>
        <button
          className={"crypt-btn-main crypt-btn"}
          onClick={(e) => this.onAnother(e)}
          type="button"
        >
          {getTranslation(this.props.lang).encryptPanel_another}
        </button>
      </div>
    );
  }

  renderError() {
    return (
      <div className="crypt-progress-container">
        <h3 className="crypt-progress-error">{"Error occured"}</h3>
        <p
          dangerouslySetInnerHTML={{
            __html: getTranslation(this.props.lang).error,
          }}
        />
        <button
          className={"crypt-btn-main crypt-btn"}
          onClick={() =>
            this.setState({ encryptionState: EncryptionState.FileSelection })
          }
          type="button"
        >
          {getTranslation(this.props.lang).tryAgain}
        </button>
      </div>
    );
  }

  renderRightCol() {
    if (this.state.encryptionState === EncryptionState.Sign) {
      return this.renderVerification();
    } else if (this.state.encryptionState === EncryptionState.FileSelection) {
      return (
        <div className="crypt-progress-container">
          {this.renderRecipients()}
          {this.renderMessageInput()}
          {this.renderSenderInputs()}
          {this.renderSendButton()}
        </div>
      );
    } else if (this.state.encryptionState === EncryptionState.Encrypting) {
      return this.renderProgress();
    } else if (this.state.encryptionState === EncryptionState.Error) {
      return this.renderError();
    } else if (this.state.encryptionState === EncryptionState.Done) {
      return this.renderDone();
    }
  }

  render() {
    return (
      <form
        className="crypt-form"
        onSubmit={(e) => {
          e.preventDefault();
          return false;
        }}
      >
        <div className="cols">
          <div className="column">{this.renderFilesField()}</div>
          <div className="column scroll-column">{this.renderRightCol()}</div>
        </div>
      </form>
    );
  }
}
