import http, { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import {
  download,
  finalize,
  init,
  upload,
} from './controllers';
import { HttpError } from './utilities';
import { handleError } from './validators';
import './environment';

const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
  if (process.env.NODE_ENV === "development") {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Request-Method', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Expose-Headers', '*');
  }

  const { url, method } = request;

  if (!url) {
    handleError(new HttpError(401, 'Invalid request'), response);
    return;
  }

  // create storage directory
  if (!fs.existsSync(process.env.STORAGE_DIR)) {
    fs.mkdirSync(process.env.STORAGE_DIR);
  }

  console.log(method, url);

  try {
    if (method === 'OPTIONS' && (url.startsWith('/fileupload/init') || url.startsWith('/fileupload/finalize/'))) {
      response.setHeader('Allow', 'POST');
      response.writeHead(200);
      response.end();
    } else if (method === 'OPTIONS' && url.startsWith('/fileupload')) {
      response.setHeader('Allow', 'PUT');
      response.writeHead(200);
      response.end();
    } else if (method === 'OPTIONS' && url.startsWith('/filedownload/')) {
      response.setHeader('Allow', 'GET');
      response.writeHead(200);
      response.end();
    } else if (method === 'POST' && url.startsWith('/fileupload/init')) {
      init(request, response);
    } else if (method === 'PUT' && url.startsWith('/fileupload/')) {
      upload(request, response);
    } else if (method === 'POST' && url.startsWith('/fileupload/finalize/')) {
      finalize(request, response);
    } else if (method === 'GET' && url.startsWith('/filedownload/')) {
      download(request, response);
    } else {
      handleError(new HttpError(404, 'Page not found'), response);
    }
  } catch (e) {
    handleError(e, response);
  }
});

server.listen(3000);
console.log('Server listening on port 3000');

export default server;
