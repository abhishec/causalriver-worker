/**
 * Rate Limiter with Exponential Backoff
 * ======================================
 * Handles API rate limits for 10M+ scale ingestion.
 * Supports:
 * - Requests per second/minute/hour limits
 * - Exponential backoff on 429 errors
 * - Retry logic with jitter
 * - Token bucket algorithm
 */

export interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  backoffMultiplier?: number; // Default: 2
  maxRetries?: number; // Default: 3
  initialBackoffMs?: number; // Default: 1000
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly backoffMultiplier: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(config: RateLimitConfig) {
    // Convert to tokens per millisecond (most granular)
    if (config.requestsPerSecond) {
      this.capacity = config.requestsPerSecond;
      this.refillRate = config.requestsPerSecond / 1000; // per ms
    } else if (config.requestsPerMinute) {
      this.capacity = config.requestsPerMinute;
      this.refillRate = config.requestsPerMinute / 60000; // per ms
    } else if (config.requestsPerHour) {
      this.capacity = config.requestsPerHour;
      this.refillRate = config.requestsPerHour / 3600000; // per ms
    } else {
      // Default: 100 requests per minute
      this.capacity = 100;
      this.refillRate = 100 / 60000;
    }

    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.backoffMultiplier = config.backoffMultiplier || 2;
    this.maxRetries = config.maxRetries || 3;
    this.initialBackoffMs = config.initialBackoffMs || 1000;
  }

  /**
   * Execute a function with rate limiting
   * Automatically retries on 429 with exponential backoff
   */
  async throttle<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
    // Refill tokens based on time elapsed
    this.refillTokens();

    // Wait if no tokens available
    if (this.tokens < 1) {
      const waitTime = this.getWaitTime();
      await this.sleep(waitTime);
      this.refillTokens();
    }

    // Consume token
    this.tokens -= 1;

    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      // Handle 429 rate limit errors
      if (this.isRateLimitError(error) && retries < this.maxRetries) {
        const backoffTime = this.calculateBackoff(retries);
        console.log(`[RateLimiter] 429 detected, backing off for ${backoffTime}ms (retry ${retries + 1}/${this.maxRetries})`);
        await this.sleep(backoffTime);

        // Retry with exponential backoff
        return this.throttle(fn, retries + 1);
      }

      throw error;
    }
  }

  /**
   * Refill tokens based on elapsed time (token bucket)
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Calculate time to wait for next token
   */
  private getWaitTime(): number {
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  /**
   * Exponential backoff with jitter
   */
  private calculateBackoff(retryCount: number): number {
    const exponential = this.initialBackoffMs * Math.pow(this.backoffMultiplier, retryCount);
    const jitter = Math.random() * 0.3 * exponential; // 0-30% jitter
    return Math.ceil(exponential + jitter);
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    // HTTP 429
    if (error?.response?.status === 429) return true;
    if (error?.status === 429) return true;

    // GitHub specific
    if (error?.message?.includes('rate limit')) return true;
    if (error?.message?.includes('API rate limit exceeded')) return true;

    // Slack specific
    if (error?.error === 'rate_limited') return true;

    // Jira specific
    if (error?.message?.includes('Rate limit exceeded')) return true;

    return false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current token count (for monitoring)
   */
  getTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Reset tokens (useful for testing)
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Rate limiter for specific services
 */

export class GitHubRateLimiter extends RateLimiter {
  constructor() {
    super({
      requestsPerHour: 5000, // GitHub authenticated rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 2000,
    });
  }
}

export class SlackRateLimiter extends RateLimiter {
  constructor() {
    super({
      requestsPerMinute: 50, // Slack Tier 3 rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 1000,
    });
  }
}

export class JiraRateLimiter extends RateLimiter {
  constructor() {
    super({
      requestsPerSecond: 10, // Jira Cloud rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 1000,
    });
  }
}

export class FreshworksRateLimiter extends RateLimiter {
  constructor() {
    super({
      requestsPerMinute: 100, // Freshworks API limit
      backoffMultiplier: 2,
      maxRetries: 3,
      initialBackoffMs: 1000,
    });
  }
}
