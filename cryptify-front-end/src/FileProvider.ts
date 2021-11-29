import { FILEREAD_CHUNK_SIZE } from "./Constants";
import Lang from "./Lang";
import { ReadableStream, WritableStream } from 'web-streams-polyfill';

export const foo = 1;

interface FileState {
  token: string,
  uuid: string,
}

const baseurl = "http://localhost";

export function createFileReadable(file: File): ReadableStream {
  let offset = 0;
  const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1 });

  return new ReadableStream({
    async pull(cntrl) {
      if (cntrl.desiredSize !== null && cntrl.desiredSize <= 0) {
        return;
      }
      const read = await file
        .slice(offset, offset + FILEREAD_CHUNK_SIZE)
        .arrayBuffer();

      if (read.byteLength === 0) {
        return cntrl.close();
      }
      offset += FILEREAD_CHUNK_SIZE;
      cntrl.enqueue(new Uint8Array(read));
    },
  },
  queuingStrategy);
}

async function initFile(
  abortSignal: AbortSignal,
  sender: string,
  recipient: string,
  mailContent: string | null,
  lang: Lang
): Promise<FileState> {
  const response = await fetch(`${baseurl}/fileupload/init`, {
    signal: abortSignal,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: sender, 
      recipient: recipient,
      mailContent: mailContent,
      mailLang: lang
    })
  });

  
  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`Error occured while initializing file. status: ${response.status}, msg: ${errorText}`);
  }

  const resJson = await response.json();
  const token = response.headers.get("cryptifytoken") as string;
  return {
    token: token,
    uuid: resJson["uuid"]
  };
}

async function storeChunk(
  abortSignal: AbortSignal,
  state: FileState,
  chunk: Uint8Array,
  offset: number,
): Promise<FileState> {
  const response = await fetch(`${baseurl}/fileupload/${state.uuid}`, {
    signal: abortSignal,
    method: "PUT",
    headers: {
      "cryptifytoken": state.token,
      "Content-Type": "application/octet-stream",
      "content-range": `bytes ${offset}-${offset + chunk.length}/*`
    },
    body: new Blob([chunk])
  });

  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`Error occured while uploading chunk. status: ${response.status}, msg: ${errorText}`);
  }

  const token = response.headers.get("cryptifytoken") as string;

  return {
    token: token,
    uuid: state.uuid
  };
}

async function finalize(abortSignal: AbortSignal, state: FileState, size: number): Promise<void> {
  const response = await fetch(`${baseurl}/fileupload/finalize/${state.uuid}`, {
    signal: abortSignal,
    method: "POST",
    headers: {
      "cryptifytoken": state.token,
      "content-range": `bytes */${size}`
    }
  });

  if (response.status !== 200) {
    const errorText = await response.text()
    throw new Error(`Error occured while finalizing file upload. status: ${response.status}, body: ${errorText}`);
  }
}

export async function getFileLoadStream(abortSignal: AbortSignal, uuid: string): Promise<[number, ReadableStream<Uint8Array>]> {
  const response = await fetch(`${baseurl}/filedownload/${uuid}`, {
    signal: abortSignal,
    method: "GET",
  });

  if (response.status !== 200) {
    const errorText = await response.text()
    throw new Error(`Error occured while fetching file. status: ${response.status}, body: ${errorText}`);
  }

  const filesize = parseInt(response.headers.get("content-length") as string);
  const blob = await response.body;
  if (blob === null) {
    throw new Error("No response.body object.");
  }
  return [filesize, blob as ReadableStream<Uint8Array>];
}

export function getFileStoreStream(
  abortController: AbortController,
  sender: string,
  recipient: string,
  mailContent: string | null,
  lang: Lang,
  progressReported: (uploaded: number, last: boolean) => void
): WritableStream<Uint8Array> {
  let state: FileState = {
    token: "",
    uuid: ""
  }

  let processed = 0;
  const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1 });

  const start = async (c: WritableStreamDefaultController) => {
    try {
      state = await initFile(abortController.signal, sender, recipient, mailContent, lang);
      progressReported(processed, false);
      if (abortController.signal.aborted) {
        throw new Error("Abort signaled during initFile.");
      }
    }
    catch (e) {
      c.error(e);
    }
  };
  
  const write = async (chunk: Uint8Array, c: WritableStreamDefaultController) => {
    try {
      state = await storeChunk(abortController.signal, state, chunk, processed);
      processed += chunk.length;
      progressReported(processed, false);
      if (abortController.signal.aborted) {
        throw new Error("Abort signaled during storeChunk.");
      }
    }
    catch (e) {
      c.error(e);
    }
  }

  const close = async () => {
    const timeoutId = setTimeout(() => abortController.abort(), 60000);
    await finalize(abortController.signal, state, processed);
    progressReported(processed, true);
    clearTimeout(timeoutId);
    if (abortController.signal.aborted) {
      throw new Error("Abort signaled during finalize.");
    }
  }

  const abort = async () => {
    abortController.abort();
  }

  return new WritableStream({
    start,
    write,
    close,
    abort
  }, queuingStrategy);
}
