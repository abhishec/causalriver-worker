/**
 * Task Intent Classifier + Privacy Firewall
 * ==========================================
 *
 * Classifies every incoming task into an intent category and applies
 * privacy filtering BEFORE any data reaches the LLM.
 *
 * Intent categories:
 *   - "delivery-intelligence": SE-aaS queries (pod matching, health, velocity)
 *   - "accounting":            AaaS queries (bookkeeping, reconciliation, P&L)
 *   - "process-execution":     Process Engine templates (HR, procurement, orders)
 *   - "brain-query":           Questions about brain state, RL, agent health
 *   - "code-intelligence":     Code review, test gen, TDD, spec decomposition
 *   - "agent-creation":        Creating a new agent
 *   - "general":               Catch-all for unclassified queries
 *   - "privacy-block":         BLOCKED — contains PII that must not reach LLM
 *
 * Privacy fast-path: if the message contains PII patterns (email, SSN, credit card,
 * phone, passport number), return "privacy-block" immediately without LLM call.
 *
 * Classification uses regex-first (fast path, no LLM), then returns result.
 * This classifier runs synchronously in <1ms for 90% of queries.
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskIntent =
  | "delivery-intelligence"
  | "accounting"
  | "process-execution"
  | "brain-query"
  | "code-intelligence"
  | "agent-creation"
  | "general"
  | "privacy-block";

export interface ClassificationResult {
  intent: TaskIntent;
  confidence: number;        // 0–1
  privacyFlags: string[];    // which PII patterns were detected
  matchedKeywords: string[]; // which keywords triggered the classification
  processingMs: number;      // how long classification took
}

export interface ClassifierParams {
  message: string;
  organizationId?: string;
  userId?: string;
}

// ── System (trusted) email domains — never block these ───────────────────────
// Emails from known system domains are internal references, not submitted PII.
const KNOWN_SYSTEM_DOMAINS = new Set([
  "usebrainos.com",
  "tookitaki.com",
  "anthropic.com",
]);

// ── Privacy patterns ─────────────────────────────────────────────────────────
// Order matters: first match wins for the fast-path check.
// Email is handled specially below (system domain allowlist).
interface PrivacyPattern {
  name: string;
  regex: RegExp;
}

const PRIVACY_PATTERNS: PrivacyPattern[] = [
  { name: "ssn",         regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "credit-card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/ },
  { name: "phone",       regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: "passport",    regex: /\b[A-Z]{1,2}\d{6,9}\b/ },
  { name: "api-key",     regex: /\b(sk-|pk-|api_key=|Bearer\s+)[A-Za-z0-9_\-]{20,}\b/ },
];

// Email handled separately with allowlist check
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

// Patterns that indicate the email is being SUBMITTED as personal data
// (vs. just mentioning it as a known system address)
const EMAIL_SUBMISSION_PATTERNS = [
  /process\s+this/i,
  /customer\s+email/i,
  /user\s+email/i,
  /contact\s+email/i,
  /send\s+to/i,
  /email\s+address\s+is/i,
  /here\s+is\s+the\s+email/i,
  /personal\s+data/i,
  /pii/i,
  /client\s+info/i,
];

// ── Intent keyword maps ───────────────────────────────────────────────────────
// Each entry is an array of lowercase keyword/phrase fragments.
// The classifier checks if any fragment appears in the lowercased message.
// Longer/more specific phrases should be listed before shorter fragments
// to maximise precision (but since we scan all and score, order is advisory).

type IntentCategory = Exclude<TaskIntent, "general" | "privacy-block">;

const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  "delivery-intelligence": [
    "pod match",
    "pod matching",
    "flight risk",
    "scope creep",
    "health score",
    "engagement health",
    "delivery intelligence",
    "sprint velocity",
    "sprint health",
    "bottleneck",
    "engineer velocity",
    "early warning",
    "velocity index",
    "review burden",
    "overallocation",
    "delivery",
    "sprint",
    "velocity",
    "pod",
  ],
  "accounting": [
    "bookkeeping",
    "bookkeep",
    "reconcil",
    "invoice",
    "accounts receivable",
    "accounts payable",
    "balance sheet",
    "profit and loss",
    "p&l",
    "revenue recognition",
    "financial statement",
    "tax filing",
    "tax return",
    "journal entry",
    "general ledger",
    "financial",
    "revenue",
    "profit",
    "loss",
    "tax",
  ],
  "process-execution": [
    "offboarding",
    "onboarding",
    "offboard",
    "onboard",
    "procurement",
    "purchase order",
    "expense approval",
    "approval workflow",
    "order management",
    "hr workflow",
    "hr process",
    "employee offboard",
    "employee onboard",
  ],
  "brain-query": [
    "brain iq",
    "learning velocity",
    "rl signals",
    "reinforcement learning",
    "cognitive cycle",
    "agent health",
    "brain state",
    "brain stats",
    "brain context",
    "quality score",
    "confidence score",
    "feedback loop",
    "learning stats",
    "brain query",
    "brain",
    "cognitive",
  ],
  "code-intelligence": [
    "pull request",
    "code review",
    "pr review",
    "unit test",
    "integration test",
    "test driven",
    "tdd",
    "refactor",
    "dependency update",
    "spec decomposition",
    "code architecture",
    "debug this",
    "fix this bug",
    "architecture review",
    "code",
    "test",
    "bug",
    "refactor",
  ],
  "agent-creation": [
    "create agent",
    "create a new agent",
    "build agent",
    "build a new agent",
    "spawn agent",
    "make an agent",
    "new agent",
    "deploy agent",
  ],
};

// Confidence weight by keyword specificity (longer phrases = higher weight).
// We use simple length heuristic: phrases > 8 chars = 0.7, short = 0.45.
function _keywordConfidence(kw: string): number {
  return kw.length > 8 ? 0.7 : 0.45;
}

// ── Privacy refusal phrases ───────────────────────────────────────────────────
// 9 phrases cycled deterministically (hash of flag name → index).
const PRIVACY_REFUSAL_PHRASES = [
  "I noticed some sensitive information in your message.",
  "For data privacy, I can't process messages containing personal data.",
  "This message appears to contain PII — please remove it and try again.",
  "Privacy protection prevents me from processing this request as-is.",
  "I'm unable to handle messages with personally identifiable information.",
  "To protect privacy, please remove [FLAG] before continuing.",
  "This request contains sensitive data patterns that I'm not able to process.",
  "Data privacy rules block me from handling this message.",
  "Please anonymize your message before sending — I detected [FLAG].",
];

function _phraseIndex(flag: string): number {
  let h = 0;
  for (let i = 0; i < flag.length; i++) {
    h = (h * 31 + flag.charCodeAt(i)) & 0xffff;
  }
  return h % PRIVACY_REFUSAL_PHRASES.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine whether a matched email address is a system-domain reference
 * (safe to pass through) vs. submitted personal data (must block).
 *
 * Logic:
 *  1. If every matched email's domain is in KNOWN_SYSTEM_DOMAINS → not PII.
 *  2. If the surrounding message does NOT contain submission-intent phrases → not PII.
 *  3. Otherwise → PII, block.
 */
function _isEmailPrivacyViolation(message: string): boolean {
  const lower = message.toLowerCase();

  // Reset lastIndex before global exec loop
  EMAIL_REGEX.lastIndex = 0;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = EMAIL_REGEX.exec(message)) !== null) {
    matches.push(m[0]);
  }

  if (matches.length === 0) return false;

  // Filter out system-domain emails
  const externalEmails = matches.filter((email) => {
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return !KNOWN_SYSTEM_DOMAINS.has(domain);
  });

  if (externalEmails.length === 0) return false;

  // External email present — check if message context suggests data submission
  const hasSubmissionContext = EMAIL_SUBMISSION_PATTERNS.some((pat) => pat.test(lower));
  // Also block if multiple external emails (bulk data scenario)
  const isMultiple = externalEmails.length > 1;

  return hasSubmissionContext || isMultiple;
}

// ── Core exports ──────────────────────────────────────────────────────────────

/**
 * Synchronous intent classifier + privacy firewall.
 *
 * Contract:
 *  - Never throws — returns { intent: "general", confidence: 0 } on any error.
 *  - No async, no DB calls, no LLM calls.
 *  - Executes in < 5ms for messages up to 50 KB.
 */
export function classifyTaskIntent(params: ClassifierParams): ClassificationResult {
  const startMs = Date.now();

  try {
    const { message } = params;

    if (!message || typeof message !== "string") {
      return {
        intent: "general",
        confidence: 0,
        privacyFlags: [],
        matchedKeywords: [],
        processingMs: Date.now() - startMs,
      };
    }

    // ── 1. Privacy fast-path ────────────────────────────────────────────────
    const privacyFlags: string[] = [];

    // Non-email patterns (simple regex test)
    for (const pp of PRIVACY_PATTERNS) {
      if (pp.regex.test(message)) {
        privacyFlags.push(pp.name);
      }
    }

    // Email: context-aware check
    if (_isEmailPrivacyViolation(message)) {
      privacyFlags.push("email");
    }

    if (privacyFlags.length > 0) {
      logger.warn("[TaskIntentClassifier] Privacy block triggered", { flags: privacyFlags });
      return {
        intent: "privacy-block",
        confidence: 1.0,
        privacyFlags,
        matchedKeywords: [],
        processingMs: Date.now() - startMs,
      };
    }

    // ── 2. Intent scoring ───────────────────────────────────────────────────
    const lower = message.toLowerCase();

    type ScoredIntent = { intent: IntentCategory; score: number; keywords: string[] };
    const scores: ScoredIntent[] = (Object.keys(INTENT_KEYWORDS) as IntentCategory[]).map(
      (intent) => {
        const matchedKeywords: string[] = [];
        let score = 0;
        for (const kw of INTENT_KEYWORDS[intent]) {
          if (lower.includes(kw)) {
            matchedKeywords.push(kw);
            score += _keywordConfidence(kw);
          }
        }
        return { intent, score, keywords: matchedKeywords };
      }
    );

    // Sort descending by score
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    if (!best || best.score === 0) {
      return {
        intent: "general",
        confidence: 0.3,
        privacyFlags: [],
        matchedKeywords: [],
        processingMs: Date.now() - startMs,
      };
    }

    // Normalize confidence: cap at 0.97 (never claim perfect certainty from regex)
    // Use a soft sigmoid: score / (score + 1) * 2, then clamp to [0.35, 0.97]
    const rawConf = (best.score / (best.score + 1)) * 2;
    const confidence = Math.min(0.97, Math.max(0.35, rawConf));

    return {
      intent: best.intent,
      confidence,
      privacyFlags: [],
      matchedKeywords: best.keywords,
      processingMs: Date.now() - startMs,
    };
  } catch (err) {
    // Never throw — return safe fallback
    logger.warn("[TaskIntentClassifier] Unexpected error during classification:", err instanceof Error ? err.message : String(err));
    return {
      intent: "general",
      confidence: 0,
      privacyFlags: [],
      matchedKeywords: [],
      processingMs: Date.now() - startMs,
    };
  }
}

/**
 * Build a polite, varied privacy refusal message.
 *
 * Cycles through 9 phrases deterministically based on the first flag name.
 * Substitutes [FLAG] with the human-readable flag list.
 */
export function buildPrivacyRefusal(flags: string[]): string {
  if (!flags || flags.length === 0) {
    return "Privacy protection prevents me from processing this request as-is.";
  }

  const primaryFlag = flags[0];
  const idx = _phraseIndex(primaryFlag);
  const flagLabel = flags.length === 1
    ? primaryFlag.replace(/-/g, " ")
    : flags.map((f) => f.replace(/-/g, " ")).join(" and ");

  // idx is always in-bounds: _phraseIndex returns h % PRIVACY_REFUSAL_PHRASES.length
  const phrase = PRIVACY_REFUSAL_PHRASES[idx] ?? PRIVACY_REFUSAL_PHRASES[0]!;
  return phrase.replace("[FLAG]", flagLabel);
}
