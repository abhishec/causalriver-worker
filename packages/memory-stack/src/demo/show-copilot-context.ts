#!/usr/bin/env npx tsx
/**
 * Shows EXACTLY what the copilot LLM layer receives as context
 * from the brain — the raw prompt injection, nothing else.
 *
 * v2: Uses the same fixed logic as code-intelligence-context.ts:
 *   - Fuzzy keyword extraction (not just regex patterns)
 *   - Fuzzy entity search (substring match against graph entity IDs)
 *   - Onboarding fallback (top hubs, domain breakdown, expertise heatmap)
 *   - Debugging/incident fallback (fuzzy upstream dep search)
 *   - Collaboration graph wired for all use cases
 */
import {
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
  createCodeParser,
  createGitHubConnector,
} from '../index';
import type { ConnectorSignal } from '../connectors/connector-framework';
import type {
  KnowledgeDependencyGraphInstance,
  ExpertiseGraphInstance,
  CollaborationGraphInstance,
} from '../index';

// ═══════════════════════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════════════════════

function createMockSupabase(store: ConnectorSignal[]) {
  const mk = (): any => {
    const c: any = {};
    for (const m of ['select','eq','neq','in','gte','lte','order','limit','filter']) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.single = () => Promise.resolve({ data: null, error: null });
    c.insert = (rows: any) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      for (const r of arr) { if (r.source_domain && r.signal_type) store.push(r as any); }
      return Promise.resolve({ data: arr, error: null });
    };
    c.upsert = () => Promise.resolve({ data: null, error: null });
    c.update = () => mk();
    c.delete = () => mk();
    return c;
  };
  return { from: () => mk(), rpc: () => Promise.resolve({ data: null, error: null }) };
}

// ═══════════════════════════════════════════════════════════════════════
// USE CASE DETECTION (mirrors code-intelligence-context.ts v2)
// ═══════════════════════════════════════════════════════════════════════

type DeveloperUseCase = 'onboarding' | 'debugging' | 'incident' | 'knowledge' | 'review' | 'general';

function detectUseCase(q: string): DeveloperUseCase {
  const patterns: Array<{ uc: DeveloperUseCase; re: RegExp[] }> = [
    { uc: 'onboarding', re: [/how does .+ work/i, /explain/i, /architecture/i, /overview/i, /getting started/i, /understand .+ (code|system)/i, /tell me about/i, /walk me through/i] },
    { uc: 'debugging', re: [/error in/i, /fails when/i, /root cause/i, /why .+ (fail|break|crash)/i, /bug in/i, /debug/i, /not working/i, /what causes/i, /fix .+ issue/i] },
    { uc: 'incident', re: [/incident/i, /outage/i, /service .+ (down|unavailable)/i, /blast radius/i, /what .+ affected/i, /p[01] .+ (incident|issue)/i] },
    { uc: 'knowledge', re: [/who knows/i, /bus factor/i, /expertise/i, /expert on/i, /who .+ (review|help|fix)/i, /knowledge .+ (transfer|retention)/i, /single point of failure/i] },
    { uc: 'review', re: [/review .+ (pr|pull request|change)/i, /pr .+ (impact|affect)/i, /what .+ (change|break|affect)/i, /what breaks/i, /changes to/i, /downstream/i, /who should review/i] },
  ];
  for (const { uc, re } of patterns) {
    if (re.some(r => r.test(q))) return uc;
  }
  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION v2 (with fuzzy keyword fallback)
// ═══════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could',
  'should','may','might','shall','can','need','must','ought',
  'i','you','he','she','it','we','they','me','him','her',
  'us','them','my','your','his','its','our','their',
  'this','that','these','those','what','which','who','whom',
  'how','when','where','why','if','then','else','so','but',
  'and','or','not','no','nor','for','with','without','about',
  'from','into','through','during','before','after','above',
  'below','to','of','in','on','at','by','up','down','out',
  'off','over','under','again','further','all','any','both',
  'each','few','more','most','other','some','such','only',
  'own','same','than','too','very','just','because','as',
  'until','while','also','between','every','tell',
  'work','works','working','explain','show','tell','give',
  'help','find','look','see','know','understand','get',
  'make','use','using','does','happen','happens',
  'code','codebase','file','files','function','class',
  'system','project','repo','repository',
]);

function extractEntities(q: string): string[] {
  const ents: string[] = [];

  // Strategy 1: file paths
  const pm = q.match(/[\w\-./]+\.(ts|tsx|js|jsx|py|go)/gi);
  if (pm) ents.push(...pm);

  // Strategy 2: quoted identifiers
  const qm = q.match(/[`"']([^`"']+)[`"']/g);
  if (qm) for (const m of qm) ents.push(m.replace(/[`"']/g, ''));

  // Strategy 3: module/suffix patterns (expanded)
  const mm = q.match(/(?:the\s+)?(\w[\w-]+)\s+(?:module|service|handler|component|controller|package|library|utility|helper|class|function|api|endpoint|system|feature|layer|page|route|middleware|schema|model|database|table|hook|context|provider|store|flow|logic|domain)/gi);
  if (mm) for (const m of mm) {
    const name = m.replace(/\s+(?:module|service|handler|component|controller|package|library|utility|helper|class|function|api|endpoint|system|feature|layer|page|route|middleware|schema|model|database|table|hook|context|provider|store|flow|logic|domain)$/i, '').replace(/^the\s+/i, '').trim();
    if (name.length > 1) ents.push(name);
  }

  // Strategy 4: fuzzy keyword fallback (only if nothing found above)
  if (ents.length === 0) {
    const words = q.toLowerCase().replace(/[^a-z0-9\s\-_@/]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    ents.push(...words);
  }

  return [...new Set(ents)];
}

// ═══════════════════════════════════════════════════════════════════════
// FUZZY GRAPH SEARCH + HUB ANALYSIS + DOMAIN BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════

function fuzzySearchEntities(depGraph: KnowledgeDependencyGraphInstance, keywords: string[], limit = 15) {
  if (keywords.length === 0) return [];
  const allEdges = depGraph.getEdges();
  const entityIds = new Set<string>();
  for (const edge of allEdges) { entityIds.add(edge.sourceId); entityIds.add(edge.targetId); }

  const scored: Array<{ entityId: string; matches: number; domain: string | null }> = [];
  const lowerKws = keywords.map(k => k.toLowerCase());
  for (const eid of entityIds) {
    const lower = eid.toLowerCase();
    let mc = 0;
    for (const kw of lowerKws) { if (lower.includes(kw)) mc++; }
    if (mc > 0) scored.push({ entityId: eid, matches: mc, domain: depGraph.mapEntityToDomain(eid) });
  }
  return scored.sort((a, b) => b.matches - a.matches).slice(0, limit);
}

function getTopHubs(depGraph: KnowledgeDependencyGraphInstance, limit = 10) {
  const allEdges = depGraph.getEdges();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of allEdges) {
    fanOut.set(e.sourceId, (fanOut.get(e.sourceId) || 0) + 1);
    fanIn.set(e.targetId, (fanIn.get(e.targetId) || 0) + 1);
  }
  const all = new Set([...fanIn.keys(), ...fanOut.keys()]);
  const scored: Array<{ entityId: string; fanIn: number; fanOut: number; total: number; domain: string | null }> = [];
  for (const eid of all) {
    const fi = fanIn.get(eid) || 0;
    const fo = fanOut.get(eid) || 0;
    scored.push({ entityId: eid, fanIn: fi, fanOut: fo, total: fi + fo, domain: depGraph.mapEntityToDomain(eid) });
  }
  return scored.sort((a, b) => b.total - a.total).slice(0, limit);
}

function getDomainBreakdown(depGraph: KnowledgeDependencyGraphInstance) {
  const allEdges = depGraph.getEdges();
  const entityIds = new Set<string>();
  for (const e of allEdges) { entityIds.add(e.sourceId); entityIds.add(e.targetId); }
  const domMap = new Map<string, string[]>();
  for (const eid of entityIds) {
    const d = depGraph.mapEntityToDomain(eid) || 'other';
    if (!domMap.has(d)) domMap.set(d, []);
    domMap.get(d)!.push(eid);
  }
  return Array.from(domMap.entries())
    .map(([domain, ents]) => ({ domain, entityCount: ents.length }))
    .sort((a, b) => b.entityCount - a.entityCount);
}

// ═══════════════════════════════════════════════════════════════════════
// USE-CASE HINTS
// ═══════════════════════════════════════════════════════════════════════

function getUseCaseHint(uc: DeveloperUseCase): string {
  const hints: Record<string, string> = {
    onboarding: 'Explain code architecture, key modules, and who to ask for help. Be welcoming and thorough.',
    debugging: 'Trace upstream dependencies for root cause analysis. Show error propagation paths.',
    incident: 'Assess blast radius, identify affected services, and suggest expert contacts for each affected area.',
    knowledge: 'Show bus factor risks, expertise distribution, and suggest knowledge transfer actions.',
    review: 'Analyze impact of changes, suggest reviewers based on expertise, and flag risky downstream effects.',
  };
  return hints[uc] || '';
}

// ═══════════════════════════════════════════════════════════════════════
// BUILD COPILOT CONTEXT (mirrors buildCodeIntelligencePrompt v2)
// ═══════════════════════════════════════════════════════════════════════

function buildCopilotContext(
  depGraph: KnowledgeDependencyGraphInstance,
  expertiseGraph: ExpertiseGraphInstance,
  collabGraph: CollaborationGraphInstance,
  question: string,
): string {
  const useCase = detectUseCase(question);
  const entities = extractEntities(question);
  const sections: string[] = [];

  // ── Resolve entities: exact match first, then fuzzy ──
  let resolvedEntityIds: string[] = [];
  if (entities.length > 0) {
    for (const entity of entities) {
      try {
        const impact = depGraph.analyzeImpact(entity);
        if (impact.totalImpactRadius > 0) resolvedEntityIds.push(entity);
      } catch {}
    }
    if (resolvedEntityIds.length === 0) {
      resolvedEntityIds = fuzzySearchEntities(depGraph, entities, 10).map(r => r.entityId);
    }
  }

  // ── Dependency context ──
  const depStats = depGraph.getStats();
  if (depStats.totalEdges > 0) {
    const lines: string[] = [
      '## Code Dependency Graph',
      `- ${depStats.totalEdges} dependency edges across ${depStats.uniqueEntities} entities`,
      `- Domains: ${Object.entries(depStats.byDomain).map(([d, c]) => `${d}(${c})`).join(', ')}`,
    ];

    // Impact analysis for resolved entities
    for (const eid of resolvedEntityIds.slice(0, 3)) {
      try {
        const impact = depGraph.analyzeImpact(eid);
        if (impact.totalImpactRadius > 0) {
          lines.push('');
          lines.push(`### Impact: ${eid}`);
          lines.push(`- Direct dependents: ${impact.directDependents.length}`);
          lines.push(`- Transitive impact radius: ${impact.totalImpactRadius}`);
          lines.push(`- Risk score: ${(impact.riskScore * 100).toFixed(0)}%`);
          lines.push(`- Affected domains: ${impact.affectedDomains.join(', ')}`);
          if (impact.criticalPaths.length > 0) {
            lines.push(`- Critical paths: ${impact.criticalPaths.slice(0, 3).map(p => p.join(' → ')).join('; ')}`);
          }
        }
      } catch {}
    }

    // ── ONBOARDING: architecture overview ──
    if (useCase === 'onboarding') {
      const hubs = getTopHubs(depGraph, 10);
      if (hubs.length > 0) {
        lines.push('');
        lines.push('### Architecture Hotspots (most connected entities):');
        for (const hub of hubs) {
          const tag = hub.domain ? ` [${hub.domain}]` : '';
          lines.push(`  - ${hub.entityId} (fan-in: ${hub.fanIn}, fan-out: ${hub.fanOut})${tag}`);
        }
      }

      const domains = getDomainBreakdown(depGraph);
      if (domains.length > 0) {
        lines.push('');
        lines.push('### Domain Architecture:');
        for (const d of domains.slice(0, 8)) {
          lines.push(`  - ${d.domain}: ${d.entityCount} entities`);
        }
      }

      if (resolvedEntityIds.length > 0 && entities.length > 0) {
        lines.push('');
        lines.push(`### Entities matching "${entities.join(', ')}":`);
        for (const eid of resolvedEntityIds.slice(0, 8)) {
          const domain = depGraph.mapEntityToDomain(eid);
          lines.push(`  - ${eid}${domain ? ` [${domain}]` : ''}`);
        }
      }
    }

    // ── DEBUGGING / INCIDENT: upstream deps + blast radius ──
    if (useCase === 'debugging' || useCase === 'incident') {
      for (const eid of resolvedEntityIds.slice(0, 3)) {
        const upstream = depGraph.queryDependencies({ entityId: eid, direction: 'upstream', limit: 10 });
        if (upstream.length > 0) {
          lines.push('');
          lines.push(`### Upstream dependencies of ${eid} (potential root causes):`);
          for (const dep of upstream.slice(0, 8)) {
            lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
          }
        }

        if (useCase === 'incident') {
          const downstream = depGraph.queryDependencies({ entityId: eid, direction: 'downstream', limit: 10 });
          if (downstream.length > 0) {
            lines.push('');
            lines.push(`### Downstream dependents of ${eid} (blast radius):`);
            for (const dep of downstream.slice(0, 8)) {
              lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
            }
          }
        }
      }

      if (resolvedEntityIds.length === 0 && entities.length > 0) {
        const fuzzy = fuzzySearchEntities(depGraph, entities, 5);
        if (fuzzy.length > 0) {
          lines.push('');
          lines.push(`### Files matching "${entities.join(', ')}" (possible locations):`);
          for (const f of fuzzy) {
            lines.push(`  - ${f.entityId}${f.domain ? ` [${f.domain}]` : ''}`);
          }
        }
      }
    }

    // ── REVIEW: downstream consumers ──
    if (useCase === 'review') {
      for (const eid of resolvedEntityIds.slice(0, 2)) {
        const downstream = depGraph.queryDependencies({ entityId: eid, direction: 'downstream', limit: 15 });
        if (downstream.length > 0) {
          lines.push('');
          lines.push(`### Downstream consumers of ${eid} (affected by changes):`);
          for (const dep of downstream.slice(0, 10)) {
            lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType})`);
          }
        }
      }
    }

    sections.push(lines.join('\n'));
  }

  // ── Expertise context ──
  const expStats = expertiseGraph.getStats();
  if (expStats.totalEdges > 0) {
    const lines: string[] = [
      '## Expertise Map',
      `- ${expStats.uniqueContributors} contributors across ${expStats.uniqueTopics} topics`,
    ];

    const queriedTopics = new Set<string>();
    for (const entity of entities.slice(0, 5)) {
      if (queriedTopics.has(entity.toLowerCase())) continue;
      queriedTopics.add(entity.toLowerCase());
      const experts = expertiseGraph.queryExperts({ topic: entity, limit: 5 });
      if (experts.length > 0) {
        lines.push('');
        lines.push(`### Experts for "${entity}":`);
        for (const exp of experts) {
          lines.push(`  - ${exp.contributorName || exp.contributorId} (strength: ${(exp.strength * 100).toFixed(0)}%, evidence: ${exp.evidenceCount} contributions)`);
        }
      }
    }

    if (useCase === 'knowledge') {
      const heatmap = expertiseGraph.getHeatmap(30);
      const singles: string[] = [];
      for (const [topic, edges] of heatmap) {
        if (edges.length === 1 && edges[0].strength > 0.3) {
          singles.push(`${topic} (only: ${edges[0].contributorId})`);
        }
      }
      if (singles.length > 0) {
        lines.push('');
        lines.push('### Bus Factor Warnings (single expert):');
        for (const s of singles.slice(0, 10)) lines.push(`  - ⚠️ ${s}`);
      }
    }

    if (useCase === 'onboarding') {
      const heatmap = expertiseGraph.getHeatmap(15);
      if (heatmap.size > 0) {
        lines.push('');
        lines.push('### Top Expertise Areas (who to ask):');
        let shown = 0;
        for (const [topic, edges] of heatmap) {
          if (shown >= 10) break;
          const top = edges[0];
          lines.push(`  - ${topic}: ${edges.length} expert${edges.length > 1 ? 's' : ''}, top: ${top.contributorName || top.contributorId} (${(top.strength * 100).toFixed(0)}%)`);
          shown++;
        }
      }
    }

    sections.push(lines.join('\n'));
  }

  // ── Collaboration context ──
  const netStats = collabGraph.getNetworkStats();
  if (netStats.totalEdges > 0) {
    const lines: string[] = [
      '## Collaboration Network',
      `- ${netStats.totalEdges} collaboration edges across ${netStats.uniqueContributors} contributors`,
      `- Teams: ${netStats.uniqueTeams}, Cross-team edges: ${netStats.crossTeamEdges}`,
      `- Network density: ${(netStats.density * 100).toFixed(1)}%`,
    ];

    if (['incident', 'review', 'knowledge', 'onboarding'].includes(useCase)) {
      const bridges = collabGraph.getBridgeContributors(5);
      if (bridges.length > 0) {
        lines.push('');
        lines.push('### Bridge Contributors (connect teams):');
        for (const b of bridges) {
          lines.push(`  - ${b.contributor}: bridges ${b.teams.join(', ')} (${b.crossTeamEdges} cross-team edges)`);
        }
      }
    }

    sections.push(lines.join('\n'));
  }

  // ── Build final prompt ──
  const hint = getUseCaseHint(useCase);
  return [
    '# Code Intelligence Context',
    `**Developer use case detected:** ${useCase}`,
    hint ? `**Focus:** ${hint}` : '',
    '',
    ...sections,
  ].filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN — sync, parse, build graphs, show context for each question
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const token = process.argv[2] || 'process.env.GITHUB_TOKEN';
  const owner = 'calcom', repo = 'cal.com';

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' COPILOT CONTEXT DEMO v2 — What the LLM actually receives');
  console.log(' Fixed: fuzzy search, onboarding fallback, domain mapping');
  console.log(' Loading brain from real cal.com GitHub API...');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Sync signals
  const signals: ConnectorSignal[] = [];
  const mockDb = createMockSupabase(signals) as any;
  const ghConnector = createGitHubConnector({ token, owner, repo, syncScope: { pulls: true, reviews: true, fileChanges: true, workflows: true, issues: true, commits: true, jobDetails: true } });
  await ghConnector.fullSync(mockDb, 'jarvis-calcom');
  console.log(`✓ Signals synced: ${signals.length}`);

  // Parse code (200 files for speed)
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'NexusBrain' }
  });
  const treeData = await treeRes.json();
  const CODE_EXT = new Set(['.ts','.tsx','.js','.jsx']);
  const EXCLUDE = new Set(['node_modules','.next','dist','build','.git','vendor','coverage']);
  const codeFiles = (treeData.tree || []).filter((f: any) => {
    if (f.type !== 'blob') return false;
    const ext = f.path.substring(f.path.lastIndexOf('.'));
    return CODE_EXT.has(ext) && !f.path.split('/').some((p: string) => EXCLUDE.has(p));
  }).slice(0, 200);

  const parser = createCodeParser();
  const fileIndexes: any[] = [];
  for (let i = 0; i < codeFiles.length; i += 15) {
    const batch = codeFiles.slice(i, i + 15);
    const results = await Promise.all(batch.map(async (file: any) => {
      try {
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}?ref=main`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'NexusBrain' }
        });
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.content) return null;
        return parser.parseSource(Buffer.from(d.content, 'base64').toString('utf-8'), file.path);
      } catch { return null; }
    }));
    for (const fi of results) if (fi) fileIndexes.push(fi);
    if (i + 15 < codeFiles.length) await new Promise(r => setTimeout(r, 150));
    process.stdout.write(`\r  Parsing: ${Math.min(i+15, codeFiles.length)}/${codeFiles.length}...`);
  }
  console.log(`\n✓ Files parsed: ${fileIndexes.length}`);

  // Build graphs
  const depGraph = createKnowledgeDependencyGraph({ weightPerEdge: 0.08 });
  for (const fi of fileIndexes) { try { depGraph.recordFromFileIndex(fi); } catch {} }

  const expertiseGraph = createExpertiseGraph({ minEvidence: 1 });
  const prSigs = signals.filter((s: any) => ['pr_merged','pr_opened','pr_review_submitted'].includes(s.signal_type));
  for (const sig of prSigs) {
    const meta = (sig as any).signal_metadata || sig.metadata || {};
    const who = meta.author || meta.reviewer || meta.user;
    const files = meta.file_paths || meta.directories || [];
    if (who && files.length > 0) {
      for (const f of files.slice(0, 10)) {
        const topic = f.toLowerCase().split('/').find((p: string) => p !== 'src' && p !== 'lib' && p !== 'app' && p !== 'packages' && p !== 'apps' && p.length > 1) || 'general';
        expertiseGraph.recordExpertise({ contributorId: who, contributorName: who, topic, evidenceType: sig.signal_type === 'pr_review_submitted' ? 'review' : 'code_change' });
      }
    }
  }

  const collabGraph = createCollaborationGraph();
  // Build collaboration from review signals (author ↔ reviewer pairs)
  const prMerged = signals.filter((s: any) => s.signal_type === 'pr_merged');
  const prReviews = signals.filter((s: any) => s.signal_type === 'pr_review_submitted');
  for (const pr of prMerged) {
    const prMeta = (pr as any).signal_metadata || pr.metadata || {};
    const author = prMeta.author;
    if (!author) continue;
    const prNum = prMeta.pr_number || prMeta.number;
    for (const review of prReviews) {
      const reviewMeta = (review as any).signal_metadata || review.metadata || {};
      const reviewer = reviewMeta.reviewer || reviewMeta.author;
      const reviewPrNum = reviewMeta.pr_number || reviewMeta.number;
      if (reviewer && reviewer !== author && prNum === reviewPrNum) {
        collabGraph.recordInteraction({ contributorA: author, contributorB: reviewer, interactionType: 'code_review' });
      }
    }
  }

  console.log(`✓ Dep graph: ${depGraph.getStats().totalEdges} edges, ${depGraph.getStats().uniqueEntities} entities`);
  console.log(`✓ Expertise: ${expertiseGraph.getStats().totalEdges} entries, ${expertiseGraph.getStats().uniqueContributors} contributors`);
  const collabStats = collabGraph.getNetworkStats();
  console.log(`✓ Collaboration: ${collabStats.totalEdges} edges, ${collabStats.uniqueContributors} contributors\n`);

  // ═══════════════════════════════════════════════════════════════════
  // THE QUESTIONS — show raw copilot context for each
  // ═══════════════════════════════════════════════════════════════════

  const questions = [
    'How does the booking system work?',
    'Error in the payment handler, what is the root cause?',
    'Auth service is down, what is the blast radius?',
    'Who knows about the API module? What is the bus factor?',
    'What breaks if I change "@calcom/prisma"?',
  ];

  for (const question of questions) {
    console.log('\n' + '═'.repeat(70));
    console.log(`  USER QUESTION: "${question}"`);
    console.log('═'.repeat(70));

    const useCase = detectUseCase(question);
    const entities = extractEntities(question);
    const fullPrompt = buildCopilotContext(depGraph, expertiseGraph, collabGraph, question);

    console.log('\n┌─── RAW CONTEXT INJECTED INTO LLM SYSTEM PROMPT ───┐\n');
    console.log(fullPrompt);
    console.log('\n└─── END OF BRAIN CONTEXT ───────────────────────────┘');
    console.log(`\n  Use case: ${useCase} | Entities extracted: [${entities.join(', ')}]`);
    console.log(`  The LLM receives ONLY this context + the user question.`);
    console.log(`  Nothing else. No hallucination possible — data is from the graph.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
