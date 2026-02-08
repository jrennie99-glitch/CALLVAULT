import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Database connection is optional - server will start even if DB is unavailable
// This allows deployment to succeed even with temporary database connectivity issues
let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let isConnected = false;
let lastConnectionAttempt = 0;
const CONNECTION_RETRY_INTERVAL = 30000; // 30 seconds
const MAX_CONNECTION_RETRIES = 5;
let connectionRetryCount = 0;

// In-memory fallback storage for when database is unavailable
// WARNING: Data is lost on server restart - only use for development/testing
export const inMemoryStore = {
  identities: new Map<string, any>(),
  contacts: new Map<string, any[]>(),
  conversations: new Map<string, any>(),
  messages: new Map<string, any[]>(),
  pendingMessages: new Map<string, any[]>(), // For offline message delivery
};

export function isDatabaseAvailable(): boolean {
  return db !== null && isConnected;
}

export function getPool(): pg.Pool | null {
  return pool;
}

// Test database connection with timeout
async function testConnection(timeoutMs = 5000): Promise<boolean> {
  if (!pool) return false;
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout')), timeoutMs);
    });
    
    const testPromise = pool.query('SELECT NOW()');
    await Promise.race([testPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.error("Database connection test failed:", (error as Error).message);
    return false;
  }
}

// Initialize database connection with retry logic
async function initializeDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️  DATABASE_URL not set - using IN-MEMORY storage (data will be lost on restart)");
    console.warn("   Set DATABASE_URL for production use with persistent data");
    return;
  }

  // Prevent too frequent connection attempts
  const now = Date.now();
  if (now - lastConnectionAttempt < CONNECTION_RETRY_INTERVAL) {
    return;
  }
  lastConnectionAttempt = now;

  try {
    // Create pool with optimized settings
    pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Timeout for new connections
      // Add error handler for the pool
      ...(process.env.NODE_ENV === 'production' ? {
        ssl: {
          rejectUnauthorized: false // Required for some cloud providers
        }
      } : {})
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      isConnected = false;
      // Attempt to reconnect
      scheduleReconnect();
    });

    db = drizzle(pool, { schema });
    console.log("✓ Database connection pool initialized");

    // Test connection
    const connected = await testConnection();
    if (connected) {
      isConnected = true;
      connectionRetryCount = 0;
      console.log("✓ Database connection verified");
    } else {
      throw new Error('Connection test failed');
    }
  } catch (error) {
    connectionRetryCount++;
    console.error(`⚠️  Failed to initialize database connection (attempt ${connectionRetryCount}/${MAX_CONNECTION_RETRIES}):`, (error as Error).message);
    
    if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
      console.error("   Max connection retries reached. Server will continue with in-memory storage.");
      console.error("   Data will be lost on server restart!");
    } else {
      scheduleReconnect();
    }
    
    // Clean up failed pool
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      pool = null;
    }
    db = null;
    isConnected = false;
  }
}

// Schedule reconnection attempt
function scheduleReconnect(): void {
  if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
    setTimeout(() => {
      console.log("Attempting to reconnect to database...");
      initializeDatabase();
    }, CONNECTION_RETRY_INTERVAL);
  }
}

// Initial connection attempt
initializeDatabase();

// Health check function for monitoring
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!pool) {
    return { healthy: false, error: 'Pool not initialized' };
  }

  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    isConnected = true;
    return { healthy: true, latency };
  } catch (error) {
    isConnected = false;
    return { healthy: false, error: (error as Error).message };
  }
}

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  if (pool) {
    console.log("Closing database connections...");
    try {
      await pool.end();
      console.log("Database connections closed");
    } catch (error) {
      console.error("Error closing database connections:", error);
    }
    pool = null;
    db = null;
    isConnected = false;
  }
}

export { pool, db };
