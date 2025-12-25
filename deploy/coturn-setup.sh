#!/bin/bash
# Call Vault - Coturn TURN Server Setup
# Run on the same server or a dedicated TURN server
# Run as root or with sudo

set -e

echo "=========================================="
echo "  Coturn TURN Server Setup"
echo "=========================================="

# Install coturn
echo "[1/5] Installing coturn..."
apt update
apt install -y coturn

# Get server details
read -p "Enter your server's public IP address: " SERVER_IP
read -p "Enter your domain name (e.g., turn.callvault.com): " TURN_DOMAIN
read -p "Enter TURN username (default: callvault): " TURN_USER
TURN_USER=${TURN_USER:-callvault}
read -sp "Enter TURN password (strong password recommended): " TURN_PASS
echo

# Enable coturn service
echo "[2/5] Enabling coturn service..."
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Backup original config
cp /etc/turnserver.conf /etc/turnserver.conf.backup

# Create coturn configuration
echo "[3/5] Creating coturn configuration..."
cat > /etc/turnserver.conf << EOF
# Call Vault Coturn Configuration

# Network settings
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=$SERVER_IP
relay-ip=$SERVER_IP

# Realm and domain
realm=$TURN_DOMAIN
server-name=$TURN_DOMAIN

# Authentication
lt-cred-mech
user=$TURN_USER:$TURN_PASS

# Security settings
fingerprint
no-tlsv1
no-tlsv1_1

# Logging
log-file=/var/log/turnserver.log
verbose

# Relay port range (must match firewall rules)
min-port=49152
max-port=65535

# Performance tuning
total-quota=100
max-bps=0
stale-nonce=600

# Disable CLI (not needed)
no-cli

# For TLS (optional - uncomment and set paths if using SSL)
# cert=/etc/letsencrypt/live/$TURN_DOMAIN/fullchain.pem
# pkey=/etc/letsencrypt/live/$TURN_DOMAIN/privkey.pem

# Security: deny private IPs
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
EOF

# Create log file with proper permissions
touch /var/log/turnserver.log
chown turnserver:turnserver /var/log/turnserver.log

# Start and enable coturn
echo "[4/5] Starting coturn service..."
systemctl restart coturn
systemctl enable coturn

# Check status
echo "[5/5] Verifying coturn status..."
systemctl status coturn --no-pager

echo ""
echo "=========================================="
echo "  Coturn Setup Complete!"
echo "=========================================="
echo ""
echo "TURN Server Configuration for .env:"
echo "-----------------------------------"
echo "TURN_MODE=custom"
echo "TURN_URLS=turn:$SERVER_IP:3478"
echo "TURN_USERNAME=$TURN_USER"
echo "TURN_CREDENTIAL=$TURN_PASS"
echo ""
echo "For TLS (TURNS):"
echo "TURN_URLS=turn:$SERVER_IP:3478,turns:$TURN_DOMAIN:5349"
echo ""
echo "Ports to ensure are open:"
echo "- 3478/tcp and 3478/udp (TURN)"
echo "- 5349/tcp and 5349/udp (TURNS with TLS)"
echo "- 49152-65535/udp (relay range)"
echo ""
echo "Test TURN server: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
echo ""
