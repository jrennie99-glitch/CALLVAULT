import { randomUUID } from 'crypto';

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Log entry structure
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
  requestId?: string;
  userAddress?: string;
  ip?: string;
}

// Error tracking for production
interface ErrorReport {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  count: number;
  lastOccurred: string;
}

// In-memory error tracking (for production monitoring)
const errorTracker = new Map<string, ErrorReport>();
const MAX_TRACKED_ERRORS = 100;
const ERROR_DEDUPLICATION_WINDOW = 5 * 60 * 1000; // 5 minutes

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const isDebug = process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'debug';

/**
 * Main logging function
 */
export function log(level: LogLevel, message: string, options?: {
  context?: Record<string, any>;
  error?: Error;
  requestId?: string;
  userAddress?: string;
  ip?: string;
}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...options
  };

  // Format the log output
  const formatted = formatLogEntry(entry);

  // Output based on level
  switch (level) {
    case 'debug':
      if (isDebug) console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
    case 'fatal':
      console.error(formatted);
      trackError(entry);
      break;
  }
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts: string[] = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`
  ];

  if (entry.requestId) {
    parts.push(`[req:${entry.requestId.slice(0, 8)}]`);
  }

  if (entry.userAddress) {
    parts.push(`[user:${entry.userAddress.slice(0, 12)}...]`);
  }

  parts.push(entry.message);

  if (entry.context && Object.keys(entry.context).length > 0) {
    try {
      parts.push('\n  Context:', JSON.stringify(entry.context, null, 2).replace(/\n/g, '\n  '));
    } catch {
      parts.push('\n  Context: [Circular or non-serializable]');
    }
  }

  if (entry.error) {
    parts.push(`\n  Error: ${entry.error.message}`);
    if (entry.error.stack) {
      parts.push(`\n  Stack: ${entry.error.stack.split('\n').slice(0, 3).join('\n         ')}`);
    }
  }

  return parts.join(' ');
}

/**
 * Track errors for production monitoring
 */
function trackError(entry: LogEntry): void {
  if (!isProduction && !process.env.ENABLE_ERROR_TRACKING) return;

  const errorKey = `${entry.message}_${entry.error?.message || ''}`;
  const existing = errorTracker.get(errorKey);

  if (existing && Date.now() - new Date(existing.lastOccurred).getTime() < ERROR_DEDUPLICATION_WINDOW) {
    existing.count++;
    existing.lastOccurred = entry.timestamp;
  } else {
    // Clean up old errors if we're at the limit
    if (errorTracker.size >= MAX_TRACKED_ERRORS) {
      const oldestKey = errorTracker.keys().next().value;
      errorTracker.delete(oldestKey);
    }

    errorTracker.set(errorKey, {
      id: randomUUID(),
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      stack: entry.error?.stack,
      context: entry.context,
      count: 1,
      lastOccurred: entry.timestamp
    });
  }
}

/**
 * Get tracked errors for monitoring
 */
export function getTrackedErrors(): ErrorReport[] {
  return Array.from(errorTracker.values())
    .sort((a, b) => new Date(b.lastOccurred).getTime() - new Date(a.lastOccurred).getTime());
}

/**
 * Clear tracked errors
 */
export function clearTrackedErrors(): void {
  errorTracker.clear();
}

// Convenience methods
export const logger = {
  debug: (message: string, context?: Record<string, any>) => log('debug', message, { context }),
  info: (message: string, context?: Record<string, any>) => log('info', message, { context }),
  warn: (message: string, context?: Record<string, any>, error?: Error) => log('warn', message, { context, error }),
  error: (message: string, error?: Error, context?: Record<string, any>) => log('error', message, { error, context }),
  fatal: (message: string, error?: Error, context?: Record<string, any>) => log('fatal', message, { error, context }),
  
  // Request-scoped logging
  withRequest: (requestId: string, userAddress?: string, ip?: string) => ({
    debug: (message: string, context?: Record<string, any>) => log('debug', message, { requestId, userAddress, ip, context }),
    info: (message: string, context?: Record<string, any>) => log('info', message, { requestId, userAddress, ip, context }),
    warn: (message: string, context?: Record<string, any>, error?: Error) => log('warn', message, { requestId, userAddress, ip, context, error }),
    error: (message: string, error?: Error, context?: Record<string, any>) => log('error', message, { requestId, userAddress, ip, error, context }),
  }),

  getTrackedErrors,
  clearTrackedErrors
};

export default logger;
