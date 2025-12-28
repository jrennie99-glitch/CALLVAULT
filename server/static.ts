import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  
  // Check if build exists
  if (!fs.existsSync(distPath)) {
    console.warn(`Build directory not found: ${distPath}`);
    console.warn('Serving API-only mode. Run "npm run build" to build frontend.');
    
    // Serve a simple response for root in API-only mode
    app.get("/", (_req, res) => {
      res.status(200).send("Server running - API only mode");
    });
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.warn(`index.html not found in build directory: ${indexPath}`);
    app.get("/", (_req, res) => {
      res.status(200).send("Server running - build incomplete");
    });
    return;
  }

  // Serve static files from dist/public
  app.use(express.static(distPath));

  // Fall through to index.html for SPA routing
  app.use("*", (_req, res) => {
    res.sendFile(indexPath);
  });
}
