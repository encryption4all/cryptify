import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';

import {
  appendToFile,
  fileHash,
  filePath,
  HttpError,
  InitParams,
  returnJson,
  sendEmail,
  uuidv4,
} from './utilities';

import {
  checkToken,
  getBody,
  getMetaData,
  getUuid,
  handleError,
  parseJsonBody,
} from './validators';

export async function init(request: IncomingMessage, response: ServerResponse) {
  try {
    const json: InitParams = await parseJsonBody(request) as InitParams;
    const uuid = uuidv4();
    json.uuid = uuid;
    json.date = (new Date()).toISOString();
    json.expires = (new Date(Date.now() + 12096e5)).toISOString();

    const metadataFile = filePath(`${uuid}.metadata.json`);
    fs.writeFileSync(metadataFile, JSON.stringify(json));

    const token = (await fileHash(metadataFile)).toString('hex');
    const tokenFile = filePath(`${uuid}.token`);
    fs.writeFileSync(tokenFile, token);

    const headers = {
      cryptifytoken: token,
    };

    returnJson(200, { uuid }, response, headers);
  } catch (e) {
    handleError(e, response);
  }
}

export async function upload(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const uuid = getUuid(request);

  if (uuid instanceof HttpError) {
    handleError(uuid, response);
    return;
  }

  const dataFile = filePath(`${uuid}.part`);
  const contentRange = request.headers['content-range'];

  if (!contentRange) {
    handleError(new HttpError(400, 'Content-range header not found'), response);
    return;
  }

  const matches = contentRange.match(/bytes (\d+)-(\d+)\/\*/);

  if (!matches) {
    handleError(new HttpError(400, 'Content-range header incorrectly formatted'), response);
    return;
  }

  const [from, until] = matches.slice(1).map((n) => parseInt(n, 10));

  if (until - from <= 0) {
    handleError(new HttpError(400, 'Content-range header incorrectly formatted'), response);
    return;
  }

  try {
    await checkToken(request, uuid);
  } catch (e) {
    handleError(e, response);
    return;
  }

  const content = await getBody(request);

  if (from === 0) {
    // check starting bytes
    if (content.length < 4
      || content[0] !== 0x14
      || content[1] !== 0x8A
      || content[2] !== 0x8E
      || content[3] !== 0xA7
    ) {
      handleError(new HttpError(400, 'Invalid file header, expected cryptify header'), response);
      return;
    }
  }

  try {
    await appendToFile(dataFile, content, from, until - from);

    const tokenFile = filePath(`${uuid}.token`);
    const token = (await fileHash(tokenFile, content)).toString('hex');
    fs.writeFileSync(tokenFile, token);

    const headers = {
      cryptifytoken: token,
    };

    returnJson(200, { uuid }, response, headers);
  } catch (e) {
    handleError(e, response);
  }
}

export async function finalize(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const uuid = getUuid(request);

  if (uuid instanceof HttpError) {
    handleError(uuid, response);
    return;
  }

  const contentRange = request.headers['content-range'];
  const dataFile = filePath(`${uuid}.part`);
  const finalFile = filePath(`${uuid}.cryptify`);

  try {
    await checkToken(request, uuid);
  } catch (e) {
    handleError(e, response);
    return;
  }

  if (!contentRange) {
    handleError(new HttpError(400, 'Content-range header not found'), response);
    return;
  }

  const matches = contentRange.match(/bytes \*\/(\d+)/);

  if (!matches) {
    handleError(new HttpError(400, 'Content-range header incorrectly formatted'), response);
    return;
  }

  try {
    const stats = fs.statSync(dataFile);
    const fileSize = parseInt(matches[1], 10);

    if (stats.size !== fileSize) {
      console.log(`File size did not match uploaded file size, expected from fs: ${stats.size} but received: ${fileSize}`)
      handleError(new HttpError(422, 'File size did not match uploaded file size'), response);
      return;
    }

    const metadata = await getMetaData(uuid);
    metadata.filesSize = stats.size;
    const metadataFile = filePath(`${uuid}.metadata.json`);
    fs.writeFileSync(metadataFile, JSON.stringify(metadata));

    fs.renameSync(dataFile, finalFile);
  } catch (e) {
    handleError(new HttpError(404, 'File not found', e), response);
    return;
  }

  try {
    await sendEmail(uuid);
  } catch (e) {
    handleError(new HttpError(400, 'Error sending email', e), response);
    return;
  }

  response.writeHead(200);
  response.end();
}

export async function download(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const uuid = getUuid(request);

  if (uuid instanceof HttpError) {
    handleError(uuid, response);
    return;
  }

  const dataFile = filePath(`${uuid}.cryptify`);

  if (!fs.existsSync(dataFile)) {
    handleError(new HttpError(404, 'File not found'), response);
    return;
  }

  try {
    const stats = await fs.statSync(dataFile);

    response.writeHead(200, {
      'content-length': stats.size,
      'content-type': 'application/octet-stream',
    });

    const src = fs.createReadStream(dataFile);
    src.pipe(response);
  } catch (e) {
    handleError(e, response);
  }
}
