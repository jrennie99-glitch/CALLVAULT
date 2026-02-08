#!/usr/bin/env node
/**
 * CallVault Startup Check Script
 * 
 * Validates environment configuration without starting the server.
 * Useful for CI/CD pipelines and pre-deployment checks.
 * 
 * Usage:
 *   npx tsx check-config.ts
 *   npx tsx check-config.ts --strict  # Exit with error on warnings too
 */

import { validateConfig, printValidationResults } from "./server/config";

const strict = process.argv.includes("--strict");

console.log("\n" + "=".repeat(60));
console.log("CallVault Configuration Validator");
console.log("=".repeat(60) + "\n");

const result = validateConfig();
printValidationResults(result);

if (!result.valid) {
  console.log("❌ Configuration validation FAILED\n");
  process.exit(1);
}

if (strict && result.warnings.length > 0) {
  console.log("❌ Strict mode: Warnings treated as errors\n");
  process.exit(1);
}

console.log("✅ Configuration validation PASSED\n");
process.exit(0);
