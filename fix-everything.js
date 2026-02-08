#!/usr/bin/env node
/**
 * CallVault Complete Setup Script
 * Run this ON YOUR SERVER to fix everything
 * 
 * Usage:
 *   export DATABASE_URL=postgresql://user:pass@host:port/db
 *   node fix-everything.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════╗');
console.log('║     CallVault - Fix Everything         ║');
console.log('╚════════════════════════════════════════╝');
console.log('');

// Check environment
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set!');
  console.error('Run: export DATABASE_URL=postgresql://user:pass@host:port/db');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const TABLES = [
  `CREATE TABLE IF NOT EXISTS crypto_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT NOT NULL UNIQUE,
    public_key_base58 TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free'
  )`,
  
  `CREATE TABLE IF NOT EXISTS persistent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    convo_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media_type TEXT DEFAULT 'text',
    status TEXT NOT NULL DEFAULT 'pending',
    seq INTEGER,
    server_timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    nonce TEXT
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_messages_convo ON persistent_messages(convo_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_from ON persistent_messages(from_address)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_to ON persistent_messages(to_address)`,
  
  `CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_address TEXT NOT NULL,
    contact_address TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(owner_address, contact_address)
  )`,
  
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    participant_addresses TEXT[] NOT NULL,
    is_group BOOLEAN DEFAULT FALSE,
    name TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`,
  
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_address, endpoint)
  )`,
  
  `CREATE TABLE IF NOT EXISTS device_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_address, token)
  )`
];

async function fixDatabase() {
  console.log('🔧 Fixing database...');
  
  try {
    console.log('  Testing connection...');
    const result = await pool.query('SELECT NOW() as now');
    console.log(`  ✓ Connected at ${result.rows[0].now}`);
    
    console.log('  Creating tables...');
    for (const sql of TABLES) {
      try {
        await pool.query(sql);
      } catch (err) {
        console.error(`  ⚠️  ${err.message}`);
      }
    }
    
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN (
        'crypto_identities', 'persistent_messages', 'contacts', 
        'conversations', 'push_subscriptions'
      )
    `);
    
    console.log(`  ✓ ${tables.rowCount} tables ready`);
    
  } catch (err) {
    console.error('❌ Database fix failed:', err.message);
    throw err;
  }
}

function checkEnv() {
  console.log('\n📋 Checking environment...');
  
  const checks = {
    'DATABASE_URL': !!process.env.DATABASE_URL,
    'TURN_MODE': process.env.TURN_MODE || 'public',
    'TURN_URLS': !!process.env.TURN_URLS,
    'TURN_USERNAME': !!process.env.TURN_USERNAME,
    'TURN_CREDENTIAL': !!process.env.TURN_CREDENTIAL,
    'VAPID_PUBLIC_KEY': !!process.env.VAPID_PUBLIC_KEY,
    'VAPID_PRIVATE_KEY': !!process.env.VAPID_PRIVATE_KEY
  };
  
  const turnConfigured = checks.TURN_URLS && checks.TURN_USERNAME && checks.TURN_CREDENTIAL;
  
  if (checks.TURN_MODE === 'custom' && !turnConfigured) {
    console.log('  ⚠️  TURN_MODE=custom but credentials missing!');
    console.log('     Calls will FAIL behind NAT');
  } else if (checks.TURN_MODE === 'public') {
    console.log('  ⚠️  Using public TURN (unreliable)');
  }
  
  if (!checks.VAPID_PUBLIC_KEY || !checks.VAPID_PRIVATE_KEY) {
    console.log('  ⚠️  Push notifications not configured');
    console.log('     Offline users won\'t get call alerts');
  }
}

async function generateVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return;
  }
  
  console.log('\n🔑 Generating VAPID keys for push notifications...');
  
  try {
    const webpush = require('web-push');
    const keys = webpush.generateVAPIDKeys();
    
    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  ADD THESE TO YOUR COOLIFY ENVIRONMENT VARS:   ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
    console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
    console.log(`VAPID_SUBJECT=mailto:admin@callvault.app`);
    console.log('');
    console.log('⚠️  Copy these now - they won\'t be shown again!');
    console.log('');
    
  } catch (err) {
    console.log('  Install web-push: npm install web-push');
    console.log('  Then run: npx web-push generate-vapid-keys');
  }
}

async function main() {
  try {
    await fixDatabase();
    checkEnv();
    await generateVapidKeys();
    
    console.log('\n✅ Setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add VAPID keys to Coolify environment');
    console.log('2. Configure TURN server (see below)');
    console.log('3. Restart your server');
    console.log('4. Test with: node test-connection.js');
    console.log('');
    console.log('TURN Server Setup:');
    console.log('  TURN_MODE=custom');
    console.log('  TURN_URLS=turn:yourserver.com:3478');
    console.log('  TURN_USERNAME=your_username');
    console.log('  TURN_CREDENTIAL=your_password');
    console.log('');
    
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
