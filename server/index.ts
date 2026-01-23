import express, { type Express } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { storage } from "./storage";
import path from "path";
import fs from "fs";

const app: Express = express();
const isDevelopment = process.env.NODE_ENV !== "production";

// Trust proxy headers (X-Forwarded-*) from reverse proxies like Coolify's nginx
app.set("trust proxy", true);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CRITICAL: Root and health endpoints must be registered FIRST
// before any middleware or static file serving that could intercept them

// Root endpoint - confirms server is running (for health checks without Accept: text/html)
app.get("/", (req, res, next) => {
  // If browser wants HTML, let static/Vite handle it
  const acceptHeader = req.headers.accept || '';
  if (acceptHeader.includes('text/html')) {
    return next();
  }
  // For curl/health checks, return plain text
  res.status(200).type('text/plain').send('CallVault backend is running');
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, timestamp: Date.now() });
});

// Production diagnostic endpoint - helps verify configuration
app.get("/api/diagnostics", (_req, res) => {
  const turnMode = process.env.TURN_MODE || 'public';
  const turnUrls = process.env.TURN_URLS || '';
  const turnConfigured = !!(process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL);
  const stunUrls = process.env.STUN_URLS || 'stun:stun.l.google.com:19302';
  const vapidConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const dbConfigured = !!process.env.DATABASE_URL;
  
  // Detect if behind proxy
  const trustProxy = app.get('trust proxy');
  
  res.json({
    app: "CallVault",
    environment: process.env.NODE_ENV || "development",
    timestamp: Date.now(),
    server: {
      port: PORT,
      host: "0.0.0.0",
      trustProxy: trustProxy,
      baseUrl: process.env.PUBLIC_URL || `http://localhost:${PORT}`
    },
    webrtc: {
      turnMode: turnMode,
      turnConfigured: turnConfigured,
      turnUrls: turnUrls ? turnUrls.split(',').map(u => u.trim().replace(/:[^:@]+@/, ':***@')) : [],
      stunUrls: stunUrls.split(',').map(u => u.trim()),
      recommendation: !turnConfigured && turnMode === 'custom' 
        ? 'TURN_MODE=custom requires TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL'
        : turnMode === 'public'
        ? 'Using public OpenRelay (testing only - set TURN_MODE=custom for production)'
        : 'OK'
    },
    websocket: {
      path: "/ws",
      protocol: "wss (auto-detected by client based on page protocol)"
    },
    push: {
      vapidConfigured: vapidConfigured,
      recommendation: !vapidConfigured ? 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY for push notifications' : 'OK'
    },
    database: {
      configured: dbConfigured,
      recommendation: !dbConfigured ? 'DATABASE_URL is required' : 'OK'
    },
    messaging: {
      type: "In-app WebSocket (WhatsApp-style)",
      smsProvider: "None (not required)",
      storage: "PostgreSQL + local filesystem for media"
    }
  });
});

// Deploy version stamp
const BUILD_COMMIT = process.env.BUILD_COMMIT || "unknown";
const BUILD_TIME = new Date().toISOString();

app.get("/api/version", (_req, res) => {
  res.status(200).json({
    app: "CallVault",
    env: process.env.NODE_ENV || "development",
    buildTime: BUILD_TIME,
    commit: BUILD_COMMIT
  });
});

console.log(`CallVault boot: commit=${BUILD_COMMIT} buildTime=${BUILD_TIME}`);

// For ESM/CJS compatibility
const getModuleDirname = () => {
  if (typeof import.meta.dirname !== 'undefined') {
    return import.meta.dirname;
  }
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return process.cwd();
};

const moduleDirname = getModuleDirname();

// Determine port based on environment
const DEFAULT_DEV_PORT = 5000;
const DEFAULT_PROD_PORT = 3000;
const PORT = process.env.PORT 
  ? parseInt(process.env.PORT, 10) 
  : (isDevelopment ? DEFAULT_DEV_PORT : DEFAULT_PROD_PORT);

// Read version from package.json
let version = "1.0.0";
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(moduleDirname, "..", "package.json"), "utf-8")
  );
  version = packageJson.version;
} catch (err) {
  console.warn("Could not read version from package.json");
}

async function startServer() {
  // Create HTTP server
  const httpServer = createServer(app);

  // Register all API routes and WebSocket handlers
  await registerRoutes(httpServer, app);

  // API 404 handler: Ensure unmatched /api/* routes return JSON, never HTML
  // This MUST be registered AFTER all API routes but BEFORE static/Vite handlers
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found', path: _req.originalUrl });
  });
  console.log('📋 Route order: API routes → API 404 handler → static/Vite');

  // Setup static file serving or Vite dev server
  if (isDevelopment) {
    console.log("🔧 Development mode: Setting up Vite dev server...");
    // Dynamically import vite module only in development
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  } else {
    console.log("📦 Production mode: Serving static files...");
    serveStatic(app);
  }

  // Start the server
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log("\n============================================================");
    console.log("Call Vault Server Started");
    console.log("============================================================");
    console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
    console.log(`PORT: ${PORT}`);
    console.log(`HOST: 0.0.0.0`);
    console.log(`Listening on: http://0.0.0.0:${PORT}`);
    console.log(`Version: ${version}`);
    
    if (!isDevelopment) {
      const buildDir = path.resolve(moduleDirname, "public");
      console.log(`Build Directory: ${buildDir}`);
    }
    
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    console.log(`Public URL: ${publicUrl}`);
    console.log(`Health Check: ${publicUrl}/health`);
    console.log(`API Health Check: ${publicUrl}/api/health`);
    console.log("============================================================\n");
    
    // Start nonce cleanup job (runs every 5 minutes)
    const NONCE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
      try {
        // Skip if database is not available
        const { isDatabaseAvailable } = await import('./db');
        if (!isDatabaseAvailable()) return;
        
        const cleaned = await storage.cleanupExpiredNonces();
        if (cleaned > 0) {
          console.log(`[Nonce Cleanup] Removed ${cleaned} expired nonces`);
        }
      } catch (err) {
        // Only log if DB is configured
        if (process.env.DATABASE_URL) {
          console.error('[Nonce Cleanup] Error:', err);
        }
      }
    }, NONCE_CLEANUP_INTERVAL);
    
    // Run initial cleanup on startup (only if DB available)
    const { isDatabaseAvailable } = await import('./db');
    if (isDatabaseAvailable()) {
      storage.cleanupExpiredNonces().then(cleaned => {
        if (cleaned > 0) {
          console.log(`[Nonce Cleanup] Initial cleanup: removed ${cleaned} expired nonces`);
        }
      }).catch(err => console.error('[Nonce Cleanup] Initial cleanup error:', err));
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});