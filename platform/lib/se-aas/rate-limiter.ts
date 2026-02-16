/**
 * Rate Limiter for SE-aaS Job Queue
 *
 * Prevents unbounded API usage with sliding window rate limiting
 *
 * @module lib/se-aas/rate-limiter
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitConfig {
  jobsPerHour: number;
  jobsPerDay: number;
  tokensPerDay?: number;
  claudeCallsPerHour?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds
}

const DEFAULT_LIMITS: RateLimitConfig = {
  jobsPerHour: 100,
  jobsPerDay: 1000,
  tokensPerDay: 100000,
  claudeCallsPerHour: 500,
};

/**
 * Check if request is within rate limits
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  organizationId: string,
  limitType: 'jobs' | 'tokens' | 'claude_calls' = 'jobs'
): Promise<RateLimitResult> {
  // Get organization's rate limits
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('rate_limits')
    .eq('organization_id', organizationId)
    .single();

  const limits: RateLimitConfig = {
    ...DEFAULT_LIMITS,
    ...(orgSettings?.rate_limits as Partial<RateLimitConfig> || {}),
  };

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Count recent usage
  const { count: hourlyCount, error: hourlyError } = await supabase
    .from('se_aas_rate_limit_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('limit_type', limitType)
    .gte('created_at', oneHourAgo.toISOString());

  const { count: dailyCount, error: dailyError } = await supabase
    .from('se_aas_rate_limit_tracking')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('limit_type', limitType)
    .gte('created_at', oneDayAgo.toISOString());

  if (hourlyError || dailyError) {
    throw new Error('Failed to check rate limits');
  }

  // Determine limits based on type
  let hourlyLimit: number;
  let dailyLimit: number;

  switch (limitType) {
    case 'jobs':
      hourlyLimit = limits.jobsPerHour;
      dailyLimit = limits.jobsPerDay;
      break;
    case 'claude_calls':
      hourlyLimit = limits.claudeCallsPerHour || 500;
      dailyLimit = limits.claudeCallsPerHour ? limits.claudeCallsPerHour * 24 : 10000;
      break;
    case 'tokens':
      hourlyLimit = (limits.tokensPerDay || 100000) / 24;
      dailyLimit = limits.tokensPerDay || 100000;
      break;
  }

  // Check hourly limit
  if ((hourlyCount || 0) >= hourlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oneHourAgo.getTime() + 60 * 60 * 1000),
      retryAfter: Math.ceil((oneHourAgo.getTime() + 60 * 60 * 1000 - now.getTime()) / 1000),
    };
  }

  // Check daily limit
  if ((dailyCount || 0) >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oneDayAgo.getTime() + 24 * 60 * 60 * 1000),
      retryAfter: Math.ceil((oneDayAgo.getTime() + 24 * 60 * 60 * 1000 - now.getTime()) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: Math.min(hourlyLimit - (hourlyCount || 0), dailyLimit - (dailyCount || 0)),
    resetAt: new Date(oneHourAgo.getTime() + 60 * 60 * 1000),
  };
}

/**
 * Record rate limit usage
 */
export async function recordRateLimitUsage(
  supabase: SupabaseClient,
  organizationId: string,
  limitType: 'jobs' | 'tokens' | 'claude_calls',
  count: number = 1
): Promise<void> {
  await supabase.from('se_aas_rate_limit_tracking').insert({
    organization_id: organizationId,
    limit_type: limitType,
    count,
    created_at: new Date().toISOString(),
  });
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  jobs: RateLimitResult;
  claudeCalls: RateLimitResult;
}> {
  const [jobs, claudeCalls] = await Promise.all([
    checkRateLimit(supabase, organizationId, 'jobs'),
    checkRateLimit(supabase, organizationId, 'claude_calls'),
  ]);

  return { jobs, claudeCalls };
}

/**
 * Cleanup old rate limit tracking records (run daily)
 */
export async function cleanupRateLimitTracking(
  supabase: SupabaseClient
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { count } = await supabase
    .from('se_aas_rate_limit_tracking')
    .delete()
    .lt('created_at', sevenDaysAgo.toISOString());

  return count || 0;
}
