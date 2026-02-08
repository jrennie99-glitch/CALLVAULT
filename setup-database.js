#!/usr/bin/env node
/**
 * CallVault Database Setup Script
 * 
 * This script creates all necessary database tables.
 * Run this after setting DATABASE_URL.
 * 
 * Usage:
 *   node setup-database.js
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  console.error('Set it with: export DATABASE_URL=postgresql://user:pass@host:port/db');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const schema = `
-- Users table (for admin access)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Crypto identities (main user table)
CREATE TABLE IF NOT EXISTS crypto_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL UNIQUE,
  public_key_base58 TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  handle TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_disabled BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMP,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT DEFAULT 'none',
  plan_renewal_at TIMESTAMP,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_status TEXT DEFAULT 'none',
  trial_start_at TIMESTAMP,
  trial_end_at TIMESTAMP,
  trial_minutes_remaining INTEGER,
  trial_plan TEXT DEFAULT 'pro',
  freeze_mode BOOLEAN DEFAULT FALSE,
  freeze_mode_setup_completed BOOLEAN DEFAULT FALSE,
  is_comped BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  suspended_at TIMESTAMP,
  suspended_by TEXT,
  suspended_reason TEXT,
  free_access_end_at TIMESTAMP,
  admin_expires_at TIMESTAMP,
  priority_support BOOLEAN DEFAULT FALSE,
  call_priority INTEGER DEFAULT 0
);

-- Persistent messages (chat history)
CREATE TABLE IF NOT EXISTS persistent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  convo_id TEXT NOT NULL,
  content TEXT NOT NULL,
  media_type TEXT,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  seq INTEGER,
  server_timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  nonce TEXT,
  message_type TEXT DEFAULT 'text',
  attachment_name TEXT,
  attachment_size INTEGER
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS pm_convo_id_seq_idx ON persistent_messages(convo_id, seq);
CREATE INDEX IF NOT EXISTS pm_convo_id_created_at_idx ON persistent_messages(convo_id, created_at);
CREATE INDEX IF NOT EXISTS pm_from_address_idx ON persistent_messages(from_address);
CREATE INDEX IF NOT EXISTS pm_to_address_idx ON persistent_messages(to_address);
CREATE INDEX IF NOT EXISTS pm_status_idx ON persistent_messages(status);
CREATE INDEX IF NOT EXISTS pm_nonce_idx ON persistent_messages(nonce);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address TEXT NOT NULL,
  contact_address TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(owner_address, contact_address)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convo_id TEXT NOT NULL UNIQUE,
  participant_addresses TEXT[] NOT NULL,
  is_group BOOLEAN DEFAULT FALSE,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_message_at TIMESTAMP,
  last_message_content TEXT
);

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_address, endpoint)
);

-- Device push tokens (FCM/APNs)
CREATE TABLE IF NOT EXISTS device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMP,
  is_valid BOOLEAN DEFAULT TRUE,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  UNIQUE(user_address, token)
);

-- Trial nonces (replay protection)
CREATE TABLE IF NOT EXISTS trial_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL UNIQUE,
  used_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

-- Call passes
CREATE TABLE IF NOT EXISTS call_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id TEXT NOT NULL UNIQUE,
  creator_address TEXT NOT NULL,
  recipient_address TEXT,
  pass_type TEXT NOT NULL,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP,
  payment_token_id TEXT,
  payment_amount DECIMAL(20, 8),
  payment_currency TEXT,
  creator_earnings DECIMAL(20, 8) DEFAULT 0
);

-- Blocked users
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address TEXT NOT NULL,
  blocked_address TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(owner_address, blocked_address)
);

-- Linked addresses
CREATE TABLE IF NOT EXISTS linked_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_address TEXT NOT NULL,
  linked_address TEXT NOT NULL UNIQUE,
  linked_public_key TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Call rooms
CREATE TABLE IF NOT EXISTS call_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  host_address TEXT NOT NULL,
  name TEXT,
  is_video BOOLEAN DEFAULT TRUE,
  is_locked BOOLEAN DEFAULT FALSE,
  max_participants INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMP
);

-- Room participants
CREATE TABLE IF NOT EXISTS call_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES call_rooms(id) ON DELETE CASCADE,
  participant_address TEXT NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  left_at TIMESTAMP,
  UNIQUE(room_id, participant_address)
);

-- Group call participants
CREATE TABLE IF NOT EXISTS group_call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  participant_address TEXT NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  left_at TIMESTAMP,
  UNIQUE(room_id, participant_address)
);

-- Earnings
CREATE TABLE IF NOT EXISTS earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  paid_at TIMESTAMP
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_address TEXT NOT NULL,
  action TEXT NOT NULL,
  target_address TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_transfer_id TEXT,
  paypal_payout_id TEXT,
  crypto_tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP
);

-- Subscription usage
CREATE TABLE IF NOT EXISTS subscription_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL UNIQUE,
  minutes_used INTEGER DEFAULT 0,
  reset_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Nonce cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM trial_nonces WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
`;

async function setupDatabase() {
  console.log('🔧 Setting up CallVault database...\n');
  
  try {
    console.log('Testing database connection...');
    const testResult = await pool.query('SELECT NOW() as now');
    console.log(`✓ Connected to database at ${testResult.rows[0].now}\n`);
    
    console.log('Creating tables...');
    await pool.query(schema);
    console.log('✓ Tables created successfully\n');
    
    // Verify tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    console.log('\n✅ Database setup complete!');
    console.log('\nNext steps:');
    console.log('1. Set VAPID keys for push notifications:');
    console.log('   npx web-push generate-vapid-keys');
    console.log('2. Configure TURN server for calls');
    console.log('3. Restart your server');
    
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    if (error.message.includes('does not exist')) {
      console.error('\nThe database does not exist. Create it first:');
      console.error('  createdb callvault');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
