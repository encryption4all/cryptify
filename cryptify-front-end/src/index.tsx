import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

import { WritableStream as PolyfilledWritableStream } from "web-streams-polyfill/ponyfill";

document.addEventListener("DOMContentLoaded", async () => {
  let downloadUuid: string | null = null;
  let recipient: string | null = null;

  const params = new URLSearchParams(window.location.search);
  const uuid = params.get("download");
  const uuidRegex = /(\w{8}-(\w{4}-){3}\w{12})/;
  if (uuid !== null && uuid !== undefined) {
    const m = uuid.match(uuidRegex);
    if (m === null) {
      window.location.href = window.location.origin;
      return;
    }
    downloadUuid = m[1];
  }

  recipient = params.get("recipient");

  if (window.WritableStream === undefined) {
    window.WritableStream = PolyfilledWritableStream;
  }

  const container = document.getElementById("root");
  const root = createRoot(container!);
  root.render(<App downloadUuid={downloadUuid} recipient={recipient} />);
});
