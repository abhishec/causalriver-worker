import { describe, it, expect } from 'vitest';
import { createRunbookIndexer, type RunbookDocument } from '../learning/runbook-indexer';

describe('RunbookIndexer', () => {
  const indexer = createRunbookIndexer();

  const sampleRunbook = `# Database Outage Response

## 1. Identify the Issue
- Check database connection pool status
- Review recent deployment logs
- Check CloudWatch metrics for CPU/memory spikes

## 2. Immediate Mitigation
1. Restart the connection pool
2. Scale up read replicas if needed
3. Enable query kill for long-running queries

## 3. Root Cause Analysis
1. Check slow query logs
2. Review index usage statistics
3. Identify schema changes in recent deployments

## 4. Communication
- Notify #incidents channel in Slack
- Update status page
- Send customer communication if SLA breached
`;

  describe('indexRunbook()', () => {
    it('should produce a valid TrainingPack', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'engineering-wiki');

      expect(pack).toBeDefined();
      expect(pack.id).toBe('runbook-database-outage-runbook');
      expect(pack.title).toBe('Runbook: Database Outage Runbook');
      expect(pack.source).toBe('engineering-wiki');
      expect(pack.industry).toBe('Technology');
      expect(pack.confidence).toBe(0.75);
    });

    it('should include engineering in domains', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.domains).toContain('engineering');
    });

    it('should extract runbook-related tags', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.tags).toContain('runbook');
      expect(pack.tags).toContain('documentation');
      expect(pack.tags).toContain('incident-response');
    });

    it('should extract steps as businessRules', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.businessRules.length).toBeGreaterThan(0);
      // Should capture numbered/bulleted list items
      expect(pack.businessRules.some((r) => r.naturalLanguage.includes('connection pool'))).toBe(true);
    });

    it('should create patterns from sections', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.patterns.length).toBeGreaterThan(0);
      // Pattern names should be based on section headings
      expect(pack.patterns.some((p) => p.name.includes('runbook_'))).toBe(true);
    });

    it('should build narrative from sections', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.narrative).toContain('Runbook: Database Outage Runbook');
      expect(pack.narrative).toContain('Sections:');
      expect(pack.narrative).toContain('Steps:');
    });

    it('should handle minimal content gracefully', () => {
      const pack = indexer.indexRunbook('Simple text without headers', 'Simple', 'test');
      expect(pack).toBeDefined();
      expect(pack.id).toBe('runbook-simple');
      expect(pack.businessRules).toHaveLength(0); // No list items
      expect(pack.patterns).toHaveLength(1); // Body text > 20 chars creates one pattern
    });

    it('should generate unique IDs from title', () => {
      const pack1 = indexer.indexRunbook('content', 'Auth Service Recovery', 'wiki');
      const pack2 = indexer.indexRunbook('content', 'Payment Gateway Runbook', 'wiki');
      expect(pack1.id).not.toBe(pack2.id);
      expect(pack1.id).toBe('runbook-auth-service-recovery');
      expect(pack2.id).toBe('runbook-payment-gateway-runbook');
    });

    it('should sanitize special characters in IDs', () => {
      const pack = indexer.indexRunbook('content', 'Auth (v2) — Recovery!', 'wiki');
      expect(pack.id).toMatch(/^runbook-[a-z0-9-]+$/);
    });

    it('should extract keywords from content and title', () => {
      const pack = indexer.indexRunbook(sampleRunbook, 'Database Outage Runbook', 'wiki');
      expect(pack.tags.length).toBeGreaterThan(3); // runbook + documentation + incident-response + keywords
    });

    it('should cap steps at 10', () => {
      const manySteps = Array.from({ length: 20 }, (_, i) => `${i + 1}. Step number ${i + 1}`).join('\n');
      const pack = indexer.indexRunbook(manySteps, 'Many Steps', 'test');
      expect(pack.businessRules.length).toBeLessThanOrEqual(10);
    });

    it('should cap patterns at 10', () => {
      const manySections = Array.from(
        { length: 15 },
        (_, i) => `## Section ${i + 1}\nThis is a sufficiently long body for section ${i + 1} that should create a pattern entry in the output.`
      ).join('\n\n');
      const pack = indexer.indexRunbook(manySections, 'Many Sections', 'test');
      expect(pack.patterns.length).toBeLessThanOrEqual(10);
    });
  });

  describe('indexBatch()', () => {
    it('should index multiple documents', () => {
      const docs: RunbookDocument[] = [
        { content: '# Auth Runbook\n1. Check auth service\n2. Restart tokens', title: 'Auth Recovery', source: 'wiki' },
        { content: '# Deploy Runbook\n1. Check CI\n2. Rollback if needed', title: 'Deploy Recovery', source: 'wiki' },
        { content: '# Monitoring\n- Check dashboards\n- Review alerts', title: 'Monitoring Guide', source: 'wiki' },
      ];

      const packs = indexer.indexBatch(docs);
      expect(packs).toHaveLength(3);
      expect(packs[0].id).toBe('runbook-auth-recovery');
      expect(packs[1].id).toBe('runbook-deploy-recovery');
      expect(packs[2].id).toBe('runbook-monitoring-guide');
    });

    it('should return empty array for empty input', () => {
      const packs = indexer.indexBatch([]);
      expect(packs).toHaveLength(0);
    });
  });

  describe('section splitting', () => {
    it('should handle h1, h2, h3 headers', () => {
      const content = `# Top Level
Top content

## Second Level
Second content

### Third Level
Third content`;

      const pack = indexer.indexRunbook(content, 'Headers Test', 'test');
      expect(pack.narrative).toContain('Top Level');
      expect(pack.narrative).toContain('Second Level');
      expect(pack.narrative).toContain('Third Level');
    });

    it('should handle content before first header', () => {
      const content = `This is preamble content before any headers.

# First Section
Section content here.`;

      const pack = indexer.indexRunbook(content, 'Preamble Test', 'test');
      expect(pack).toBeDefined();
    });
  });

  describe('step extraction', () => {
    it('should extract numbered steps (dot notation)', () => {
      const content = `# Steps
1. First step
2. Second step
3. Third step`;
      const pack = indexer.indexRunbook(content, 'Numbered', 'test');
      expect(pack.businessRules).toHaveLength(3);
      expect(pack.businessRules[0].naturalLanguage).toBe('First step');
    });

    it('should extract numbered steps (paren notation)', () => {
      const content = `# Steps
1) First step
2) Second step`;
      const pack = indexer.indexRunbook(content, 'Paren', 'test');
      expect(pack.businessRules).toHaveLength(2);
    });

    it('should extract bulleted steps (dash)', () => {
      const content = `# Steps
- First item
- Second item
- Third item`;
      const pack = indexer.indexRunbook(content, 'Dashes', 'test');
      expect(pack.businessRules).toHaveLength(3);
    });

    it('should extract bulleted steps (asterisk)', () => {
      const content = `# Steps
* First item
* Second item`;
      const pack = indexer.indexRunbook(content, 'Asterisks', 'test');
      expect(pack.businessRules).toHaveLength(2);
    });

    it('should skip empty list items', () => {
      const content = `# Steps
1. Real step
2.
3. Another step`;
      const pack = indexer.indexRunbook(content, 'Gaps', 'test');
      expect(pack.businessRules).toHaveLength(2);
    });
  });
});
