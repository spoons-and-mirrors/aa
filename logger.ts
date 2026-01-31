import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Simple file logger for debugging
// Only active when logging is enabled via environment variable
// =============================================================================

const LOG_DIR = path.join(process.cwd(), '.logs');
const LOG_FILE = path.join(LOG_DIR, 'user-instructions.log');
const WRITE_INTERVAL_MS = 100;

let logBuffer: string[] = [];
let writeScheduled = false;
let initialized = false;

function isLoggingEnabled(): boolean {
  const val = process.env.OPENCODE_AA_LOG;
  return val === '1' || val === 'true';
}

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (!isLoggingEnabled()) return false;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.writeFileSync(LOG_FILE, '');
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) {
    writeScheduled = false;
    return;
  }

  const toWrite = logBuffer.join('');
  logBuffer = [];
  writeScheduled = false;

  try {
    await fs.promises.appendFile(LOG_FILE, toWrite);
  } catch {
    // Silently fail
  }
}

function scheduleFlush(): void {
  if (!writeScheduled) {
    writeScheduled = true;
    setTimeout(flushLogs, WRITE_INTERVAL_MS);
  }
}

function writeLog(level: LogLevel, category: string, message: string, data?: unknown): void {
  if (!ensureInitialized()) return;

  const timestamp = formatTimestamp();
  const dataStr = data !== undefined ? ` | ${JSON.stringify(data)}` : '';
  const logLine = `[${timestamp}] [${level}] [${category}] ${message}${dataStr}\n`;

  logBuffer.push(logLine);
  scheduleFlush();
}

export const log = {
  debug: (category: string, message: string, data?: unknown) =>
    writeLog('DEBUG', category, message, data),

  info: (category: string, message: string, data?: unknown) =>
    writeLog('INFO', category, message, data),

  warn: (category: string, message: string, data?: unknown) =>
    writeLog('WARN', category, message, data),

  error: (category: string, message: string, data?: unknown) =>
    writeLog('ERROR', category, message, data),

  flush: flushLogs,
};

export const LOG = {
  HOOK: 'HOOK',
  MESSAGE: 'MESSAGE',
  TOOL: 'TOOL',
} as const;
