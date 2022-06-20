import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
//import { Client } from '@e4a/irmaseal-client'

document.addEventListener("DOMContentLoaded", () => {
  let downloadUuid: string | null = null;
  const uuid = new URLSearchParams(window.location.search).get("download");
  const uuidRegex = /(\w{8}-(\w{4}-){3}\w{12})/;
  if (uuid !== null && uuid !== undefined) {
    const m = uuid.match(uuidRegex);
    if (m === null) {
      window.location.href = window.location.origin;
      return;
    }
    downloadUuid = m[1];
  }

  ReactDOM.render(
    <React.StrictMode>
      <App downloadUuid={downloadUuid} />
    </React.StrictMode>,
    document.getElementById("root")
  );
});
