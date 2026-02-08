/**
 * Startup Configuration Validation
 * 
 * Validates all critical environment variables at startup
 * and provides helpful error messages if configuration is missing or invalid.
 */

import { z } from "zod";

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

// Environment variable schemas
const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for production").optional(),
  
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().regex(/^\d+$/).transform(Number).default("5000"),
  PUBLIC_URL: z.string().url().optional(),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  ALLOWED_ORIGINS: z.string().optional(),
  
  // WebRTC / TURN
  TURN_MODE: z.enum(["public", "custom", "off"]).default("public"),
  TURN_URLS: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  STUN_URLS: z.string().optional(),
  
  // Metered
  METERED_APP_NAME: z.string().optional(),
  METERED_SECRET_KEY: z.string().optional(),
  
  // Push Notifications
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().email().default("mailto:admin@callvault.app"),
  FCM_SERVER_KEY: z.string().optional(),
  
  // Email
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // Solana
  ENABLE_SOLANA_PAYMENTS: z.enum(["true", "false"]).default("false"),
  SOLANA_CLUSTER: z.enum(["mainnet-beta", "testnet", "devnet"]).default("mainnet-beta"),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_USDC_MINT: z.string().optional(),
  SOL_USD_PRICE: z.string().optional(),
  
  // Base
  ENABLE_CRYPTO_PAYMENTS: z.enum(["true", "false"]).default("false"),
  BASE_USDC_CONTRACT: z.string().optional(),
  BASE_RPC_URL: z.string().url().optional(),
  ETH_USD_PRICE: z.string().optional(),
  CRYPTO_INVOICE_EXPIRATION_MINUTES: z.string().default("20"),
  
  // AI
  AI_INTEGRATIONS_GEMINI_API_KEY: z.string().optional(),
  AI_INTEGRATIONS_GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  
  // Build
  BUILD_COMMIT: z.string().default("unknown"),
  BUILD_TIME: z.string().optional(),
});

/**
 * Validates all environment variables
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  try {
    const env = envSchema.parse(process.env);
    const isProduction = env.NODE_ENV === "production";

    // =============================================================================
    // CRITICAL CHECKS (Production only)
    // =============================================================================
    
    if (isProduction) {
      // Database is required in production
      if (!env.DATABASE_URL) {
        errors.push("DATABASE_URL is required in production mode. Data will be lost on restart without a database.");
      } else {
        // Validate DATABASE_URL format
        try {
          const dbUrl = new URL(env.DATABASE_URL);
          if (!dbUrl.protocol.startsWith("postgres")) {
            errors.push(`DATABASE_URL must be a PostgreSQL connection string (got: ${dbUrl.protocol})`);
          }
        } catch {
          errors.push("DATABASE_URL is not a valid URL");
        }
      }

      // Check PUBLIC_URL is set
      if (!env.PUBLIC_URL) {
        warnings.push("PUBLIC_URL is not set. Some features like webhooks may not work correctly.");
      }
    }

    // =============================================================================
    // TURN CONFIGURATION
    // =============================================================================
    
    if (env.TURN_MODE === "custom") {
      if (!env.TURN_URLS) {
        errors.push("TURN_MODE=custom requires TURN_URLS to be set");
      }
      if (!env.TURN_USERNAME && !env.TURN_SECRET) {
        errors.push("TURN_MODE=custom requires TURN_USERNAME or TURN_SECRET to be set");
      }
      if (!env.TURN_CREDENTIAL && !env.TURN_SECRET) {
        errors.push("TURN_MODE=custom requires TURN_CREDENTIAL or TURN_SECRET to be set");
      }
      info.push(`TURN configured with server: ${env.TURN_URLS?.split(",")[0]}`);
    } else if (env.TURN_MODE === "public") {
      warnings.push("Using public OpenRelay TURN servers. This is unreliable for production. Set TURN_MODE=custom with your own server.");
    } else if (env.TURN_MODE === "off") {
      warnings.push("TURN is disabled. Calls will likely fail behind NAT/firewalls.");
    }

    // Check for Metered credentials (alternative to custom TURN)
    if (env.METERED_APP_NAME && env.METERED_SECRET_KEY) {
      info.push("Metered.ca TURN credentials detected - will be used for TURN relay");
    }

    // =============================================================================
    // PUSH NOTIFICATIONS
    // =============================================================================
    
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      info.push("VAPID keys configured - push notifications enabled");
      
      // Validate VAPID key format (base64url)
      const base64urlPattern = /^[A-Za-z0-9_-]+$/;
      if (!base64urlPattern.test(env.VAPID_PUBLIC_KEY)) {
        warnings.push("VAPID_PUBLIC_KEY doesn't look like a valid base64url string");
      }
      if (!base64urlPattern.test(env.VAPID_PRIVATE_KEY)) {
        warnings.push("VAPID_PRIVATE_KEY doesn't look like a valid base64url string");
      }
    } else if (env.VAPID_PUBLIC_KEY || env.VAPID_PRIVATE_KEY) {
      warnings.push("Only one VAPID key is set. Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required.");
    } else {
      warnings.push("VAPID keys not set. Push notifications will not work. Generate keys with: npx web-push generate-vapid-keys");
    }

    if (env.FCM_SERVER_KEY) {
      info.push("FCM_SERVER_KEY configured - Firebase push notifications enabled");
    }

    // =============================================================================
    // EMAIL CONFIGURATION
    // =============================================================================
    
    if (env.RESEND_API_KEY) {
      info.push("Resend email provider configured");
    }
    if (env.SENDGRID_API_KEY) {
      info.push("SendGrid email provider configured");
    }
    if (!env.RESEND_API_KEY && !env.SENDGRID_API_KEY) {
      warnings.push("No email provider configured. Email features will not work.");
    }

    // =============================================================================
    // PAYMENT CONFIGURATION
    // =============================================================================
    
    if (env.STRIPE_SECRET_KEY) {
      if (!env.STRIPE_SECRET_KEY.startsWith("sk_")) {
        warnings.push("STRIPE_SECRET_KEY doesn't start with 'sk_' - may be invalid");
      } else if (env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
        warnings.push("Using Stripe test keys. For production, use live keys (sk_live_*)");
      } else {
        info.push("Stripe payments configured");
      }
    }

    if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
      warnings.push("STRIPE_WEBHOOK_SECRET doesn't start with 'whsec_' - may be invalid");
    }

    // Solana
    if (env.ENABLE_SOLANA_PAYMENTS === "true") {
      info.push(`Solana payments enabled (cluster: ${env.SOLANA_CLUSTER})`);
      if (env.SOLANA_RPC_URL) {
        info.push(`Using custom Solana RPC: ${env.SOLANA_RPC_URL}`);
      }
    }

    // Base/Ethereum
    if (env.ENABLE_CRYPTO_PAYMENTS === "true") {
      info.push("Crypto payments on Base chain enabled");
      if (env.BASE_RPC_URL) {
        info.push(`Using custom Base RPC: ${env.BASE_RPC_URL}`);
      }
    }

    // =============================================================================
    // AI INTEGRATIONS
    // =============================================================================
    
    if (env.AI_INTEGRATIONS_GEMINI_API_KEY) {
      info.push("Google Gemini AI integration configured");
    }

    // =============================================================================
    // SECURITY WARNINGS
    // =============================================================================
    
    // Check for default/changeme passwords
    if (env.DATABASE_URL?.includes(":changeme@")) {
      warnings.push("DATABASE_URL contains default password 'changeme'. Change this for production!");
    }
    if (env.TURN_CREDENTIAL === "changeme") {
      warnings.push("TURN_CREDENTIAL is set to default 'changeme'. Change this for production!");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  } catch (parseError) {
    if (parseError instanceof z.ZodError) {
      for (const issue of parseError.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      errors.push(`Configuration validation error: ${parseError}`);
    }

    return {
      valid: false,
      errors,
      warnings,
      info,
    };
  }
}

/**
 * Prints validation results to console
 */
export function printValidationResults(result: ValidationResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 CallVault Configuration Check");
  console.log("=".repeat(60));

  // Info
  for (const msg of result.info) {
    console.log(`  ✓ ${msg}`);
  }

  // Warnings
  for (const msg of result.warnings) {
    console.log(`  ⚠️  ${msg}`);
  }

  // Errors
  for (const msg of result.errors) {
    console.log(`  ✗ ${msg}`);
  }

  console.log("=".repeat(60));

  if (!result.valid) {
    console.log("\n❌ Configuration errors detected!");
    console.log("Please fix the errors above before starting the server.\n");
  } else if (result.warnings.length > 0) {
    console.log("\n⚠️  Configuration has warnings.");
    console.log("The server will start but some features may not work correctly.\n");
  } else {
    console.log("\n✓ Configuration looks good!\n");
  }
}

/**
 * Performs startup validation and exits if critical errors are found
 */
export function performStartupValidation(exitOnError = true): ValidationResult {
  const result = validateConfig();
  printValidationResults(result);

  if (!result.valid && exitOnError) {
    process.exit(1);
  }

  return result;
}
