import "./EncryptPanel.css";
import 'web-streams-polyfill';
import React from 'react';
import { Client } from '@e4a/irmaseal-client'
import CryptFileInput from './CryptFileInput';
import CryptFileList from './CryptFileList';

//IRMA Packages/dependencies
import irmaLogo from './resources/irma-logo.svg';
import appleAppStoreEN from './resources/apple-appstore-en.svg';
import googlePlayStoreEN from './resources/google-playstore-en.svg';
import appleAppStoreNL from './resources/apple-appstore-nl.svg';
import googlePlayStoreNL from './resources/google-playstore-nl.svg';

import { Writer } from '@transcend-io/conflux';
import checkmark from './resources/checkmark.svg';
import {createFileReadable, getFileStoreStream} from './FileProvider';
import Lang from './Lang';
import getTranslation from './Translations';
import { SMOOTH_TIME } from './Constants';

import {
  ReadableStream as PolyfillReadableStream,
  WritableStream as PolyfillWritableStream,
  TransformStream as PolyfillTransformStream
} from 'web-streams-polyfill';

import {
  createReadableStreamWrapper,
  createWritableStreamWrapper,
  createTransformStreamWrapper,
} from '@mattiasbuelens/web-streams-adapter'
import { MAX_UPLOAD_SIZE, UPLOAD_CHUNK_SIZE } from "./Constants";
import { Chunker } from "@e4a/irmaseal-client/src/stream";

const toReadable = createReadableStreamWrapper(PolyfillReadableStream)
const toWritable = createWritableStreamWrapper(PolyfillWritableStream)
const toTransform = createTransformStreamWrapper(PolyfillTransformStream)

//IRMA Packages/dependencies
const IrmaCore = require('@privacybydesign/irma-core');
const IrmaWeb = require('@privacybydesign/irma-web');
const IrmaClient = require('@privacybydesign/irma-client');

const baseurl = "http://localhost";

enum EncryptionState {
  FileSelection = 1,
  Encrypting,
  Done,
  Error,
  Verify,
  Anonymous
}

type EncryptState = {
  recipient: string,
  sender: string,
  message: string,
  files: File[];
  percentages: number[],
  done: boolean[],
  encryptionState: EncryptionState,
  abort: AbortController,
  selfAborted: boolean,
  encryptStartTime: number,
  irma_token: string
};

type EncryptProps = {
  lang: Lang,
  sealClient: Client
};

const defaultEncryptState: EncryptState = {
  recipient: "",
  sender: "",
  message: "",
  files: [],
  percentages: [],
  done: [],
  encryptionState: EncryptionState.FileSelection,
  abort: new AbortController(),
  selfAborted: false,
  encryptStartTime: 0,
  irma_token: ""
};

export default class EncryptPanel extends React.Component<EncryptProps, EncryptState> {
  constructor(props: EncryptProps) {
    super(props);
    this.state = defaultEncryptState;
  }

  isMobile(): boolean {
    if (typeof window === 'undefined' ) {
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
    if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints && navigator.maxTouchPoints > 2) {
      return true;
    }
  
    // Neither Android nor iOS, assuming desktop
    return false;
  };

  onFile(files: FileList) {
    const fileArr = Array.from(files);

    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files.concat(fileArr),
      percentages: this.state.percentages.concat(fileArr.map(_ => 0)),
      done: this.state.done.concat(fileArr.map(_ => false)),
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  onRemoveFile(index: number) {
    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files.filter((_, i) => i !== index),
      percentages: this.state.percentages.filter((_, i) => i !== index),
      done: this.state.done.filter((_, i) => i !== index),
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  onChangeRecipient(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      recipient: ev.target.value.toLowerCase(),
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  onChangeSenderEvent(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      recipient: this.state.recipient,
      sender: ev.target.value.toLowerCase(),
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  //Function when a user does not has access to the sender field.
  onChangeSenderString(sen: string) {
    this.setState({
      recipient: this.state.recipient,
      sender: sen,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    },() =>{
      this.onEncrypt()
    });
  }

  onChangeMobileNumber(ev: React.ChangeEvent<HTMLInputElement>) {
    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  onChangeMessageEvent(ev: React.ChangeEvent<HTMLTextAreaElement>) {
    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: ev.target.value,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });
  }

  //Function when a user does not has access to the sender field.
  onChangeAnonymousString(sen: string, mes: string) {
    this.setState({
      recipient: this.state.recipient,
      sender: sen,
      message: mes,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: ""
    }, () =>{
      this.onEncrypt();
    });
  }

  reportProgress(resolve: () => void, uploaded: number, done: boolean) {
    let offset = 0;
    let percentages = this.state.percentages.map(p => p);
    let timeouts: number[] | undefined[] = this.state.percentages.map(_ => undefined);

    this.state.files.forEach((f, i) => {
      const startFile = offset;
      const endFile = offset + f.size;
      if (uploaded < startFile) {
        percentages[i] = 0;
      }
      else if (uploaded >= endFile) {
        // We update to done after some time
        // To allow smoothing of progress.
        if (timeouts[i] === undefined) {
          timeouts[i] = window.setTimeout(() => {
            const dones = this.state.done.map(d => d);
            dones[i] = true;
            this.setState({
              recipient: this.state.recipient,
              sender: this.state.sender,
              message: this.state.message,
              files: this.state.files,
              percentages: this.state.percentages,
              done: dones,
              encryptionState: this.state.encryptionState,
              abort: this.state.abort,
              selfAborted: this.state.selfAborted,
              encryptStartTime: this.state.encryptStartTime,
              irma_token: this.state.irma_token,
            });
          }, 1000 * SMOOTH_TIME);
        }
        percentages[i] = 100;
      }
      else {
        const uploadedOfFile = (uploaded - startFile) / f.size;
        percentages[i] = Math.round(100 * uploadedOfFile);
      }

      offset = endFile;
    });

    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: percentages,
      done: this.state.done,
      encryptionState: this.state.encryptionState,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      encryptStartTime: this.state.encryptStartTime,
      irma_token: this.state.irma_token
    });

    if (done) {
      window.setTimeout(() => resolve(), 1000 * SMOOTH_TIME);
    }
  }

  async applyEncryption() {
    if (!this.canEncrypt()) {
      return;
    }

    // Create sealer
    const attribute = {
      type: 'pbdf.sidn-pbdf.email.email',
      value: this.state.recipient,
    };

    const { header, metadata, keys } = this.props.sealClient.createMetadata(attribute);

    const meta_json = metadata.to_json();
    const sealer = toTransform(this.props.sealClient.createTransformStream({
      aesKey: keys.aes_key,
      macKey: keys.mac_key,
      iv: meta_json.iv,
      header: header,
      decrypt: false,
    })) as TransformStream;

    // @ts-ignore
    const cryptChunker = toTransform(this.props.sealClient.createChunker({})) as TransformStream;
    // @ts-ignore
    const uploadChunker = toTransform(new TransformStream(new Chunker({ chunkSize: UPLOAD_CHUNK_SIZE }))) as TransformStream;

    // Create streams that takes all input files and zips them into
    // an output stream.
    const zipTf = new Writer();
    const readable = toReadable(zipTf.readable) as ReadableStream;
    const writeable = toWritable(zipTf.writable);

    const writer = writeable.getWriter();

    this.state.files.forEach((f, i) => {
      const s = toReadable(createFileReadable(f));

      writer.write({
        name: f.name,
        lastModified: f.lastModified,
        stream: () => s
      });
    });

    writer.close();

    // This is not 100% accurate due to zip and irmaseal
    // header but it's close enough for the UI.
    const finished = new Promise<void>(async (resolve, reject) => {
      const fileStream = toWritable(getFileStoreStream(
        this.state.abort,
        this.state.sender,
        this.state.recipient,
        this.state.message,
        this.props.lang,
        this.state.irma_token,
        (n, last) => this.reportProgress(resolve, n, last)
      )) as WritableStream;
      
      readable
        .pipeThrough(cryptChunker)
        .pipeThrough(sealer)
        .pipeThrough(uploadChunker)
        .pipeTo(fileStream)
        .catch(reject);
    });

    await finished;
  }

  async onEncrypt() {
    // TODO: Simplify this error handling logic.
    // For some reason stream errors are not caught
    // Which means when the user aborts
    // exceptions spill into the console...

    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: EncryptionState.Encrypting,
      abort: this.state.abort,
      selfAborted: false,
      encryptStartTime: Date.now(),
      irma_token: this.state.irma_token
    });

    try {
      await this.applyEncryption();
      this.setState({
        recipient: this.state.recipient,
        sender: this.state.sender,
        message: this.state.message,
        files: this.state.files,
        percentages: this.state.percentages,
        done: this.state.done,
        encryptionState: EncryptionState.Done,
        abort: this.state.abort,
        selfAborted: false,
        encryptStartTime: 0,
        irma_token: this.state.irma_token
      });
    }
    catch (e) {
      if (this.state.selfAborted === false) {
        console.error("Error occured during encryption");
        console.error(e);
        this.setState({
          recipient: this.state.recipient,
          sender: this.state.sender,
          message: this.state.message,
          files: this.state.files,
          percentages: this.state.percentages,
          done: this.state.done,
          encryptionState: EncryptionState.Error,
          abort: this.state.abort,
          selfAborted: false,
          encryptStartTime: 0,
          irma_token: this.state.irma_token
        });
      }
      else {
        this.setState({
          recipient: this.state.recipient,
          sender: this.state.sender,
          message: this.state.message,
          files: this.state.files,
          percentages: this.state.percentages.map(_ => 0),
          done: this.state.percentages.map(_ => false),
          encryptionState: EncryptionState.FileSelection,
          abort: this.state.abort,
          selfAborted: false,
          encryptStartTime: 0,
          irma_token: this.state.irma_token

        });
      }
    }
  }

  async onVerify() {
    //Change React State for verifying the sender.
    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages,
      done: this.state.done,
      encryptionState: EncryptionState.Verify,
      abort: this.state.abort,
      selfAborted: false,
      encryptStartTime: 0,
      irma_token: this.state.irma_token
    },
    () =>{ 

      const irma = new IrmaCore({
        debugging: true,            // Enable to get helpful output in the browser console
        element: ".crypt-irma-qr",  // Which DOM element to render to
        
        // Back-end options
        session: {
          // Point this to your controller:
          url: `${baseurl}/verification`,
        
          start: {
            url: (o: any) => `${o.url}/start`,
            method: 'GET'
          },

          mapping: {
            sessionPtr: (r: any) => r.sessionPtr,
            sessionToken: (r: any) => r.token
          },

          result: {
            url: (o: any, {sessionToken}: any) => `${o.url}/${sessionToken}/result`,
            method: 'GET'
          }
        }

      });

      irma.use(IrmaWeb);
      irma.use(IrmaClient);

      irma.start()
        .then((result: any) => {
          //Check if the IRMA server is DONE and the proof is VALID.
          if(result["status"] === "DONE" && result["proofStatus"] === "VALID")
          {
          
            this.setState({
              recipient: this.state.recipient,
              sender: this.state.sender,
              message: this.state.message,
              files: this.state.files,
              percentages: this.state.percentages,
              done: this.state.done,
              encryptionState: EncryptionState.Verify,
              abort: this.state.abort,
              selfAborted: false,
              encryptStartTime: 0,
              irma_token: result["token"]
            },
            () =>{ 
              this.onChangeSenderString(result["disclosed"][0][0]["rawvalue"])
            });
          }
        })
        .catch((error: string) => console.error("Couldn't do what you asked 😢", error));
    });
  }

  onCancel(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    this.state.abort.abort();
    this.setState({
      recipient: this.state.recipient,
      sender: this.state.sender,
      message: this.state.message,
      files: this.state.files,
      percentages: this.state.percentages.map(_ => 0),
      done: this.state.percentages.map(_ => false),
      encryptionState: EncryptionState.FileSelection,
      abort: new AbortController(),
      selfAborted: false,
      encryptStartTime: 0,
      irma_token: this.state.irma_token
    });

  }

  onAnother(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    this.setState(defaultEncryptState);
  }

  canEncrypt() {
    const totalSize = this.state.files
      .map((f) => f.size)
      .reduce((a, b) => a + b, 0);

    return totalSize < MAX_UPLOAD_SIZE
        && this.state.recipient.length > 0
        //&& this.state.sender.length > 0
        && this.state.files.length > 0;
  }

  renderfilesField() {
    if (this.state.files.length === 0) {
      return (
        <div className="crypt-file-upload-box">
          <CryptFileInput
            lang={this.props.lang}
            onFile={(f) => this.onFile(f) }
            multiple={true}
            required={true}
          />
        </div>
      );
    }
    else {
      let addFile = null;
      if (this.state.encryptionState === EncryptionState.FileSelection) {
        addFile = (f: FileList) => this.onFile(f);
      }
      return (
        <div>
          <CryptFileList
            lang={this.props.lang}
            onAddFiles={addFile}
            onRemoveFile={
              this.state.encryptionState === EncryptionState.FileSelection
                ? (i) => this.onRemoveFile(i)
                : null
              }
            files={this.state.files}
            forUpload={true}
            percentages={this.state.percentages}
            done={this.state.done}
          >
          </CryptFileList>
        </div>
      );
    }
  }

  renderUserInputs() {
    return (
      <div className="crypt-progress-container">
        <div className="crypt-select-protection-input-box">
          <h4>{ getTranslation(this.props.lang).encryptPanel_emailRecipient }</h4>
          <input placeholder="" type="text" required={true}
                value={this.state.recipient}
                onChange={(e) => this.onChangeRecipient(e)}
          />
        </div>
        {/*
        
        //Removed sender field due to IRMA QR-code scanning to verify sender.
        <div className="crypt-select-protection-input-box">
          <h4>{ getTranslation(this.props.lang).encryptPanel_emailSender }</h4>
          <input placeholder="" type="text" required={true}
                value={this.state.sender}
                onChange={(e) => this.onChangeSenderEvent(e)}
          />
        </div> 
        
        */}
        <div className="crypt-select-protection-input-box">
          <h4>{ getTranslation(this.props.lang).encryptPanel_message }</h4>
          <textarea
            required={false}
            rows={4}
            value={this.state.message}
            onChange={(e) => this.onChangeMessageEvent(e)}
          />
        </div>
        <button
          className={"crypt-btn-main crypt-btn" + (this.canEncrypt() ? "" : " crypt-btn-disabled")}
          onClick={(e) => {
            if (this.canEncrypt()) {
              this.onVerify();
            }
          }}
        >
          { getTranslation(this.props.lang).encryptPanel_encryptSend }
        </button>
      </div>
    );
  }

  renderVerification() {
    const isMobile = this.isMobile();
    let iosBtn = null; 
    let iosHref = null; 
    let androidBtn = null; 
    let androidHref = null;
    switch (this.props.lang) {
    case Lang.EN:
      iosBtn = appleAppStoreEN;
      iosHref = "https://apps.apple.com/app/irma-authenticatie/id1294092994";
      androidBtn = googlePlayStoreEN;
      androidHref = "https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=en";
      break;
    case Lang.NL:
      iosBtn = appleAppStoreNL;
      iosHref = "https://apps.apple.com/nl/app/irma-authenticatie/id1294092994";
      androidBtn = googlePlayStoreNL;
      androidHref = "https://play.google.com/store/apps/details?id=org.irmacard.cardemu&hl=nl";
      break;
    }

    return (
      <div className="crypt-progress-container">
        <h3>
          { isMobile
            ? getTranslation(this.props.lang).encryptPanel_irmaInstructionHeaderMobile
            : getTranslation(this.props.lang).encryptPanel_irmaInstructionHeaderQr
          }
        </h3>
        <p>
          { isMobile
            ? getTranslation(this.props.lang).encryptPanel_irmaInstructionMobile
            : getTranslation(this.props.lang).encryptPanel_irmaInstructionQr
          }
        </p>

        <div className="crypt-irma-qr"></div>

        <div className="get-irma-here-anchor">
          <img className="irma-logo" src={irmaLogo} alt="irma-logo" />
          <div className="get-irma-text"
            style={{display: "inline-block", verticalAlign: "middle", height: "45pt", marginLeft: "5pt", marginBottom: "calc(1em/2)"}}>
            { getTranslation(this.props.lang).decryptPanel_noIrma }
          </div>
          <div className="get-irma-buttons">
            <a href={iosHref}
              style={{display: "inline-block", height: "38pt", marginRight: "15pt"}}>
              <img style={{height: "100%"}} className="irma-appstore-button" src={iosBtn} alt="apple-appstore" />
            </a>
            <a href={androidHref}
              style={{display: "inline-block", height: "38pt"}}>
              <img  style={{height: "100%"}} className="irma-appstore-button" src={androidBtn} alt="google-playstore" />
            </a>
          </div>
        </div>

        <button
          className={"crypt-btn-anonymous crypt-btn"}
          onClick={(e) => { 
            this.onChangeAnonymousString("Someone",getTranslation(this.props.lang).encryptPanel_messageAnonymous);
        }}
          type="button"
        >
          { getTranslation(this.props.lang).encryptPanel_encryptSendAnonymous }
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
      .map((f, i) => this.state.percentages[i] * f.size / totalSize)
      .reduce((a, b) => a + b, 0);
    
    let timeEstimateRepr = getTranslation(this.props.lang).estimate;
    if (deltaT > 1000 && totalProgress > 1) {
      const remainingProgress = 100 - totalProgress;
      const estimatedT = remainingProgress * (deltaT / totalProgress);
      timeEstimateRepr = getTranslation(this.props.lang).timeremaining(estimatedT);
    }


    return <div className="crypt-progress-container">
      <h3>
        { getTranslation(this.props.lang).encryptPanel_encrypting }</h3>
      <p>
        { getTranslation(this.props.lang).encryptPanel_encryptingInfo }
        <a href={`mailto:${this.state.recipient}`}>{this.state.recipient}</a>
      </p>
      <p>{timeEstimateRepr}</p>
      
      <button
          className={"crypt-btn crypt-btn-secondary crypt-btn-cancel"}
          onClick={(e) => this.onCancel(e) }
          type="button"
        >
          { getTranslation(this.props.lang).cancel }
        </button>
    </div>;
  }

  renderDone() {
    return <div className="crypt-progress-container">
      <h3>
        <img className="checkmark-icon" src={ checkmark } alt="checkmark-icon" style={{ height: "0.85em" }}/>  
        { getTranslation(this.props.lang).encryptPanel_succes }
      </h3>
      <p>
        <span>
          { getTranslation(this.props.lang).encryptPanel_succesInfo }
        </span>
        <a href={`mailto:${this.state.recipient}`}>{this.state.recipient}</a>
      </p>
      <button
          className={"crypt-btn-main crypt-btn"}
          onClick={(e) => this.onAnother(e) }
          type="button"
        >
        { getTranslation(this.props.lang).encryptPanel_another }
        </button>
    </div>;
  }

  renderError() {
    return <div className="crypt-progress-container">
      <h3 className="crypt-progress-error">{"Error occured"}</h3>
      <p>
      { getTranslation(this.props.lang).error }
      </p>
      <button
          className={"crypt-btn-main crypt-btn"}
          onClick={(e) => this.onEncrypt() }
          type="button"
        >
          { getTranslation(this.props.lang).tryAgain }
        </button>
    </div>;
  }

  render() {
    if (this.state.encryptionState === EncryptionState.Verify)
    {
      return (
        <form>
          {this.renderVerification()}
        </form>
      );
    }
    else if (this.state.encryptionState === EncryptionState.FileSelection) {
      return (
        <form onSubmit={(e) => {
          // preven submit redirection
          e.preventDefault();
          return false;
        }}>
          {this.renderfilesField()}
          {this.renderUserInputs()}
        </form>
      );
    }
    else if (this.state.encryptionState === EncryptionState.Encrypting) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderProgress()}
        </form>
      );
    }
    else if (this.state.encryptionState === EncryptionState.Error) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderError()}
        </form>
      );
    }
    else if (this.state.encryptionState === EncryptionState.Done) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderDone()}
        </form>
      );
    }
  }
}
