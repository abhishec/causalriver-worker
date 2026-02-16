import { describe, it, expect } from 'vitest';
import { createCICDIngestor, type CICDEvent } from '../connectors/cicd-ingestor';

describe('CICDIngestor', () => {
  const ingestor = createCICDIngestor();

  describe('normalizeEvent', () => {
    it('should map build_completed + success to ci_passed', () => {
      const event: CICDEvent = {
        provider: 'jenkins',
        eventType: 'build_completed',
        pipelineName: 'my-app',
        status: 'success',
        gitSha: 'abc123',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('ci_passed');
      expect(signals[0].signal_value).toBe(1);
      expect(signals[0].entity_type).toBe('ci_run');
      expect(signals[0].source_domain).toBe('engineering.cicd');
    });

    it('should map build_completed + failure to ci_failed', () => {
      const event: CICDEvent = {
        provider: 'circleci',
        eventType: 'build_completed',
        pipelineName: 'frontend',
        status: 'failure',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('ci_failed');
      expect(signals[0].signal_value).toBe(-1);
    });

    it('should map deploy_completed + success to deploy_success', () => {
      const event: CICDEvent = {
        provider: 'buildkite',
        eventType: 'deploy_completed',
        pipelineName: 'deploy-prod',
        status: 'success',
        environment: 'production',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('deploy_success');
      expect(signals[0].signal_value).toBe(1);
      expect(signals[0].entity_type).toBe('deployment');
      expect(signals[0].metadata?.environment).toBe('production');
    });

    it('should map deploy_completed + failure to deploy_failure', () => {
      const event: CICDEvent = {
        provider: 'gitlab_ci',
        eventType: 'deploy_completed',
        pipelineName: 'deploy-staging',
        status: 'failure',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('deploy_failure');
      expect(signals[0].signal_value).toBe(-1);
    });

    it('should map test_completed + failure to test_failed', () => {
      const event: CICDEvent = {
        provider: 'jenkins',
        eventType: 'test_completed',
        pipelineName: 'integration-tests',
        status: 'failure',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('test_failed');
      expect(signals[0].signal_value).toBe(-0.8);
    });

    it('should map test_completed + success to test_passed', () => {
      const event: CICDEvent = {
        provider: 'circleci',
        eventType: 'test_completed',
        pipelineName: 'unit-tests',
        status: 'success',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('test_passed');
      expect(signals[0].signal_value).toBe(0.8);
    });

    it('should emit started signal for build_started', () => {
      const event: CICDEvent = {
        provider: 'buildkite',
        eventType: 'build_started',
        pipelineName: 'my-build',
        status: 'running',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('build_started');
      expect(signals[0].signal_value).toBe(0);
    });

    it('should emit deploy_started for deploy_started events', () => {
      const event: CICDEvent = {
        provider: 'gitlab_ci',
        eventType: 'deploy_started',
        pipelineName: 'deploy-staging',
        status: 'running',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('deploy_started');
      expect(signals[0].entity_type).toBe('deployment');
    });

    it('should include all metadata fields', () => {
      const event: CICDEvent = {
        provider: 'jenkins',
        eventType: 'build_completed',
        pipelineName: 'backend',
        jobName: 'unit-tests',
        status: 'success',
        gitRef: 'refs/heads/main',
        gitSha: 'abc123def',
        durationSeconds: 120,
        environment: 'ci',
        triggeredBy: 'alice',
        providerMetadata: { build_number: 42 },
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals[0].metadata).toMatchObject({
        provider: 'jenkins',
        pipeline: 'backend',
        job_name: 'unit-tests',
        git_ref: 'refs/heads/main',
        git_sha: 'abc123def',
        duration_seconds: 120,
        environment: 'ci',
        triggered_by: 'alice',
        provider_metadata: { build_number: 42 },
      });
    });

    it('should not emit signals for cancelled builds', () => {
      const event: CICDEvent = {
        provider: 'circleci',
        eventType: 'build_completed',
        pipelineName: 'my-app',
        status: 'cancelled',
      };

      const signals = ingestor.normalizeEvent(event, 'org-1');
      expect(signals).toHaveLength(0);
    });

    it('should use defaultOrgId from config', () => {
      const ingestorWithDefault = createCICDIngestor({ defaultOrgId: 'default-org' });
      const event: CICDEvent = {
        provider: 'jenkins',
        eventType: 'build_completed',
        pipelineName: 'my-app',
        status: 'success',
      };

      const signals = ingestorWithDefault.normalizeEvent(event, '');
      expect(signals[0].organization_id).toBe('default-org');
    });
  });

  describe('parseWebhook — Jenkins', () => {
    it('should parse Jenkins build notification', () => {
      const payload = {
        name: 'my-pipeline',
        build: {
          phase: 'COMPLETED',
          status: 'SUCCESS',
          number: 42,
          full_url: 'https://jenkins.example.com/job/my-pipeline/42',
          duration: 60000,
          scm: {
            branch: 'main',
            commit: 'abc123',
          },
        },
      };

      const event = ingestor.parseWebhook('jenkins', payload);
      expect(event).not.toBeNull();
      expect(event!.provider).toBe('jenkins');
      expect(event!.eventType).toBe('build_completed');
      expect(event!.pipelineName).toBe('my-pipeline');
      expect(event!.status).toBe('success');
      expect(event!.gitRef).toBe('main');
      expect(event!.gitSha).toBe('abc123');
      expect(event!.durationSeconds).toBe(60);
    });

    it('should detect deploy jobs by name', () => {
      const payload = {
        name: 'deploy-production',
        build: {
          phase: 'COMPLETED',
          status: 'SUCCESS',
          full_url: 'https://jenkins.example.com/job/deploy-production/10',
        },
      };

      const event = ingestor.parseWebhook('jenkins', payload);
      expect(event!.eventType).toBe('deploy_completed');
    });

    it('should return null for missing build', () => {
      const event = ingestor.parseWebhook('jenkins', { name: 'test' });
      expect(event).toBeNull();
    });
  });

  describe('parseWebhook — CircleCI', () => {
    it('should parse workflow-completed event', () => {
      const payload = {
        type: 'workflow-completed',
        pipeline: {
          id: 'pipe-1',
          vcs: { branch: 'main', revision: 'def456' },
        },
        workflow: {
          id: 'wf-1',
          name: 'build-and-test',
          status: 'success',
        },
      };

      const event = ingestor.parseWebhook('circleci', payload);
      expect(event).not.toBeNull();
      expect(event!.provider).toBe('circleci');
      expect(event!.eventType).toBe('build_completed');
      expect(event!.status).toBe('success');
      expect(event!.gitRef).toBe('main');
      expect(event!.gitSha).toBe('def456');
    });

    it('should detect deploy workflow by name', () => {
      const payload = {
        type: 'workflow-completed',
        pipeline: { id: 'p', vcs: {} },
        workflow: { id: 'w', name: 'deploy-staging', status: 'success' },
      };

      const event = ingestor.parseWebhook('circleci', payload);
      expect(event!.eventType).toBe('deploy_completed');
    });

    it('should return null for missing type', () => {
      const event = ingestor.parseWebhook('circleci', { workflow: {} });
      expect(event).toBeNull();
    });
  });

  describe('parseWebhook — GitLab CI', () => {
    it('should parse pipeline webhook', () => {
      const payload = {
        object_kind: 'pipeline',
        object_attributes: {
          id: 123,
          status: 'success',
          ref: 'main',
          sha: 'ghi789',
          duration: 180,
          stages: ['build', 'test'],
        },
        project: { id: 1, name: 'my-app' },
      };

      const event = ingestor.parseWebhook('gitlab_ci', payload);
      expect(event).not.toBeNull();
      expect(event!.provider).toBe('gitlab_ci');
      expect(event!.eventType).toBe('build_completed');
      expect(event!.status).toBe('success');
      expect(event!.durationSeconds).toBe(180);
    });

    it('should detect deploy pipeline by stage', () => {
      const payload = {
        object_kind: 'pipeline',
        object_attributes: {
          id: 456,
          status: 'success',
          ref: 'main',
          sha: 'abc',
          stages: ['build', 'test', 'deploy'],
        },
        project: { name: 'api' },
      };

      const event = ingestor.parseWebhook('gitlab_ci', payload);
      expect(event!.eventType).toBe('deploy_completed');
    });

    it('should handle running pipeline as build_started', () => {
      const payload = {
        object_kind: 'pipeline',
        object_attributes: { id: 789, status: 'running', ref: 'dev', sha: 'x' },
        project: { name: 'test' },
      };

      const event = ingestor.parseWebhook('gitlab_ci', payload);
      expect(event!.eventType).toBe('build_started');
      expect(event!.status).toBe('running');
    });

    it('should return null for unknown object_kind', () => {
      const event = ingestor.parseWebhook('gitlab_ci', { object_kind: 'merge_request' });
      expect(event).toBeNull();
    });
  });

  describe('parseWebhook — Buildkite', () => {
    it('should parse build.finished event', () => {
      const payload = {
        event: 'build.finished',
        build: {
          state: 'passed',
          branch: 'main',
          commit: 'jkl012',
          number: 55,
          started_at: '2024-01-05T10:00:00Z',
          finished_at: '2024-01-05T10:03:00Z',
          creator: { name: 'alice' },
        },
        pipeline: {
          name: 'frontend-build',
          organization: { name: 'myorg' },
        },
      };

      const event = ingestor.parseWebhook('buildkite', payload);
      expect(event).not.toBeNull();
      expect(event!.provider).toBe('buildkite');
      expect(event!.eventType).toBe('build_completed');
      expect(event!.status).toBe('success');
      expect(event!.gitRef).toBe('main');
      expect(event!.durationSeconds).toBe(180);
      expect(event!.triggeredBy).toBe('alice');
    });

    it('should detect deploy pipeline by name', () => {
      const payload = {
        event: 'build.finished',
        build: { state: 'passed', branch: 'main', commit: 'x' },
        pipeline: { name: 'deploy-production' },
      };

      const event = ingestor.parseWebhook('buildkite', payload);
      expect(event!.eventType).toBe('deploy_completed');
    });

    it('should parse job event', () => {
      const payload = {
        event: 'job.finished',
        job: { id: 'j1', name: 'lint', state: 'passed' },
        build: { branch: 'main', commit: 'abc' },
        pipeline: { name: 'ci' },
      };

      const event = ingestor.parseWebhook('buildkite', payload);
      expect(event!.jobName).toBe('lint');
    });

    it('should return null for missing event', () => {
      const event = ingestor.parseWebhook('buildkite', { build: {} });
      expect(event).toBeNull();
    });
  });

  describe('parseWebhook — invalid inputs', () => {
    it('should return null for null payload', () => {
      const event = ingestor.parseWebhook('jenkins', null);
      expect(event).toBeNull();
    });

    it('should return null for unsupported provider', () => {
      const event = ingestor.parseWebhook('custom' as any, { some: 'data' });
      expect(event).toBeNull();
    });
  });
});
