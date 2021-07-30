import React from 'react';
import Lang from './Lang';
import getTranslation from './Translations';

import './CryptFileList.css';
import CryptProgress from "./CryptProgress";

import { FileDrop } from 'react-file-drop';
import { MAX_UPLOAD_SIZE } from './Constants';

import plusIcon from './resources/plus-icon.svg';
import fileIcon from './resources/file-icon.svg';
import fileIconLockedUpload from './resources/file-icon-locked-upload.svg';
import fileIconLockedDownload from './resources/file-icon-locked-download.svg';
import fileRemove from './resources/file-remove.svg';
import fileRemoveHover from './resources/file-remove-hover.svg';
import checkmark from './resources/checkmark.svg';

type CryptFileListProps = {
  lang: Lang,
  onAddFiles : ((f : FileList) => void) | null,
  onRemoveFile : ((index: number) => void) | null,
  forUpload: boolean,
  files: File[],
  percentages: number[],
  done: boolean[],
};

type CryptFileListState = {
  hoverCrossIdx: number
}

const defaultCryptFileListState: CryptFileListState = {
  hoverCrossIdx: -1
};

class CryptFileList extends React.Component<CryptFileListProps, CryptFileListState> {
  constructor(props: CryptFileListProps) {
    super(props);
    this.state = defaultCryptFileListState;
  }

  onFiles(files : FileList | null) {
    if (files === null || this.props.onAddFiles === null) {
      return;
    }
    this.props.onAddFiles(files);
  }

  onRemoveFile(index: number) {
    if (this.props.onRemoveFile === null) {
      return;
    }
    this.props.onRemoveFile(index);
  }

  humanFileSize(bytes: number) {
    if (bytes < 100 * 1000) {
      return `${(bytes / 1000).toFixed(2)} kB`;
    }
    else if (bytes < 100 * 1000 * 1000) {
      return `${(bytes / 1000000).toFixed(2)} MB`;
    }
    else if (bytes < 100 * 1000 * 1000 * 1000) {
      return `${(bytes / 1000000000).toFixed(2)} GB`;
    }
    else {
      return `${(bytes / 1000000000000).toFixed(2)} TB`;
    }
  }

  renderFileStatusIcon(index: number) {
    if (this.props.onRemoveFile === null) {
      if (this.props.done[index]) {
        return <img className="file-icon" src={ checkmark } alt="file-done-icon" />
      }
      else {
        return <span className="file-icon" />
      }
    }
    else {
      const fileRemoveSrc = this.state.hoverCrossIdx === index ? fileRemoveHover : fileRemove;
      const f = this.props.onRemoveFile;
      return (
        <img className="file-icon" src={ fileRemoveSrc } alt="file-remove-icon"
          onMouseOver={(e) => this.setState({ hoverCrossIdx: index })}
          onMouseOut={(e) => this.setState({ hoverCrossIdx: -1 })}
          style={{ height: "0.75em" }}
          onClick={(e) => f(index) }
        />
      );
    }
  }

  renderFile(index: number) {
    const file = this.props.files[index];
    let fIcon = fileIcon;
    if (this.props.forUpload && this.props.done[index]) {
      fIcon = fileIconLockedUpload;
    }
    else if (!this.props.forUpload) {
      fIcon = fileIconLockedDownload;
    }

    return (
      <div className="crypt-file" key={index}>
        <div className="crypt-file-information">
          <img className="file-icon" src={ fIcon } alt="file-icon"
               style={{height: "1.4em", width: "auto", position: "relative", top: "0.1em"}}
          />
          <span className="file-name">{file.name}</span>
          <div className="file-float-right">
            <span className="file-size">{this.humanFileSize(file.size)}</span>
            {this.renderFileStatusIcon(index)}
          </div>
        </div>
        <CryptProgress lang={this.props.lang} percentage={this.props.percentages[index]}/>
      </div>
    );
  }

  renderFileAddBox() {
    const n = this.props.files.length;
    const size = this.props.files.reduce((a, b) => a + b.size, 0);
    const sizeLeft = MAX_UPLOAD_SIZE - size;
    let humanFileSize = "0 kB";
    const tooLarge = sizeLeft < 0;
    if (tooLarge === false) {
      humanFileSize = this.humanFileSize(sizeLeft);
    }
    if (this.props.onAddFiles === null) {
      return <div />
    }
    else {
      return (
        <div className="crypt-file-list-add-file-box">
          <FileDrop
            className="crypt-file-list-file-drop"
            onDrop={(files, _) => this.onFiles(files)}
          >
            <input
              multiple={true}
              required={false}
              id="crypt-file-list-add-files-input"
              type="file"
              onChange={(ev) => this.onFiles(ev.currentTarget.files)}
            >
            </input>
            <div>
            <label className="crypt-file-list-add-input-label" htmlFor="crypt-file-list-add-files-input">
              <div className="crypt-file-list-add-box-content">
                <img className="add-files-icon" src={plusIcon} alt="add-files-icon" />
                <div className="add-files-text"
                  style={{
                    display: "inline-block",
                    verticalAlign: "middle",
                    height: "32pt",
                    marginLeft: "5pt",
                    marginBottom: "calc(1em/2)",
                    color: tooLarge ? "red" : "#424242"
                  }}>
                  <span>
                    { tooLarge
                      ? getTranslation(this.props.lang).cryptFileList_tooLarge
                      : getTranslation(this.props.lang).cryptFileList_addMoreFiles }
                  </span><br />
                  <span>{ getTranslation(this.props.lang).cryptFileList_filesAdded(n, humanFileSize) }</span>
                </div>
              </div>
            </label>
          </div>
          </FileDrop>
        </div>
      );
    }
  }

  render() {
    return (
      <div>
        <div className="crypt-file-list">
          {this.props.files.map((_, i) => this.renderFile(i))}
        </div>
        {this.renderFileAddBox()}
      </div>
    );
  }
}

export default CryptFileList;
