/**
 * SE-aaS Production Service Layer
 * =================================
 *
 * Production-ready API service for Software Engineering as a Service.
 * Provides REST endpoints, authentication, rate limiting, monitoring, and job orchestration.
 *
 * Features:
 * - API authentication & authorization
 * - Rate limiting per user/org
 * - Error recovery with retry logic
 * - Job orchestration for async operations
 * - Metrics & monitoring
 * - Cost tracking (token usage)
 * - Database persistence
 *
 * @module orchestrator/se-aas-service
 */

import { createAgentRegistry, type AgentRegistry } from './agent-registry';
import { registerSoftwareEngineeringAgents } from './agents-software-engineering';
import { registerEnhancedSoftwareEngineeringDomains } from './action-domains-software-engineering-enhanced';
import { createRetry, createCircuitBreaker } from '../infra';
import { createLogger, createMetrics, type NexusLogger, type NexusMetrics } from '../observability';
import { createSupabaseRepository, type NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface SEaaSConfig {
  /** Supabase client for persistence */
  supabase?: any;
  /** Authentication provider */
  authProvider?: AuthProvider;
  /** Rate limiter configuration */
  rateLimit?: RateLimitConfig;
  /** Enable monitoring */
  enableMonitoring?: boolean;
  /** Logger instance */
  logger?: NexusLogger;
  /** Metrics instance */
  metrics?: NexusMetrics;
  /** Max concurrent jobs */
  maxConcurrentJobs?: number;
  /** Job timeout (ms) */
  jobTimeout?: number;
}

export interface AuthProvider {
  /** Validate API key */
  validateApiKey: (apiKey: string) => Promise<AuthContext>;
  /** Check if user has permission */
  hasPermission: (ctx: AuthContext, permission: string) => Promise<boolean>;
}

export interface AuthContext {
  userId: string;
  orgId: string;
  permissions: string[];
  quotas: {
    tokensPerDay: number;
    tokensUsedToday: number;
    requestsPerMinute: number;
  };
}

export interface RateLimitConfig {
  /** Requests per minute per user */
  requestsPerMinute: number;
  /** Tokens per day per org */
  tokensPerDay: number;
  /** Concurrent requests per user */
  maxConcurrentPerUser: number;
}

export interface JobRequest {
  /** Job type */
  type: 'code-review' | 'feature-build' | 'codebase-analysis' | 'tech-debt-audit';
  /** Input parameters */
  input: Record<string, any>;
  /** User context */
  auth: AuthContext;
  /** Callback webhook URL */
  webhookUrl?: string;
  /** Priority (1-10, higher = more important) */
  priority?: number;
}

export interface JobResult {
  /** Job ID */
  jobId: string;
  /** Job status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Result data */
  result?: any;
  /** Error message if failed */
  error?: string;
  /** Progress (0-100) */
  progress: number;
  /** Tokens used */
  tokensUsed: number;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** Completed timestamp */
  completedAt?: string;
}

export interface SEaaSMetrics {
  /** Total requests processed */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Total tokens used */
  totalTokensUsed: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Active jobs */
  activeJobs: number;
  /** Queue depth */
  queueDepth: number;
}

// ============================================================================
// SE-AAS SERVICE
// ============================================================================

export class SEaaSService {
  private registry: AgentRegistry;
  private repository: NexusRepository | null = null;
  private authProvider: AuthProvider | null;
  private rateLimit: RateLimitConfig;
  private logger: NexusLogger;
  private metrics: NexusMetrics;
  private jobs: Map<string, JobResult> = new Map();
  private jobQueue: JobRequest[] = [];
  private activeJobs = 0;
  private maxConcurrentJobs: number;
  private jobTimeout: number;
  private rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(config: SEaaSConfig = {}) {
    // Initialize registry with SE agents
    this.registry = createAgentRegistry({ verbose: false });
    registerSoftwareEngineeringAgents(this.registry);
    registerEnhancedSoftwareEngineeringDomains(this.registry);

    // Initialize persistence if provided
    if (config.supabase) {
      this.repository = createSupabaseRepository({ supabase: config.supabase });
    }

    // Initialize auth
    this.authProvider = config.authProvider || null;

    // Initialize rate limiting
    this.rateLimit = config.rateLimit || {
      requestsPerMinute: 100,
      tokensPerDay: 100000,
      maxConcurrentPerUser: 5,
    };

    // Initialize monitoring
    this.logger = config.logger || createLogger({ level: 'info' });
    this.metrics = config.metrics || createMetrics();

    // Job configuration
    this.maxConcurrentJobs = config.maxConcurrentJobs || 10;
    this.jobTimeout = config.jobTimeout || 300000; // 5 minutes

    // Start job processor
    this.startJobProcessor();

    this.logger.info('SE-aaS service initialized', {
      maxConcurrentJobs: this.maxConcurrentJobs,
      rateLimit: this.rateLimit,
    });
  }

  /**
   * Code Review API
   * POST /api/v1/code-review
   */
  async codeReview(request: {
    pullRequestId: string;
    changedFiles: string[];
    description: string;
    apiKey: string;
    webhookUrl?: string;
  }): Promise<JobResult> {
    // Authenticate
    const auth = await this.authenticate(request.apiKey);

    // Check rate limits
    await this.checkRateLimit(auth);

    // Create job
    const jobRequest: JobRequest = {
      type: 'code-review',
      input: {
        pullRequestId: request.pullRequestId,
        changedFiles: request.changedFiles,
        description: request.description,
      },
      auth,
      webhookUrl: request.webhookUrl,
      priority: 5,
    };

    return this.enqueueJob(jobRequest);
  }

  /**
   * Feature Build API
   * POST /api/v1/feature-build
   */
  async featureBuild(request: {
    specification: string;
    language: string;
    framework?: string;
    patterns?: string[];
    apiKey: string;
    webhookUrl?: string;
  }): Promise<JobResult> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    const jobRequest: JobRequest = {
      type: 'feature-build',
      input: {
        specification: request.specification,
        language: request.language,
        framework: request.framework,
        patterns: request.patterns,
      },
      auth,
      webhookUrl: request.webhookUrl,
      priority: 7,
    };

    return this.enqueueJob(jobRequest);
  }

  /**
   * Codebase Analysis API
   * POST /api/v1/codebase-analysis
   */
  async codebaseAnalysis(request: {
    repositoryUrl: string;
    branch?: string;
    apiKey: string;
    webhookUrl?: string;
  }): Promise<JobResult> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    const jobRequest: JobRequest = {
      type: 'codebase-analysis',
      input: {
        repositoryUrl: request.repositoryUrl,
        branch: request.branch || 'main',
      },
      auth,
      webhookUrl: request.webhookUrl,
      priority: 3,
    };

    return this.enqueueJob(jobRequest);
  }

  /**
   * Tech Debt Audit API
   * POST /api/v1/tech-debt-audit
   */
  async techDebtAudit(request: {
    scope?: string;
    apiKey: string;
    webhookUrl?: string;
  }): Promise<JobResult> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    const jobRequest: JobRequest = {
      type: 'tech-debt-audit',
      input: {
        scope: request.scope,
      },
      auth,
      webhookUrl: request.webhookUrl,
      priority: 4,
    };

    return this.enqueueJob(jobRequest);
  }

  /**
   * Get Job Status
   * GET /api/v1/jobs/:jobId
   */
  async getJobStatus(jobId: string, apiKey: string): Promise<JobResult> {
    const auth = await this.authenticate(apiKey);

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Verify user owns this job
    if (job.result?.auth?.userId !== auth.userId) {
      throw new Error('Unauthorized');
    }

    return job;
  }

  /**
   * Get Service Metrics
   * GET /api/v1/metrics
   */
  async getMetrics(apiKey: string): Promise<SEaaSMetrics> {
    const auth = await this.authenticate(apiKey);

    // Check permission
    if (this.authProvider) {
      const hasPermission = await this.authProvider.hasPermission(auth, 'metrics.read');
      if (!hasPermission) {
        throw new Error('Unauthorized: metrics.read permission required');
      }
    }

    const snapshot = this.metrics.snapshot();

    return {
      totalRequests: snapshot.counters['seaas.requests.total'] || 0,
      successfulRequests: snapshot.counters['seaas.requests.success'] || 0,
      failedRequests: snapshot.counters['seaas.requests.failed'] || 0,
      totalTokensUsed: snapshot.counters['seaas.tokens.used'] || 0,
      avgResponseTime: snapshot.histograms['seaas.response.time']?.mean || 0,
      activeJobs: this.activeJobs,
      queueDepth: this.jobQueue.length,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async authenticate(apiKey: string): Promise<AuthContext> {
    if (!this.authProvider) {
      // Default auth context for development
      return {
        userId: 'dev-user',
        orgId: 'dev-org',
        permissions: ['*'],
        quotas: {
          tokensPerDay: 1000000,
          tokensUsedToday: 0,
          requestsPerMinute: 1000,
        },
      };
    }

    try {
      const ctx = await this.authProvider.validateApiKey(apiKey);
      this.logger.debug('Authenticated user', { userId: ctx.userId, orgId: ctx.orgId });
      return ctx;
    } catch (error: any) {
      this.logger.warn('Authentication failed', { error: error.message });
      throw new Error('Invalid API key');
    }
  }

  private async checkRateLimit(auth: AuthContext): Promise<void> {
    const key = `${auth.orgId}:${auth.userId}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    let bucket = this.rateLimitStore.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.rateLimitStore.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > this.rateLimit.requestsPerMinute) {
      const resetIn = Math.ceil((bucket.resetAt - now) / 1000);
      throw new Error(`Rate limit exceeded. Try again in ${resetIn}s`);
    }

    // Check token quota
    if (auth.quotas.tokensUsedToday >= auth.quotas.tokensPerDay) {
      throw new Error('Daily token quota exceeded');
    }

    this.logger.debug('Rate limit check passed', {
      userId: auth.userId,
      count: bucket.count,
      limit: this.rateLimit.requestsPerMinute,
    });
  }

  private async enqueueJob(request: JobRequest): Promise<JobResult> {
    const jobId = this.generateJobId();

    const job: JobResult = {
      jobId,
      status: 'pending',
      progress: 0,
      tokensUsed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: { auth: request.auth }, // Store auth for ownership check
    };

    this.jobs.set(jobId, job);
    this.jobQueue.push(request);

    // Sort by priority
    this.jobQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.logger.info('Job enqueued', {
      jobId,
      type: request.type,
      queueDepth: this.jobQueue.length,
      priority: request.priority,
    });

    this.metrics.increment('seaas.jobs.enqueued');
    this.metrics.gauge('seaas.queue.depth', this.jobQueue.length);

    // Persist job if repository available
    if (this.repository) {
      await this.persistJob(job, request);
    }

    return job;
  }

  private async processJob(request: JobRequest, job: JobResult): Promise<void> {
    const startTime = Date.now();

    try {
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      this.updateJob(job);

      this.logger.info('Processing job', { jobId: job.jobId, type: request.type });

      // Execute agent based on job type
      let result: any;

      switch (request.type) {
        case 'code-review':
          result = await this.executeWithRetry(() =>
            this.registry.runAgent('brain-code-reviewer', request.input)
          );
          break;

        case 'feature-build':
          result = await this.executeWithRetry(() =>
            this.registry.runAgent('brain-feature-builder', request.input)
          );
          break;

        case 'codebase-analysis':
          result = await this.executeWithRetry(() =>
            this.registry.runAgent('brain-codebase-mapper', request.input)
          );
          break;

        case 'tech-debt-audit':
          result = await this.executeWithRetry(() =>
            this.registry.runAgent('brain-tech-debt-optimizer', request.input)
          );
          break;

        default:
          throw new Error(`Unknown job type: ${request.type}`);
      }

      // Update job with result
      job.status = 'completed';
      job.result = result;
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      // Track tokens used
      if (result.metadata?.tokensUsed) {
        job.tokensUsed = result.metadata.tokensUsed;
        this.metrics.increment('seaas.tokens.used', job.tokensUsed);
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('seaas.response.time', duration);
      this.metrics.increment('seaas.requests.success');

      this.logger.info('Job completed', {
        jobId: job.jobId,
        type: request.type,
        duration,
        tokensUsed: job.tokensUsed,
      });

      // Send webhook if provided
      if (request.webhookUrl) {
        await this.sendWebhook(request.webhookUrl, job);
      }
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.updatedAt = new Date().toISOString();

      this.metrics.increment('seaas.requests.failed');

      this.logger.error('Job failed', {
        jobId: job.jobId,
        type: request.type,
        error: error.message,
      });

      // Send webhook for failure
      if (request.webhookUrl) {
        await this.sendWebhook(request.webhookUrl, job);
      }
    } finally {
      this.updateJob(job);

      // Persist final result
      if (this.repository) {
        await this.persistJob(job, request);
      }
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const retry = createRetry({
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoff: 'exponential',
    });

    return retry.execute(fn);
  }

  private updateJob(job: JobResult): void {
    this.jobs.set(job.jobId, job);
  }

  private async persistJob(job: JobResult, request: JobRequest): Promise<void> {
    if (!this.repository) return;

    try {
      // Store in activity log
      await this.repository.logActivity({
        user_id: request.auth.userId,
        org_id: request.auth.orgId,
        action_type: `seaas.${request.type}`,
        entity_type: 'job',
        entity_id: job.jobId,
        metadata: {
          status: job.status,
          progress: job.progress,
          tokensUsed: job.tokensUsed,
          result: job.result,
          error: job.error,
        },
      });
    } catch (error: any) {
      this.logger.warn('Failed to persist job', { jobId: job.jobId, error: error.message });
    }
  }

  private async sendWebhook(url: string, job: JobResult): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }

      this.logger.debug('Webhook sent', { jobId: job.jobId, url });
    } catch (error: any) {
      this.logger.warn('Webhook delivery failed', {
        jobId: job.jobId,
        url,
        error: error.message,
      });
    }
  }

  private startJobProcessor(): void {
    setInterval(() => {
      if (this.activeJobs >= this.maxConcurrentJobs) {
        return;
      }

      const request = this.jobQueue.shift();
      if (!request) {
        return;
      }

      const job = Array.from(this.jobs.values()).find(
        j => j.status === 'pending' && j.result?.auth?.userId === request.auth.userId
      );

      if (!job) {
        this.logger.warn('Job not found for request', { type: request.type });
        return;
      }

      this.activeJobs++;
      this.metrics.gauge('seaas.jobs.active', this.activeJobs);

      this.processJob(request, job)
        .catch(error => {
          this.logger.error('Job processor error', { error: error.message });
        })
        .finally(() => {
          this.activeJobs--;
          this.metrics.gauge('seaas.jobs.active', this.activeJobs);
        });
    }, 1000); // Check every second
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create SE-aaS service instance
 */
export function createSEaaSService(config?: SEaaSConfig): SEaaSService {
  return new SEaaSService(config);
}
