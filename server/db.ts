import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Database connection is optional - server will start even if DB is unavailable
// This allows deployment to succeed even with temporary database connectivity issues
let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// In-memory fallback storage for when database is unavailable
// WARNING: Data is lost on server restart - only use for development/testing
export const inMemoryStore = {
  identities: new Map<string, any>(),
  contacts: new Map<string, any[]>(),
  conversations: new Map<string, any>(),
  messages: new Map<string, any[]>(),
};

export function isDatabaseAvailable(): boolean {
  return db !== null;
}

try {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️  DATABASE_URL not set - using IN-MEMORY storage (data will be lost on restart)");
    console.warn("   Set DATABASE_URL for production use with persistent data");
  } else {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
    console.log("✓ Database connection pool initialized");
    
    // Test connection asynchronously (non-blocking)
    (async () => {
      try {
        await pool.query('SELECT NOW()');
        console.log("✓ Database connection verified");
      } catch (err: any) {
        console.error("⚠️  Database connection test failed:", err.message);
        console.error("   Server will continue running with limited functionality");
      }
    })();
  }
} catch (error) {
  console.error("⚠️  Failed to initialize database connection:", error);
  console.error("   Server will continue running with limited functionality");
}

export { pool, db };
