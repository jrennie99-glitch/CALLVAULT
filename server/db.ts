import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Database connection is optional - server will start even if DB is unavailable
// This allows deployment to succeed even with temporary database connectivity issues
let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

try {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️  DATABASE_URL not set - database features will be unavailable");
  } else {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
    console.log("✓ Database connection pool initialized");
    
    // Test connection asynchronously (non-blocking)
    pool.query('SELECT NOW()').then(() => {
      console.log("✓ Database connection verified");
    }).catch((err) => {
      console.error("⚠️  Database connection test failed:", err.message);
      console.error("   Server will continue running with limited functionality");
    });
  }
} catch (error) {
  console.error("⚠️  Failed to initialize database connection:", error);
  console.error("   Server will continue running with limited functionality");
}

export { pool, db };
