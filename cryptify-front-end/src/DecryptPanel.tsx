import "./DecryptPanel.css"
import React from 'react';
import CryptFileList from './CryptFileList';
import { Client } from '@e4a/irmaseal-client';
import createProgressReporter from './ProgressReporter';
import streamSaver from 'streamsaver';
import mkIrmaErr from './IrmaErrMod';
import {getFileLoadStream} from './FileProvider';
import Lang from './Lang';
import getTranslation from './Translations';
import irmaLogo from './resources/irma-logo.svg';
import appleAppStoreEN from './resources/apple-appstore-en.svg';
import googlePlayStoreEN from './resources/google-playstore-en.svg';
import appleAppStoreNL from './resources/apple-appstore-nl.svg';
import googlePlayStoreNL from './resources/google-playstore-nl.svg';
import checkmark from './resources/checkmark.svg';

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
import { SMOOTH_TIME } from "./Constants";

const toReadable = createReadableStreamWrapper(PolyfillReadableStream)
const toWritable = createWritableStreamWrapper(PolyfillWritableStream)
const toTransform = createTransformStreamWrapper(PolyfillTransformStream)

const IrmaCore = require('@privacybydesign/irma-core');
const IrmaWeb = require('@privacybydesign/irma-web');
const IrmaClient = require('@privacybydesign/irma-client');

streamSaver.mitm = "https://cryptify.nl/mitm.html?version=2.0.0";

enum DecryptionState {
  IrmaSession = 1,
  AskDownload,
  Decrypting,
  Done,
  Error
}

type StreamDecryptInfo = {
  keys: any,
  header: any,
  metadata: any,
  content: ReadableStream<Uint8Array>
}

type DecryptState = {
  decryptionState: DecryptionState,
  fakeFile: File | null,
  decryptInfo: StreamDecryptInfo | null,
  percentage: number,
  done: boolean,
  abort: AbortController,
  selfAborted: boolean,
  decryptStartTime: number
};

type DecryptProps = {
  lang: Lang,
  sealClient: Client,
  downloadUuid: string
}

const defaultDecryptState: DecryptState = {
  decryptionState: DecryptionState.IrmaSession,
  fakeFile: null,
  decryptInfo: null,
  percentage: 0,
  done: false,
  abort: new AbortController(),
  selfAborted: false,
  decryptStartTime: 0
};

export default class DecryptPanel extends React.Component<DecryptProps, DecryptState> {
  constructor(props: DecryptProps) {
    super(props);
    this.state = defaultDecryptState;
  }

  // Based on:https://gitlab.science.ru.nl/irma/github-mirrors/irma-frontend-packages/-/blob/master/irma-core/user-agent.js
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

  async componentDidMount() {
    await this.onDecrypt();
  }

  async onDecrypt() {
    this.setState({
      decryptionState: DecryptionState.IrmaSession,
      fakeFile: this.state.fakeFile,
      decryptInfo: this.state.decryptInfo,
      percentage: this.state.percentage,
      done: this.state.done,
      abort: this.state.abort,
      selfAborted: false,
      decryptStartTime: Date.now()
    });

    try {
      await this.applyDecryption();
    }
    catch (e) {
      console.error("Error occured during decryption");
      console.error(e);
      this.setState({
        decryptionState: DecryptionState.Error,
        fakeFile: this.state.fakeFile,
        decryptInfo: this.state.decryptInfo,
        percentage: this.state.percentage,
        done: this.state.done,
        abort: this.state.abort,
        selfAborted: this.state.selfAborted,
        decryptStartTime: this.state.decryptStartTime
      });
    }
  }

  async applyDecryption() {
    const [streamSize, encrypted] = await getFileLoadStream(this.state.abort.signal, this.props.downloadUuid);

    const name = `cryptify-${this.props.downloadUuid.split("-")[0]}.zip`
    const fakeFile: File = {
      name: name,
      size: streamSize
    } as File;

    this.setState({
      decryptionState: DecryptionState.IrmaSession,
      fakeFile: fakeFile,
      decryptInfo: this.state.decryptInfo,
      percentage: this.state.percentage,
      done: this.state.done,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      decryptStartTime: this.state.decryptStartTime
    });

    // Do irma session and get symmetric encryption keys
    const { header, metadata, readable} = await this.props.sealClient.extractMetadata(encrypted);
    const content = toReadable(readable) as ReadableStream;
    const meta_json =  metadata.to_json();

    const session = this.props.sealClient.createPKGSession(meta_json.identity.attribute, meta_json.identity.timestamp);

    const irma = new IrmaCore({
      element: ".crypt-irma-qr",
      session: session,
      language: (this.props.lang as string).toLowerCase()
    });

    const irmaPromise = new Promise<any>(async (resolve, reject) => {
      irma.use(mkIrmaErr(reject));
      irma.use(IrmaWeb);
      irma.use(IrmaClient);
      const usk = await irma.start();
      resolve(usk);
    });

    // Setup decryption
    const usk = await irmaPromise;
    const keys = metadata.derive_keys(usk);

    this.setState({
      decryptionState: DecryptionState.AskDownload,
      fakeFile: this.state.fakeFile,
      decryptInfo: {
        keys: keys,
        header: header,
        metadata: meta_json,
        content: content
      },
      percentage: this.state.percentage,
      done: this.state.done,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      decryptStartTime: this.state.decryptStartTime
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
        decryptStartTime: this.state.decryptStartTime
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
        done: this.state.done,
        abort: this.state.abort,
        selfAborted: this.state.selfAborted,
        decryptStartTime: this.state.decryptStartTime
      });
      return;
    }

    const unsealer = toTransform(this.props.sealClient.createTransformStream({
      aesKey: this.state.decryptInfo.keys.aes_key,
      macKey: this.state.decryptInfo.keys.mac_key,
      iv: this.state.decryptInfo.metadata.iv,
      header: this.state.decryptInfo.header,
      decrypt: true,
    })) as TransformStream<Uint8Array, Uint8Array>;

    const chunker = toTransform(
      // @ts-ignore
      this.props.sealClient.createChunker({ offset: this.state.decryptInfo.header.byteLength }) 
    ) as TransformStream<Uint8Array, Uint8Array>;
    
    const rawFileStream = streamSaver.createWriteStream(this.state.fakeFile.name);
    const fileStream = toWritable(rawFileStream) as WritableStream<Uint8Array>;

    // Apply unsealer
    let resolve: any = null;
    const finished = new Promise<void>(async (res, _) => {
      resolve = res;
    });

    const progress = toTransform(createProgressReporter((processed, done) => {
      const fakeFile = this.state.fakeFile as File;
      this.setState({
        decryptionState: DecryptionState.Decrypting,
        decryptInfo: this.state.decryptInfo,
        percentage: 100 * processed / fakeFile.size,
        done: this.state.done,
        abort: this.state.abort,
        selfAborted: this.state.selfAborted,
        decryptStartTime: this.state.decryptStartTime
      });

      if (done) {
        window.setTimeout(() => {
          this.setState({
            decryptionState: DecryptionState.Decrypting,
            fakeFile: this.state.fakeFile,
            decryptInfo: this.state.decryptInfo,
            percentage: 100,
            done: true,
            abort: this.state.abort,
            selfAborted: this.state.selfAborted,
            decryptStartTime: this.state.decryptStartTime
          });
          resolve();
        }, 1000 * SMOOTH_TIME);
      }
    })) as TransformStream<Uint8Array, Uint8Array>;

    await this.state.decryptInfo.content
      .pipeThrough(progress)
      .pipeThrough(chunker)
      .pipeThrough(unsealer)
      .pipeTo(fileStream);
        
    await finished;

    this.setState({
      decryptionState: DecryptionState.Done,
      fakeFile: this.state.fakeFile,
      decryptInfo: this.state.decryptInfo,
      percentage: 100,
      done: true,
      abort: this.state.abort,
      selfAborted: this.state.selfAborted,
      decryptStartTime: this.state.decryptStartTime
    });
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
        >
        </CryptFileList>
      </div>
    );
  }

  renderIrmaSession() {
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
            ? getTranslation(this.props.lang).decryptPanel_irmaInstructionHeaderMobile
            : getTranslation(this.props.lang).decryptPanel_irmaInstructionHeaderQr
          }
        </h3>
        <p>
          { isMobile
            ? getTranslation(this.props.lang).decryptPanel_irmaInstructionMobile
            : getTranslation(this.props.lang).decryptPanel_irmaInstructionQr
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
      </div>
    );
  }

  renderAskDownload() {
    return <div className="crypt-progress-container">
      <h3>{ getTranslation(this.props.lang).decryptPanel_askDownload }</h3>
      <p>{ getTranslation(this.props.lang).decryptPanel_askDownloadText }</p>
      <button
        className={"crypt-btn-main crypt-btn"}
        onClick={(e) => this.onDownload() }
        type="button"
      >
        { "Download" }
      </button>
    </div>;
  }


  renderProgress() {
    const deltaT = Date.now() - this.state.decryptStartTime;
    
    const totalProgress = this.state.percentage;
    
    let timeEstimateRepr = getTranslation(this.props.lang).estimate;
    if (deltaT > 1000 && totalProgress > 1) {
      const remainingProgress = 100 - totalProgress;
      const estimatedT = remainingProgress * (deltaT / totalProgress);
      timeEstimateRepr = getTranslation(this.props.lang).timeremaining(estimatedT);
    }

    return <div className="crypt-progress-container">
      <h3>{ getTranslation(this.props.lang).decryptPanel_downloadDecrypt }</h3>
      <p>{ getTranslation(this.props.lang).decryptPanel_decrypting }</p>
      <p>{timeEstimateRepr}</p>
      
      <button
        className={"crypt-btn crypt-btn-secondary crypt-btn-cancel"}
        onClick={(e) => this.onCancelDecrypt(e) }
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
        { getTranslation(this.props.lang).decryptPanel_succes }
      </h3>
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
          onClick={(e) => this.onDecrypt() }
          type="button"
        >
          { getTranslation(this.props.lang).tryAgain }
        </button>
    </div>;
  }

  render() {
    if (this.state.decryptionState === DecryptionState.IrmaSession) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderIrmaSession()}
        </form>
      );
    }
    if (this.state.decryptionState === DecryptionState.AskDownload) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderAskDownload()}
        </form>
      );
    }
    else if (this.state.decryptionState === DecryptionState.Decrypting) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderProgress()}
        </form>
      );
    }
    else if (this.state.decryptionState === DecryptionState.Done) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderDone()}
        </form>
      );
    }
    else if (this.state.decryptionState === DecryptionState.Error) {
      return (
        <form>
          {this.renderfilesField()}
          {this.renderError()}
        </form>
      );
    }
  }
}
