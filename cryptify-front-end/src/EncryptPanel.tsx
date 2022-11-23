import React from "react";
import CryptFileInput from "./CryptFileInput";
import CryptFileList from "./CryptFileList";

//IRMA Packages/dependencies
import irmaLogo from "./resources/irma-logo.svg";
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
  BACKEND_URL,
} from "./Constants";
import Chunker from "./utils";
import { withTransform } from "./utils";

//IRMA Packages/dependencies
const IrmaCore = require("@privacybydesign/irma-core");
const IrmaWeb = require("@privacybydesign/irma-web");
const IrmaClient = require("@privacybydesign/irma-client");

enum EncryptionState {
  FileSelection = 1,
  Encrypting,
  Done,
  Error,
  Verify,
  Anonymous,
}

type EncryptState = {
  recipient: string;
  recipientValid: boolean;
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
  irma_token: string;
};

type EncryptProps = {
  lang: Lang;
};

async function getParameters(): Promise<String> {
  let resp = await fetch(`${PKG_URL}/v2/parameters`);
  let params = await resp.json();
  return params.publicKey;
}

const defaultEncryptState: EncryptState = {
  recipient: "",
  recipientValid: false,
  sender: "",
  message: "",
  files: [],
  percentages: [],
  done: [],
  encryptionState: EncryptionState.FileSelection,
  abort: new AbortController(),
  selfAborted: false,
  encryptStartTime: 0,
  modPromise: import("@e4a/irmaseal-wasm-bindings"),
  pkPromise: getParameters(),
  irma_token: "",
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

  onChangeRecipient(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      recipient: ev.target.value.toLowerCase().replace(/ /g, ""),
      recipientValid: ev.target.form?.checkValidity() ?? false, 
    });
  }

  // TODO: can go?
  onChangeSenderEvent(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      sender: ev.target.value.toLowerCase(),
    });
  }

  // Function when a user does not has access to the sender field.
  onChangeSenderString(sender: string) {
    this.setState(
      {
        sender: sender,
      },
      () => {
        this.onEncrypt();
      }
    );
  }

  // TODO: unused
  onChangeMobileNumber(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({});
  }

  onChangeMessageEvent(ev: React.ChangeEvent<HTMLTextAreaElement>) {
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
    const mod = await this.state.modPromise;

    const ts = Math.round(Date.now() / 1000);

    const policies = {
      [this.state.recipient]: {
        ts,
        con: [{ t: "pbdf.sidn-pbdf.email.email", v: this.state.recipient }],
      },
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
        this.state.recipient,
        this.state.message,
        this.props.lang,
        this.state.irma_token,
        (n, last) => this.reportProgress(resolve, n, last)
      ) as [WritableStream, string];

      this.setState({ sender });

      mod.seal(
        pk,
        policies,
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

  async onVerify() {
    this.setState(
      {
        encryptionState: EncryptionState.Verify,
      },
      async () => {
        let token = "";
        const irma = new IrmaCore({
          debugging: true, // Enable to get helpful output in the browser console
          element: ".crypt-irma-qr", // Which DOM element to render to

          session: {
            url: `${BACKEND_URL}/verification`,
            start: {
              url: (o: any) => `${o.url}/start`,
              method: "GET",
            },
            mapping: {
              sessionToken: (r) => {
                token = r.token;
                return r.token;
              },
            },
            result: false,
          },
        });

        irma.use(IrmaWeb);
        irma.use(IrmaClient);

        await irma
          .start()
          .catch((e) => console.error("failed IRMA session: ", e));

        this.setState({ irma_token: token });
        this.onEncrypt();
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

    return (
      totalSize < MAX_UPLOAD_SIZE &&
      this.state.recipient.length > 0 &&
      this.state.recipientValid &&
      this.state.files.length > 0
    );
  }

  renderfilesField() {
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
        <div>
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

  renderUserInputs() {
    return (
      <div className="crypt-progress-container">
        <form className="crypt-select-protection-input-box">
          <h4>{getTranslation(this.props.lang).encryptPanel_emailRecipient}</h4>
          <input
            placeholder=""
            type="email"
            required
            value={this.state.recipient}
            onChange={(e) => this.onChangeRecipient(e)}
          />
        </form>
        {/*
        
        //Removed sender field due to IRMA QR-code scanning to verify sender.
        <div className="crypt-select-protection-input-box">
<<<<<<< HEAD
          <h4>{getTranslation(this.props.lang).encryptPanel_emailSender}</h4>
          <input
            placeholder=""
            type="text"
            required={true}
            value={this.state.sender}
            onChange={(e) => this.onChangeSender(e)}
||||||| a904de8
          <h4>{ getTranslation(this.props.lang).encryptPanel_emailSender }</h4>
          <input placeholder="" type="text" required={true}
                value={this.state.sender}
                onChange={(e) => this.onChangeSender(e)}
=======
          <h4>{ getTranslation(this.props.lang).encryptPanel_emailSender }</h4>
          <input placeholder="" type="text" required={true}
                value={this.state.sender}
                onChange={(e) => this.onChangeSenderEvent(e)}
>>>>>>> main
          />
        </div> 
        
        */}
        <div className="crypt-select-protection-input-box">
          <h4>{getTranslation(this.props.lang).encryptPanel_message}</h4>
          <textarea
            required={false}
            rows={4}
            value={this.state.message}
            onChange={(e) => this.onChangeMessageEvent(e)}
          />
        </div>
        <button
          className={
            "crypt-btn-main crypt-btn" +
            (this.canEncrypt() ? "" : " crypt-btn-disabled")
          }
          onClick={(e) => {
            if (this.canEncrypt()) {
              this.onVerify();
            }
          }}
        >
          {getTranslation(this.props.lang).encryptPanel_encryptSend}
        </button>
      </div>
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
          <img className="irma-logo" src={irmaLogo} alt="irma-logo" />
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

        <button
          className={"crypt-btn-anonymous crypt-btn"}
          onClick={() => this.onEncrypt()}
          type="button"
        >
          {getTranslation(this.props.lang).encryptPanel_encryptSendAnonymous}
        </button>
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

    return (
      <div className="crypt-progress-container">
        <h3>{getTranslation(this.props.lang).encryptPanel_encrypting}</h3>
        <p>
          {getTranslation(this.props.lang).encryptPanel_encryptingInfo}
          <a href={`mailto:${this.state.recipient}`}>{this.state.recipient}</a>
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
          <a href={`mailto:${this.state.recipient}`}>{this.state.recipient}</a>
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

  render() {
    if (this.state.encryptionState === EncryptionState.Verify) {
      return <form>{this.renderVerification()}</form>;
    } else if (this.state.encryptionState === EncryptionState.FileSelection) {
      return (
        <form
          onSubmit={(e) => {
            // preven submit redirection
            e.preventDefault();
            return false;
          }}
        >
          {this.renderfilesField()}
          {this.renderUserInputs()}
        </form>
      );
    } else if (this.state.encryptionState === EncryptionState.Encrypting) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderProgress()}
        </form>
      );
    } else if (this.state.encryptionState === EncryptionState.Error) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderError()}
        </form>
      );
    } else if (this.state.encryptionState === EncryptionState.Done) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderDone()}
        </form>
      );
    }
  }
}
