import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";

const app = express();
const httpServer = createServer(app);

// Trust proxy headers when running behind nginx/load balancer
// Set TRUST_PROXY=true in .env when deployed behind a reverse proxy
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CORS middleware - configurable via ALLOWED_ORIGINS env var
// Defaults to allowing same-origin only if not set
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // If ALLOWED_ORIGINS is set, validate against it
  if (allowedOrigins.length > 0) {
    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  // If no ALLOWED_ORIGINS set, allow same-origin requests (no header set = browser blocks cross-origin)
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Anti-AI crawler and scraper protection
const AI_BOT_USER_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai', 'Claude-Web',
  'Google-Extended', 'Bytespider', 'Applebot-Extended', 'PerplexityBot',
  'YouBot', 'Amazonbot', 'cohere-ai', 'Diffbot', 'OAI-SearchBot',
  'Scrapy'
];

app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  
  // Allow requests without user-agent (internal/health checks)
  if (!userAgent) {
    return next();
  }
  
  // Block known AI bots from accessing the app (but not dev tools like curl)
  const isAIBot = AI_BOT_USER_AGENTS.some(bot => 
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );
  
  if (isAIBot) {
    console.log(`Blocked AI bot: ${userAgent}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Add security headers to prevent scraping
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Health check endpoint - must be before logging middleware for clean responses
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || (process.env.NODE_ENV === "production" ? "3000" : "5000"),
    version: process.env.npm_package_version || '1.0.0'
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Initialize default plan entitlements on startup
  try {
    const { initializeEntitlements } = await import('./entitlements');
    await initializeEntitlements();
    log('Plan entitlements initialized');
  } catch (error) {
    console.error('Failed to initialize plan entitlements:', error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Default to 3000 in production (Coolify/Docker standard) or 5000 in development (Replit standard)
  // This serves both the API and the client.
  const defaultPort = process.env.NODE_ENV === "production" ? "3000" : "5000";
  const port = parseInt(process.env.PORT || defaultPort, 10);
  
  // Log detailed startup information
  const buildDir = process.env.NODE_ENV === "production" 
    ? path.resolve(__dirname, "public")
    : "development (using Vite)";
  const publicUrl = process.env.PUBLIC_URL || `http://0.0.0.0:${port}`;
  
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      console.log("=".repeat(60));
      log(`Call Vault Server Started`);
      console.log("=".repeat(60));
      log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
      log(`PORT: ${port}`);
      log(`HOST: 0.0.0.0`);
      log(`Build Directory: ${buildDir}`);
      log(`Public URL: ${publicUrl}`);
      log(`Health Check: ${publicUrl}/health`);
      console.log("=".repeat(60));
    },
  );
})();
