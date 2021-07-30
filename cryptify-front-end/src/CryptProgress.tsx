import React from 'react';
import Lang from './Lang';

import './CryptProgress.css';


type CryptProgressProps = {
  lang: Lang,
  percentage: number
};

class CryptProgress extends React.Component<CryptProgressProps, {}> {
  render() {
    const done = this.props.percentage.toString() + "%";
    return (
      <div className="crypt-progress">
        <span className="crypt-progress-done" style={{width: done}}/>
        <span className="crypt-progress-remaining"/>
      </div>
    );
  }
}

export default CryptProgress;
