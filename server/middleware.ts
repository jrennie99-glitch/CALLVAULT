import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from './logger';

// Request timing storage
const requestStartTimes = new WeakMap<Request, number>();

// Sensitive headers to redact
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-webhook-secret',
  'x-turn-credential',
  'x-fcm-token'
];

// Sensitive body fields to redact
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'credential',
  'privateKey',
  'apiKey',
  'signature',
  'p256dh',
  'auth',
  'creditCard',
  'cardNumber',
  'cvv'
];

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Redact sensitive data from headers
 */
function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted = { ...headers };
  for (const header of SENSITIVE_HEADERS) {
    if (redacted[header]) {
      redacted[header] = '[REDACTED]';
    }
  }
  return redacted;
}

/**
 * Redact sensitive data from body
 */
function redactBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  
  const redacted = Array.isArray(body) ? [...body] : { ...body };
  
  for (const field of SENSITIVE_FIELDS) {
    if (field in redacted) {
      redacted[field] = '[REDACTED]';
    }
  }
  
  // Recursively redact nested objects
  for (const key of Object.keys(redacted)) {
    if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactBody(redacted[key]);
    }
  }
  
  return redacted;
}

/**
 * Request/Response logging middleware
 * Logs incoming requests and outgoing responses
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate or use existing request ID
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.headers['x-request-id'] = requestId;
  
  // Store start time
  requestStartTimes.set(req, Date.now());
  
  // Get user info if available
  const userAddress = (req as any).userAddress || req.body?.address || req.params?.address;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Create request-scoped logger
  const reqLogger = logger.withRequest(requestId, userAddress, clientIp);
  
  // Attach logger to request for use in route handlers
  (req as any).logger = reqLogger;
  
  // Log incoming request
  const requestLog = {
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    headers: redactHeaders(req.headers as Record<string, any>),
    body: req.body && Object.keys(req.body).length > 0 ? redactBody(req.body) : undefined,
    ip: clientIp,
    userAgent: req.headers['user-agent']
  };
  
  reqLogger.info(`→ ${req.method} ${req.path}`, requestLog);
  
  // Capture response
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  
  let responseBody: any;
  let statusCode: number = res.statusCode;
  
  res.status = function(code: number) {
    statusCode = code;
    return originalStatus(code);
  };
  
  res.json = function(body: any) {
    responseBody = body;
    return originalJson(body);
  };
  
  res.send = function(body: any) {
    if (typeof body === 'object') {
      responseBody = body;
    }
    return originalSend(body);
  };
  
  // Log on response finish
  res.on('finish', () => {
    const startTime = requestStartTimes.get(req) || Date.now();
    const duration = Date.now() - startTime;
    
    const responseLog: Record<string, any> = {
      statusCode,
      duration: `${duration}ms`
    };
    
    // Only log response body for errors or if explicitly enabled
    if (statusCode >= 400 || process.env.LOG_RESPONSE_BODY === 'true') {
      if (responseBody && typeof responseBody === 'object') {
        responseLog.body = redactBody(responseBody);
      }
    }
    
    // Log at appropriate level based on status code
    if (statusCode >= 500) {
      reqLogger.error(`← ${req.method} ${req.path} ${statusCode} (${duration}ms)`, responseLog);
    } else if (statusCode >= 400) {
      reqLogger.warn(`← ${req.method} ${req.path} ${statusCode} (${duration}ms)`, responseLog);
    } else {
      reqLogger.info(`← ${req.method} ${req.path} ${statusCode} (${duration}ms)`, responseLog);
    }
  });
  
  // Log errors
  res.on('error', (error: Error) => {
    reqLogger.error(`Response error for ${req.method} ${req.path}`, error, {
      statusCode: res.statusCode
    });
  });
  
  next();
}

/**
 * Async request handler wrapper
 * Catches errors in async route handlers
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handling middleware
 * Must be registered AFTER all routes
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  const userAddress = (req as any).userAddress || req.body?.address;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  const errorContext = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: redactBody(req.body),
    ip: clientIp,
    userAgent: req.headers['user-agent']
  };
  
  logger.withRequest(requestId, userAddress, clientIp)
    .error('Unhandled error in request', err, errorContext);
  
  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (res.headersSent) {
    // If headers already sent, delegate to default Express error handler
    return next(err);
  }
  
  const statusCode = (err as any).statusCode || (err as any).status || 500;
  
  res.status(statusCode).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
    requestId
  });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  logger.withRequest(requestId, undefined, clientIp)
    .warn(`Route not found: ${req.method} ${req.path}`, {
      query: req.query,
      ip: clientIp
    });
  
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    requestId
  });
}

export default {
  requestLogger,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  generateRequestId
};
