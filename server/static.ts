import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// In production (CJS bundle), __dirname will be the dist directory
// In development (ESM), we need to compute it from import.meta
const getStaticDir = () => {
  // When bundled as CJS, __dirname points to dist/, so dist/public is __dirname/public
  // When running as ESM in dev, we'd use import.meta.dirname
  if (typeof __dirname !== 'undefined' && __dirname) {
    return path.resolve(__dirname, "public");
  }
  // Fallback for ESM (shouldn't happen in production build)
  return path.resolve(process.cwd(), "dist", "public");
};

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Call Vault - Build Missing</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 600px;
    }
    h1 {
      font-size: 3rem;
      margin: 0 0 1rem 0;
    }
    p {
      font-size: 1.2rem;
      margin: 0.5rem 0;
      opacity: 0.9;
    }
    .code {
      background: rgba(0,0,0,0.3);
      padding: 1rem;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      margin-top: 1.5rem;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚧 Frontend Build Missing</h1>
    <p>The Call Vault frontend has not been built yet.</p>
    <p>The server is running, but the client application needs to be compiled.</p>
    <div class="code">
      To build the frontend, run:<br>
      <strong>npm run build</strong>
    </div>
  </div>
</body>
</html>`;

// Helper function to serve root endpoint with simple status message
function serveRootEndpoint(app: Express) {
  app.get("/", (_req, res) => {
    res.status(200).send('FileHelper is running ✅');
  });
}

// Helper function to check if path should be served fallback HTML
function shouldServeFallback(path: string): boolean {
  return !path.startsWith('/api') && !path.startsWith('/health');
}

export function serveStatic(app: Express) {
  const distPath = getStaticDir();
  
  // Check if build exists
  if (!fs.existsSync(distPath)) {
    console.error(`❌ Build directory not found: ${distPath}`);
    console.error('📦 Run "npm run build" to build the frontend.');
    console.error('🔧 Serving simple HTML message at root.');
    
    // Serve simple message at root only - don't override all routes
    serveRootEndpoint(app);
    
    // For any other non-API routes, serve fallback HTML
    app.get("*", (_req, res) => {
      if (shouldServeFallback(_req.path)) {
        res.status(503).send(FALLBACK_HTML);
      }
    });
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ index.html not found in build directory: ${indexPath}`);
    console.error('📦 The build may be incomplete. Run "npm run build" again.');
    console.error('🔧 Serving simple HTML message at root.');
    
    serveRootEndpoint(app);
    
    app.get("*", (_req, res) => {
      if (shouldServeFallback(_req.path)) {
        res.status(503).send(FALLBACK_HTML);
      }
    });
    return;
  }

  console.log(`✅ Serving static files from: ${distPath}`);
  console.log(`✅ SPA index.html: ${indexPath}`);

  // Serve static files from dist/public
  app.use(express.static(distPath));

  // SPA catch-all route: serve index.html for all non-API routes
  // This ensures client-side routing works correctly
  // NOTE: This function must be called AFTER all API routes are registered
  // so that API endpoints take precedence over this catch-all
  app.use("*", (_req, res) => {
    res.sendFile(indexPath);
  });
}
