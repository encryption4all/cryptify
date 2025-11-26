import {browserName, browserVersion, isMobile} from "react-device-detect";

type ConfigFile = {
    PKG_URL?: string;
    BACKEND_URL?: string;
    UPLOAD_CHUNK_SIZE?: number;
};
const rawConfig: unknown = (window as any).__APP_CONFIG__;
const configFile: ConfigFile = rawConfig && typeof rawConfig === "object" ? (rawConfig as ConfigFile) : {};

// 2GB
export const MAX_UPLOAD_SIZE: number = 2 * 1000 * 1000 * 1000;

// 1Mb chunks
export const FILEREAD_CHUNK_SIZE: number = 1024 * 1024;
export const UPLOAD_CHUNK_SIZE: number = configFile.UPLOAD_CHUNK_SIZE ?? 1024 * 1024;

// progress bar smooth time in seconds.
export const SMOOTH_TIME: number = 2;

export const PKG_URL = configFile.PKG_URL ?? `https://postguard-${process.env.REACT_APP_ENV}.cs.ru.nl/pkg`

// Stable: https://cryptify.nl/api/v2
// Main: https://cryptify.nl/main/api/v2
export const BACKEND_URL = configFile.BACKEND_URL ?? "https://cryptify.nl/api/v2";

export const METRICS_HEADER = {
    "X-PostGuard-Client-Version": `${browserName}${
        isMobile ? "(mobile)" : ""
    },${browserVersion},${process.env.REACT_APP_NAME},${
        process.env.REACT_APP_VERSION
    }`,
};
