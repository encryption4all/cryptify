import { browserName, browserVersion, isMobile } from "react-device-detect";

// 2GB
export const MAX_UPLOAD_SIZE: number = 2 * 1000 * 1000 * 1000;

// 1Mb chunks
export const FILEREAD_CHUNK_SIZE: number = 1024 * 1024;
export const UPLOAD_CHUNK_SIZE: number = 1024 * 1024;

// progress bar smooth time in seconds.
export const SMOOTH_TIME: number = 2;

const prod = process.env.NODE_ENV === "production";

export const PKG_URL = "https://main.postguard.ihub.ru.nl/pkg";
export const BACKEND_URL = prod ? "https://cryptify.nl/api/v2" : "";

export const METRICS_HEADER = {
  "X-PostGuard-Client-Version": `${browserName}${
    isMobile ? "(mobile)" : ""
  },${browserVersion},${process.env.REACT_APP_NAME},${
    process.env.REACT_APP_VERSION
  }`,
};
