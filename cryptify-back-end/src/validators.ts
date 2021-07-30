import { timingSafeEqual } from 'crypto';
import fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';

import {
  HttpError,
  InitParams,
  UUID_REGEX,
  returnJson,
  filePath,
} from './utilities';

export async function checkToken(
  request: IncomingMessage,
  uuid: string,
): Promise<void> {
  const tokenFile = filePath(`${uuid}.token`);
  console.dir(request.headers);
  const token: string | undefined = request.headers.cryptifytoken as string | undefined;

  if (!fs.existsSync(tokenFile)) {
    throw new HttpError(404, 'File not found');
  }

  if (!token) {
    throw new HttpError(400, 'cryptifytoken header not found');
  }

  const tokenBuffer = Buffer.from(token);
  const sumBuffer = fs.readFileSync(tokenFile);

  if (sumBuffer.length !== tokenBuffer.length || !timingSafeEqual(sumBuffer, tokenBuffer)) {
    throw new HttpError(400, 'Server file parts cryptifytoken differs from cryptifytoken in request.');
  }
}

export function getBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const body: Uint8Array[] = [];
    request.on('data', (chunk) => {
      body.push(chunk);
    }).on('end', () => {
      resolve(Buffer.concat(body));
    });
  });
}

export async function getMetaData(uuid: string): Promise<InitParams> {
  const metadataFile = filePath(`${uuid}.metadata.json`);

  if (!fs.existsSync(metadataFile)) {
    throw new HttpError(404, 'File not found');
  }

  // If the encoding option is specified then this function returns a string. Otherwise it returns a
  // buffer.
  const metadata: string = fs.readFileSync(metadataFile, { encoding: 'utf8' });

  try {
    return JSON.parse(metadata);
  } catch (e) {
    throw new HttpError(400, 'Could not parse json');
  }
}

export function getUuid(request: IncomingMessage): string | HttpError {
  const uuid = request.url?.slice(-36);

  if (!uuid || !UUID_REGEX.test(uuid)) {
    return new HttpError(400, 'Missing or incorrectly formatted UUID');
  }

  return uuid;
}

export function handleError(e: HttpError, response: ServerResponse) {
  console.error('ERROR', e.parent || e.message);
  if (e.status) {
    returnJson(e.status, { error: e.message }, response);
  } else {
    returnJson(500, { error: 'Internal server error' }, response);
  }
}

export function parseJsonBody(request: IncomingMessage): Promise<object> {
  return getBody(request).then((body) => {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch (e) {
      throw new HttpError(401, 'Could not parse json body');
    }
  });
}
