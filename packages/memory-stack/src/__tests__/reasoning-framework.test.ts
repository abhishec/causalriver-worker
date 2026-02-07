/**
 * Nexus Memory Stack - Reasoning Framework Tests
 *
 * Tests for Claude-optimized prompting structure, intent classification,
 * and structured response formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  defaultReasoningStages,
  buildReasoningFramework,
  defaultIntentGuides,
  classifyIntent,
  formatStructuredResponse,
} from '../intelligence/reasoning-framework';
import type { StructuredResponse } from '../intelligence/reasoning-framework';

describe('Reasoning Framework', () => {
  // ============================================================================
  // DEFAULT REASONING STAGES
  // ============================================================================

  describe('defaultReasoningStages', () => {
    it('should contain exactly 5 default stages', () => {
      expect(defaultReasoningStages).toHaveLength(5);
    });

    it('should have the correct stage names in order', () => {
      const names = defaultReasoningStages.map((s) => s.name);
      expect(names).toEqual([
        'Understanding',
        'Data Assessment',
        'Pattern Analysis',
        'Cross-Domain Connection',
        'Recommendation',
      ]);
    });

    it('should have prompts array with at least one prompt per stage', () => {
      for (const stage of defaultReasoningStages) {
        expect(stage.prompts.length).toBeGreaterThan(0);
        expect(typeof stage.description).toBe('string');
        expect(stage.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // FRAMEWORK BUILDER
  // ============================================================================

  describe('buildReasoningFramework', () => {
    it('should create a framework with default options when called with no arguments', () => {
      const framework = buildReasoningFramework();
      expect(framework).toBeDefined();
      expect(typeof framework.buildPrompt).toBe('function');
      expect(typeof framework.parseResponse).toBe('function');
      expect(typeof framework.getStages).toBe('function');
    });

    describe('getStages', () => {
      it('should return default stages when none are specified', () => {
        const framework = buildReasoningFramework();
        expect(framework.getStages()).toEqual(defaultReasoningStages);
      });

      it('should return custom stages when provided', () => {
        const customStages = [
          { name: 'Custom', description: 'A custom stage', prompts: ['Question?'] },
        ];
        const framework = buildReasoningFramework({ stages: customStages });
        expect(framework.getStages()).toEqual(customStages);
        expect(framework.getStages()).toHaveLength(1);
      });
    });

    describe('buildPrompt', () => {
      it('should include the reasoning framework header', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        expect(prompt).toContain('## Reasoning Framework');
        expect(prompt).toContain('Follow this structured approach');
      });

      it('should include all default stage names and prompts', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        for (const stage of defaultReasoningStages) {
          expect(prompt).toContain(stage.name);
          expect(prompt).toContain(stage.description);
          for (const p of stage.prompts) {
            expect(prompt).toContain(`- ${p}`);
          }
        }
      });

      it('should include uncertainty handling by default', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        expect(prompt).toContain('### Uncertainty Handling');
        expect(prompt).toContain('What you are confident about');
        expect(prompt).toContain('What you are uncertain about');
      });

      it('should exclude uncertainty handling when disabled', () => {
        const framework = buildReasoningFramework({ requireExplicitUncertainty: false });
        const prompt = framework.buildPrompt();
        expect(prompt).not.toContain('### Uncertainty Handling');
      });

      it('should include data gaps section by default', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        expect(prompt).toContain('### Data Gaps');
        expect(prompt).toContain('Note what data would help');
      });

      it('should exclude data gaps section when disabled', () => {
        const framework = buildReasoningFramework({ includeDataGaps: false });
        const prompt = framework.buildPrompt();
        expect(prompt).not.toContain('### Data Gaps');
      });

      it('should reflect custom maxRecommendations in the prompt', () => {
        const framework = buildReasoningFramework({ maxRecommendations: 10 });
        const prompt = framework.buildPrompt();
        expect(prompt).toContain('Provide up to 10 prioritized recommendations');
      });

      it('should append additional context when provided', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt('Focus on revenue metrics');
        expect(prompt).toContain('### Additional Context');
        expect(prompt).toContain('Focus on revenue metrics');
      });

      it('should not include additional context section when not provided', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        expect(prompt).not.toContain('### Additional Context');
      });

      it('should number stages sequentially', () => {
        const framework = buildReasoningFramework();
        const prompt = framework.buildPrompt();
        expect(prompt).toContain('### 1. Understanding');
        expect(prompt).toContain('### 2. Data Assessment');
        expect(prompt).toContain('### 5. Recommendation');
      });
    });

    describe('parseResponse', () => {
      it('should extract the first line as summary', () => {
        const framework = buildReasoningFramework();
        const result = framework.parseResponse('This is the summary.\nMore details here.');
        expect(result.summary).toBe('This is the summary.');
      });

      it('should initialize empty arrays for analysis, recommendations, and uncertainties', () => {
        const framework = buildReasoningFramework();
        const result = framework.parseResponse('Some text without patterns');
        expect(result.analysis).toEqual([]);
        expect(result.uncertainties).toEqual([]);
      });

      it('should extract recommendation patterns from text', () => {
        const framework = buildReasoningFramework();
        const text =
          'Summary line.\nWe recommend: increasing budget\nWe should: hire more staff';
        const result = framework.parseResponse(text);
        expect(result.recommendations).toBeDefined();
        expect(result.recommendations!.length).toBeGreaterThan(0);
        // First recommendation should be high priority
        expect(result.recommendations![0].priority).toBe('high');
      });

      it('should assign descending priority to multiple recommendations', () => {
        const framework = buildReasoningFramework();
        const text = [
          'Summary.',
          'I recommend: first action',
          'I suggest: second action',
          'I also suggest: third action',
          'Additionally recommend: fourth action',
        ].join('\n');
        const result = framework.parseResponse(text);
        const recs = result.recommendations!;
        expect(recs[0].priority).toBe('high');
        expect(recs[1].priority).toBe('medium');
        expect(recs[2].priority).toBe('medium');
        // Index >= 3 should be low
        if (recs.length > 3) {
          expect(recs[3].priority).toBe('low');
        }
      });

      it('should return empty recommendations when no patterns match', () => {
        const framework = buildReasoningFramework();
        const result = framework.parseResponse('Plain text with no keywords at all.');
        expect(result.recommendations).toEqual([]);
      });

      it('should handle empty string input', () => {
        const framework = buildReasoningFramework();
        const result = framework.parseResponse('');
        expect(result.summary).toBeUndefined();
        expect(result.recommendations).toEqual([]);
      });
    });
  });

  // ============================================================================
  // INTENT CLASSIFICATION
  // ============================================================================

  describe('defaultIntentGuides', () => {
    it('should contain exactly 5 intent guides', () => {
      expect(defaultIntentGuides).toHaveLength(5);
    });

    it('should have the correct intent names', () => {
      const intents = defaultIntentGuides.map((g) => g.intent);
      expect(intents).toEqual([
        'status_check',
        'root_cause',
        'prediction',
        'recommendation',
        'comparison',
      ]);
    });

    it('should have non-empty keywords, suggestedActions, and dataNeeded for each guide', () => {
      for (const guide of defaultIntentGuides) {
        expect(guide.keywords.length).toBeGreaterThan(0);
        expect(guide.suggestedActions.length).toBeGreaterThan(0);
        expect(guide.dataNeeded.length).toBeGreaterThan(0);
      }
    });
  });

  describe('classifyIntent', () => {
    it('should classify a status check query', () => {
      const result = classifyIntent('How is the project going?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('status_check');
    });

    it('should classify a root cause query', () => {
      const result = classifyIntent('Why did revenue drop last quarter?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('root_cause');
    });

    it('should classify a prediction query', () => {
      const result = classifyIntent('What if we increase spending?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('prediction');
    });

    it('should classify a recommendation query', () => {
      const result = classifyIntent('What should we do about churn?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('recommendation');
    });

    it('should classify a comparison query', () => {
      const result = classifyIntent('Compare plan A versus plan B');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('comparison');
    });

    it('should return null when no intent matches', () => {
      const result = classifyIntent('hello there');
      expect(result).toBeNull();
    });

    it('should be case insensitive', () => {
      const result = classifyIntent('WHY did this happen?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('root_cause');
    });

    it('should match on the first matching guide (priority order)', () => {
      // "should" appears in the recommendation intent; ensure it matches correctly
      const result = classifyIntent('should we proceed?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('recommendation');
    });
  });

  // ============================================================================
  // RESPONSE FORMATTING
  // ============================================================================

  describe('formatStructuredResponse', () => {
    it('should format a complete structured response', () => {
      const response: StructuredResponse = {
        summary: 'Overall health is good.',
        analysis: ['Revenue is up 10%', 'Churn decreased'],
        recommendations: [
          { action: 'Expand team', rationale: 'Growing demand', priority: 'high', owner: 'VP Eng' },
          { action: 'Reduce costs', rationale: 'Margin pressure', priority: 'medium' },
        ],
        uncertainties: [
          { area: 'Market conditions', level: 'high', mitigation: 'Monitor quarterly' },
          { area: 'Data quality', level: 'low' },
        ],
        dataGaps: ['Missing Q4 data', 'No competitor analysis'],
      };

      const output = formatStructuredResponse(response);

      // Summary section
      expect(output).toContain('## Summary');
      expect(output).toContain('Overall health is good.');

      // Analysis section
      expect(output).toContain('## Analysis');
      expect(output).toContain('- Revenue is up 10%');
      expect(output).toContain('- Churn decreased');

      // Recommendations section with priority icons
      expect(output).toContain('## Recommendations');
      expect(output).toContain('**Expand team**');
      expect(output).toContain('_Owner:_ VP Eng');
      expect(output).toContain('**Reduce costs**');

      // Uncertainties section
      expect(output).toContain('## Uncertainties');
      expect(output).toContain('**Market conditions** (high uncertainty)');
      expect(output).toContain('_Mitigation:_ Monitor quarterly');
      expect(output).toContain('**Data quality** (low uncertainty)');

      // Data gaps section
      expect(output).toContain('## Data Gaps');
      expect(output).toContain('- Missing Q4 data');
      expect(output).toContain('- No competitor analysis');
    });

    it('should omit analysis section when analysis is empty', () => {
      const response: StructuredResponse = {
        summary: 'Brief summary.',
        analysis: [],
        recommendations: [],
        uncertainties: [],
      };
      const output = formatStructuredResponse(response);
      expect(output).toContain('## Summary');
      expect(output).not.toContain('## Analysis');
      expect(output).not.toContain('## Recommendations');
      expect(output).not.toContain('## Uncertainties');
    });

    it('should omit data gaps section when dataGaps is undefined', () => {
      const response: StructuredResponse = {
        summary: 'No gaps.',
        analysis: [],
        recommendations: [],
        uncertainties: [],
      };
      const output = formatStructuredResponse(response);
      expect(output).not.toContain('## Data Gaps');
    });

    it('should omit data gaps section when dataGaps is empty', () => {
      const response: StructuredResponse = {
        summary: 'Empty gaps.',
        analysis: [],
        recommendations: [],
        uncertainties: [],
        dataGaps: [],
      };
      const output = formatStructuredResponse(response);
      expect(output).not.toContain('## Data Gaps');
    });

    it('should not include owner line when owner is not provided', () => {
      const response: StructuredResponse = {
        summary: 'Test.',
        analysis: [],
        recommendations: [
          { action: 'Do something', rationale: 'Because', priority: 'low' },
        ],
        uncertainties: [],
      };
      const output = formatStructuredResponse(response);
      expect(output).not.toContain('_Owner:_');
    });

    it('should not include mitigation line when mitigation is not provided', () => {
      const response: StructuredResponse = {
        summary: 'Test.',
        analysis: [],
        recommendations: [],
        uncertainties: [{ area: 'Unknown area', level: 'medium' }],
      };
      const output = formatStructuredResponse(response);
      expect(output).toContain('**Unknown area** (medium uncertainty)');
      expect(output).not.toContain('_Mitigation:_');
    });
  });
});
