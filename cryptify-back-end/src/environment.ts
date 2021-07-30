declare global {
  // eslint-disable-next-line no-unused-vars
  namespace NodeJS {
    // eslint-disable-next-line no-unused-vars
    interface ProcessEnv {
      STORAGE_DIR: string;
      EMAIL_SUBJECT: string;
      EMAIL_SMTP_URL: string;
      NODE_ENV: 'development' | 'production';
      [key: string]: string | undefined;
    }
  }
}

export {};
