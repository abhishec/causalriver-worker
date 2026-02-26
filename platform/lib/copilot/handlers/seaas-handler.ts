/**
 * SE-aaS Natural Language Routing
 *
 * Provides:
 *   - detectSEaaSRoute()   — regex fallback SE-aaS domain detection
 *   - detectAccountingRoute() — regex fallback AaaS domain detection
 *   - detectLanguage()     — simple language detection helper
 *
 * Extracted from chat/route.ts (was lines 4237–4670).
 * The LLM interpreter is the primary routing mechanism; these run as safety net.
 */

// ============================================================================
// SE-aaS NATURAL LANGUAGE ROUTING
// ============================================================================

/**
 * Detect if user message should route to an SE-aaS domain.
 *
 * ROUTING TABLE:
 *   "analyze this SQL" / "check SQL" / "SQL query" → sql-analyzer
 *   "generate test cases" / "test for" → test-case-generator
 *   "generate test data" / "mock data" / "seed data" → test-data-generator
 *   "write TDD code" / "implement with tests" → tdd-code-generator
 *   "diagnose incident" / "root cause" / "why is X down" → incident-diagnosis
 *   "impact analysis" / "what's affected" / "blast radius" → impact-analysis
 *   "data lineage" / "where does this data come from" → data-lineage
 *   "query logs" / "find in logs" / "log search" → log-query
 */
export function detectSEaaSRoute(
  message: string
): { domainType: string; extractedInput: Record<string, unknown> } | null {
  const lower = message.toLowerCase();

  // ── SQL Analyzer ──────────────────────────────────────────────────────
  if (
    /analyze\s+(this\s+)?sql|check\s+(this\s+)?sql|sql\s+query\s+review|review\s+(this\s+)?query|optimize\s+(this\s+)?sql|sql\s+(?:quality|audit|analysis|security|performance)|comprehensive\s+sql|perform.*sql\s+(?:quality|analysis)|sql\s+correctness/i.test(lower)
  ) {
    const sqlMatch = message.match(/```(?:sql)?\s*([\s\S]+?)```/) ||
                     message.match(/:\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+[\s\S]+/i);
    const query = sqlMatch ? sqlMatch[1].trim() : message.replace(/^.*?(SELECT|INSERT|UPDATE|DELETE)/i, '$1').trim();

    return {
      domainType: 'sql-analyzer',
      extractedInput: {
        query: query || message,
        analysisTypes: ['correctness', 'performance', 'security', 'style'],
        databaseType: 'postgresql',
      },
    };
  }

  // ── Test Case Generator ───────────────────────────────────────────────
  if (
    /generate\s+test\s+cases?|create\s+test\s+cases?|test\s+cases?\s+for|write\s+tests?\s+for|generate.*test\s+suite|comprehensive.*test\s+suite|executable\s+test\s+suite/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'test-case-generator',
      extractedInput: {
        code: codeMatch?.[1]?.trim() || message,
        language: detectLanguage(message),
        coverage: 'comprehensive',
      },
    };
  }

  // ── Test Data Generator ───────────────────────────────────────────────
  if (
    /generate\s+test\s+data|mock\s+data|seed\s+data|fake\s+data|sample\s+data|synthetic\s+test\s+data|test\s+dataset|generate.*synthetic.*data|pii.safe.*anon/i.test(lower)
  ) {
    return {
      domainType: 'test-data-generator',
      extractedInput: {
        description: message,
        format: 'json',
        count: 10,
      },
    };
  }

  // ── TDD Code Generator ────────────────────────────────────────────────
  if (
    /write\s+(?:tdd|test.driven)|implement\s+with\s+tests?|tdd\s+(?:for|implement)|red.green.refactor|execute\s+(?:the\s+)?(?:complete\s+)?tdd|tdd\s+(?:cycle|agent|red|phase)/i.test(lower)
  ) {
    return {
      domainType: 'tdd-code-generator',
      extractedInput: {
        description: message,
        language: detectLanguage(message),
      },
    };
  }

  // ── Incident Diagnosis ────────────────────────────────────────────────
  if (
    /diagnose\s+(?:this\s+)?incident|root\s+cause|why\s+is\s+.*(?:down|failing|broken|crashing)|incident\s+(?:analysis|diagnosis)/i.test(lower)
  ) {
    return {
      domainType: 'incident-diagnosis',
      extractedInput: {
        description: message,
        severity: /critical|p0|sev.?0/i.test(lower) ? 'critical' : 'high',
      },
    };
  }

  // ── Impact Analysis ───────────────────────────────────────────────────
  if (
    /impact\s+analysis|blast\s+radius|what.?s\s+affected|downstream\s+impact|dependency\s+impact/i.test(lower)
  ) {
    return {
      domainType: 'impact-analysis',
      extractedInput: {
        description: message,
        changeType: 'code_change',
      },
    };
  }

  // ── Data Lineage ──────────────────────────────────────────────────────
  if (
    /data\s+lineage|where\s+does\s+.*(?:data|field)\s+come\s+from|trace\s+data|data\s+flow|data\s+origin/i.test(lower)
  ) {
    return {
      domainType: 'data-lineage',
      extractedInput: {
        description: message,
      },
    };
  }

  // ── Log Query ─────────────────────────────────────────────────────────
  if (
    /query\s+logs?|search\s+logs?|find\s+in\s+logs?|log\s+search|grep\s+logs?|log\s+(?:analysis|analys|investigation|anomaly|pattern|cluster)|error\s+pattern\s+cluster|anomaly\s+(?:timeline|investigation)|intelligent\s+log|log\s+intelligence/i.test(lower)
  ) {
    return {
      domainType: 'log-query',
      extractedInput: {
        query: message,
        timeRange: '24h',
      },
    };
  }

  // ── Dependency Upgrade ──────────────────────────────────────────────
  if (
    /outdated\s+dep|upgrade\s+dep|dependency\s+upgrade|dependency\s+update|check\s+dep.*version|npm\s+audit|security\s+vuln|dependency\s+(?:security|audit|maintenance)|full\s+dependency.*audit|cve\s+audit|package.*security\s+audit/i.test(lower)
  ) {
    const manifestMatch = message.match(/```(?:json)?\s*([\s\S]+?)```/);
    return {
      domainType: 'dependency-upgrade',
      extractedInput: {
        manifest: manifestMatch?.[1]?.trim() || '{}',
        ecosystem: /pip|python/i.test(lower) ? 'pip' : /go\b/i.test(lower) ? 'go' : 'npm',
      },
    };
  }

  // ── Design Doc Generator ─────────────────────────────────────────────
  if (
    /generate\s+(?:hld|lld|design\s+doc)|create\s+(?:hld|lld|design\s+doc)|reverse.?engineer\s+design|architecture\s+doc|system\s+design\s+doc|design\s+documentation\s+package|hld.*lld|publication.ready.*design|c4\s+diagram|sequence\s+diagram.*design/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    const isReverse = /reverse|from\s+code|extract\s+design/i.test(lower);
    return {
      domainType: 'design-doc-generator',
      extractedInput: {
        direction: isReverse ? 'reverse' : 'forward',
        requirements: isReverse ? undefined : message,
        sourceCode: isReverse ? (codeMatch?.[1]?.trim() || message) : codeMatch?.[1]?.trim(),
        level: /hld\s+and\s+lld|both/i.test(lower) ? 'both' : /lld/i.test(lower) ? 'lld' : 'hld',
      },
    };
  }

  // ── Performance Profiler ─────────────────────────────────────────────
  if (
    /performance\s+profil|slow\s+endpoint|bottleneck.*performance|latency\s+analys|apm\s+data|slow\s+query.*analys|performance\s+audit|comprehensive\s+performance|bottleneck\s+analysis|n\+1\s+(?:query|detection)|memory\s+(?:leak|profil)|core\s+web\s+vital/i.test(lower)
  ) {
    return {
      domainType: 'performance-profiler',
      extractedInput: {
        traceData: message,
      },
    };
  }

  // ── Dead Code Detector ───────────────────────────────────────────────
  if (
    /dead\s+code|unused\s+(?:code|import|function|variable)|unreachable\s+code|code\s+cleanup/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'dead-code-detector',
      extractedInput: {
        sourceCode: codeMatch?.[1]?.trim() || message,
        language: detectLanguage(message),
      },
    };
  }

  // ── Boilerplate & Scaffolding Generator ──────────────────────────────
  if (
    /scaffol|boilerplate|generate\s+(?:crud|endpoint|api\s+route|service|component)|new\s+(?:service|module|endpoint|component)\s+(?:for|with|that)/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'boilerplate-scaffold',
      extractedInput: {
        description: message,
        template: codeMatch?.[1]?.trim(),
        language: detectLanguage(message),
        includeTests: true,
        includeLogging: true,
      },
    };
  }

  // ── PR Review & Iteration Assistant ──────────────────────────────────
  if (
    /review\s+(?:this\s+)?(?:pr|pull\s+request|diff|code\s+change)|pr\s+review|code\s+review|check\s+(?:this\s+)?(?:pr|diff)\s+for/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    const prMatch = lower.match(/#(\d+)/);
    return {
      domainType: 'pr-review',
      extractedInput: {
        diff: codeMatch?.[1]?.trim() || message,
        title: prMatch ? `PR #${prMatch[1]}` : 'Code Review',
        prNumber: prMatch ? parseInt(prMatch[1]) : undefined,
        focus: ['security', 'performance', 'correctness', 'tests'],
      },
    };
  }

  // ── Codebase Q&A Agent ────────────────────────────────────────────────
  if (
    /(?:how|where|what|why|explain|show\s+me)\s+.*(?:code|function|class|module|service|endpoint|logic|implemented|work|handler|controller)/i.test(lower) ||
    /understand\s+.*(?:code|codebase)|explain\s+(?:this\s+)?(?:code|function|class|method)/i.test(lower)
  ) {
    return {
      domainType: 'codebase-qa',
      extractedInput: {
        question: message,
        includeGitHistory: true,
      },
    };
  }

  // ── Early Warning — P0 Velocity Collapse Detection ───────────────────
  if (
    /early.warning|velocity\s+(?:collapse|analysis|trend|drop|prediction)|sprint\s+velocity|delivery\s+velocity|SPOF|bottleneck\s+risk|gini\s+coefficient|velocity\s+pulse|collapse\s+risk|at.risk\s+engagement|flight.?risk|overallocation|over.allocated|at.risk\s+engineer|engineer.*(?:risk|burnout|overload)|review\s+burden/i.test(lower) ||
    /run\s+(?:a\s+)?(?:full\s+)?delivery\s+velocity/i.test(lower)
  ) {
    return {
      domainType: 'early-warning',
      extractedInput: {
        query: message,
        analysisMode: 'full',
        lookbackSprints: 3,
        flagThreshold: 0.8,
      },
    };
  }

  // ── Scope Creep Detection — P0 Scope Intelligence ────────────────────
  if (
    /scope\s+(?:creep|drift|integrity|audit|change|growth|injection)|story\s+point\s+drift|scope\s+baseline|unplanned\s+work|mid.sprint\s+(?:addition|injection)|burndown\s+trajectory|scope\s+control/i.test(lower) ||
    /run\s+(?:a\s+)?(?:full\s+)?scope\s+integrity/i.test(lower)
  ) {
    return {
      domainType: 'scope-creep',
      extractedInput: {
        query: message,
        alertThreshold: 0.15,
        cumulative: true,
      },
    };
  }

  // ── Pod Match — Team Assignment Recommendation ────────────────────────
  if (
    /(?:analyse|analyze)\s+(?:all\s+)?(?:available\s+)?(?:engineering\s+)?pods|(?:assign|recommend|which|best|right)\s+(?:\w+\s+)?pod|which\s+team\s+(?:should|for)|pod\s+(?:match|recommendation|assignment)|who\s+should\s+(?:build|work|deliver)|delivery\s+pod|assign.*(?:engagement|client|project)|recommend.*(?:team|pod)|pod.*(?:for|to)\s+(?:the\s+)?(?:engagement|client|project)/i.test(lower)
  ) {
    return {
      domainType: 'pod-match',
      extractedInput: {
        query: message,
        engagementName: message.match(/(?:for|on|about)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?\s+(?:engagement|client|project)/i)?.[1]?.trim(),
        topN: 3,
      },
    };
  }

  // ── Engagement Health Dashboard — Delivery Intelligence composite ─────
  if (
    /delivery\s+intelligence|engagement\s+health|health\s+score|health\s+dashboard|generate.*engagement.*health|rag\s+status|forecast\s+confidence/i.test(lower)
  ) {
    return {
      domainType: 'delivery-intelligence',
      extractedInput: {
        query: message,
        engagementName: message.match(/(?:for|on|about)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?\s+(?:engagement|client|project)/i)?.[1]?.trim(),
      },
    };
  }

  // ── Architecture Extractor ────────────────────────────────────────────
  if (
    /extract.*(?:system\s+)?architecture|show\s+(?:me\s+)?(?:the\s+)?(?:system\s+)?architecture|(?:system|service|micro.?service)\s+(?:graph|map|diagram|topology)|(?:generate|create|build)\s+(?:architecture|c4|container)\s+diagram|architecture\s+(?:overview|document|extract|risks?)|service\s+(?:dependency|communication)\s+map|c4\s+(?:level|diagram|context|container)|service\s+inventory|module\s+ownership\s+map/i.test(lower)
  ) {
    return {
      domainType: 'architecture-extractor',
      extractedInput: {
        query: message,
        includeRisks: true,
        includeMermaid: true,
        includeOwnership: true,
      },
    };
  }

  return null;
}

/**
 * Simple language detection from message content.
 */
export function detectLanguage(message: string): string {
  const lower = message.toLowerCase();
  if (/typescript|\.ts\b/i.test(lower)) return 'typescript';
  if (/python|\.py\b/i.test(lower)) return 'python';
  if (/javascript|\.js\b/i.test(lower)) return 'javascript';
  if (/java\b/i.test(lower)) return 'java';
  if (/go\b|golang/i.test(lower)) return 'go';
  if (/rust\b|\.rs\b/i.test(lower)) return 'rust';
  if (/ruby\b|\.rb\b/i.test(lower)) return 'ruby';
  return 'typescript'; // Default
}

// ============================================================================
// AaaS (ACCOUNTING) NATURAL LANGUAGE ROUTING
// ============================================================================

/**
 * Detect if user message should route to an Accounting-aaS domain.
 *
 * ROUTING TABLE:
 *   "show P&L" / "profit and loss" / "revenue breakdown" → statement-generator
 *   "balance sheet" / "total assets" → statement-generator
 *   "reconcile" / "trial balance" → reconciler
 *   "classify accounts" / "journal entry" → bookkeeper
 *   "GST" / "tax compliance" / "IRAS" → tax-compliance
 *   "Benford" / "anomaly" / "duplicate" → anomaly-detective
 *   "audit" / "workpapers" → audit-preparer
 *   "expense analysis" / "cost breakdown" → statement-generator
 */
export function detectAccountingRoute(
  message: string
): { domainType: string; extractedInput: Record<string, unknown> } | null {
  const lower = message.toLowerCase();

  if (
    /p\s*&\s*l|profit\s+and\s+loss|income\s+statement|revenue\s+breakdown|revenue\s+trend|expense\s+analysis|cost\s+breakdown|margin|financial\s+statement/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'profit-and-loss', question: message },
    };
  }

  if (
    /balance\s+sheet|total\s+assets|total\s+liabilities|equity\s+position|net\s+worth|financial\s+position/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'balance-sheet', question: message },
    };
  }

  if (
    /reconcil|trial\s+balance|month.?end\s+close|completeness\s+check/i.test(lower)
  ) {
    return {
      domainType: 'reconciler',
      extractedInput: { question: message },
    };
  }

  if (
    /classify\s+account|journal\s+entr|double.?entry|chart\s+of\s+account|account\s+classif|bookkeep/i.test(lower)
  ) {
    return {
      domainType: 'bookkeeper',
      extractedInput: { question: message },
    };
  }

  if (
    /\bgst\b|tax\s+compliance|iras|withholding\s+tax|tax\s+filing|tax\s+obligation|vat/i.test(lower)
  ) {
    return {
      domainType: 'tax-compliance',
      extractedInput: { question: message },
    };
  }

  if (
    /benford|anomal|duplicate\s+transaction|round.?number|vendor\s+concentration|suspicious\s+transaction|fraud/i.test(lower)
  ) {
    return {
      domainType: 'anomaly-detective',
      extractedInput: { question: message },
    };
  }

  if (
    /audit\s+read|audit\s+prep|workpaper|audit\s+risk|external\s+audit|audit\s+finding/i.test(lower)
  ) {
    return {
      domainType: 'audit-preparer',
      extractedInput: { question: message },
    };
  }

  if (
    /cash\s+balance|runway|burn\s+rate|cash\s+flow|cash\s+position|how\s+long.*money/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'cash-flow', question: message },
    };
  }

  return null;
}
