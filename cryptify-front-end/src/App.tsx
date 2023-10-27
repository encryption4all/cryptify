import React from "react";
import "./App.css";

import EncryptPanel from "./EncryptPanel";
import DecryptPanel from "./DecryptPanel";
import Lang from "./Lang";

type AppState = {
  lang: Lang;
};

type AppProps = {
  downloadUuid: string | null;
  recipient: string | null;
};

const langKey = "preferredLanguage";

class App extends React.Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = {
      lang: this.getLangSetting(),
    };

    this.langListener = this.langListener.bind(this);
  }

  langListener(e: MessageEvent): void {
    this.setLang(e.data.lang === "nl-NL" ? Lang.NL : Lang.EN);
  }

  componentDidMount(): void {
    window.addEventListener('message', this.langListener);
  }

  componentWillUnmount(): void {
    window.removeEventListener('message', this.langListener);
  }

  getLangSetting(): Lang {
    let storedLang = localStorage.getItem(langKey);
    let currentLang = storedLang === "nl-NL" ? Lang.NL : Lang.EN;
    if (
      currentLang === null ||
      (currentLang !== (Lang.EN as string) &&
        currentLang !== (Lang.NL as string))
    ) {
      const userLang = navigator.language;
      currentLang = Lang.EN;
      if (userLang === "nl-NL") {
        currentLang = Lang.NL;
      }
    }
    return currentLang as Lang;
  }

  setLang(lang: Lang): void {
    this.setState({
      lang: lang,
    });
  }

  contentPanel() {
    if (this.props.downloadUuid && this.props.recipient) {
      return (
        <DecryptPanel
          lang={this.state.lang}
          downloadUuid={this.props.downloadUuid}
          recipient={this.props.recipient}
        />
      );
    } else {
      return <EncryptPanel lang={this.state.lang} />;
    }
  }

  render() {
    let panelClass = "";
    // @ts-ignore
    if (this.props.downloadUuid) {
      panelClass = "decrypt-panel";
    } else {
      panelClass = "encrypt-panel";
    }

    return (
      <div className="App">
        <div className={`content-panel ${panelClass}`}>
          {this.contentPanel()}
        </div>
        {/*
        <InfoPanel
          lang={this.state.lang}
          onSetLang={(l: Lang) => this.setLang(l)}
        />
        */}
      </div>
    );
  }
}

export default App;
