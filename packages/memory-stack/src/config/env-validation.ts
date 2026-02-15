/**
 * Environment Variable Validation Schema
 * ═══════════════════════════════════════════════════════════════
 *
 * Validates all environment variables at startup to prevent runtime failures.
 * Ensures design partner deployments never fail due to missing config.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Complete environment schema
 */
const EnvSchema = z.object({
  // Supabase (required - accepts either key name)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_KEY: z.string().min(32).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32).optional(),

  // Organization ID (required)
  ORGANIZATION_ID: z.string().min(1, 'ORGANIZATION_ID is required'),

  // Redis (optional but recommended)
  REDIS_URL: z.string().url().optional(),

  // Connectors (optional)
  SLACK_BOT_TOKEN: z.string().optional(),
  JIRA_HOST: z.string().url().optional(),
  JIRA_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPOS: z.string().optional(),

  // LLM Providers (optional)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Monitoring (optional)
  DATADOG_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidatedEnv extends z.infer<typeof EnvSchema> {
  // Parsed GitHub repos
  githubRepos?: string[];
}

export interface ValidationResult {
  success: boolean;
  env?: ValidatedEnv;
  errors?: string[];
  warnings?: string[];
}

/**
 * Validate environment variables and return typed config.
 * Exits process if required vars are missing in production.
 */
export function validateEnv(options: {
  exitOnError?: boolean;
  silent?: boolean;
} = {}): ValidationResult {
  const { exitOnError = true, silent = false } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse environment
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Manual check for Supabase key (must have one or the other)
  if (!process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY: Required');
  }

  // Check for recommended but missing variables
  if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL not set - Deduplication and caching disabled. Impacts 10M+ scale performance.');
  }

  if (!process.env.SLACK_BOT_TOKEN && !process.env.JIRA_API_TOKEN && !process.env.GITHUB_TOKEN) {
    warnings.push('No connector tokens set - Motor command execution unavailable.');
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    warnings.push('No LLM API keys set - AI-powered features unavailable.');
  }

  // If critical errors exist, handle them
  if (errors.length > 0) {
    if (!silent) {
      console.error('\n❌ Environment Validation Failed:\n');
      errors.forEach(err => console.error(`   • ${err}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.\n');
    }

    if (exitOnError && process.env.NODE_ENV === 'production') {
      process.exit(1);
    }

    return { success: false, errors, warnings };
  }

  // Create validated env object
  const data = result.data!;
  const env: ValidatedEnv = {
    ...data,
    SUPABASE_URL: data.SUPABASE_URL!,
    ORGANIZATION_ID: data.ORGANIZATION_ID!,
    githubRepos: data.GITHUB_REPOS?.split(',').map(r => r.trim()),
  };

  // Print warnings if any
  if (!silent && warnings.length > 0) {
    console.warn('\n⚠️  Environment Warnings:\n');
    warnings.forEach(warn => console.warn(`   • ${warn}`));
    console.warn('');
  }

  // Success message
  if (!silent) {
    console.log('✅ Environment validation passed\n');
    console.log(`   Organization: ${env.ORGANIZATION_ID}`);
    console.log(`   Supabase: ${env.SUPABASE_URL}`);
    console.log(`   Redis: ${env.REDIS_URL ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Connectors: ${[
      env.SLACK_BOT_TOKEN && 'Slack',
      env.JIRA_API_TOKEN && 'Jira',
      env.GITHUB_TOKEN && 'GitHub',
    ].filter(Boolean).join(', ') || 'None'}`);
    console.log('');
  }

  return { success: true, env, warnings };
}

/**
 * Get validated environment or exit process.
 * Use this at application startup.
 */
export function getValidatedEnv(): ValidatedEnv {
  const result = validateEnv({ exitOnError: true, silent: false });
  if (!result.success || !result.env) {
    throw new Error('Environment validation failed - this should never happen after exit check');
  }
  return result.env;
}

/**
 * Check if specific optional features are enabled.
 */
export function checkFeatureFlags(env: ValidatedEnv): {
  redisEnabled: boolean;
  slackEnabled: boolean;
  jiraEnabled: boolean;
  githubEnabled: boolean;
  aiEnabled: boolean;
  monitoringEnabled: boolean;
} {
  return {
    redisEnabled: !!env.REDIS_URL,
    slackEnabled: !!env.SLACK_BOT_TOKEN,
    jiraEnabled: !!(env.JIRA_HOST && env.JIRA_EMAIL && env.JIRA_API_TOKEN),
    githubEnabled: !!(env.GITHUB_TOKEN && env.githubRepos && env.githubRepos.length > 0),
    aiEnabled: !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY),
    monitoringEnabled: !!(env.DATADOG_API_KEY || env.SENTRY_DSN),
  };
}
