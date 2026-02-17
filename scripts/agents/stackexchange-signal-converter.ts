/**
 * StackExchange Signal Converter — Q&A Data → Brain Signals + Training Packs
 *
 * Extracts engineering knowledge quality signals from StackOverflow & Code Review:
 * - Knowledge depth (answer quality, score distribution)
 * - Community expertise (answerer reputation, accepted answer rate)
 * - Problem complexity (view-to-answer ratio, answer count distribution)
 * - Knowledge freshness (activity recency, question cadence)
 * - Topic interconnection (tag co-occurrence patterns)
 *
 * All signals aggregated per-day per-category.
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { TagCategoryData, SEQuestion } from './stackexchange-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertStackExchangeToSignals(
  categoryData: TagCategoryData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const entityId = `${categoryData.site}:${categoryData.category}`;

  // ── 1. Knowledge Depth (per day) ──
  // How deep are the answers? Based on average answer count and accepted answer rate.
  {
    const questionsByDay = new Map<string, SEQuestion[]>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      if (!questionsByDay.has(day)) questionsByDay.set(day, []);
      questionsByDay.get(day)!.push(q);
    }
    for (const [day, questions] of questionsByDay) {
      if (questions.length < 3) continue;
      const avgAnswers = questions.reduce((s, q) => s + q.answer_count, 0) / questions.length;
      const acceptedRate = questions.filter(q => q.accepted_answer_id).length / questions.length;
      // 1.0 = avg 5+ answers with 80%+ accepted, 0 = no answers
      const depth = Math.min(1, (avgAnswers / 5) * 0.6 + acceptedRate * 0.4);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_knowledge_depth',
        signal_value: depth,
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          avg_answers: Math.round(avgAnswers * 10) / 10,
          accepted_rate: Math.round(acceptedRate * 100),
          questions: questions.length,
          category: categoryData.category,
        },
      });
    }
  }

  // ── 2. Community Expertise (per day) ──
  // Quality of answerers: reputation distribution of question askers.
  {
    const repByDay = new Map<string, { totalRep: number; count: number; highRep: number }>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      const entry = repByDay.get(day) || { totalRep: 0, count: 0, highRep: 0 };
      entry.totalRep += q.owner.reputation || 0;
      entry.count++;
      if ((q.owner.reputation || 0) > 10000) entry.highRep++;
      repByDay.set(day, entry);
    }
    for (const [day, { totalRep, count, highRep }] of repByDay) {
      if (count < 3) continue;
      const avgRep = totalRep / count;
      // Normalize: 1.0 = avg rep 50K+, 0 = avg rep 0
      const expertise = Math.min(1, avgRep / 50000);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_community_expertise',
        signal_value: expertise,
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          avg_reputation: Math.round(avgRep),
          high_rep_askers: highRep,
          total_askers: count,
          category: categoryData.category,
        },
      });
    }
  }

  // ── 3. Problem Complexity (per day) ──
  // How complex are the questions? Based on view-to-answer ratio and score.
  {
    const complexByDay = new Map<string, { totalViews: number; totalAnswers: number; totalScore: number; count: number }>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      const entry = complexByDay.get(day) || { totalViews: 0, totalAnswers: 0, totalScore: 0, count: 0 };
      entry.totalViews += q.view_count;
      entry.totalAnswers += q.answer_count;
      entry.totalScore += q.score;
      entry.count++;
      complexByDay.set(day, entry);
    }
    for (const [day, { totalViews, totalAnswers, totalScore, count }] of complexByDay) {
      if (count < 3) continue;
      const viewsPerAnswer = totalAnswers > 0 ? totalViews / totalAnswers : totalViews;
      const avgScore = totalScore / count;
      // High views per answer = complex problem (many look, few can answer)
      // Normalize: 1.0 = 10K+ views per answer, 0 = low
      const complexity = Math.min(1, (viewsPerAnswer / 10000) * 0.6 + Math.min(1, avgScore / 100) * 0.4);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_problem_complexity',
        signal_value: complexity,
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          views_per_answer: Math.round(viewsPerAnswer),
          avg_score: Math.round(avgScore * 10) / 10,
          questions: count,
          category: categoryData.category,
        },
      });
    }
  }

  // ── 4. Knowledge Freshness (per day) ──
  // How recent is the activity? Based on last_activity_date proximity.
  {
    const nowEpoch = Date.now() / 1000;
    const freshByDay = new Map<string, { totalFreshness: number; count: number }>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      const entry = freshByDay.get(day) || { totalFreshness: 0, count: 0 };
      const daysSinceActivity = (nowEpoch - q.last_activity_date) / 86400;
      // 1.0 = active today, 0 = 365+ days ago
      const freshness = Math.max(0, Math.min(1, 1 - daysSinceActivity / 365));
      entry.totalFreshness += freshness;
      entry.count++;
      freshByDay.set(day, entry);
    }
    for (const [day, { totalFreshness, count }] of freshByDay) {
      if (count < 3) continue;
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_knowledge_freshness',
        signal_value: totalFreshness / count,
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          avg_freshness: Math.round((totalFreshness / count) * 100),
          questions: count,
          category: categoryData.category,
        },
      });
    }
  }

  // ── 5. Topic Interconnection (per day) ──
  // How interconnected are the tags? Measures tag diversity per question.
  {
    const tagsByDay = new Map<string, { totalTags: number; uniqueTags: Set<string>; count: number }>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      const entry = tagsByDay.get(day) || { totalTags: 0, uniqueTags: new Set(), count: 0 };
      entry.totalTags += q.tags.length;
      entry.count++;
      for (const tag of q.tags) entry.uniqueTags.add(tag);
      tagsByDay.set(day, entry);
    }
    for (const [day, { totalTags, uniqueTags, count }] of tagsByDay) {
      if (count < 3) continue;
      const avgTagsPerQ = totalTags / count;
      const tagDiversity = uniqueTags.size;
      // 1.0 = 3+ tags per Q with 20+ unique tags, indicating cross-domain questions
      const interconnection = Math.min(1, (avgTagsPerQ / 3) * 0.5 + (tagDiversity / 20) * 0.5);
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_topic_interconnection',
        signal_value: interconnection,
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          avg_tags_per_q: Math.round(avgTagsPerQ * 10) / 10,
          unique_tags: tagDiversity,
          questions: count,
          category: categoryData.category,
        },
      });
    }
  }

  // ── 6. Answer Quality Distribution (per day) ──
  // Measures the quality spread: high-score answers = well-solved problems.
  {
    const qualByDay = new Map<string, { highScore: number; medScore: number; lowScore: number; count: number }>();
    for (const q of categoryData.questions) {
      const day = new Date(q.creation_date * 1000).toISOString().substring(0, 10);
      const entry = qualByDay.get(day) || { highScore: 0, medScore: 0, lowScore: 0, count: 0 };
      entry.count++;
      if (q.score >= 50) entry.highScore++;
      else if (q.score >= 10) entry.medScore++;
      else entry.lowScore++;
      qualByDay.set(day, entry);
    }
    for (const [day, { highScore, medScore, count }] of qualByDay) {
      if (count < 3) continue;
      // 1.0 = all high-scoring (well-solved), 0 = all low-scoring
      const quality = (highScore * 1.0 + medScore * 0.5) / count;
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'se_answer_quality',
        signal_value: Math.min(1, quality),
        signal_timestamp: day,
        entity_type: 'knowledge-category',
        entity_id: entityId,
        metadata: {
          high_score: highScore,
          med_score: medScore,
          total: count,
          category: categoryData.category,
        },
      });
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildStackExchangeTrainingPacks(allData: TagCategoryData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const categoryCount = allData.length;

  // Compute per-category stats for correlations
  const catStats = allData.map(cat => {
    const totalQs = cat.questions.length;
    const answeredRate = totalQs > 0 ? cat.questions.filter(q => q.is_answered).length / totalQs : 0;
    const avgScore = totalQs > 0 ? cat.questions.reduce((s, q) => s + q.score, 0) / totalQs : 0;
    const avgViews = totalQs > 0 ? cat.questions.reduce((s, q) => s + q.view_count, 0) / totalQs : 0;
    const avgAnswers = totalQs > 0 ? cat.questions.reduce((s, q) => s + q.answer_count, 0) / totalQs : 0;
    const avgTagsPerQ = totalQs > 0 ? cat.questions.reduce((s, q) => s + q.tags.length, 0) / totalQs : 0;
    const topExpertise = cat.topAnswerers.length > 0
      ? cat.topAnswerers.reduce((s, a) => s + a.reputation, 0) / cat.topAnswerers.length
      : 0;
    return {
      category: cat.category,
      totalQs,
      answeredRate,
      avgScore,
      avgViews,
      avgAnswers,
      avgTagsPerQ,
      topExpertise,
    };
  });

  function computeCorrelation(
    getX: (s: typeof catStats[0]) => number,
    getY: (s: typeof catStats[0]) => number,
  ): number {
    const pairs = catStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 3) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      denomX += (xs[i] - meanX) ** 2;
      denomY += (ys[i] - meanY) ** 2;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  // ── Pack 1: Knowledge Quality → Engineering Outcomes ──
  const scoreVsAnswered = computeCorrelation(s => s.avgScore, s => s.answeredRate);
  packs.push({
    id: 'se-knowledge-quality',
    title: 'Knowledge Quality and Engineering Problem Resolution',
    source: `Computed from ${categoryCount} StackExchange categories: score-answeredRate r=${scoreVsAnswered}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: Math.min(0.85, 0.5 + Math.abs(scoreVsAnswered) * 0.4),
    tags: ['stackexchange', 'knowledge', 'quality', 'engineering', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'se_knowledge_depth',
        effectSize: Math.abs(scoreVsAnswered) || 0.5,
        lagDays: 14,
        coefficientSign: scoreVsAnswered > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Knowledge Depth → Problem Resolution',
        domains: ['engineering', 'product'],
        description: `r=${scoreVsAnswered} between Q&A score and answer acceptance across ${categoryCount} categories. Higher-quality knowledge bases correlate with better problem resolution.`,
        observed: catStats.filter(s => s.avgScore > 20 && s.answeredRate > 0.7).length,
        expected: Math.round(categoryCount * 0.4),
        total: categoryCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 2: Community Expertise → Knowledge Quality ──
  const expertiseVsQuality = computeCorrelation(s => s.topExpertise, s => s.avgScore);
  packs.push({
    id: 'se-expertise-quality',
    title: 'Expert Community Concentration and Knowledge Quality',
    source: `Computed from ${categoryCount} StackExchange categories: expertise-quality r=${expertiseVsQuality}`,
    industry: 'Technology',
    domains: ['people', 'engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(expertiseVsQuality) * 0.4),
    tags: ['stackexchange', 'expertise', 'community', 'data-computed'],
    causalChains: [
      {
        source: 'people',
        target: 'engineering',
        metric: 'se_community_expertise',
        effectSize: Math.abs(expertiseVsQuality) || 0.5,
        lagDays: 7,
        coefficientSign: expertiseVsQuality > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Expert Concentration → Answer Quality',
        domains: ['people', 'engineering'],
        description: `r=${expertiseVsQuality} between top answerer expertise and average question score. Expert-dense communities produce higher-quality knowledge.`,
        observed: catStats.filter(s => s.topExpertise > 50000 && s.avgScore > 20).length,
        expected: Math.round(categoryCount * 0.3),
        total: categoryCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 3: Problem Complexity → Test/Architecture Patterns ──
  const viewsVsAnswers = computeCorrelation(s => s.avgViews, s => s.avgAnswers);
  packs.push({
    id: 'se-complexity-patterns',
    title: 'Problem Complexity Patterns for Test and Architecture Generation',
    source: `Computed from ${categoryCount} StackExchange categories: views-answers r=${viewsVsAnswers}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(viewsVsAnswers) * 0.4),
    tags: ['stackexchange', 'complexity', 'testing', 'architecture', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'se_problem_complexity',
        effectSize: Math.abs(viewsVsAnswers) || 0.5,
        lagDays: 30,
        coefficientSign: viewsVsAnswers > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Problem Complexity → Solution Diversity',
        domains: ['engineering'],
        description: `r=${viewsVsAnswers} between question views and answer count across ${categoryCount} categories. Complex problems attract diverse solutions — critical for test case and architecture generation.`,
        observed: catStats.filter(s => s.avgViews > 5000 && s.avgAnswers > 3).length,
        expected: Math.round(categoryCount * 0.3),
        total: categoryCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 4: Cross-Domain Knowledge (Tag Interconnection → Architecture Understanding) ──
  const tagsVsScore = computeCorrelation(s => s.avgTagsPerQ, s => s.avgScore);
  packs.push({
    id: 'se-cross-domain-knowledge',
    title: 'Cross-Domain Knowledge Transfer Patterns',
    source: `Computed from ${categoryCount} StackExchange categories: tagDiversity-score r=${tagsVsScore}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.7,
    tags: ['stackexchange', 'cross-domain', 'knowledge-transfer', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'se_topic_interconnection',
        effectSize: Math.abs(tagsVsScore) || 0.4,
        lagDays: 14,
        coefficientSign: tagsVsScore > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Tag Diversity → Knowledge Quality',
        domains: ['engineering'],
        description: `r=${tagsVsScore} between tag diversity and question score. Cross-domain questions (testing + architecture, SQL + performance) indicate deeper engineering knowledge.`,
        observed: catStats.filter(s => s.avgTagsPerQ > 2.5 && s.avgScore > 15).length,
        expected: Math.round(categoryCount * 0.3),
        total: categoryCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
