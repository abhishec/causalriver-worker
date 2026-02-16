/**
 * Generic CI/CD Signal Ingestor
 *
 * Normalizes CI/CD events from any provider (Jenkins, CircleCI, GitLab CI,
 * Buildkite, etc.) into standard NexusBrain ConnectorSignals.
 *
 * Teams use many CI/CD providers. This ensures all build/deploy events
 * feed into the same causal graph regardless of provider.
 *
 * Supports:
 *   - Normalized event ingestion via CICDEvent
 *   - Per-provider webhook parsers (Jenkins, CircleCI, GitLab, Buildkite)
 *   - Automatic signal_type mapping (ci_passed, ci_failed, deploy_success, etc.)
 *
 * @example
 * ```typescript
 * const ingestor = createCICDIngestor();
 * const event = ingestor.parseWebhook('jenkins', jenkinsPayload);
 * if (event) {
 *   const signals = ingestor.normalizeEvent(event, 'org_123');
 *   await storeConnectorSignals(supabase, signals);
 * }
 * ```
 */

import type { ConnectorSignal } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export type CICDProvider = 'github_actions' | 'github' | 'jenkins' | 'circleci' | 'gitlab_ci' | 'gitlab' | 'buildkite' | 'custom';

export type CICDEventType = 'build_started' | 'build_completed' | 'deploy_started' | 'deploy_completed' | 'test_completed';

export type CICDStatus = 'success' | 'failure' | 'cancelled' | 'running';

export interface CICDFailureDetails {
  /** Primary error message from the build/test output */
  errorMessage?: string;
  /** Stack trace or build log excerpt */
  stackTrace?: string;
  /** List of failed test names/paths */
  failedTests?: string[];
  /** Assertion error messages (extracted from test output) */
  assertionErrors?: string[];
  /** Exit code of the failed process */
  exitCode?: number;
  /** The build step/stage that failed */
  failedStep?: string;
}

export interface CICDEvent {
  provider: CICDProvider;
  eventType: CICDEventType;
  pipelineName: string;
  jobName?: string;
  status: CICDStatus;
  gitRef?: string;
  gitSha?: string;
  durationSeconds?: number;
  environment?: string;
  triggeredBy?: string;
  providerMetadata?: Record<string, unknown>;
  /** Detailed failure information for CI_failed/test_failed events (UC2: Debugging Assistant) */
  failureDetails?: CICDFailureDetails;
}

export interface CICDIngestorConfig {
  defaultOrgId?: string;
}

export interface CICDIngestor {
  normalizeEvent(event: CICDEvent, organizationId: string): ConnectorSignal[];
  parseWebhook(provider: CICDProvider, payload: unknown): CICDEvent | null;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createCICDIngestor(config?: CICDIngestorConfig): CICDIngestor {
  function normalizeEvent(event: CICDEvent, organizationId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];
    const orgId = organizationId || config?.defaultOrgId || '';

    const baseMetadata: Record<string, unknown> = {
      provider: event.provider,
      pipeline: event.pipelineName,
      ...(event.jobName && { job_name: event.jobName }),
      ...(event.gitRef && { git_ref: event.gitRef }),
      ...(event.gitSha && { git_sha: event.gitSha }),
      ...(event.durationSeconds != null && { duration_seconds: event.durationSeconds }),
      ...(event.environment && { environment: event.environment }),
      ...(event.triggeredBy && { triggered_by: event.triggeredBy }),
      ...(event.providerMetadata && { provider_metadata: event.providerMetadata }),
      ...(event.failureDetails && { failure_details: event.failureDetails }),
    };

    const isDeploy = event.eventType === 'deploy_started' || event.eventType === 'deploy_completed';

    switch (event.eventType) {
      case 'build_completed': {
        if (event.status === 'success') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'ci_passed',
            signal_value: 1,
            entity_type: 'ci_run',
            entity_id: `ci_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        } else if (event.status === 'failure') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'ci_failed',
            signal_value: -1,
            entity_type: 'ci_run',
            entity_id: `ci_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        }
        break;
      }

      case 'deploy_completed': {
        if (event.status === 'success') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'deploy_success',
            signal_value: 1,
            entity_type: 'deployment',
            entity_id: `deploy_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        } else if (event.status === 'failure') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'deploy_failure',
            signal_value: -1,
            entity_type: 'deployment',
            entity_id: `deploy_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        }
        break;
      }

      case 'test_completed': {
        if (event.status === 'failure') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'test_failed',
            signal_value: -0.8,
            entity_type: 'ci_run',
            entity_id: `test_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        } else if (event.status === 'success') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.cicd',
            signal_type: 'test_passed',
            signal_value: 0.8,
            entity_type: 'ci_run',
            entity_id: `test_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
            metadata: baseMetadata,
          });
        }
        break;
      }

      case 'build_started':
      case 'deploy_started': {
        // Emit started signals for tracking duration metrics
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.cicd',
          signal_type: isDeploy ? 'deploy_started' : 'build_started',
          signal_value: 0,
          entity_type: isDeploy ? 'deployment' : 'ci_run',
          entity_id: `${isDeploy ? 'deploy' : 'ci'}_${event.provider}_${event.pipelineName}_${event.gitSha || Date.now()}`,
          metadata: baseMetadata,
        });
        break;
      }
    }

    return signals;
  }

  function parseWebhook(provider: CICDProvider, payload: unknown): CICDEvent | null {
    if (!payload || typeof payload !== 'object') return null;

    // Normalize provider aliases
    const normalizedProvider = provider === 'gitlab' ? 'gitlab_ci'
      : provider === 'github' ? 'github_actions'
      : provider;

    switch (normalizedProvider) {
      case 'jenkins':
        return parseJenkinsWebhook(payload as Record<string, any>);
      case 'circleci':
        return parseCircleCIWebhook(payload as Record<string, any>);
      case 'gitlab_ci':
        return parseGitLabWebhook(payload as Record<string, any>);
      case 'buildkite':
        return parseBuildkiteWebhook(payload as Record<string, any>);
      default:
        return null;
    }
  }

  return { normalizeEvent, parseWebhook };
}

// ============================================================================
// PROVIDER-SPECIFIC WEBHOOK PARSERS
// ============================================================================

function mapJenkinsPhase(phase: string): CICDEventType {
  switch (phase?.toLowerCase()) {
    case 'started': return 'build_started';
    case 'completed':
    case 'finalized': return 'build_completed';
    default: return 'build_completed';
  }
}

function mapJenkinsStatus(status: string): CICDStatus {
  switch (status?.toUpperCase()) {
    case 'SUCCESS': return 'success';
    case 'FAILURE':
    case 'UNSTABLE': return 'failure';
    case 'ABORTED': return 'cancelled';
    default: return 'failure';
  }
}

function parseJenkinsWebhook(payload: Record<string, any>): CICDEvent | null {
  const build = payload.build;
  if (!build) return null;

  const phase = build.phase || payload.phase;
  const status = build.status || build.result || payload.status;
  const isDeployJob = (build.full_url || '').toLowerCase().includes('deploy') ||
                      (payload.name || '').toLowerCase().includes('deploy');

  return {
    provider: 'jenkins',
    eventType: isDeployJob
      ? (mapJenkinsPhase(phase) === 'build_started' ? 'deploy_started' : 'deploy_completed')
      : mapJenkinsPhase(phase),
    pipelineName: payload.name || build.display_name || 'unknown',
    status: mapJenkinsStatus(status),
    durationSeconds: build.duration ? Math.round(build.duration / 1000) : undefined,
    gitRef: build.scm?.branch,
    gitSha: build.scm?.commit,
    providerMetadata: {
      build_number: build.number,
      build_url: build.full_url || build.url,
    },
  };
}

function parseCircleCIWebhook(payload: Record<string, any>): CICDEvent | null {
  const pipeline = payload.pipeline;
  const workflow = payload.workflow;
  const job = payload.job;

  // CircleCI webhook v2 format uses `type` field; legacy/simplified payloads may omit it
  const type = payload.type;

  // Infer event type when `type` field is absent (require at least a status to be meaningful)
  const isWorkflowEvent = type === 'workflow-completed' || (!type && workflow?.status && !job);
  const isJobEvent = type === 'job-completed' || (!type && job?.status);

  if (!isWorkflowEvent && !isJobEvent) return null;

  const statusMap: Record<string, CICDStatus> = {
    success: 'success',
    failed: 'failure',
    error: 'failure',
    canceled: 'cancelled',
    timedout: 'failure',
  };

  const eventStatus = isWorkflowEvent
    ? workflow?.status
    : job?.status;

  const pipelineName = isWorkflowEvent
    ? workflow?.name || 'workflow'
    : job?.name || 'job';

  const isDeploy = pipelineName.toLowerCase().includes('deploy');

  return {
    provider: 'circleci',
    eventType: isDeploy ? 'deploy_completed' : 'build_completed',
    pipelineName,
    jobName: isJobEvent ? job?.name : undefined,
    status: statusMap[eventStatus] || 'failure',
    gitRef: pipeline?.vcs?.branch,
    gitSha: pipeline?.vcs?.revision,
    providerMetadata: {
      pipeline_id: pipeline?.id,
      workflow_id: workflow?.id,
      job_number: job?.number,
    },
  };
}

function parseGitLabWebhook(payload: Record<string, any>): CICDEvent | null {
  const objectKind = payload.object_kind;

  if (objectKind === 'pipeline') {
    const attrs = payload.object_attributes;
    if (!attrs) return null;

    const statusMap: Record<string, CICDStatus> = {
      success: 'success',
      failed: 'failure',
      canceled: 'cancelled',
      skipped: 'cancelled',
      running: 'running',
      pending: 'running',
    };

    const isDeploy = (attrs.stages || []).some((s: string) =>
      s.toLowerCase().includes('deploy')
    );

    const isStarted = attrs.status === 'running' || attrs.status === 'pending';

    let eventType: CICDEventType;
    if (isDeploy) {
      eventType = isStarted ? 'deploy_started' : 'deploy_completed';
    } else {
      eventType = isStarted ? 'build_started' : 'build_completed';
    }

    return {
      provider: 'gitlab_ci',
      eventType,
      pipelineName: payload.project?.name || 'pipeline',
      status: statusMap[attrs.status] || 'failure',
      gitRef: attrs.ref,
      gitSha: attrs.sha,
      durationSeconds: attrs.duration ? Math.round(attrs.duration) : undefined,
      providerMetadata: {
        pipeline_id: attrs.id,
        stages: attrs.stages,
        project_id: payload.project?.id,
      },
    };
  }

  if (objectKind === 'build' || objectKind === 'job') {
    const attrs = payload.object_attributes || payload;
    const statusMap: Record<string, CICDStatus> = {
      success: 'success',
      failed: 'failure',
      canceled: 'cancelled',
      running: 'running',
    };

    return {
      provider: 'gitlab_ci',
      eventType: 'build_completed',
      pipelineName: attrs.pipeline?.project?.name || 'job',
      jobName: attrs.name || attrs.build_name,
      status: statusMap[attrs.status || attrs.build_status] || 'failure',
      gitRef: attrs.ref,
      gitSha: attrs.sha || attrs.commit?.sha,
      durationSeconds: attrs.duration ? Math.round(attrs.duration) : undefined,
      providerMetadata: {
        job_id: attrs.id || attrs.build_id,
        stage: attrs.stage || attrs.build_stage,
      },
    };
  }

  return null;
}

function parseBuildkiteWebhook(payload: Record<string, any>): CICDEvent | null {
  const event = payload.event;
  const build = payload.build;
  const job = payload.job;

  if (!event) return null;

  const statusMap: Record<string, CICDStatus> = {
    passed: 'success',
    failed: 'failure',
    canceled: 'cancelled',
    blocked: 'cancelled',
    running: 'running',
    scheduled: 'running',
  };

  if (event.startsWith('build.')) {
    const pipelineName = payload.pipeline?.name || build?.pipeline?.name || 'pipeline';
    const isDeploy = pipelineName.toLowerCase().includes('deploy');

    let eventType: CICDEventType;
    if (event === 'build.running') {
      eventType = isDeploy ? 'deploy_started' : 'build_started';
    } else {
      eventType = isDeploy ? 'deploy_completed' : 'build_completed';
    }

    const startedAt = build?.started_at ? new Date(build.started_at).getTime() : 0;
    const finishedAt = build?.finished_at ? new Date(build.finished_at).getTime() : 0;
    const duration = startedAt && finishedAt ? Math.round((finishedAt - startedAt) / 1000) : undefined;

    return {
      provider: 'buildkite',
      eventType,
      pipelineName,
      status: statusMap[build?.state] || 'failure',
      gitRef: build?.branch,
      gitSha: build?.commit,
      durationSeconds: duration,
      triggeredBy: build?.creator?.name,
      providerMetadata: {
        build_number: build?.number,
        build_url: build?.web_url,
        organization: payload.pipeline?.organization?.name,
      },
    };
  }

  if (event.startsWith('job.')) {
    return {
      provider: 'buildkite',
      eventType: 'build_completed',
      pipelineName: payload.pipeline?.name || 'pipeline',
      jobName: job?.name,
      status: statusMap[job?.state] || 'failure',
      gitRef: build?.branch,
      gitSha: build?.commit,
      providerMetadata: {
        job_id: job?.id,
        build_number: build?.number,
      },
    };
  }

  return null;
}
