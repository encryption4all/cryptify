import { BinaryLike, createHash, randomInt } from 'crypto';
import fs from 'fs';
import { ServerResponse } from 'http';
import path from 'path';

import * as nodemailer from 'nodemailer';

import { getMetaData } from './validators';
import './environment';
import { exception } from 'console';

export class HttpError extends Error {
  public status;

  public parent;

  constructor(status: number, message: string, parent: Error | null = null) {
    super(message);
    this.status = status;
    this.parent = parent;
  }
}

export interface InitParams {
  sender: string,
  recipient: string;
  filesSize: number;
  mailContent?: string;
  mailLang?: string;
  uuid?: string;
  date?: string;
  expires?: string;
}

export const UUID_REGEX = /\w{8}-(\w{4}-){3}\w{12}/;

export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
    const r = randomInt(16);
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

export function returnJson(status: number, json: object, response: ServerResponse, headers = {}) {
  const body = JSON.stringify(json);
  console.log('RESPONSE', status, body, headers);
  response.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  response.end(body, 'utf-8');
}

export function filePath(filename: string) {
  return path.join(process.env.STORAGE_DIR, filename);
}

export function fileHash(filename: string, buff: Buffer = Buffer.from([])): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const shaSum = createHash('sha256');
    try {
      const stream = fs.createReadStream(filename);
      stream.on('data', (data: BinaryLike) => {
        shaSum.update(data);
      });
      stream.on('end', () => {
        if (buff) {
          shaSum.update(buff);
        }
        const hash = shaSum.digest();
        resolve(hash);
      });
    } catch (error) {
      reject(new Error('Could not calculate file hash'));
    }
  });
}

export function appendToFile(
  file: string,
  content: Buffer,
  from: number,
  length: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    
    fs.open(file, 'a', (e, fd) => {
      if (e) {
        reject(e);
      }
      
      fs.write(fd, content, 0, length, from, (writeError, written) => {
        if (writeError) {
          reject(writeError);
        }
        else if (written !== length) {
          const msg = `Data written to file does not match the length. buffer size: ${content.length}, length: ${length}, written: ${written}`;
          console.error(msg);
          reject(msg);
        }
        else {
          fs.close(fd, (closeError) => {
            if (closeError) {
              reject(closeError);
            }
            else {
              resolve();
            }
          });
        }
      });
    });
  });
}

type MailLanguage = 'EN'|'NL';

interface Map {
  [key: string]: string
}

function loadEmailTemplate(name: string) {
  return fs.readFileSync(path.join(__dirname, `email/${name}`), { encoding: 'utf8' });
}

function emailTemplates(variables: Map, lang: MailLanguage = 'NL') {
  try {
    let html = loadEmailTemplate(`${lang}/email.html`);
    let text = loadEmailTemplate(`${lang}/email.txt`);
    let subject = loadEmailTemplate(`${lang}/subject.txt`);

    Object.entries(variables).forEach(([key, value]) => {
      const expression = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      html = html.replace(expression, value);
      text = text.replace(expression, value);
      subject = subject.replace(expression, value);
    });

    return { text, html, subject };
  } catch (e) {
    throw new HttpError(400, 'Could not load templates', e);
  }
}

function encodeText(text: string) {
  return text.replace(/[\u00A0-\u9999<>&]/g, (i) => `&#${i.charCodeAt(0)};`);
}

function formatFileSize(size: number) {
  const i: number = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / 1024 ** i).toFixed()} ${['B', 'kB', 'MB', 'GB', 'TB'][i]}`;
}

function formatDate(date: string, lang: MailLanguage = 'NL') {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${new Date(date).toLocaleString(lang, options)}`;
}

export async function sendEmail(uuid: string): Promise<void> {
  const {
    recipient,
    sender,
    expires,
    filesSize,
    mailContent,
    mailLang,
  } = await getMetaData(uuid);

  const url = `https://cryptify.nl?download=${uuid}`;
  
  let content = mailContent || '';
  if (content === '' && mailLang === 'EN') {
    content = "The sender did not pass along a message.";
  }
  else if (content === '' && mailLang === 'NL') {
    content = "The verzender heeft geen bericht ingevuld.";
  }
  
  const htmlContent = `<p>${encodeText(content).replace(/\n/g, '</p><p>')}</p>`;
  const mailVariables: Map = {
    sender,
    content,
    fileSize: formatFileSize(filesSize),
    expiryDate: formatDate(expires!, mailLang as MailLanguage),
    url,
    htmlContent,
  };

  const { text, html, subject } = emailTemplates(mailVariables, mailLang as MailLanguage);
  const transporter = nodemailer.createTransport(process.env.EMAIL_SMTP_URL);

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: recipient,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
  } catch (e) {
    throw new HttpError(400, 'Error sending email', e);
  }
}
