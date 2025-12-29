import express, { type Express } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import path from "path";
import fs from "fs";

const app: Express = express();
const isDevelopment = process.env.NODE_ENV !== "production";

// Trust proxy headers (X-Forwarded-*) from reverse proxies like Coolify's nginx
app.set("trust proxy", true);

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
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});