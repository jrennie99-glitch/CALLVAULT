# Call Vault - Deployment Guide

This guide covers deploying Call Vault to a Hetzner VPS (or any Ubuntu server) with nginx reverse proxy, SSL, and coturn TURN server.

## Table of Contents

- [Quick Deploy Checklist](#quick-deploy-checklist)
- [Server Requirements](#server-requirements)
- [Ports to Open](#ports-to-open)
- [Step-by-Step Setup](#step-by-step-setup)
- [Nginx Configuration](#nginx-configuration)
- [SSL with Let's Encrypt](#ssl-with-lets-encrypt)
- [Docker Deployment](#docker-deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick Deploy Checklist

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Run the setup script
curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/hetzner-setup.sh | bash

# 3. Clone the repository
cd /var/www/callvault
git clone https://github.com/YOUR_REPO.git .

# 4. Configure environment
cp deploy/env.example .env
nano .env  # Fill in your values

# 5. Install dependencies
npm ci

# 6. Build the application
npm run build

# 7. Push database schema
npm run db:push

# 8. Start with PM2
pm2 start npm --name callvault -- start
pm2 save
pm2 startup  # Run the command it outputs

# 9. Setup nginx (see below)
sudo nano /etc/nginx/sites-available/callvault

# 10. Enable nginx site
sudo ln -s /etc/nginx/sites-available/callvault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 11. SSL certificate (optional but recommended)
sudo certbot --nginx -d your-domain.com
```

---

## Server Requirements

- **OS**: Ubuntu 22.04 LTS (recommended)
- **RAM**: 1GB minimum, 2GB recommended
- **CPU**: 1 vCPU minimum
- **Storage**: 10GB minimum
- **Network**: Public IPv4 address

---

## Ports to Open

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH access |
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS |
| 3478 | TCP/UDP | TURN server |
| 5349 | TCP/UDP | TURNS (TURN over TLS) |
| 49152-65535 | UDP | TURN relay range |

---

## Step-by-Step Setup

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git build-essential ufw nginx

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2
```

### 2. PostgreSQL Setup

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Create database
sudo -u postgres psql
CREATE USER callvault WITH PASSWORD 'your-secure-password';
CREATE DATABASE callvault OWNER callvault;
GRANT ALL PRIVILEGES ON DATABASE callvault TO callvault;
\q
```

### 3. Clone and Configure

```bash
# Create app directory
sudo mkdir -p /var/www/callvault
sudo chown -R $USER:$USER /var/www/callvault
cd /var/www/callvault

# Clone repository
git clone https://github.com/YOUR_REPO.git .

# Configure environment
cp deploy/env.example .env

# Edit with your values
nano .env
```

### 4. Build and Deploy

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Push database schema
npm run db:push

# Start with PM2
pm2 start npm --name callvault -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs
```

---

## Nginx Configuration

Create `/etc/nginx/sites-available/callvault`:

```nginx
upstream callvault_backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration (certbot will add these)
    # ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://callvault_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # WebSocket support for /ws endpoint
    location /ws {
        proxy_pass http://callvault_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # File uploads
    client_max_body_size 50M;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/callvault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
# Test with:
sudo certbot renew --dry-run
```

---

## TURN Server Setup (Coturn)

For reliable WebRTC behind NAT, set up coturn:

```bash
# Run the coturn setup script
sudo bash deploy/coturn-setup.sh
```

Or manually:

```bash
# Install coturn
sudo apt install -y coturn

# Enable coturn
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Edit configuration
sudo nano /etc/turnserver.conf

# Start coturn
sudo systemctl restart coturn
sudo systemctl enable coturn
```

---

## Docker Deployment

### Using Docker Compose

```bash
# Copy environment file
cp deploy/env.example .env
nano .env  # Configure your values

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

### Building Docker Image

```bash
# Build image
docker build -t callvault .

# Run container
docker run -d \
  --name callvault \
  -p 5000:5000 \
  --env-file .env \
  callvault
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 5000 | Server port |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `NODE_ENV` | Yes | - | `production` for deployed apps |
| `ALLOWED_ORIGINS` | No | - | Comma-separated CORS origins |
| `TRUST_PROXY` | No | false | Set `true` behind nginx |
| `TURN_MODE` | No | public | `public`, `custom`, or `off` |
| `TURN_URLS` | If custom | - | Comma-separated TURN URLs |
| `TURN_USERNAME` | If custom | - | TURN authentication user |
| `TURN_CREDENTIAL` | If custom | - | TURN authentication secret |
| `VAPID_PUBLIC_KEY` | No | - | Push notification public key |
| `VAPID_PRIVATE_KEY` | No | - | Push notification private key |
| `STRIPE_SECRET_KEY` | No | - | Stripe API key |

---

## Troubleshooting

### App won't start

```bash
# Check PM2 logs
pm2 logs callvault

# Check if port is in use
sudo lsof -i :5000
```

### WebSocket connection fails

1. Ensure nginx is configured for WebSocket upgrade
2. Check `TRUST_PROXY=true` is set in `.env`
3. Verify firewall allows port 443

### TURN server not working

```bash
# Check coturn status
sudo systemctl status coturn

# Check coturn logs
sudo tail -f /var/log/turnserver.log

# Test TURN server
# Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Database connection issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1;"

# Check PostgreSQL is running
sudo systemctl status postgresql
```

---

## Health Check

The app exposes a health endpoint:

```bash
curl https://your-domain.com/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"..."}
```

---

## Updating the App

```bash
cd /var/www/callvault

# Pull latest changes
git pull origin main

# Install any new dependencies
npm ci

# Rebuild
npm run build

# Push any schema changes
npm run db:push

# Restart
pm2 restart callvault
```
