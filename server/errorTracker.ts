import { randomUUID } from 'crypto';
import logger from './logger';

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Error category for grouping
export type ErrorCategory = 
  | 'database'
  | 'websocket'
  | 'payment'
  | 'auth'
  | 'validation'
  | 'external_api'
  | 'internal'
  | 'security';

// Error report structure
export interface ErrorReport {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context: Record<string, any>;
  userAddress?: string;
  requestId?: string;
  ip?: string;
  occurrenceCount: number;
  firstOccurred: Date;
  lastOccurred: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

// Error statistics
interface ErrorStats {
  totalErrors: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  topErrors: Array<{ message: string; count: number }>;
  recentErrors: ErrorReport[];
}

// Configuration
const MAX_STORED_ERRORS = 500;
const ERROR_DEDUPLICATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ALERT_THRESHOLD = {
  critical: 1,
  high: 5,
  medium: 20
};

// In-memory error storage (replace with DB in production)
const errorStore = new Map<string, ErrorReport>();
const errorCounters = {
  lastHour: new Map<string, { count: number; resetAt: number }>(),
  bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<ErrorSeverity, number>
};

// Alert callbacks
const alertCallbacks: Array<(report: ErrorReport) => void> = [];

/**
 * Generate error fingerprint for deduplication
 */
function generateFingerprint(message: string, stack?: string, category?: ErrorCategory): string {
  // Extract the first line of stack trace for fingerprinting
  const stackLine = stack?.split('\n')[1]?.trim() || '';
  return `${category || 'unknown'}:${message}:${stackLine}`.slice(0, 200);
}

/**
 * Track an error
 */
export function trackError(
  error: Error | string,
  options: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    context?: Record<string, any>;
    userAddress?: string;
    requestId?: string;
    ip?: string;
  } = {}
): ErrorReport {
  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;
  const severity = options.severity || 'medium';
  const category = options.category || 'internal';
  
  const fingerprint = generateFingerprint(message, stack, category);
  const now = new Date();
  
  // Check for existing error within deduplication window
  const existing = errorStore.get(fingerprint);
  
  if (existing && now.getTime() - existing.lastOccurred.getTime() < ERROR_DEDUPLICATION_WINDOW_MS) {
    // Update existing error
    existing.occurrenceCount++;
    existing.lastOccurred = now;
    existing.context = { ...existing.context, ...options.context };
    
    // Update counters
    updateCounters(fingerprint, severity);
    
    // Check if we should alert
    checkAlertThreshold(existing);
    
    return existing;
  }
  
  // Create new error report
  const report: ErrorReport = {
    id: randomUUID(),
    timestamp: now,
    severity,
    category,
    message,
    stack,
    context: options.context || {},
    userAddress: options.userAddress,
    requestId: options.requestId,
    ip: options.ip,
    occurrenceCount: 1,
    firstOccurred: now,
    lastOccurred: now,
    resolved: false
  };
  
  // Store error
  errorStore.set(fingerprint, report);
  
  // Clean up old errors if at limit
  if (errorStore.size > MAX_STORED_ERRORS) {
    const oldestKey = Array.from(errorStore.entries())
      .sort((a, b) => a[1].lastOccurred.getTime() - b[1].lastOccurred.getTime())[0]?.[0];
    if (oldestKey) errorStore.delete(oldestKey);
  }
  
  // Update counters
  updateCounters(fingerprint, severity);
  errorCounters.bySeverity[severity]++;
  
  // Log the error
  logger.error(`[${category.toUpperCase()}] ${message}`, error instanceof Error ? error : undefined, {
    severity,
    ...options.context,
    userAddress: options.userAddress,
    requestId: options.requestId
  });
  
  // Check alert threshold
  checkAlertThreshold(report);
  
  return report;
}

/**
 * Update error counters
 */
function updateCounters(fingerprint: string, severity: ErrorSeverity): void {
  const now = Date.now();
  const counter = errorCounters.lastHour.get(fingerprint);
  
  if (counter && now < counter.resetAt) {
    counter.count++;
  } else {
    errorCounters.lastHour.set(fingerprint, {
      count: 1,
      resetAt: now + 60 * 60 * 1000 // 1 hour
    });
  }
}

/**
 * Check if we should trigger an alert
 */
function checkAlertThreshold(report: ErrorReport): void {
  const threshold = ALERT_THRESHOLD[report.severity];
  const counter = errorCounters.lastHour.get(generateFingerprint(report.message, report.stack, report.category));
  
  if (threshold && counter && counter.count >= threshold) {
    // Trigger alerts
    for (const callback of alertCallbacks) {
      try {
        callback(report);
      } catch (e) {
        logger.error('Alert callback failed', e as Error);
      }
    }
  }
}

/**
 * Register an alert callback
 */
export function onAlert(callback: (report: ErrorReport) => void): () => void {
  alertCallbacks.push(callback);
  return () => {
    const index = alertCallbacks.indexOf(callback);
    if (index > -1) alertCallbacks.splice(index, 1);
  };
}

/**
 * Mark an error as resolved
 */
export function resolveError(fingerprint: string, resolution?: string): boolean {
  const report = errorStore.get(fingerprint);
  if (!report) return false;
  
  report.resolved = true;
  report.resolvedAt = new Date();
  report.resolution = resolution;
  
  return true;
}

/**
 * Get all tracked errors
 */
export function getErrors(options?: {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  resolved?: boolean;
  limit?: number;
  since?: Date;
}): ErrorReport[] {
  let errors = Array.from(errorStore.values());
  
  if (options?.severity) {
    errors = errors.filter(e => e.severity === options.severity);
  }
  
  if (options?.category) {
    errors = errors.filter(e => e.category === options.category);
  }
  
  if (options?.resolved !== undefined) {
    errors = errors.filter(e => e.resolved === options.resolved);
  }
  
  if (options?.since) {
    errors = errors.filter(e => e.lastOccurred >= options.since!);
  }
  
  // Sort by last occurred, most recent first
  errors.sort((a, b) => b.lastOccurred.getTime() - a.lastOccurred.getTime());
  
  if (options?.limit) {
    errors = errors.slice(0, options.limit);
  }
  
  return errors;
}

/**
 * Get error statistics
 */
export function getErrorStats(): ErrorStats {
  const errors = Array.from(errorStore.values());
  
  const bySeverity: Record<ErrorSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byCategory: Partial<Record<ErrorCategory, number>> = {};
  const messageCounts = new Map<string, number>();
  
  for (const error of errors) {
    bySeverity[error.severity] = (bySeverity[error.severity] || 0) + error.occurrenceCount;
    byCategory[error.category] = (byCategory[error.category] || 0) + error.occurrenceCount;
    messageCounts.set(error.message, (messageCounts.get(error.message) || 0) + error.occurrenceCount);
  }
  
  const topErrors = Array.from(messageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));
  
  return {
    totalErrors: errors.reduce((sum, e) => sum + e.occurrenceCount, 0),
    bySeverity,
    byCategory: byCategory as Record<ErrorCategory, number>,
    topErrors,
    recentErrors: errors.slice(0, 20)
  };
}

/**
 * Clear all tracked errors
 */
export function clearErrors(): void {
  errorStore.clear();
  errorCounters.lastHour.clear();
  errorCounters.bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
}

/**
 * Create a safe async wrapper that tracks errors
 */
export function safeAsync<T>(
  fn: () => Promise<T>,
  options: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    context?: Record<string, any>;
    userAddress?: string;
    requestId?: string;
    ip?: string;
    defaultValue?: T;
  } = {}
): Promise<T | undefined> {
  return fn().catch(error => {
    trackError(error, {
      severity: options.severity || 'medium',
      category: options.category || 'internal',
      context: options.context,
      userAddress: options.userAddress,
      requestId: options.requestId,
      ip: options.ip
    });
    return options.defaultValue;
  });
}

/**
 * Error tracking middleware for Express
 * Catches and tracks unhandled errors
 */
export function errorTrackingMiddleware(err: Error, req: any, res: any, next: any): void {
  const severity: ErrorSeverity = err.name === 'UnauthorizedError' ? 'high' : 'critical';
  const category: ErrorCategory = err.name?.includes('Database') ? 'database' : 'internal';
  
  trackError(err, {
    severity,
    category,
    context: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    },
    userAddress: req.userAddress || req.body?.address,
    requestId: req.headers?.['x-request-id'],
    ip: req.ip || req.socket?.remoteAddress
  });
  
  next(err);
}

export default {
  trackError,
  resolveError,
  getErrors,
  getErrorStats,
  clearErrors,
  onAlert,
  safeAsync,
  errorTrackingMiddleware
};
