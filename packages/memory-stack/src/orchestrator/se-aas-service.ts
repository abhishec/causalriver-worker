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
import {
  ReleaseTracker,
  getReleaseByName,
  listActiveReleases,
  type ReleaseConfig,
  type ReleaseEntity,
  type ReleaseReadiness,
  type VelocityByDrop,
  type CommitDiff,
} from '../connectors/release-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface SEaaSConfig {
  /** Supabase client for persistence */
  supabase?: any;
  /** Organization ID for persistence scoping */
  organizationId?: string;
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
  /** Brain Agent Runtime — when provided, P1 jobs route through full L1-L30 brain stack */
  brainAgentRuntime?: import('./brain-agent-runtime').BrainAgentRuntimeInstance;
  /** Anthropic API key for brain agents */
  anthropicApiKey?: string;
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
  private brainAgentRuntime: import('./brain-agent-runtime').BrainAgentRuntimeInstance | null = null;
  private anthropicApiKey: string | null = null;
  private organizationId: string;
  private _jobProcessorInterval: ReturnType<typeof setInterval> | null = null;
  private _supabase: any | null = null;

  constructor(config: SEaaSConfig = {}) {
    // Initialize registry with SE agents
    this.registry = createAgentRegistry({ verbose: false });
    registerSoftwareEngineeringAgents(this.registry);
    registerEnhancedSoftwareEngineeringDomains(this.registry);

    // Initialize persistence if provided
    if (config.supabase) {
      this._supabase = config.supabase;
      this.repository = createSupabaseRepository(config.supabase, config.organizationId || 'default');
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

    // Brain Agent Runtime (L1-L30 powered execution)
    this.brainAgentRuntime = config.brainAgentRuntime || null;
    this.anthropicApiKey = config.anthropicApiKey || null;
    this.organizationId = config.organizationId || 'default';

    // Start job processor
    this.startJobProcessor();

    this.logger.info('SE-aaS service initialized', {
      maxConcurrentJobs: this.maxConcurrentJobs,
      rateLimit: this.rateLimit,
      brainAgentEnabled: !!this.brainAgentRuntime,
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

  // ============================================================================
  // RELEASE TRACKING QUERY HANDLERS (Track 2)
  // ============================================================================

  /**
   * SE-aaS Release Query 1: releaseGetTickets
   * GET /api/v1/releases/:releaseId/tickets
   *
   * "What Jira tickets are in the 5.11.5 Drop 1?"
   * Returns all Jira tickets linked to a release entity, with status / assignee.
   */
  async releaseGetTickets(request: {
    releaseId: string;
    releaseConfig: ReleaseConfig;
    apiKey: string;
  }): Promise<Array<{ key: string; summary: string; status: string; issue_type: string; assignee: string | null }>> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    const tracker = new ReleaseTracker(this.getSupabase()!, request.releaseConfig);
    const tickets = await tracker.getTicketsForVersion(request.releaseId);

    this.logger.info('releaseGetTickets completed', {
      releaseId: request.releaseId,
      count: tickets.length,
    });
    this.metrics.increment('seaas.release.tickets.query');

    return tickets;
  }

  /**
   * SE-aaS Release Query 2: releaseGetDiff
   * GET /api/v1/releases/:releaseId/diff
   *
   * "What changed between 5.11.4.3 and 5.11.5?"
   * Returns all commits linked to the release via github_compare.
   */
  async releaseGetDiff(request: {
    releaseId: string;
    releaseConfig: ReleaseConfig;
    apiKey: string;
  }): Promise<CommitDiff[]> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    const tracker = new ReleaseTracker(this.getSupabase()!, request.releaseConfig);
    const diff = await tracker.getCommitsDiff(request.releaseId);

    this.logger.info('releaseGetDiff completed', {
      releaseId: request.releaseId,
      commits: diff.length,
    });
    this.metrics.increment('seaas.release.diff.query');

    return diff;
  }

  /**
   * SE-aaS Release Query 3: releaseGetVelocityByDrop
   * GET /api/v1/releases/:releaseName/velocity
   *
   * "Show me Team B's velocity per drop"
   * Returns PR merge counts and ticket resolution counts broken down per drop window.
   */
  async releaseGetVelocityByDrop(request: {
    releaseName: string;
    releaseConfig: ReleaseConfig;
    apiKey: string;
  }): Promise<VelocityByDrop> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    const tracker = new ReleaseTracker(this.getSupabase()!, request.releaseConfig);
    const velocity = await tracker.getTeamVelocityByDrop();

    this.logger.info('releaseGetVelocityByDrop completed', {
      releaseName: request.releaseName,
      drops: velocity.drops.length,
    });
    this.metrics.increment('seaas.release.velocity.query');

    return velocity;
  }

  /**
   * SE-aaS Release Query 4: releaseGetReadiness
   * GET /api/v1/releases/:releaseId/readiness
   *
   * "What is the release readiness score for 6.3.4?"
   * Returns a 0–100 score (red / amber / green) based on:
   *   50% ticket resolution + 30% PR merge rate + 20% team activity.
   */
  async releaseGetReadiness(request: {
    releaseId: string;
    releaseConfig: ReleaseConfig;
    apiKey: string;
  }): Promise<ReleaseReadiness> {
    const auth = await this.authenticate(request.apiKey);
    await this.checkRateLimit(auth);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    const tracker = new ReleaseTracker(this.getSupabase()!, request.releaseConfig);
    const readiness = await tracker.getReleaseReadiness(request.releaseId);

    this.logger.info('releaseGetReadiness completed', {
      releaseId: request.releaseId,
      score: readiness.readinessScore,
      label: readiness.readinessLabel,
    });
    this.metrics.increment('seaas.release.readiness.query');

    return readiness;
  }

  /**
   * List all active releases for the organisation.
   * GET /api/v1/releases
   */
  async listActiveReleases(apiKey: string): Promise<ReleaseEntity[]> {
    await this.authenticate(apiKey);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    const releases = await listActiveReleases(this.getSupabase()!, this.organizationId);
    this.logger.info('listActiveReleases completed', { count: releases.length });
    this.metrics.increment('seaas.release.list.query');

    return releases;
  }

  /**
   * Look up a release by name and return the entity.
   * GET /api/v1/releases/by-name/:releaseName
   */
  async getReleaseByName(releaseName: string, apiKey: string): Promise<ReleaseEntity | null> {
    await this.authenticate(apiKey);

    if (!this.getSupabase()) {
      throw new Error('Supabase client is required for release query handlers');
    }

    return getReleaseByName(this.getSupabase()!, this.organizationId, releaseName);
  }

  /** Internal helper — returns the raw Supabase client (may be null) */
  private getSupabase(): any | null {
    return this._supabase;
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
   * Approve or reject a Brain Agent action that is pending human approval.
   * POST /api/v1/agents/:executionId/approve
   */
  async approveAgentAction(request: {
    executionId: string;
    approved: boolean;
    feedback?: string;
    apiKey: string;
  }): Promise<{ success: boolean; message: string }> {
    await this.authenticate(request.apiKey);

    if (!this.brainAgentRuntime) {
      throw new Error('Brain Agent Runtime is not configured');
    }

    await this.brainAgentRuntime.approveAction(
      request.executionId,
      request.approved,
      request.feedback
    );

    this.logger.info('Agent action approval processed', {
      executionId: request.executionId,
      approved: request.approved,
    });

    return {
      success: true,
      message: request.approved
        ? `Execution ${request.executionId} approved — action will proceed`
        : `Execution ${request.executionId} rejected`,
    };
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

    // Extract counter/histogram values from snapshot.metrics array
    const findMetricValue = (name: string): number => {
      const m = snapshot.metrics.find(metric => metric.name === name);
      return m && 'value' in m ? (m as { value: number }).value : 0;
    };

    return {
      totalRequests: findMetricValue('seaas.requests.total'),
      successfulRequests: findMetricValue('seaas.requests.success'),
      failedRequests: findMetricValue('seaas.requests.failed'),
      totalTokensUsed: findMetricValue('seaas.tokens.used'),
      avgResponseTime: 0, // Histogram mean not directly available from snapshot
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

  /** Map SE-aaS job types to Brain Agent IDs */
  private static readonly JOB_TYPE_TO_AGENT_ID: Record<string, string> = {
    'code-review': 'code-reviewer',
    'feature-build': 'feature-builder',
    'codebase-analysis': 'codebase-mapper',
    'tech-debt-audit': 'tech-debt-auditor',
  };

  /** Map SE-aaS job types to legacy agent registry names */
  private static readonly JOB_TYPE_TO_LEGACY_AGENT: Record<string, string> = {
    'code-review': 'brain-code-reviewer',
    'feature-build': 'brain-feature-builder',
    'codebase-analysis': 'brain-codebase-mapper',
    'tech-debt-audit': 'brain-tech-debt-optimizer',
  };

  private async processJob(request: JobRequest, job: JobResult): Promise<void> {
    const startTime = Date.now();

    try {
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      this.updateJob(job);

      this.logger.info('Processing job', { jobId: job.jobId, type: request.type });

      let result: any;

      // Route through Brain Agent Runtime (full L1-L30) when available
      if (this.brainAgentRuntime) {
        result = await this.processViaBrainAgentRuntime(request, job);
      } else {
        // Fallback: legacy agent registry path (no brain stack)
        result = await this.processViaLegacyRegistry(request);
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
      this.metrics.observe('seaas.response.time', duration);
      this.metrics.increment('seaas.requests.success');

      this.logger.info('Job completed', {
        jobId: job.jobId,
        type: request.type,
        duration,
        tokensUsed: job.tokensUsed,
        brainPowered: !!this.brainAgentRuntime,
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

  /**
   * Process job through Brain Agent Runtime — full L1-L30 cognitive cycle.
   * All 30 brain layers execute, output is weighted per agent config,
   * and composite confidence determines auto-execute vs pending-approval.
   */
  private async processViaBrainAgentRuntime(
    request: JobRequest,
    job: JobResult
  ): Promise<any> {
    const agentId = SEaaSService.JOB_TYPE_TO_AGENT_ID[request.type];
    if (!agentId) {
      throw new Error(`No brain agent mapping for job type: ${request.type}`);
    }

    this.logger.info('Routing through Brain Agent Runtime (L1-L30)', {
      jobId: job.jobId,
      agentId,
      type: request.type,
    });

    const brainResult = await this.executeWithRetry(() =>
      this.brainAgentRuntime!.execute({
        agentId,
        input: request.input as Record<string, unknown>,
        anthropicApiKey: this.anthropicApiKey || undefined,
      })
    );

    // Handle pending-approval status — job stays "running" until approved
    if (brainResult.status === 'pending-approval') {
      this.logger.info('Brain agent requires human approval', {
        jobId: job.jobId,
        agentId,
        executionId: brainResult.executionId,
        confidence: brainResult.confidence,
      });

      return {
        ...brainResult,
        metadata: {
          tokensUsed: brainResult.metrics.tokensUsed,
          brainPowered: true,
          executionId: brainResult.executionId,
          requiresApproval: true,
          compositeConfidence: brainResult.confidence,
          layersExecuted: 30,
        },
      };
    }

    // Auto-executed — return full result
    return {
      ...brainResult,
      metadata: {
        tokensUsed: brainResult.metrics.tokensUsed,
        brainPowered: true,
        executionId: brainResult.executionId,
        compositeConfidence: brainResult.confidence,
        layersExecuted: 30,
        autoExecuted: true,
      },
    };
  }

  /**
   * Legacy path — uses agent registry directly (no brain stack).
   * Backward compatible fallback when brainAgentRuntime is not configured.
   */
  private async processViaLegacyRegistry(request: JobRequest): Promise<any> {
    const agentName = SEaaSService.JOB_TYPE_TO_LEGACY_AGENT[request.type];
    if (!agentName) {
      throw new Error(`Unknown job type: ${request.type}`);
    }

    return this.executeWithRetry(() =>
      this.registry.runAgent(agentName, request.input)
    );
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const retry = createRetry({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
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
        agentType: 'seaas',
        actionType: `seaas.${request.type}`,
        inputSummary: `Job ${job.jobId} — ${request.type}`,
        outputSummary: `Status: ${job.status}, Progress: ${job.progress}%`,
        tokensUsed: job.tokensUsed,
        metadata: {
          userId: request.auth.userId,
          orgId: request.auth.orgId,
          jobId: job.jobId,
          status: job.status,
          progress: job.progress,
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

  /** Stop the job processor interval to prevent memory leaks */
  shutdown(): void {
    if (this._jobProcessorInterval) {
      clearInterval(this._jobProcessorInterval);
      this._jobProcessorInterval = null;
    }
  }

  private startJobProcessor(): void {
    this._jobProcessorInterval = setInterval(() => {
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
