# Call Vault - Coolify Deployment Guide

This guide provides step-by-step instructions for deploying Call Vault to Coolify using Nixpacks.

## Prerequisites

- A Coolify instance set up and running
- A PostgreSQL database (can be provisioned through Coolify)
- Domain name or use the provided `.sslip.io` domain

## Quick Start

### 1. Create New Application in Coolify

1. Log into your Coolify dashboard
2. Click **"New Resource"** → **"Application"**
3. Select **"Public Repository"**
4. Enter repository URL: `https://github.com/jrennie99-glitch/CALLVAULT`
5. Select the branch you want to deploy (e.g., `main`)

### 2. Configure Build Settings

Coolify will automatically detect this as a Node.js application via Nixpacks.

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
npm start
```

The application will automatically:
- Install dependencies with `npm ci`
- Build the frontend (Vite) and backend (esbuild)
- Start the production server on port 3000 (configurable via `PORT` environment variable)

### 3. Configure Environment Variables

Set the following environment variables in Coolify:

#### Required Variables

```env
# Database (create a PostgreSQL database in Coolify and use its connection string)
DATABASE_URL=postgresql://user:password@host:5432/database

# Environment
NODE_ENV=production

# Port (Coolify will set this automatically, but you can override)
PORT=3000
```

#### Optional Variables

```env
# Public URL (your domain or .sslip.io address)
PUBLIC_URL=https://your-app.sslip.io

# CORS Configuration (if needed for external domains)
ALLOWED_ORIGINS=https://your-domain.com

# Trust proxy headers (required when behind Coolify's reverse proxy)
TRUST_PROXY=true

# TURN/STUN Server Configuration (for WebRTC calls)
TURN_MODE=custom
TURN_URLS=turn:your-turn-server.com:3478
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-password

# Or use Google STUN only (simpler, but may not work behind strict NATs)
TURN_MODE=off
STUN_URLS=stun:stun.l.google.com:19302

# Push Notifications (optional)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Stripe (optional, for payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Configure Database

If you haven't already:

1. In Coolify, create a new PostgreSQL database
2. Copy the connection string
3. Add it as the `DATABASE_URL` environment variable

After the first deployment, you need to initialize the database schema:

```bash
# SSH into your Coolify server or use Coolify's terminal
cd /path/to/your/app
npm run db:push
```

### 5. Deploy

1. Click **"Deploy"** in Coolify
2. Monitor the build logs to ensure everything compiles correctly
3. Once deployed, access your application at the provided URL

## Health Check

The application includes multiple health check endpoints:

**Simple Health Check** (`/health`):
```bash
curl https://your-app.sslip.io/health
```

Response:
```
OK
```

**Detailed Health Check** (`/api/health`):
```bash
curl https://your-app.sslip.io/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": 1735379474123
}
```

Both endpoints return HTTP status code `200 OK` when the server is running correctly.

## Verification

After deployment, verify the following:

1. **Health Check**: Visit `https://your-app.sslip.io/health` - should return `200 OK` with text "OK"
2. **API Health Check**: Visit `https://your-app.sslip.io/api/health` - should return `200 OK` with JSON
3. **Homepage**: Visit `https://your-app.sslip.io/` - should load the Call Vault frontend (HTTP 200)
4. **API**: API endpoints are available at `https://your-app.sslip.io/api/*`
5. **Static Files**: Assets like favicon, manifest.json should load from `https://your-app.sslip.io/`

## Server Configuration Details

### Port Binding

The server automatically:
- Binds to `0.0.0.0` (all interfaces) for container compatibility
- Uses `process.env.PORT` with fallback to `3000` in production, `5000` in development
- Supports Coolify's automatic port detection and assignment
- **Coolify should route traffic to the port specified in `process.env.PORT`** (Coolify sets this automatically)

**Expected Port:** The application expects Coolify to route traffic to the port set in the `PORT` environment variable (typically `3000` in production).

### Static File Serving

- **Production**: Serves built files from `dist/public/`
- **SPA Routing**: All non-API routes fall back to `index.html` for client-side routing
- **Fallback Page**: If build is missing, shows a styled error page instead of blank page

### Startup Logging

On startup, the server logs detailed information:

```
============================================================
Call Vault Server Started
============================================================
NODE_ENV: production
PORT: 3000
HOST: 0.0.0.0
Listening on: http://0.0.0.0:3000
Version: 1.0.0
Build Directory: /app/dist/public
Public URL: https://your-app.sslip.io
Health Check: https://your-app.sslip.io/health
API Health Check: https://your-app.sslip.io/api/health
============================================================
```

**Important:** The line "Listening on: http://0.0.0.0:3000" shows the actual port the server is listening on. Coolify should route traffic to this port.

## Troubleshooting

### Blank Page Issue

If you see a blank page:

1. **Check build logs**: Ensure `npm run build` completed successfully
2. **Check server logs**: Look for "✅ Serving static files" message
3. **Verify build directory**: The `dist/public/` folder should exist with `index.html`
4. **Check browser console**: Look for 404 errors on assets

If the build is missing, you'll see a styled fallback page saying "Frontend Build Missing" instead of a blank page.

### Database Connection Issues

If the server won't start:

1. Verify `DATABASE_URL` is set correctly
2. Ensure the PostgreSQL database is accessible from the application
3. Check that you've run `npm run db:push` to initialize the schema

### Port Conflicts

If the application won't start due to port conflicts:

1. Coolify automatically assigns ports - don't manually set `PORT` unless needed
2. Check that no other service is using the same port

### CORS Issues

If API calls fail from the frontend:

1. Verify `TRUST_PROXY=true` is set
2. Check that `ALLOWED_ORIGINS` includes your domain (or leave empty for same-origin)

## Build Process Details

The `npm run build` script:

1. **Builds Frontend**: Uses Vite to compile the React application
   - Input: `client/` directory
   - Output: `dist/public/` directory
   - Creates optimized bundle with code splitting

2. **Builds Backend**: Uses esbuild to compile the Express server
   - Input: `server/` directory
   - Output: `dist/index.cjs`
   - Bundles dependencies for faster cold starts

## Nixpacks Configuration

Coolify uses Nixpacks to automatically detect and build Node.js applications:

- **Detected**: Automatically detects Node.js from `package.json`
- **Install Phase**: Runs `npm ci` to install dependencies
- **Build Phase**: Runs `npm run build`
- **Start Phase**: Runs `npm start` (which executes `node dist/index.cjs`)

No additional configuration files (like `nixpacks.toml` or `Dockerfile`) are needed.

## Environment-Specific Notes

### Development vs Production

- **Development**: Uses Vite dev server with hot reload
  - Command: `npm run dev`
  - Port: 5000 (default)
  - No build step needed

- **Production**: Serves pre-built static files
  - Command: `npm start`
  - Port: 3000 (default, configurable)
  - Requires `npm run build` first

### Behind Reverse Proxy

When deployed on Coolify (behind nginx), the application is automatically configured to work correctly:
- **Trust Proxy**: The server is configured with `app.set("trust proxy", true)` by default
- This allows the server to correctly handle `X-Forwarded-*` headers from Coolify's reverse proxy
- The server automatically respects `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`, etc.
- No additional configuration needed for reverse proxy compatibility

## Security Considerations

1. **Database Credentials**: Store `DATABASE_URL` securely in Coolify's environment variables
2. **API Keys**: Never commit secrets to Git - use environment variables
3. **HTTPS**: Coolify automatically provides SSL certificates via Let's Encrypt
4. **CORS**: Configure `ALLOWED_ORIGINS` to prevent unauthorized cross-origin requests

## Additional Resources

- [Coolify Documentation](https://coolify.io/docs)
- [Nixpacks Documentation](https://nixpacks.com/docs)
- [Full deployment guide](./deploy/README.md) - Includes manual VPS setup

## Support

If you encounter issues:

1. Check Coolify build logs for build errors
2. Check Coolify runtime logs for server errors
3. Use the `/health` endpoint to verify the server is running
4. Review this document's troubleshooting section

## Summary

**Working Coolify Configuration:**

- **Build Command**: `npm run build` (automatically detected)
- **Start Command**: `npm start` (automatically detected)
- **Port**: Uses `PORT` environment variable (Coolify sets this automatically)
- **Host**: Binds to `0.0.0.0` (container-compatible)
- **Trust Proxy**: Enabled by default for reverse proxy compatibility
- **Health Checks**: 
  - `GET /health` returns `200 OK` with text "OK"
  - `GET /api/health` returns `200 OK` with JSON
  - `GET /` returns `200 OK` with SPA frontend
- **Static Files**: Served from `dist/public/` with SPA fallback
- **Fallback**: Shows styled error page if build is missing

**Expected Port for Coolify:** The application listens on the port specified in the `PORT` environment variable (default: `3000` in production). Coolify should route traffic to this port.

The application is now production-ready and will render correctly when accessed via the Coolify public domain URL.
