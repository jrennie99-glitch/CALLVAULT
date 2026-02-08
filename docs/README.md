# CallVault Documentation

Welcome to the CallVault documentation.

## Quick Links

- [Deployment Guide](./DEPLOYMENT.md) - Complete deployment instructions
- [Environment Configuration](../.env.example) - All environment variables
- [API Documentation](#) - Coming soon

## Getting Started

1. **Quick Start with Docker:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   docker-compose up -d
   ```

2. **Verify Configuration:**
   ```bash
   node check-config.js
   ```

3. **Check Health:**
   ```bash
   curl http://localhost:5000/api/health
   ```

## Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Template for all environment variables |
| `docker-compose.yml` | Docker services configuration |
| `server/config.ts` | Runtime configuration validation |
| `check-config.js` | Standalone config validator |

## Support

For issues and questions:
1. Check the [Deployment Guide](./DEPLOYMENT.md)
2. Run `node check-config.js` for validation
3. Visit `/api/diagnostics` for runtime diagnostics
