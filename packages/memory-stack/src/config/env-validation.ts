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
 * Required environment variables for core functionality
 */
const RequiredEnvSchema = z.object({
  // Supabase (required)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  // Accept either SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_KEY: z.string().min(32, 'SUPABASE_KEY must be at least 32 characters').optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32).optional(),

  // Organization ID (required)
  ORGANIZATION_ID: z.string().min(1, 'ORGANIZATION_ID is required'),
}).refine(
  (data) => data.SUPABASE_KEY || data.SUPABASE_SERVICE_ROLE_KEY,
  { message: 'Either SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY is required', path: ['SUPABASE_KEY'] }
);

/**
 * Optional but recommended environment variables
 */
const OptionalEnvSchema = z.object({
  // Redis (highly recommended for 10M+ scale)
  REDIS_URL: z.string().url().optional(),

  // Connectors (required for motor commands)
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),
  JIRA_HOST: z.string().url().optional(),
  JIRA_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().startsWith('ghp_').or(z.string().startsWith('gho_')).optional(),
  GITHUB_REPOS: z.string().optional(), // Comma-separated list

  // LLM Providers (for AI features)
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),

  // Monitoring
  DATADOG_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

/**
 * Complete environment schema
 */
const EnvSchema = RequiredEnvSchema.merge(OptionalEnvSchema);

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

  // Parse required variables
  const requiredResult = RequiredEnvSchema.safeParse(process.env);
  if (!requiredResult.success) {
    for (const issue of requiredResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Parse optional variables
  const optionalResult = OptionalEnvSchema.safeParse(process.env);

  // Check for recommended but missing variables
  if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL not set - Deduplication and caching will be disabled. This impacts 10M+ scale performance.');
  }

  if (!process.env.SLACK_BOT_TOKEN && !process.env.JIRA_API_TOKEN && !process.env.GITHUB_TOKEN) {
    warnings.push('No connector tokens set - Motor command execution will be unavailable.');
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    warnings.push('No LLM API keys set - AI-powered features will be unavailable.');
  }

  // If critical errors exist, handle them
  if (errors.length > 0) {
    if (!silent) {
      console.error('\n❌ Environment Validation Failed:\n');
      errors.forEach(err => console.error(`  • ${err}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.\n');
    }

    if (exitOnError && process.env.NODE_ENV === 'production') {
      process.exit(1);
    }

    return { success: false, errors, warnings };
  }

  // Parse complete environment
  const fullResult = EnvSchema.safeParse(process.env);
  if (!fullResult.success) {
    // Should never happen if required validation passed, but be defensive
    return { success: false, errors: ['Unexpected validation error'], warnings };
  }

  // Post-process environment
  const env: ValidatedEnv = {
    ...fullResult.data,
    githubRepos: fullResult.data.GITHUB_REPOS?.split(',').map(r => r.trim()),
  };

  // Print warnings if any
  if (!silent && warnings.length > 0) {
    console.warn('\n⚠️  Environment Warnings:\n');
    warnings.forEach(warn => console.warn(`  • ${warn}`));
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
