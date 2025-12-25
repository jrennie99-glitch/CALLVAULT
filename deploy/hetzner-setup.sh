#!/bin/bash
# Call Vault - Hetzner VPS Setup Script
# Tested on Ubuntu 22.04 LTS
# Run as root or with sudo

set -e

echo "=========================================="
echo "  Call Vault - Hetzner VPS Setup"
echo "=========================================="

# Update system
echo "[1/8] Updating system packages..."
apt update && apt upgrade -y

# Install essential packages
echo "[2/8] Installing essential packages..."
apt install -y curl wget git build-essential ufw nginx certbot python3-certbot-nginx

# Install Node.js 20 LTS
echo "[3/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install PM2 globally
echo "[4/8] Installing PM2 process manager..."
npm install -g pm2

# Install PostgreSQL
echo "[5/8] Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
echo "[6/8] Setting up PostgreSQL database..."
read -p "Enter database name (default: callvault): " DB_NAME
DB_NAME=${DB_NAME:-callvault}

read -p "Enter database user (default: callvault): " DB_USER
DB_USER=${DB_USER:-callvault}

read -sp "Enter database password: " DB_PASS
echo

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo ""
echo "Database URL: postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo ""

# Configure firewall
echo "[7/8] Configuring firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 3478/tcp    # TURN TCP
ufw allow 3478/udp    # TURN UDP
ufw allow 5349/tcp    # TURNS (TLS)
ufw allow 5349/udp    # TURNS (TLS)
ufw allow 49152:65535/udp  # TURN relay range

# Enable firewall
echo "y" | ufw enable
ufw status

# Create app directory
echo "[8/8] Creating application directory..."
mkdir -p /var/www/callvault
chown -R $SUDO_USER:$SUDO_USER /var/www/callvault

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repo: cd /var/www/callvault && git clone <repo-url> ."
echo "2. Copy env file: cp deploy/env.example .env"
echo "3. Edit .env with your values: nano .env"
echo "4. Install dependencies: npm ci"
echo "5. Build: npm run build"
echo "6. Push database schema: npm run db:push"
echo "7. Start with PM2: pm2 start npm --name callvault -- start"
echo "8. Save PM2 config: pm2 save && pm2 startup"
echo "9. Setup nginx: see deploy/README.md"
echo ""
echo "Database URL for .env:"
echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo ""
