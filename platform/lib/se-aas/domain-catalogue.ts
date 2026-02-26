/**
 * Shared Domain Catalogue — SE-AAS & AAAS
 * ========================================
 *
 * Single source of truth for all 20 SE-aaS domain definitions
 * and 6 AAAS agent definitions. Consumed by:
 *   - se-aas/page.tsx (service marketplace)
 *   - se-aas/artifacts/page.tsx (artifact list domain labels)
 *   - PartnerDashboard (usage heatmap)
 *   - ActivationChecklist (domain references)
 *
 * Do NOT duplicate domain labels/icons elsewhere — import from here.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type DomainEntry = {
  id: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  badge?: string;
  badgeVariant?: "accent" | "danger" | "warning" | "success";
  badgePulse?: boolean;
  href?: string;
  copilotPrompt?: string;
  colorClass: string;   // Tailwind text color for accent
  ringClass: string;    // border color
  bgClass: string;      // subtle background tint
};

export type DomainLabel = {
  label: string;
  icon: string;
  color: string;
};

// ── SE-AAS Domain Catalogue (20 domains) ───────────────────────────────────

export const DOMAIN_CATALOGUE: DomainEntry[] = [
  // ── P0: Delivery Intelligence ──────────────────────────────────────────
  {
    id: "early-warning",
    label: "Early Warning",
    icon: "⚡",
    category: "P0 · Delivery Intelligence",
    description:
      "Velocity collapse prediction with GBRT ML · SPOF bottleneck risk via Gini, HHI & Betweenness Centrality. Real-time branch-scoped monitoring.",
    badge: "Live",
    badgeVariant: "accent",
    badgePulse: true,
    href: "/early-warning",
    copilotPrompt: "Run a full delivery velocity analysis across all Jira boards: calculate sprint velocity trend (last 3 sprints), identify Single Point of Failure (SPOF) bottlenecks using contributor Gini coefficient, predict risk of velocity collapse (>20% drop) in next sprint, and flag any engagements with <7 days to deadline that are <80% complete. Show a risk dashboard with traffic-light status (🔴 Critical / 🟡 At-Risk / 🟢 Healthy) and specific recommended interventions for each at-risk engagement. Include a SPOF heat-map showing contributor concentration risk per module.",
    colorClass: "text-red-400",
    ringClass: "border-red-500/25",
    bgClass: "bg-red-500/5",
  },
  {
    id: "delivery-intelligence",
    label: "Engagement Health",
    icon: "💊",
    category: "P0 · Delivery Intelligence",
    description:
      "Health score dashboard — delivery velocity, Jira resolution, scope drift, team sentiment, and forecast confidence across all engagements.",
    copilotPrompt: "Generate a comprehensive Engagement Health Dashboard across all active client engagements. For each engagement produce: (1) Overall Health Score (0–100) with sub-scores for Velocity Health, Scope Health, Team Health, and Forecast Confidence; (2) Sprint Resolution Rate vs. baseline with trend direction; (3) Scope Drift percentage with story-point delta from sprint baseline; (4) Team Sentiment index derived from commit frequency and PR review patterns; (5) RAG status (🔴/🟡/🟢) with specific recommended interventions per engagement. Include an executive summary table ranked by risk score, a 4-week delivery forecast with confidence bands, and a 'Top 3 Actions This Week' section with owner assignments.",
    colorClass: "text-emerald-400",
    ringClass: "border-emerald-500/25",
    bgClass: "bg-emerald-500/5",
  },
  {
    id: "pod-match",
    label: "Pod Match",
    icon: "🎯",
    category: "P0 · Delivery Intelligence",
    description:
      "Recommend the best pod for an engagement — tech stack overlap, past performance, cycle time, and capacity analysis.",
    copilotPrompt: "Analyse all available engineering pods and recommend the optimal team assignment for this engagement. For the top 3 pod candidates, provide: (1) Tech Stack Overlap Score (%) vs. engagement requirements with gap analysis; (2) Historical Performance Score — avg cycle time, on-time delivery rate, defect escape rate from past similar engagements; (3) Current Capacity utilisation percentage and available engineering bandwidth (person-hours/week); (4) Skill Gap Analysis listing technologies requiring ramp-up with estimated learning curve in weeks; (5) Risk-adjusted Recommendation Score combining all factors. Present results as a comparison matrix with a clear 🏆 Winner verdict, confidence level, expected ramp-up timeline, and a 30-day onboarding plan for the recommended pod.",
    colorClass: "text-cyan-400",
    ringClass: "border-cyan-500/25",
    bgClass: "bg-cyan-500/5",
  },
  {
    id: "scope-creep",
    label: "Scope Creep",
    icon: "📏",
    category: "P0 · Delivery Intelligence",
    description:
      "Detect scope creep alerts — story point drift, sprint scope changes, and baseline vs current workload analysis.",
    copilotPrompt: "Run a full scope integrity audit across all active sprints and engagements. For each sprint: (1) Story Point Drift — current total vs. sprint-start baseline (🔴 flag if >15% growth); (2) Mid-Sprint Injection Log — every ticket added post-sprint-start with creator, business justification, and priority; (3) Scope Creep Velocity — rate of unplanned work addition per week with trend (accelerating/stable/decelerating); (4) Burndown Trajectory — overlay baseline vs. actual vs. predicted completion lines with date-slip calculation; (5) Cumulative Scope Growth — flag engagements where total scope has grown >20% since project start. Output a Scope Creep Intelligence Report with: severity rankings per engagement, top offending epic/feature owners, scope-change pattern analysis, and a recommended Scope Control Protocol (change request gates, story point caps, approval workflows).",
    colorClass: "text-warning",
    ringClass: "border-warning/25",
    bgClass: "bg-warning/5",
  },

  // ── P1: Code Intelligence ──────────────────────────────────────────────
  {
    id: "pr-review",
    label: "PR Review",
    icon: "🔍",
    category: "P1 · Code Intelligence",
    description:
      "Brain-augmented code review with causal cascade impact — see how this PR ripples through NPS, customer success, and revenue via L4 causal graph edges.",
    href: "/se-aas/pr-review",
    copilotPrompt: "Perform an expert-level code review of this PR diff with five-dimensional analysis:\n\n(1) 🔐 SECURITY — Identify injection risks (SQL, XSS, command), auth bypass vectors, secret/credential exposure, insecure deserialization, broken access control (OWASP Top 10). For each issue: file:line:severity:remediation.\n\n(2) ⚡ PERFORMANCE — N+1 query patterns, missing database indexes, O(n²) or worse algorithms, unnecessary re-renders, synchronous blocking operations, memory allocation hotspots.\n\n(3) 🐛 CORRECTNESS — Logic bugs, off-by-one errors, race conditions, missing null checks, unhandled error paths, incorrect async/await patterns, state mutation bugs.\n\n(4) 🧪 TEST COVERAGE — Identify uncovered branches and missing test scenarios. For each gap, write the specific test case that should exist (describe/it block with assertions).\n\n(5) 📊 CAUSAL BUSINESS IMPACT — Using Brain causal graph (L4 edges), trace how this code change propagates to: customer NPS scores, support ticket volume, revenue metrics, and SLA compliance. Show the full causal chain with confidence scores.\n\nOutput: Overall Risk Score (0–100), prioritised action items with effort estimates, and a suggested git diff for each critical fix.",
    colorClass: "text-blue-400",
    ringClass: "border-blue-500/25",
    bgClass: "bg-blue-500/5",
  },
  {
    id: "tdd",
    label: "TDD Agent",
    icon: "🧪",
    category: "P1 · Code Intelligence",
    description:
      "Red-Green-Refactor cycle: auto-generate unit + integration tests with coverage estimation, mocking strategy, and test prioritisation from Brain signal history.",
    copilotPrompt: "Execute the complete TDD Red-Green-Refactor cycle for this codebase:\n\n🔴 PHASE 1 — RED (Failing Tests): Generate a comprehensive test suite covering: (a) Happy path unit tests for every exported function/class method; (b) Boundary condition tests — null, undefined, empty arrays, max-length strings, type coercions, negative numbers; (c) Integration tests for all service boundaries and external API calls; (d) Negative path tests — expected error conditions, thrown exceptions, validation rejections.\n\n🟢 PHASE 2 — GREEN (Minimal Implementation): For each failing test, generate the minimum implementation code required to pass it. Include inline comments explaining the intent.\n\n🔵 PHASE 3 — REFACTOR: Identify code smells in the GREEN implementation (duplication, long methods, deep nesting, magic numbers) and provide refactored versions that preserve all test coverage.\n\n📊 DELIVERABLES: (1) Coverage Report — estimated line/branch/function coverage %; (2) Mock Factory Code — typed mock implementations for all external dependencies; (3) Test Execution Order — optimised sequence for fastest CI feedback (unit → integration → e2e); (4) Flaky Test Risk Assessment — flag any tests with timing dependencies or shared state.",
    colorClass: "text-green-400",
    ringClass: "border-green-500/25",
    bgClass: "bg-green-500/5",
  },
  {
    id: "boilerplate-scaffold",
    label: "Scaffolding",
    icon: "🏗️",
    category: "P1 · Code Intelligence",
    description:
      "Generate production-ready boilerplate: REST API, microservice, React component, CLI tool — opinionated templates with your team's patterns baked in.",
    href: "/se-aas/scaffolding",
    copilotPrompt: "Generate a production-ready enterprise project scaffold with the following components:\n\n📁 PROJECT STRUCTURE: src/ (app, domain, infrastructure, shared), tests/ (unit, integration, e2e), docs/, scripts/ — with barrel exports and path aliases configured.\n\n🔧 CONFIGURATION: TypeScript strict mode tsconfig.json, ESLint + Prettier with team ruleset, .env validation with Zod schema on startup, package.json with all scripts (dev, build, test, lint, typecheck, migrate).\n\n🌐 API LAYER: Express/Fastify router with: OpenAPI 3.0 spec auto-generation, Zod request/response validation middleware, global error handler with typed error classes, structured logging (Pino) with request correlation IDs, rate limiting, CORS, helmet security headers.\n\n🔐 AUTH SCAFFOLD: JWT access + refresh token rotation, auth middleware with role-based guards, API key authentication option, session invalidation support.\n\n🗄️ DATABASE LAYER: Connection pooling config, migration runner with rollback support, repository pattern with fully typed queries, transaction helper with automatic rollback.\n\n🧪 TESTING SETUP: Jest config with path aliases, test factory functions for all entities, Supertest API test helpers, 80% coverage enforcement gate.\n\n🚀 CI/CD: GitHub Actions pipeline (lint → typecheck → test → build → security scan → deploy), Docker + docker-compose for local dev, health check endpoint (/health with deep DB check).\n\nOutput: complete file tree + full file contents for every scaffolded file.",
    colorClass: "text-purple-400",
    ringClass: "border-purple-500/25",
    bgClass: "bg-purple-500/5",
  },
  {
    id: "dependency-upgrade",
    label: "Dep Upgrade",
    icon: "📦",
    category: "P1 · Code Intelligence",
    description:
      "Audit outdated packages, detect breaking changes, generate migration steps with risk scores, flag CVEs, and surface npm advisory security issues.",
    href: "/se-aas/dep-upgrade",
    copilotPrompt: "Perform a full dependency security and maintenance audit of this project. For every package in package.json analyse:\n\n🔐 SECURITY AUDIT: List all CVEs affecting installed versions (CVSS score, severity level, attack vector, affected versions, first patched version, exploit availability). Flag packages with CRITICAL or HIGH CVEs for immediate action.\n\n📅 STALENESS ANALYSIS: Flag packages >2 major versions behind current stable. Show version history timeline and identify packages that are abandoned or unmaintained (no commits >2 years).\n\n💥 BREAKING CHANGES: For each package requiring a major version bump, extract and summarise all breaking changes from changelogs. Categorise by: API removals, signature changes, behavioural changes, configuration changes.\n\n🔧 MIGRATION GUIDE: For each upgrade, generate: automated codemods (where available), manual code change instructions with before/after examples, estimated effort in hours, and safe upgrade ordering to avoid conflicts.\n\n📊 RISK SCORING: Composite upgrade risk score (0–100) = CVE severity × usage frequency × breaking change complexity × test coverage.\n\n📋 PRIORITISED UPGRADE PLAN:\n- 🚨 CRITICAL: Patch within 24h (active CVEs)\n- 🔴 HIGH: This sprint (CVEs or major staleness)\n- 🟡 MEDIUM: Next quarter (minor improvements)\n- 🟢 LOW: Backlog (cosmetic updates)\n\nTotal estimated effort hours and recommended upgrade sequence.",
    colorClass: "text-orange-400",
    ringClass: "border-orange-500/25",
    bgClass: "bg-orange-500/5",
  },
  {
    id: "design-doc-generator",
    label: "HLD / LLD",
    icon: "📐",
    category: "P1 · Code Intelligence",
    description:
      "Forward mode (requirements → design) or reverse mode (code → design): generates HLD & LLD docs with Mermaid architecture, sequence, and ER diagrams.",
    href: "/se-aas/design-doc",
    copilotPrompt: "Generate a complete, publication-ready system design documentation package:\n\n━━━ PART 1: HIGH-LEVEL DESIGN ━━━\n\n🏗️ SYSTEM CONTEXT (C4 Level 1 — Mermaid): All external actors, the system boundary, and key integrations. Show data flow directions.\n\n📦 CONTAINER DIAGRAM (C4 Level 2 — Mermaid): Each service/application with its technology stack, responsibilities, and communication protocols between containers.\n\n🏛️ ARCHITECTURAL DECISIONS (ADR format): For the 5 most significant decisions — Context, Options Considered (pros/cons table), Decision Made, Consequences (positive and negative).\n\n📊 NON-FUNCTIONAL REQUIREMENTS MATRIX: Latency targets (p50/p95/p99), throughput (RPS), availability SLA (%), scalability strategy, DR/RTO/RPO targets.\n\n━━━ PART 2: LOW-LEVEL DESIGN ━━━\n\n🔩 COMPONENT DIAGRAM (C4 Level 3 — Mermaid): Internal structure of each major service with interfaces.\n\n🔄 SEQUENCE DIAGRAMS (Mermaid): Full actor-to-database sequence for the 3 most critical user flows — include async operations, error branches, and timeout handling.\n\n🗃️ ENTITY-RELATIONSHIP DIAGRAM (Mermaid): All tables with columns, data types, PKs, FKs, unique constraints, and indexes.\n\n📡 API CONTRACT SPECIFICATION: Every endpoint — method, path, request schema (with required/optional fields), response schema (200, 400, 401, 404, 500), and example payloads.\n\n🔀 DATA FLOW DIAGRAM: How data enters, transforms, and exits the system — including all transformation functions and validation gates.\n\n⚠️ ERROR HANDLING MATRIX: Every error class, its trigger conditions, recovery strategy, and user-facing message.\n\nOutput all Mermaid diagrams as copyable code blocks + full written narrative.",
    colorClass: "text-cyan-400",
    ringClass: "border-cyan-500/25",
    bgClass: "bg-cyan-500/5",
  },

  // ── P1: Test Intelligence ──────────────────────────────────────────────
  {
    id: "test-case-generator",
    label: "Test Cases",
    icon: "✅",
    category: "P1 · Test Intelligence",
    description:
      "Generate comprehensive test suites from code analysis — edge cases, boundary conditions, happy paths, integration paths, and negative test scenarios.",
    href: "/se-aas/test-cases",
    copilotPrompt: "Generate a comprehensive, executable test suite for this codebase across all testing layers:\n\n🧪 UNIT TESTS (Jest): For every exported function and class method — happy path with representative inputs, all parameter edge cases (null/undefined/empty/boundary), error throwing and catching, pure function property-based test cases.\n\n🔗 INTEGRATION TESTS (Supertest): Every API endpoint tested with — valid authenticated request (200), unauthenticated request (401), forbidden role (403), invalid input (400 with specific validation errors), DB constraint violations (409), and server error handling (500).\n\n🎭 E2E TEST SCENARIOS (Playwright): The 5 most critical user journeys — each as a step-by-step script with explicit assertions at each step, screenshot checkpoints, and failure recovery.\n\n🎯 EDGE CASE MATRIX: Systematic edge cases using equivalence partitioning + boundary value analysis — for each input domain: minimum, minimum+1, nominal, maximum-1, maximum, and out-of-bounds values.\n\n🔐 SECURITY TEST CASES: SQL injection payloads, XSS vectors, CSRF token bypass attempts, JWT manipulation, mass assignment attacks — each as a concrete test with expected rejection.\n\n⚡ PERFORMANCE BASELINE TESTS: k6/Artillery load test scenarios for key endpoints — ramp profile, assertions on p95 < target latency, pass/fail criteria.\n\nOutput as runnable test files with proper describe/it structure, TypeScript types, and a coverage gap analysis report.",
    colorClass: "text-emerald-400",
    ringClass: "border-emerald-500/25",
    bgClass: "bg-emerald-500/5",
  },
  {
    id: "test-data-generator",
    label: "Test Data",
    icon: "🎲",
    category: "P1 · Test Intelligence",
    description:
      "Synthetic test data generation with referential integrity, PII-safe anonymisation, and scenario-based dataset creation for realistic load testing.",
    href: "/se-aas/test-data",
    copilotPrompt: "Generate a complete synthetic test dataset for this database schema with full referential integrity:\n\n📋 SEED DATA (Development): 50–100 realistic records per entity with domain-appropriate values — names from locale-specific distributions, dates in realistic ranges, IDs correctly linked across FK relationships, enum fields using realistic frequency distributions.\n\n🎯 EDGE CASE RECORDS: One record per entity covering — all nullable fields set to NULL, maximum-length strings at column char limit, boundary numeric values (0, 1, max int, negative), Unicode/emoji in text fields, empty arrays/JSON objects.\n\n🏋️ LOAD TEST DATASET: 10,000–100,000 records per primary entity following production-like statistical distributions. Designed for k6/Artillery load testing with realistic query patterns.\n\n🔒 PII-SAFE ANONYMISATION: Format-preserving transformations for all PII fields — emails (realistic fake format preserving domain structure), phone numbers (valid format, fake numbers), names (locale-appropriate fakes), addresses (real city/country, fake street), credit cards (Luhn-valid, test BINs only).\n\n📦 NAMED SCENARIO DATASETS: Pre-built datasets for specific test scenarios: 'expired_subscription_user', 'payment_failed_account', 'high_volume_enterprise_customer', 'new_user_onboarding', 'churned_user_reactivation'.\n\n🛠️ OUTPUT FORMATS: SQL INSERT statements (with transaction wrapping), JSON fixtures (for API tests), TypeScript factory functions (for unit tests with Faker.js), CSV files (for bulk import testing).",
    colorClass: "text-teal-400",
    ringClass: "border-teal-500/25",
    bgClass: "bg-teal-500/5",
  },

  // ── SWE Gap Closure ────────────────────────────────────────────────────
  {
    id: "codebase-qa",
    label: "Codebase Q&A",
    icon: "💬",
    category: "SWE · Codebase Understanding",
    description:
      "Ask natural language questions about your codebase — Brain-augmented with learned team patterns, architectural decisions, and cross-module dependency knowledge.",
    href: "/se-aas/codebase-qa",
    copilotPrompt: "Perform a deep architectural analysis of this codebase and generate a Codebase Intelligence Report:\n\n🏗️ ARCHITECTURE OVERVIEW: System layering (presentation → business logic → data access → infrastructure), design patterns in use (Repository, Factory, Observer, etc.) and where they're applied, framework conventions and how they're followed.\n\n🕸️ MODULE DEPENDENCY MAP: Inter-module dependency graph (Mermaid), coupling score between modules (afferent/efferent coupling), circular dependency detection, suggested decoupling refactors.\n\n🚪 ENTRY POINT TRACES: For the 5 most critical user-facing features, trace the complete call chain from HTTP request → controller → service → repository → database and back, including all middleware touchpoints.\n\n🌊 DATA FLOW ANALYSIS: How data enters the system, all transformation boundaries, validation gates, and where data exits or is persisted. Identify data mutation hotspots.\n\n🧑‍💻 TEAM PATTERNS CODEX: Document the implicit conventions this team uses — naming patterns, error handling style, async patterns, test organization, comment conventions. These are the 'unwritten rules' new joiners need to know.\n\n💳 TECHNICAL DEBT INVENTORY: Top 10 debt items with — description, root cause, effort to fix (S/M/L/XL), business risk if left unaddressed (Low/Medium/High/Critical), and recommended fix priority.",
    colorClass: "text-violet-400",
    ringClass: "border-violet-500/25",
    bgClass: "bg-violet-500/5",
  },
  {
    id: "dead-code-detector",
    label: "Dead Code",
    icon: "🧹",
    category: "SWE · Codebase Understanding",
    description:
      "Identify unreachable functions, unused imports, dead files — safe removal plan with confidence scores ranked by impact on bundle size and maintenance burden.",
    href: "/se-aas/dead-code",
    copilotPrompt: "Perform a complete dead code audit and generate a Safe Removal Plan:\n\n☠️ UNREACHABLE FUNCTIONS: Functions never reachable from any call graph entry point. For each: confidence score (High/Medium/Low), how unreachability was determined (static analysis path, no import found, etc.), last git commit that touched it, estimated bundle size savings.\n\n📥 UNUSED IMPORTS: Every import where the symbol is never referenced in the file. Format: file:line:import-name:estimated-kb-saved.\n\n🗂️ DEAD FILES: Source files with zero inbound imports from active code paths. Flag separately: files only referenced from other dead files (cascading dead code), test files with no corresponding source file.\n\n⚠️ DEPRECATED API USAGE: Calls to @deprecated functions, removed library APIs, polyfills for now-native browser features, Node.js deprecated APIs.\n\n🏳️ DEAD FEATURE FLAGS: Boolean constants or env-driven flags hardcoded to enable/disable features permanently — flag for cleanup.\n\n📊 BUNDLE IMPACT ANALYSIS: Rank all dead code by minified+gzipped KB savings. Show cumulative savings if all dead code were removed.\n\n🗺️ REMOVAL ROADMAP:\n- ✅ Safe to delete immediately (zero risk, high confidence)\n- 🔍 Verify before deletion (dynamic usage possible, check at runtime)\n- ⏸️ Keep for now (explain why — upcoming feature, external API contract, etc.)\n\nInclude exact git commands for safe removal of each item.",
    colorClass: "text-gray-400",
    ringClass: "border-gray-500/25",
    bgClass: "bg-gray-500/5",
  },
  {
    id: "impact-analysis",
    label: "Impact Analysis",
    icon: "💥",
    category: "SWE · Codebase Understanding",
    description:
      "Blast radius analysis: what breaks if you change module X? Traces dependency graph paths, identifies fragile coupling, and ranks downstream risk.",
    href: "/se-aas/impact",
    copilotPrompt: "Perform a full blast radius analysis for this proposed code change:\n\n🎯 DIRECT DEPENDENTS: Every module/function that directly imports or calls the changed component. Format: file:function:line — with the specific usage pattern and sensitivity to the change.\n\n🌊 TRANSITIVE IMPACT GRAPH (Mermaid): Full N-level dependency graph showing everything reachable from the change point. Color-code by risk level (red=high, amber=medium, green=low). Show the longest dependency chain.\n\n📜 API CONTRACT ANALYSIS: Any changes to function signatures, return types, thrown error types, or async behaviour that constitute breaking changes for callers.\n\n🗄️ DATABASE IMPACT: Schema changes, affected query plans (indexes still valid?), migration requirements, data backfill needs, FK constraint implications.\n\n⚙️ RUNTIME BEHAVIOUR DELTA: Expected changes in memory usage, response latency, throughput capacity, error rate patterns, and background job scheduling.\n\n🧪 TEST IMPACT MATRIX: Existing tests that cover the changed code (will pass/fail/need update?), new tests required, estimated testing effort.\n\n🚀 DEPLOYMENT STRATEGY: Can this ship without downtime? Does it need a feature flag for gradual rollout? What's the rollback procedure if it fails in production? Is a dark launch feasible?\n\n📊 RISK MATRIX: Each affected area scored by Probability × Impact with recommended mitigation actions.",
    colorClass: "text-red-400",
    ringClass: "border-red-500/25",
    bgClass: "bg-red-500/5",
  },

  // ── Observability ──────────────────────────────────────────────────────
  {
    id: "incident-diagnosis",
    label: "Incident RCA",
    icon: "🚨",
    category: "Observability",
    description:
      "Root cause analysis with Brain causal intelligence — trace production incidents upstream through signal history to the engineering or config change that triggered them.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/incident",
    copilotPrompt: "Conduct a structured Root Cause Analysis (RCA) for this production incident using Brain causal intelligence:\n\n⏱️ INCIDENT TIMELINE: Reconstruct the precise event sequence with timestamps — first symptom detected, alert fired, user impact began, escalation points, mitigation applied, service restored. Include all relevant log entries and metric anomalies.\n\n🔗 SYMPTOM CHAIN: Starting from the user-visible symptom, trace backwards through each contributing cause with evidence for each causal link.\n\n🎯 ROOT CAUSE IDENTIFICATION: The deepest causal node that triggered the chain. Distinguish clearly between: Root Cause (the origin), Contributing Factors (amplifiers), and Proximate Cause (immediate trigger).\n\n📊 CAUSAL GRAPH (Mermaid): Full cause-and-effect diagram from root cause through to user impact, with Brain L4 edge confidence scores on each causal link.\n\n🔧 IMMEDIATE FIX: Fastest action to restore service right now (with exact commands/steps).\n\n🏗️ PERMANENT FIX: Architectural or code changes to eliminate the root cause permanently. Include PR description template.\n\n👁️ DETECTION GAP: What monitoring, alerting, or observability was missing that would have caught this 30+ minutes earlier? Specific metric thresholds and alert rules to add.\n\n📚 PREVENTION PROTOCOL: Runbook updates, automated circuit breakers, chaos engineering tests, review checklist additions to prevent recurrence.\n\nOutput: Complete post-mortem document in standard 5-why format, ready for stakeholder review.",
    colorClass: "text-pink-400",
    ringClass: "border-pink-500/25",
    bgClass: "bg-pink-500/5",
  },
  {
    id: "log-query",
    label: "Log Query",
    icon: "📋",
    category: "Observability",
    description:
      "Query logs with natural language — pattern detection, error clustering, anomaly timeline construction, and structured export for post-mortems.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/log-query",
    copilotPrompt: "Perform intelligent log analysis and anomaly investigation across all system logs:\n\n🔍 ERROR PATTERN CLUSTERING: Group all ERROR and WARN entries by message template (strip dynamic values — IDs, timestamps, user data). For each cluster: total count, first/last occurrence, affected services, frequency trend (accelerating/stable/declining).\n\n📈 ANOMALY TIMELINE: Identify time windows where error rates exceeded normal baseline by >2σ. Correlate spikes with: deployment events, traffic volume changes, external dependency degradation, scheduled jobs, database maintenance.\n\n🌊 REQUEST CHAIN TRACING: For the top 3 error patterns, trace backwards through correlation IDs to reconstruct the full request chain from user action → service call → database query. Find the originating failure point.\n\n👥 USER IMPACT ASSESSMENT: For each error window, estimate: number of affected unique users, affected request percentage, degraded vs. failed requests, geographic distribution of impact.\n\n⚡ PERFORMANCE DEGRADATION ANALYSIS: Slow requests above p95 threshold — common endpoint patterns, user segments, payload sizes, time-of-day correlation.\n\n📋 STRUCTURED EXPORT:\n- Post-mortem timeline (Markdown)\n- Error frequency histogram (ASCII chart)\n- Top 10 errors ranked by business impact\n- Prioritised fix list with severity × frequency scoring\n- Recommended log retention and alerting rules",
    colorClass: "text-yellow-400",
    ringClass: "border-yellow-500/25",
    bgClass: "bg-yellow-500/5",
  },
  {
    id: "performance-profiler",
    label: "Perf Profiler",
    icon: "⚡",
    category: "Observability",
    description:
      "APM analysis: identify slow endpoints, N+1 queries, memory leaks, and SLA risk — ranked by business impact from Brain's revenue-performance causal model.",
    href: "/se-aas/perf-profiler",
    copilotPrompt: "Perform a comprehensive performance audit and bottleneck analysis:\n\n🐌 SLOW ENDPOINT RANKING: All API endpoints ranked by p95 and p99 latency. For the bottom 10: full request trace breakdown (parsing → auth → business logic → DB → serialization), compared against SLA targets, with estimated user abandonment rate impact.\n\n🗄️ DATABASE QUERY ANALYSIS: (a) N+1 patterns — identify ORM-generated sequential queries that should be batched JOINs; (b) Missing indexes — tables being sequentially scanned with CREATE INDEX statements and estimated query speedup; (c) Slow query log — queries >100ms with execution plan interpretation; (d) Lock contention — queries causing blocking and deadlock risk.\n\n💾 MEMORY PROFILING: Heap growth trends indicating leaks, large object allocation hotspots, GC pause frequency and duration, memory-intensive operations that could be streamed.\n\n🎨 FRONTEND PERFORMANCE: Core Web Vitals breakdown (LCP/FID/CLS with scores), render-blocking resources, unused JavaScript (KB), largest network requests, image optimisation opportunities.\n\n🔄 CONCURRENCY BOTTLENECKS: Thread/worker pool saturation, connection pool exhaustion patterns, serialised async operations that could be parallelised, event loop blocking code.\n\n💰 BUSINESS IMPACT RANKING (Brain Revenue-Performance Model): Each bottleneck scored by revenue at risk if SLA is breached, customer segment affected, and churn probability increase per 100ms latency increase.\n\n📊 PERFORMANCE IMPROVEMENT ROADMAP: Ranked by (Impact/Effort), with estimated latency improvement % and implementation complexity (hours) per fix.",
    colorClass: "text-amber-400",
    ringClass: "border-amber-500/25",
    bgClass: "bg-amber-500/5",
  },

  // ── Data ──────────────────────────────────────────────────────────────
  {
    id: "sql-analyzer",
    label: "SQL Analyzer",
    icon: "🗄️",
    category: "Data",
    description:
      "SQL correctness, performance optimisation, N+1 detection, injection prevention, and style linting — with execution plan analysis where DB access is available.",
    href: "/se-aas/sql-analyze",
    copilotPrompt: "Perform a comprehensive SQL quality, security, and performance analysis:\n\n🐛 CORRECTNESS ANALYSIS: Logical errors in JOIN conditions (Cartesian products, missing ON clauses), incorrect aggregation groupings (missing GROUP BY columns), wrong HAVING vs. WHERE placement, implicit type coercions that change semantics, NULL comparison anti-patterns (= NULL vs. IS NULL).\n\n⚡ PERFORMANCE OPTIMISATION: Generate EXPLAIN ANALYZE interpretation — identify sequential scans, hash joins vs. index scans, row estimate accuracy. For each full-scan: suggest the specific index type (B-tree, GIN, partial, covering) with CREATE INDEX statement and estimated speedup ratio.\n\n🔁 N+1 DETECTION: Identify ORM-generated query loops. For each N+1 pattern, provide the batched JOIN or IN() query replacement with expected query count reduction (e.g., 'reduces 1+N queries to 2 queries').\n\n🔐 INJECTION PREVENTION: Flag all string concatenation or interpolation in queries. Provide parameterised equivalents with $1/$2 placeholders. Flag dynamic ORDER BY/table name constructions requiring whitelist validation.\n\n📊 INDEX RECOMMENDATIONS: Missing indexes ranked by selectivity estimate and query frequency. Include: column(s), index type, partial condition (WHERE clause for partial indexes), and estimated storage overhead.\n\n✏️ STYLE & MAINTAINABILITY: Subqueries replaceable with CTEs for readability, inconsistent aliasing, missing comments on complex business logic, overly complex WHERE clauses extractable to views.\n\n🔬 EXECUTION PLAN (if DB access available): Run EXPLAIN (ANALYZE, BUFFERS) and provide human-readable interpretation with the top 3 immediate optimisation actions.",
    colorClass: "text-blue-400",
    ringClass: "border-blue-500/25",
    bgClass: "bg-blue-500/5",
  },
  {
    id: "data-lineage",
    label: "Data Lineage",
    icon: "🔗",
    category: "Data",
    description:
      "Map data flow through your system — FK relationships, transformation chains, circular dependency detection, and compliance-ready lineage reports.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/lineage",
    copilotPrompt: "Map the complete data lineage for this system and generate a compliance-ready lineage report:\n\n📥 DATA ORIGINS: All external data sources (REST APIs, webhooks, file imports, user input forms, message queues) with their ingestion points in the codebase, ingestion frequency, and data owner.\n\n🔀 TRANSFORMATION CHAIN: Every transformation applied to each significant data field as it moves through the system — format conversions, calculations, enrichments, aggregations, normalizations. For each transformation: function/service responsible, data quality rule applied, failure behaviour.\n\n🗃️ FOREIGN KEY GRAPH (Mermaid ER diagram): Complete FK relationship map across all tables — PK/FK columns, ON DELETE/ON UPDATE cascade rules, indexes on FK columns, orphan record risk assessment.\n\n🔄 CIRCULAR DEPENDENCY DETECTION: Any circular data dependencies that could cause consistency anomalies or infinite update loops. Suggest resolution strategies.\n\n🛡️ DATA QUALITY GATES: Where are validations applied in the pipeline? Which fields can enter invalid states? Where are the quality enforcement gaps? Recommended validation rules to add.\n\n🔒 COMPLIANCE LINEAGE (GDPR/CCPA): Trace every PII field from collection point through all transformations to storage and display — including: who has read access, any point where PII crosses system boundaries, retention policy per field, deletion cascade behaviour.\n\n📤 OUTPUT FORMAT: (1) Visual lineage diagram (Mermaid), (2) OpenLineage JSON export for compliance tooling, (3) Written narrative per primary data entity, (4) Data stewardship matrix (field → owner → retention policy).",
    colorClass: "text-indigo-400",
    ringClass: "border-indigo-500/25",
    bgClass: "bg-indigo-500/5",
  },

  // ── SWE · Architecture ────────────────────────────────────────────────
  {
    id: "architecture-extractor",
    label: "Architecture",
    icon: "🏛️",
    category: "SWE · Codebase Understanding",
    description:
      "Extract your full system architecture: service graph, data flows, module ownership, Mermaid diagrams, and architecture risks — auto-updated as code changes.",
    href: "/se-aas/architecture",
    copilotPrompt: "Extract and document the complete system architecture from this codebase:\n\n📋 SERVICE INVENTORY: Enumerate all services/applications with — primary responsibility (one sentence), technology stack, deployment target (container/serverless/VM), team owner, and external dependencies.\n\n📊 C4 ARCHITECTURE DIAGRAMS (Mermaid — all levels):\n- Level 1 System Context: actors (users, external systems) and system boundary\n- Level 2 Container: services, databases, message queues, CDN with protocols\n- Level 3 Component: internal modules per service with interfaces\n\n🔌 SERVICE COMMUNICATION MAP: All sync (REST, gRPC, GraphQL) and async (Kafka, SQS, webhooks) channels — with protocol, data contract format (JSON schema / protobuf), timeout/retry config, and circuit breaker status.\n\n🗄️ DATA ARCHITECTURE: All databases and data stores — schema summaries, data ownership boundaries, replication topology, caching layers (Redis/CDN), backup strategy, and estimated data volumes.\n\n👥 MODULE OWNERSHIP MAP: Team/squad ownership per service and module with on-call contact and documentation links. Identify orphaned modules with no clear owner.\n\n⚠️ ARCHITECTURE RISKS: (a) Single points of failure with no redundancy; (b) Services missing health checks or circuit breakers; (c) Undocumented external dependencies; (d) Missing rate limiting on public APIs; (e) Services sharing databases (coupling risk); (f) Missing idempotency on critical write operations.\n\n🗺️ EVOLUTIONARY ROADMAP: Top 5 architectural improvements ranked by (risk reduction × implementation effort) with effort estimates (person-weeks) and expected reliability/scalability gains.\n\nOutput: Complete architecture document with all Mermaid source code blocks ready for Confluence/Notion embedding.",
    badge: "New",
    badgeVariant: "accent",
    colorClass: "text-sky-400",
    ringClass: "border-sky-500/25",
    bgClass: "bg-sky-500/5",
  },
];

// ── Derived lookups ────────────────────────────────────────────────────────────

/** id → { label, icon, colorClass, bgClass } for quick lookups */
export const DOMAIN_LABEL_MAP: Record<
  string,
  { label: string; icon: string; colorClass: string; bgClass: string }
> = {
  ...Object.fromEntries(
    DOMAIN_CATALOGUE.map((d) => [
      d.id,
      { label: d.label, icon: d.icon, colorClass: d.colorClass, bgClass: d.bgClass },
    ])
  ),
  // Alias: domain-executor routes TDD as 'tdd-code-generator', catalogue id is 'tdd'
  "tdd-code-generator": { label: "TDD Agent", icon: "🧪", colorClass: "text-green-400", bgClass: "bg-green-500/5" },
};

/** id → { label, icon, color } for artifact list domain chips */
export const DOMAIN_LABELS: Record<string, DomainLabel> = {
  ...Object.fromEntries(
    DOMAIN_CATALOGUE.map((d) => [
      d.id,
      { label: d.label, icon: d.icon, color: d.colorClass },
    ])
  ),
  // Alias: domain-executor routes 'tdd-code-generator' but DOMAIN_CATALOGUE id is 'tdd'.
  // Both must resolve so artifact list chips render the correct label.
  "tdd-code-generator": { label: "TDD Agent", icon: "🧪", color: "text-green-400" },
};

// ── AAAS Agent Catalogue (6 agents) ────────────────────────────────────────────

export type AaasAgentEntry = {
  id: string;
  label: string;
  icon: string;
  description: string;
  colorClass: string;
};

export const AAAS_AGENT_CATALOGUE: AaasAgentEntry[] = [
  {
    id: "bookkeep",
    label: "Bookkeeper",
    icon: "📒",
    description: "Automated double-entry booking, GL classification, and journal-to-ledger reconciliation.",
    colorClass: "text-emerald-400",
  },
  {
    id: "reconcile",
    label: "Reconciler",
    icon: "⚖️",
    description: "Bank-to-book matching, variance identification, and 3-way reconciliation across sub-ledgers.",
    colorClass: "text-blue-400",
  },
  {
    id: "statements",
    label: "Statement Generator",
    icon: "📊",
    description: "P&L, Balance Sheet, Cash Flow statements — GAAP/IFRS-compliant with period comparison and drill-down.",
    colorClass: "text-violet-400",
  },
  {
    id: "tax",
    label: "Tax Compliance",
    icon: "🏛️",
    description: "Tax provision calculation, multi-jurisdiction compliance checks, and deferred tax tracking.",
    colorClass: "text-orange-400",
  },
  {
    id: "audit",
    label: "Audit Preparer",
    icon: "🔎",
    description: "Audit-ready workpaper generation, control testing documentation, and sampling evidence packages.",
    colorClass: "text-pink-400",
  },
  {
    id: "anomaly",
    label: "Anomaly Detective",
    icon: "🔮",
    description: "Benford's Law analysis, outlier detection, trend breaks, and causal anomaly explanation via Brain L4.",
    colorClass: "text-red-400",
  },
];

/** id → label for AAAS agent lookups */
export const AAAS_AGENT_LABEL_MAP: Record<string, { label: string; icon: string }> =
  Object.fromEntries(
    AAAS_AGENT_CATALOGUE.map((a) => [a.id, { label: a.label, icon: a.icon }])
  );

/** All domain IDs (SE-aaS + AAAS) */
export const ALL_DOMAIN_IDS = [
  ...DOMAIN_CATALOGUE.map((d) => d.id),
  ...AAAS_AGENT_CATALOGUE.map((a) => a.id),
];

/** Category grouping helper for marketplace grids */
export function groupByCategory<T extends { category?: string }>(
  items: T[]
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = item.category ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
