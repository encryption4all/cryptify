import React from 'react';
import './App.css';
import headerLogo from './resources/cryptify-dark.svg';
import { Client } from '@e4a/irmaseal-client';

import InfoPanel from './InfoPanel';
import EncryptPanel from './EncryptPanel';
import DecryptPanel from './DecryptPanel';
import Lang from './Lang';
import getTranslation from './Translations';

type AppState = {
  lang: Lang
}

type AppProps = {
  downloadUuid: string | null
}

const langKey = "cryptify-language";

class App extends React.Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = {
      lang: this.getLangSetting()
    };
  }

  getLangSetting(): Lang {
    let currentLang = localStorage.getItem(langKey);
    if ( currentLang === null
      || (currentLang !== (Lang.EN as string)
      && currentLang !== (Lang.NL as string))
    ) {
      const userLang = navigator.language;
      currentLang = Lang.EN as string;
      if (userLang === "nl-NL") {
        currentLang = Lang.NL as string;
      }
      localStorage.setItem(langKey, currentLang);
    }
    return currentLang as Lang;
  }

  setLang(lang: Lang): void {
    localStorage.setItem(langKey, lang as string);

    this.setState({
      lang: lang
    });
  }

  contentPanel() {
    if (this.props.downloadUuid) {
      return <DecryptPanel
        lang={this.state.lang}
        downloadUuid={this.props.downloadUuid}
      />
    }
    else {
      return <EncryptPanel lang={this.state.lang} />
    }
  }

  render() {
    let panelClass = null;
    let panelHeader = null;
    // @ts-ignore
    if (this.props.downloadUuid) {
      panelClass = "decrypt-panel";
      panelHeader = getTranslation(this.state.lang).decryptPanel_header;
    }
    else {
      panelClass = "encrypt-panel";
      panelHeader = getTranslation(this.state.lang).encryptPanel_header;
    }

    return (
      <div className="App">
        <div className={`content-panel ${panelClass}`}>
          <header className="App-header">
            <img className="App-header-logo" src={ headerLogo } alt="cryptify-logo" ></img>
          </header>
          <div className="crypt-panel-header">
            <div className="crypt-panel-header-text">
              { panelHeader }
            </div>
          </div>
          {this.contentPanel()}
        </div>
        <InfoPanel lang={this.state.lang} onSetLang={(l: Lang) => this.setLang(l)}/>
      </div>
    );
  }
}

export default App;
