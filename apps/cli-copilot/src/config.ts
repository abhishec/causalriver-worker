/**
 * Config — Environment variable loading & validation
 * ═══════════════════════════════════════════════════════
 * Loads from .env, validates required vars, exports typed config.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { CORE_BRAIN_ORG_ID } from '@nexus-ai/memory-stack';

// Load .env — try CWD first, then walk up to find apps/cli-copilot/.env
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/cli-copilot/.env'),
];
for (const envPath of candidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

export interface CliConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  anthropicApiKey: string;
  orgId: string;
  coreOrgId: string;
  orgName: string;
  model: string;
  maxTokens: number;
}

// Canonical source: packages/memory-stack/src/federation/constants.ts
const CORE_ORG_ID = CORE_BRAIN_ORG_ID;

export function loadConfig(): CliConfig {
  const required: Record<string, string | undefined> = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ORG_ID: process.env.ORG_ID,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error('\n  ✗ Missing required environment variables:\n');
    for (const key of missing) {
      console.error(`    - ${key}`);
    }
    console.error('\n  Copy .env.example to .env and fill in your values:');
    console.error('    cp .env.example .env\n');
    process.exit(1);
  }

  return {
    supabaseUrl: required.SUPABASE_URL!,
    supabaseServiceRoleKey: required.SUPABASE_SERVICE_ROLE_KEY!,
    anthropicApiKey: required.ANTHROPIC_API_KEY!,
    orgId: required.ORG_ID!,
    coreOrgId: process.env.CORE_ORG_ID || CORE_ORG_ID,
    orgName: process.env.ORG_NAME || 'NexusBrain Copilot',
    model: process.env.MODEL || 'claude-sonnet-4-20250514', // Cost optimization: Sonnet 4 default (set MODEL=claude-sonnet-4-5-20250929 for premium)
    maxTokens: parseInt(process.env.MAX_TOKENS || '8192', 10),
  };
}
