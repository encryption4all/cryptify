import {
  describe, it,
} from 'mocha';
import axios from 'axios';
import {
  openSync, fstatSync, readSync,
} from 'fs';
import { join } from 'path';
import { expect } from 'chai';

const TEST_FILE = openSync(join(__dirname, 'sealed.cryptify'), 'r');
const BASE_URL = 'http://localhost';
// const BASE_URL = 'https://cryptify.nl';

const api = axios.create({ baseURL: BASE_URL });

describe('file upload', async () => {
  let uuid = '';
  let token = '';

  const chunkSize = 100;
  const buffer = Buffer.alloc(chunkSize);
  const stats = fstatSync(TEST_FILE);
  const missingUuid = 'c462532d-07cf-4869-afed-e21999f3efe1';

  it('should init a file', async () => {
    const response = await api.post('/fileupload/init', {
      sender: 'sender@example.com',
      recipient: 'recipient@example.com',
      fileSize: stats.size,
      mailContent: 'Hello world!\nThis is a message.\nCheers!',
      mailLang: 'nl',
    });

    expect(response?.status).to.eq(200);
    expect(response.data?.uuid).to.match(/\w{8}-(\w{4}-){3}\w{12}/);
    expect(response?.headers.cryptifytoken).to.match(/\w+/);

    token = response.headers?.cryptifytoken;
    uuid = response.data?.uuid;
  });

  it('should return an error on invalid json', async () => {
    try {
      const response = await api.post('/fileupload/init', '{"json": "bad}');
      expect(response.status).to.eq(401);
    } catch (e) {
      expect(e.response.status).to.eq(401);
      expect(e.response.data?.error).to.eq('Could not parse json body');
    }
  });

  it('should return an error on an missing cryptifytoken header', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      `/fileupload/${uuid}`,
      buffer.slice(0, length),
      {
        headers: {
          'content-length': length,
          'content-type': 'application/octet-stream',
          'content-range': `bytes 0-${length}/*`,
        },
      },
    ).catch((e) => e.response?.status)).to.equal(400);
  });

  it('should return an error on an invalid cryptifytoken header', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      `/fileupload/${uuid}`,
      buffer.slice(0, length),
      {
        headers: {
          cryptifytoken: 'sorrythisisnotvalid',
          'content-length': length,
          'content-type': 'application/octet-stream',
          'content-range': `bytes 0-${length}/*`,
        },
      },
    ).catch((e) => e.response?.status)).to.equal(400);
  });

  it('should return an error on an missing content-range header', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      `/fileupload/${uuid}`,
      buffer.slice(0, length),
      {
        headers: {
          cryptifytoken: token,
          'content-length': length,
          'content-type': 'application/octet-stream',
        },
      },
    ).catch((e) => e.response?.status)).to.eq(400);
  });

  it('should return an error on an invalid content-range header', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      `/fileupload/${uuid}`,
      buffer.slice(0, length),
      {
        headers: {
          cryptifytoken: token,
          'content-length': length,
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-/*',
        },
      },
    ).catch((e) => e.response?.status)).to.eq(400);
  });

  it('should return an error on an invalid uuid', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      '/fileupload/notsovalid',
      buffer.slice(0, length),
      {
        headers: {
          cryptifytoken: token,
          'content-length': length,
          'content-type': 'application/octet-stream',
          'content-range': `bytes 0-${length}/*`,
        },
      },
    ).catch((e) => e.response?.status)).to.eq(404);
  });

  it('should return an error on an invalid file header', async () => {
    const length = Math.min(chunkSize, stats.size);
    readSync(TEST_FILE, buffer, 0, length, 0);

    expect(await api.put(
      `/fileupload/${uuid}`,
      Buffer.from('invalid header'),
      {
        headers: {
          cryptifytoken: token,
          'content-length': length,
          'content-type': 'application/octet-stream',
          'content-range': `bytes 0-${length}/*`,
        },
      },
    ).catch((e) => e.response?.status)).to.eq(400);
  });

  it('should handle upload chunks', async () => {
    for (let i = 0; i < Math.ceil(stats.size / chunkSize); i += 1) {
      const offset = i * chunkSize;
      const length = Math.min(chunkSize, stats.size - offset);
      readSync(TEST_FILE, buffer, 0, length, offset);

      // eslint-disable-next-line no-await-in-loop
      const response = await api.put(
        `/fileupload/${uuid}`,
        buffer.slice(0, length),
        {
          headers: {
            cryptifytoken: token,
            'content-length': length,
            'content-type': 'application/octet-stream',
            'content-range': `bytes ${offset}-${offset + length}/*`,
          },
        },
      );

      expect(response?.status).to.eq(200);
      expect(response?.headers.token).to.match(/\w+/);

      token = response?.headers.token;
    }
  });

  it('should return an error when file is not found', async () => {
    expect(await api.post('/fileupload/finalize/thisisnotacorrectuuid', null, {
      headers: {
        cryptifytoken: token,
        'content-range': `bytes */${stats.size}`,
      },
    }).catch((e) => e.response?.status)).to.equal(404);
  });

  it('should return an error on an missing content-range header in the finalize call', async () => {
    expect(await api.post(`/fileupload/finalize/${uuid}`, null, {
      headers: {
        cryptifytoken: token,
      },
    }).catch((e) => e.response?.status)).to.equal(400);
  });

  it('should return an error on an invalid formatted content-range in the finalize call', async () => {
    expect(await api.post(`/fileupload/finalize/${uuid}`, null, {
      headers: {
        cryptifytoken: token,
        'content-range': `bytes /${stats.size}`,
      },
    }).catch((e) => e.response?.status)).to.equal(400);
  });

  it('should return an error on an invalid content-range in the finalize call', async () => {
    expect(await api.post(`/fileupload/finalize/${uuid}`, null, {
      headers: {
        cryptifytoken: token,
        'content-range': 'bytes */123',
      },
    }).catch((e) => e.response?.status)).to.equal(422);
  });

  it('should return an error on an unknown file finalize', async () => {
    expect(await api.post(`/fileupload/finalize/${missingUuid}`, null, {
      headers: {
        cryptifytoken: token,
        'content-range': `bytes */${stats.size}`,
      },
    }).catch((e) => e.response?.status)).to.equal(404);
  });

  it('should handle finalize call', async () => {
    const response = await api.post(`/fileupload/finalize/${uuid}`, null, {
      headers: {
        cryptifytoken: token,
        'content-range': `bytes */${stats.size}`,
      },
    });

    expect(response?.status).to.eq(200);
  });

  it('return an error on an unknown file', async () => {
    expect(await api.get(`/filedownload/${missingUuid}`, {
      responseType: 'arraybuffer',
    }).catch((e) => e.response?.status)).to.equal(404);
  });

  it('should handle download call', async () => {
    const response = await api.get(`/filedownload/${uuid}`, {
      responseType: 'arraybuffer',
    });

    expect(response?.status).to.eq(200);
    expect(response?.data?.length).to.eq(stats.size);
  });

  it('return an error on an unknown route', async () => {
    expect(
      await api.get('/thisisnotknown')
        .catch((e) => e.response?.status),
    ).to.equal(404);
  });
});
