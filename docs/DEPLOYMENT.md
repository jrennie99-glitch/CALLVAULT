# CallVault Deployment Guide

Complete guide for deploying CallVault in production environments.

## Table of Contents

1. [Quick Start (Docker Compose)](#quick-start-docker-compose)
2. [Configuration](#configuration)
3. [Deployment Options](#deployment-options)
4. [Post-Deployment Setup](#post-deployment-setup)
5. [Troubleshooting](#troubleshooting)
6. [Security Checklist](#security-checklist)

---

## Quick Start (Docker Compose)

The fastest way to deploy CallVault is using Docker Compose:

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/callvault.git
cd callvault
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your values
nano .env
```

**Minimum required variables:**
```env
# Database (PostgreSQL)
DATABASE_URL=postgresql://callvault:your_secure_password@postgres:5432/callvault

# Server
NODE_ENV=production
PUBLIC_URL=https://your-domain.com

# PostgreSQL credentials (for docker-compose internal DB)
POSTGRES_USER=callvault
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=callvault
```

### 3. Start the Services

```bash
# Start app + database
docker-compose up -d

# Or with built-in TURN server
docker-compose --profile turn up -d
```

### 4. Initialize the Database

```bash
# Run database migrations
docker-compose exec app npm run db:push
```

### 5. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:5000/api/health

# Check full diagnostics
curl http://localhost:5000/api/diagnostics
```

---

## Configuration

### Environment Variables Reference

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `5000` |

#### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_URL` | Public URL of the app | `http://localhost:5000` |
| `TRUST_PROXY` | Trust proxy headers | `true` |
| `ALLOWED_ORIGINS` | CORS allowed origins | (empty) |

#### WebRTC / TURN Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `TURN_MODE` | TURN mode: `public`, `custom`, `off` | `public` |
| `TURN_URLS` | Comma-separated TURN URLs | `turn:server.com:3478` |
| `TURN_USERNAME` | TURN username | (your username) |
| `TURN_CREDENTIAL` | TURN password | (your password) |
| `STUN_URLS` | Comma-separated STUN URLs | `stun:stun.l.google.com:19302` |

#### Push Notifications

| Variable | Description | How to Get |
|----------|-------------|------------|
| `VAPID_PUBLIC_KEY` | VAPID public key | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | VAPID private key | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Contact email | `mailto:admin@yourdomain.com` |

#### Payments (Optional)

| Variable | Description | Provider |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe API key | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | Stripe Dashboard |
| `ENABLE_SOLANA_PAYMENTS` | Enable Solana | `true`/`false` |
| `ENABLE_CRYPTO_PAYMENTS` | Enable Base chain | `true`/`false` |

---

## Deployment Options

### Option 1: Docker Compose (Recommended)

Best for: Single server deployments, self-hosting

**Pros:**
- Easy setup
- Includes PostgreSQL
- Optional built-in TURN server
- Volume persistence

**Cons:**
- Single server limitation
- Manual scaling

**See:** [Quick Start](#quick-start-docker-compose)

---

### Option 2: Coolify

Best for: Managed deployments with easy SSL and domain management

**Setup:**

1. In Coolify dashboard, click **New Resource** → **Application**
2. Select **Public Repository** and enter your repo URL
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables from `.env.example`
6. Deploy

**Environment Variables for Coolify:**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://... (use Coolify's PostgreSQL service)
PUBLIC_URL=https://your-domain.sslip.io
TRUST_PROXY=true
```

---

### Option 3: Manual VPS Setup

Best for: Full control over the environment

**Requirements:**
- Ubuntu 22.04+ or similar
- Node.js 20+
- PostgreSQL 15+
- Nginx (for reverse proxy)

**Steps:**

1. **Install dependencies:**
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install postgresql-15

# Nginx
sudo apt-get install nginx
```

2. **Setup PostgreSQL:**
```bash
sudo -u postgres psql -c "CREATE USER callvault WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE callvault OWNER callvault;"
```

3. **Deploy application:**
```bash
git clone https://github.com/yourusername/callvault.git
cd callvault
npm ci
npm run build
cp .env.example .env
# Edit .env with your values
nano .env
npm run db:push
```

4. **Setup systemd service:**
```bash
sudo tee /etc/systemd/system/callvault.service > /dev/null <<EOF
[Unit]
Description=CallVault Server
After=network.target

[Service]
Type=simple
User=callvault
WorkingDirectory=/opt/callvault
ExecStart=/usr/bin/node dist/index.cjs
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable callvault
sudo systemctl start callvault
```

5. **Configure Nginx:**
```bash
sudo tee /etc/nginx/sites-available/callvault > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/callvault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

6. **Setup SSL with Certbot:**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Option 4: Kubernetes

Best for: High availability, auto-scaling environments

**Prerequisites:**
- Kubernetes cluster
- kubectl configured
- Helm (optional)

**Deployment files coming soon...**

---

## Post-Deployment Setup

### 1. Generate VAPID Keys for Push Notifications

```bash
npx web-push generate-vapid-keys
```

Add the output to your environment:
```env
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

### 2. Setup TURN Server (for production calls)

**Option A: Use Metered.ca (Easiest)**
1. Sign up at https://metered.ca
2. Get your API credentials
3. Add to environment:
```env
METERED_APP_NAME=your_app_name
METERED_SECRET_KEY=your_secret_key
```

**Option B: Self-hosted Coturn**
```bash
# Using docker-compose --profile turn
docker-compose --profile turn up -d
```

Or install Coturn manually:
```bash
sudo apt-get install coturn
# Edit /etc/turnserver.conf
sudo systemctl enable coturn
sudo systemctl start coturn
```

### 3. Configure Stripe (for payments)

1. Create account at https://stripe.com
2. Get API keys from Dashboard
3. Add webhook endpoint: `https://your-domain.com/api/webhooks/stripe`
4. Add to environment:
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Troubleshooting

### Health Check Failures

```bash
# Test health endpoint
curl -v http://localhost:5000/api/health

# Check logs
docker-compose logs -f app

# For systemd
sudo journalctl -u callvault -f
```

### Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres pg_isready -U callvault

# Check database logs
docker-compose logs postgres

# Verify DATABASE_URL format
# Should be: postgresql://user:password@host:port/database
```

### WebSocket Connection Issues

```bash
# Test WebSocket connection
node test-connection.js ws://localhost:5000/ws

# Check if port is open
nc -zv localhost 5000
```

### Calls Not Working (TURN Issues)

```bash
# Check TURN configuration
curl http://localhost:5000/api/turn-config

# Test TURN server online
# Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
# Add your TURN server and credentials
# Should see "relay" candidates
```

### Blank Page After Deployment

```bash
# Verify build succeeded
docker-compose exec app ls -la dist/public/

# Should contain index.html and assets/

# Rebuild if needed
docker-compose exec app npm run build
```

---

## Security Checklist

Before going to production:

- [ ] Changed default passwords (`changeme` in all config files)
- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Using HTTPS (SSL certificate installed)
- [ ] `NODE_ENV` set to `production`
- [ ] Database not exposed to internet (no public IP)
- [ ] TURN credentials are strong and unique
- [ ] VAPID keys generated (not using example keys)
- [ ] API keys (Stripe, etc.) are production keys
- [ ] Regular backups configured for database
- [ ] Firewall configured (only ports 80, 443, and TURN ports open)
- [ ] Log monitoring enabled

---

## Environment-Specific Notes

### Development

```bash
# Quick start for development
npm install
npm run dev
```

Uses in-memory storage if no DATABASE_URL is set.

### Testing

```bash
# Run tests
npm test

# Test specific component
npm test -- --grep "WebSocket"
```

### Production

- Always use PostgreSQL (in-memory data is lost on restart)
- Configure TURN server for reliable calls
- Enable push notifications for offline users
- Setup monitoring and alerting
- Configure automated backups

---

## Support

If you encounter issues:

1. Check the `/api/diagnostics` endpoint
2. Review server logs
3. Test with `test-connection.js`
4. Open an issue on GitHub with:
   - Environment details
   - Error logs
   - Diagnostics output

---

## Migration from Old Versions

If upgrading from an earlier version:

1. Backup your database
2. Pull latest code
3. Run migrations: `npm run db:push`
4. Update environment variables (check .env.example for new vars)
5. Restart services
