import fs from 'node:fs';
import path from 'node:path';
import type { TransformableInfo } from 'logform';
import { createLogger, format, transports } from 'winston';

const REDACTED = '[REDACTED]';

const SECRET_KEY_DENYLIST = new Set([
  'authorization',
  'cookie',
  'jwt',
  'passphrase',
  'password',
  'privatekey',
  'secret',
  'token',
  'wallet_private_key',
  'x-vanguard-token',
]);

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /0x[a-fA-F0-9]{64}/g,
  /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
];

const redactString = (value: string): string => {
  let output = value;

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }

  return output;
};

const redactValue = (key: string, value: unknown): unknown => {
  if (SECRET_KEY_DENYLIST.has(key.toLowerCase())) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(
      entries.map(([nestedKey, nestedValue]) => [nestedKey, redactValue(nestedKey, nestedValue)]),
    );
  }

  return value;
};

const redactionFormat = format((info: TransformableInfo) => {
  const redacted = redactValue('root', info) as Record<string, unknown>;

  for (const [key, value] of Object.entries(redacted)) {
    info[key] = value;
  }

  return info;
});

export type LoggerOptions = {
  service: string;
  level?: string;
  logDir?: string;
};

export const createAppLogger = ({ service, level = 'info', logDir = 'logs' }: LoggerOptions) => {
  fs.mkdirSync(logDir, { recursive: true });

  return createLogger({
    level,
    defaultMeta: { service },
    format: format.combine(
      redactionFormat(),
      format.timestamp(),
      format.errors({ stack: true }),
      format.json(),
    ),
    transports: [
      new transports.Console(),
      new transports.File({ filename: path.join(logDir, 'app.log') }),
    ],
  });
};
