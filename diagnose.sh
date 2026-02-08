#!/bin/bash
# CallVault Deployment Diagnostic Script
# Run this on your Coolify server to check configuration

echo "=========================================="
echo "CallVault Deployment Diagnostics"
echo "=========================================="
echo ""

# Check if running in Coolify container
if [ -z "$COOLIFY_CONTAINER_NAME" ] && [ -z "$COOLIFY_URL" ]; then
  echo "⚠️  Not running in Coolify environment"
fi

echo "1. Checking Environment Variables..."
echo "-----------------------------------"

# Critical variables
VARS=(
  "NODE_ENV"
  "PORT"
  "DATABASE_URL"
  "TURN_MODE"
  "TURN_URLS"
  "TURN_USERNAME"
  "TURN_CREDENTIAL"
  "STUN_URLS"
  "VAPID_PUBLIC_KEY"
  "VAPID_PRIVATE_KEY"
  "PUBLIC_URL"
  "TRUST_PROXY"
)

for var in "${VARS[@]}"; do
  value="${!var}"
  if [ -n "$value" ]; then
    # Mask sensitive values
    if [[ "$var" == *"PASSWORD"* ]] || [[ "$var" == *"CREDENTIAL"* ]] || [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"KEY"* ]] || [[ "$var" == *"URL"* ]]; then
      if [ ${#value} -gt 10 ]; then
        masked="${value:0:10}...${value: -5}"
        echo "  ✅ $var = $masked"
      else
        echo "  ✅ $var = [set]"
      fi
    else
      echo "  ✅ $var = $value"
    fi
  else
    echo "  ❌ $var = [NOT SET]"
  fi
done

echo ""
echo "2. Checking Database Connection..."
echo "-----------------------------------"
if [ -n "$DATABASE_URL" ]; then
  # Extract host from DATABASE_URL
  db_host=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
  echo "  Database host: $db_host"
  
  # Try to connect (if psql available)
  if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT NOW();" &> /dev/null; then
      echo "  ✅ Database connection: OK"
    else
      echo "  ❌ Database connection: FAILED"
    fi
  else
    echo "  ⚠️  psql not available - can't test connection"
  fi
else
  echo "  ❌ DATABASE_URL not set - using IN-MEMORY storage"
  echo "     ⚠️  All data will be LOST on server restart!"
fi

echo ""
echo "3. Checking TURN Configuration..."
echo "-----------------------------------"
TURN_MODE=${TURN_MODE:-public}
echo "  TURN_MODE: $TURN_MODE"

case "$TURN_MODE" in
  "custom")
    if [ -n "$TURN_URLS" ] && [ -n "$TURN_USERNAME" ] && [ -n "$TURN_CREDENTIAL" ]; then
      echo "  ✅ Custom TURN configured"
      echo "  URLs: $TURN_URLS"
    else
      echo "  ❌ Custom TURN incomplete - missing credentials"
    fi
    ;;
  "public")
    echo "  ⚠️  Using PUBLIC OpenRelay (unreliable for production)"
    echo "     Set TURN_MODE=custom for reliable calls"
    ;;
  "off")
    echo "  ⚠️  TURN is OFF - calls will fail behind NAT"
    ;;
  *)
    echo "  ❌ Unknown TURN_MODE: $TURN_MODE"
    ;;
esac

echo ""
echo "4. Checking Application Health..."
echo "-----------------------------------"
# Check if server is responding
PORT=${PORT:-3000}
if curl -s "http://localhost:$PORT/health" &> /dev/null; then
  echo "  ✅ Server responding on port $PORT"
  
  # Get detailed diagnostics
  diag=$(curl -s "http://localhost:$PORT/api/diagnostics" 2>/dev/null)
  if [ -n "$diag" ]; then
    echo "  Diagnostics available at /api/diagnostics"
  fi
else
  echo "  ❌ Server NOT responding on port $PORT"
fi

echo ""
echo "5. File System Checks..."
echo "-----------------------------------"
# Check upload directory
if [ -d "/app/uploads" ]; then
  echo "  ✅ Upload directory exists"
  upload_size=$(du -sh /app/uploads 2>/dev/null | cut -f1)
  echo "     Size: $upload_size"
else
  echo "  ⚠️  Upload directory not found at /app/uploads"
fi

# Check build exists
if [ -f "/app/dist/public/index.html" ]; then
  echo "  ✅ Frontend build exists"
else
  echo "  ❌ Frontend build missing!"
fi

echo ""
echo "=========================================="
echo "Summary & Recommendations"
echo "=========================================="

issues=0

if [ -z "$DATABASE_URL" ]; then
  echo "❌ CRITICAL: DATABASE_URL not set"
  echo "   → Messages and calls won't persist"
  echo "   → Create a PostgreSQL database in Coolify"
  echo "   → Set DATABASE_URL to the connection string"
  ((issues++))
fi

if [ "$TURN_MODE" = "public" ] || [ -z "$TURN_MODE" ]; then
  echo "⚠️  WARNING: Using public TURN servers"
  echo "   → Calls may fail or be unreliable"
  echo "   → Set TURN_MODE=custom with your own coturn server"
  ((issues++))
fi

if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
  echo "⚠️  WARNING: VAPID keys not set"
  echo "   → Push notifications won't work"
  echo "   → Run: npx web-push generate-vapid-keys"
  ((issues++))
fi

if [ $issues -eq 0 ]; then
  echo "✅ All critical settings configured!"
fi

echo ""
echo "Test commands:"
echo "  curl http://localhost:$PORT/health"
echo "  curl http://localhost:$PORT/api/diagnostics"
echo "  curl http://localhost:$PORT/api/turn-config"
echo ""
