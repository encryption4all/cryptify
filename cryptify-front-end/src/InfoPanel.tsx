import React from 'react';
import './InfoPanel.css';
import confidentialLetter from './resources/confidential-letter.svg';
import sharedFolder from './resources/shared-folder.svg';
import accordionOpened from './resources/accordion-opened.svg';
import accordionClosed from './resources/accordion-closed.svg';
import irmaLogo from './resources/irma-logo.svg';
import Lang from './Lang';
import getTranslation from './Translations';

type InfoPanelProps = {
  lang: Lang,
  onSetLang: (lang: Lang) => void,
}

type AboutPage = {
  name: "aboutPage"
};
const aboutPage: AboutPage = {
  name: "aboutPage"
};
type HelpPage = {
  name: "helpPage"
  selectedHelp: number | null
}
const helpPage: HelpPage = {
  name: "helpPage",
  selectedHelp: null
};
type PrivacyPage = {
  name: "privacyPage"
};
const privacyPage: PrivacyPage = {
  name: "privacyPage"
}

type InfoPanelPage = AboutPage | HelpPage | PrivacyPage

type InfoPanelState = {
  page: InfoPanelPage
};

// TODO: make this better
class InfoPanel extends React.Component<InfoPanelProps, InfoPanelState> {
  constructor(props: InfoPanelProps) {
    super(props);
    this.state = {
      page: aboutPage
    };
  }

  changePage(newPage: InfoPanelPage) {
    this.setState({
      page: newPage
    });
  }

  renderAbout() {
    return (
      <div>
        <div className="info-panel-header">
          { getTranslation(this.props.lang).infoPanel_aboutHeader }
        </div>
        <div className="info-panel-content">
          <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_aboutContent }} >
          </p>
          <p className="info-panel-know-more-irma">
            <img className="irma-logo" src={irmaLogo} alt="irma-logo" />
            <span className="get-irma-text"
              style={{
                display: "inline-block",
                verticalAlign: "middle",
                fontSize: "18pt",
                height: "80pt",
                marginLeft: "8pt",
              }}
            >
              <a href="https://irma.app/" style={{color: "white", textDecoration: "underline"}}>
              { getTranslation(this.props.lang).infoPanel_aboutIrmaInfo }
              </a>
            </span>
          </p>

        </div>
        <img className="info-panel-about-letter" src={ confidentialLetter } alt="info-panel-about-letter" >
        </img>
      </div>
    )
  }

  renderHelp(s: HelpPage) {
    const sharedOpen = s.selectedHelp === 0;
    const receivedOpen = s.selectedHelp === 1; 

    return (
      <div>
        <div className="info-panel-header">
          { getTranslation(this.props.lang).infoPanel_helpHeader }
        </div>
        <div className="info-panel-content">

          <div className="info-panel-content-accordion">
            <div
              className={ "info-panel-content-accordion-item" + (sharedOpen ? "" : " info-panel-content-accordion-closed") }
            >
              <div
                className="info-panel-content-accordion-title"
                onClick={() => this.changePage({
                  name: "helpPage",
                  selectedHelp: sharedOpen ? null : 0
                })}
              >
                <span><b>{getTranslation(this.props.lang).infoPanel_helpShareHeader}</b></span>
                <img className="info-panel-content-triangle" alt="accordion-icon" src={sharedOpen ? accordionOpened : accordionClosed} />
              </div>
              <div className="info-panel-content-accordion-content">
                <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareIntro }}></p>
                <ol>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareStep1 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareStep2 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareStep3 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareStep4 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareStep5 }}></li>
                </ol>
                <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpShareOutro }}></p>
              </div>
            </div>

            <div
              className={ "info-panel-content-accordion-item" + (receivedOpen ? "" : " info-panel-content-accordion-closed") }
            >
              <div
                className="info-panel-content-accordion-title"
                onClick={() => this.changePage({
                  name: "helpPage",
                  selectedHelp: receivedOpen ? null : 1
                })}
              >
                <span><b>{getTranslation(this.props.lang).infoPanel_helpReceivedHeader}</b></span>
                <img className="info-panel-content-triangle" alt="accordion-icon" src={receivedOpen ? accordionOpened : accordionClosed} />
              </div>
              <div className="info-panel-content-accordion-content">
                <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedInstallIrmaIntro }}></p>
                <ol>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedInstallStep1 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedInstallStep2 }}></li>
                </ol>
                <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedInstallIrmaOutro }}></p>
                <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseIrma }}></p>
                <ol>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseStep1 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseStep2 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseStep3 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseStep4 }}></li>
                  <li dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_helpReceivedUseStep5 }}></li>
                </ol>
              </div>
            </div>
          </div>

          <img className="info-panel-help-letter" src={ sharedFolder } alt="info-panel-help-letter" >
          </img>
        </div>
      </div>
    )
  }

  renderPrivacy() {
    return (
      <div>
        <div className="info-panel-header">
        { getTranslation(this.props.lang).infoPanel_privacyPolicyHeader }
        </div>
        <div className="info-panel-content">
          <p dangerouslySetInnerHTML={{ __html: getTranslation(this.props.lang).infoPanel_privacyPolicyContent }}>
          </p>
        </div>
      </div>
    )
  }

  render() {
    let bg: string | null = null;
    let content;
    switch (this.state.page.name) {
    case "aboutPage":
      content = this.renderAbout();
      bg = "linear-gradient(160.08deg, #27187E 0%, #D73F54 60.94%, #FF8600 78.65%, #FF8600 100%)";
      break;
    case "helpPage":
      content = this.renderHelp(this.state.page);
      bg = "linear-gradient(160.08deg, #035992 0%, #1abe94 100%)";
      break;
    case "privacyPage":
      content = this.renderPrivacy();
      bg = "linear-gradient(160.08deg, #004c92 0%, #27187e 100%)";
      break;
    }

    return (
      <div className="info-panel" style = {{background: bg}}>
        <div className="btn-bar">
          <span className="menu-bar btn-group">
            <button
              disabled={this.state.page.name === aboutPage.name}
              onClick={(_) => this.changePage(aboutPage)}
            >
              { getTranslation(this.props.lang).infoPanel_about }
            </button>
            <button
              disabled={this.state.page.name === helpPage.name}
              onClick={(_) => this.changePage(helpPage)}
            >
              { getTranslation(this.props.lang).infoPanel_help }
            </button>
            <button
              disabled={this.state.page.name === privacyPage.name}
              onClick={(_) => this.changePage(privacyPage)}
            >
              { getTranslation(this.props.lang).infoPanel_privacyPolicy }
            </button>
          </span>
          <span className="lang-bar btn-group">
            <button
              disabled={this.props.lang === Lang.EN}
              onClick={(_) => this.props.onSetLang(Lang.EN)}
            >
              EN
            </button>
            <button
              disabled={this.props.lang === Lang.NL}
              onClick={(_) => this.props.onSetLang(Lang.NL)}
            >
              NL
            </button>
          </span>
        </div>
        {content}
      </div>
    );
  }
}

export default InfoPanel;
