import React from 'react';
import { FileDrop } from 'react-file-drop';
import Lang from './Lang';
import getTranslation from './Translations';

import './CryptFileInput.css';

type CryptFileInputProps = {
  lang: Lang,
  onFile: (f : FileList) => void,
  multiple: boolean,
  required: boolean
};

class CryptFileInput extends React.Component<CryptFileInputProps, {}> {
  onFiles(files : FileList | null) {
    if (files === null) {
      return;
    }
    this.props.onFile(files);
  }

  render() {
    return (
      <div className="crypt-file-box">
        <FileDrop
          onDrop={(files, _) => this.onFiles(files)}
        >
          <input
            multiple={this.props.multiple}
            required={this.props.required}
            id="crypt-file-input"
            type="file"
            onChange={(ev) => this.onFiles(ev.currentTarget.files)}
          >
          </input>
          <div className="swallow-ptr-evs">
            <label className="crypt-file-input-label" htmlFor="crypt-file-input">
              <div className="crypt-file-box-content">
                <div className="crypt-file-box-large-text">{ getTranslation(this.props.lang).cryptFileInput_dropFiles }</div>
                <div className="crypt-file-box-small-text">{ getTranslation(this.props.lang).cryptFileInput_clickFiles }</div>
                <div className="crypt-file-box-tiny-text">{ getTranslation(this.props.lang).cryptFileInput_sendUpto }</div>
                <div className="crypt-btn crypt-file-btn">{ getTranslation(this.props.lang).cryptFileInput_addFileBtn }</div>
              </div>
            </label>
          </div>
        </FileDrop>
      </div>
    );
  }
}

export default CryptFileInput;
