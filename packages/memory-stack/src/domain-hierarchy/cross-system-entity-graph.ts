/**
 * Cross-System Entity Graph
 * ═══════════════════════════
 *
 * THE MISSING CONNECTIVE TISSUE.
 *
 * Problem:
 *   The brain knows that "engineering.github → engineering.jira" has a causal
 *   relationship statistically. But it CANNOT say:
 *     "PR #456 implements JIRA-123 which was discussed in Slack thread T789
 *      which is part of Roadmap Epic E42 and affects Customer Acme Corp"
 *
 *   This is because the brain lacks a SEMANTIC ENTITY GRAPH — a graph that
 *   connects specific artifacts across systems, not just statistical domains.
 *
 * Solution:
 *   A real-time entity graph where:
 *     - Nodes are specific artifacts (PR, Issue, Message, Epic, Customer, etc.)
 *     - Edges are semantic relationships (implements, discusses, affects, etc.)
 *     - Edges are discovered automatically from:
 *       1. Explicit references (#JIRA-123 in PR description)
 *       2. Temporal correlation (PR opened 2 min after Jira updated)
 *       3. Participant overlap (same person in both contexts)
 *       4. Content similarity (embedding cosine similarity)
 *       5. Causal inference (signal A consistently precedes signal B)
 *
 * Graph Traversal Powers:
 *   - "Show me everything related to JIRA-123" → traverses all edges
 *   - "How did this customer issue cascade?" → multi-hop path finding
 *   - "What code changes are linked to this roadmap item?" → filtered traversal
 *   - "Who are the key people connecting engineering and support?" → bridge detection
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * An artifact in any connected system.
 * This is a node in the entity graph.
 */
export interface Artifact {
  /** Globally unique ID: `${system}:${artifactType}:${externalId}` */
  id: string;
  /** Source system */
  system: string;
  /** Type of artifact */
  artifactType: ArtifactType;
  /** External ID in the source system */
  externalId: string;
  /** Human-readable title */
  title: string;
  /** URL to the artifact in the source system */
  url?: string;
  /** Domain this artifact belongs to (from domain taxonomy) */
  domain?: string;
  /** Sub-domain */
  subDomain?: string;
  /** People involved (canonical IDs) */
  participants: string[];
  /** When this artifact was created */
  createdAt: number;
  /** When this artifact was last active */
  lastActiveAt: number;
  /** Status (open, closed, merged, resolved, etc.) */
  status?: string;
  /** Key-value metadata */
  metadata?: Record<string, unknown>;
}

export type ArtifactType =
  // Engineering
  | 'pull_request'
  | 'commit'
  | 'issue'          // GitHub issue
  | 'branch'
  | 'deployment'
  | 'ci_build'
  | 'code_review'
  // Project Management
  | 'ticket'         // Jira issue/Linear issue
  | 'epic'
  | 'sprint'
  | 'story'
  | 'bug'
  | 'task'
  // Communication
  | 'message'        // Slack message
  | 'thread'         // Slack thread
  | 'channel_topic'
  // Product
  | 'roadmap_item'
  | 'feature_request'
  | 'release'
  | 'changelog_entry'
  // Customer
  | 'customer'
  | 'deal'
  | 'support_ticket'
  | 'nps_response'
  // Finance
  | 'invoice'
  | 'transaction'
  | 'expense'
  // Incidents
  | 'incident'
  | 'alert'
  | 'postmortem'
  // Documentation
  | 'document'
  | 'wiki_page'
  | 'design_file'
  // People
  | 'person'
  | 'team'
  // Generic
  | 'custom';

/**
 * A semantic link between two artifacts.
 * This is an edge in the entity graph.
 */
export interface ArtifactLink {
  /** Unique link ID */
  id: string;
  /** Source artifact ID */
  sourceId: string;
  /** Target artifact ID */
  targetId: string;
  /** Type of relationship */
  linkType: LinkType;
  /** How this link was discovered */
  discoveryMethod: LinkDiscoveryMethod;
  /** Strength of the link (0-1) */
  strength: number;
  /** Confidence in the link (0-1) */
  confidence: number;
  /** Direction: true = source→target is the natural reading direction */
  isDirectional: boolean;
  /** Evidence for this link */
  evidence: LinkEvidence[];
  /** When this link was first discovered */
  discoveredAt: number;
  /** When this link was last observed/confirmed */
  lastObservedAt: number;
  /** Number of times this link has been observed */
  observationCount: number;
}

/**
 * Types of semantic relationships between artifacts.
 * Organized by the kind of connection they represent.
 */
export type LinkType =
  // Implementation links
  | 'implements'         // PR implements ticket
  | 'fixes'              // PR/commit fixes bug
  | 'closes'             // PR closes issue
  | 'reverts'            // Commit reverts another commit
  // Discussion links
  | 'discusses'          // Slack thread discusses ticket/PR
  | 'mentions'           // Message mentions artifact
  | 'references'         // Any artifact references another
  // Hierarchy links
  | 'part_of'            // Story part_of Epic
  | 'contains'           // Epic contains Stories
  | 'child_of'           // Sub-task child_of Task
  | 'depends_on'         // Ticket depends_on another ticket
  | 'blocks'             // Ticket blocks another ticket
  // Customer links
  | 'affects'            // Bug affects customer
  | 'reported_by'        // Issue reported_by customer
  | 'requested_by'       // Feature requested_by customer
  // Deployment links
  | 'deployed_in'        // PR deployed_in release
  | 'triggers'           // Deployment triggers alert
  | 'caused_by'          // Incident caused_by deployment
  // People links
  | 'assigned_to'        // Ticket assigned_to person
  | 'authored_by'        // PR authored_by person
  | 'reviewed_by'        // PR reviewed_by person
  // Temporal links
  | 'preceded_by'        // Artifact temporally preceded_by another
  | 'followed_by'        // Artifact temporally followed_by another
  | 'concurrent_with'    // Artifacts happened at same time
  // Causal links
  | 'caused'             // Root cause analysis link
  | 'contributed_to'     // Contributing factor
  | 'resolved_by'        // Issue resolved_by action
  // Generic
  | 'related_to';        // Catch-all

export type LinkDiscoveryMethod =
  | 'explicit_reference'    // Found #JIRA-123 or PR URL in text
  | 'temporal_correlation'  // Events happened within time window
  | 'participant_overlap'   // Same people involved in both
  | 'content_similarity'    // Embedding/keyword similarity
  | 'causal_inference'      // Signal A consistently precedes B
  | 'api_integration'       // Source system provides the link (e.g., Jira→GitHub integration)
  | 'admin_manual'          // Admin manually linked
  | 'brain_learned';        // Brain discovered pattern

export interface LinkEvidence {
  method: LinkDiscoveryMethod;
  detail: string;
  confidence: number;
  observedAt: number;
}

// ============================================================================
// REFERENCE EXTRACTION PATTERNS
// ============================================================================

interface ReferencePattern {
  pattern: RegExp;
  system: string;
  artifactType: ArtifactType;
  /** Function to extract the external ID from regex match */
  extractId: (match: RegExpMatchArray) => string;
}

/**
 * Patterns to detect cross-system references in text content.
 * These are used to auto-discover links between artifacts.
 */
const REFERENCE_PATTERNS: ReferencePattern[] = [
  // Jira: PROJ-123, ABC-456
  { pattern: /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g, system: 'jira', artifactType: 'ticket', extractId: (m) => `${m[1]}-${m[2]}` },
  // GitHub PR: #123 (in GitHub context), PR #123, pull/123
  { pattern: /\bPR\s*#?(\d{1,6})\b/gi, system: 'github', artifactType: 'pull_request', extractId: (m) => m[1] },
  { pattern: /\bpull\/(\d{1,6})\b/gi, system: 'github', artifactType: 'pull_request', extractId: (m) => m[1] },
  // GitHub Issue: issue #123, issues/123
  { pattern: /\bissues?\/(\d{1,6})\b/gi, system: 'github', artifactType: 'issue', extractId: (m) => m[1] },
  // GitHub commit SHA
  { pattern: /\b([0-9a-f]{7,40})\b/g, system: 'github', artifactType: 'commit', extractId: (m) => m[1] },
  // Linear: LIN-123, TEAM-123
  { pattern: /\b([A-Z]{2,6})-(\d{1,6})\b/g, system: 'linear', artifactType: 'ticket', extractId: (m) => `${m[1]}-${m[2]}` },
  // URLs
  { pattern: /https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/gi, system: 'github', artifactType: 'pull_request', extractId: (m) => m[1] },
  { pattern: /https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi, system: 'github', artifactType: 'issue', extractId: (m) => m[1] },
  { pattern: /https?:\/\/[^/]+\.atlassian\.net\/browse\/([A-Z]+-\d+)/gi, system: 'jira', artifactType: 'ticket', extractId: (m) => m[1] },
  { pattern: /https?:\/\/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/gi, system: 'linear', artifactType: 'ticket', extractId: (m) => m[1] },
  // PagerDuty incident
  { pattern: /\bPD[- ]?(\d{6,})\b/gi, system: 'pagerduty', artifactType: 'incident', extractId: (m) => m[1] },
  { pattern: /\bincident[- #]?(\d{4,})\b/gi, system: 'pagerduty', artifactType: 'incident', extractId: (m) => m[1] },
  // Freshdesk ticket
  { pattern: /\b(?:ticket|FD)[- #]?(\d{4,})\b/gi, system: 'freshdesk', artifactType: 'support_ticket', extractId: (m) => m[1] },
];

// ============================================================================
// TEMPORAL CORRELATION CONFIG
// ============================================================================

/**
 * Time windows for temporal correlation between different artifact types.
 * If two artifacts from different systems are created within this window,
 * they're likely related.
 */
const TEMPORAL_CORRELATION_WINDOWS: Record<string, number> = {
  'ticket→pull_request': 30 * 60 * 1000,     // 30 min: ticket created → PR opened
  'pull_request→deployment': 60 * 60 * 1000,  // 1 hour: PR merged → deployment
  'deployment→incident': 30 * 60 * 1000,      // 30 min: deployment → incident
  'message→ticket': 15 * 60 * 1000,           // 15 min: Slack message → ticket created
  'incident→thread': 5 * 60 * 1000,           // 5 min: incident → Slack thread
  'incident→postmortem': 7 * 24 * 60 * 60 * 1000, // 7 days: incident → postmortem
  'feature_request→ticket': 7 * 24 * 60 * 60 * 1000, // 7 days: feature request → ticket
  'default': 10 * 60 * 1000,                  // 10 min: generic
};

// ============================================================================
// ENTITY GRAPH ENGINE
// ============================================================================

export interface CrossSystemEntityGraphConfig {
  /** Max artifacts to keep in memory per organization */
  maxArtifacts?: number;
  /** Max links to keep in memory */
  maxLinks?: number;
  /** Minimum confidence for auto-discovered links */
  minLinkConfidence?: number;
  /** Enable temporal correlation discovery */
  enableTemporalCorrelation?: boolean;
}

export interface CrossSystemEntityGraphInstance {
  /** Register a new artifact (upsert) */
  registerArtifact(artifact: Artifact): void;

  /** Register a link between two artifacts */
  registerLink(link: Omit<ArtifactLink, 'id' | 'discoveredAt' | 'lastObservedAt' | 'observationCount'>): ArtifactLink;

  /** Extract and register cross-system references from text content */
  extractReferences(sourceArtifactId: string, textContent: string, sourceSystem: string): ArtifactLink[];

  /** Discover temporal correlations between recent artifacts */
  discoverTemporalLinks(windowMs?: number): ArtifactLink[];

  /** Find all artifacts linked to a given artifact (multi-hop) */
  traverse(artifactId: string, options?: TraversalOptions): TraversalResult;

  /** Find the shortest path between two artifacts */
  findPath(fromId: string, toId: string, maxHops?: number): ArtifactLink[] | null;

  /** Get all artifacts for a given entity (canonical entity ID) */
  getArtifactsForEntity(entityId: string): Artifact[];

  /** Get all artifacts in a given domain */
  getArtifactsByDomain(domain: string): Artifact[];

  /** Find bridge people (connecting multiple domains through artifacts) */
  findBridgePeople(minDomains?: number): BridgePerson[];

  /** Get impact chain: if this artifact changes, what's affected? */
  getImpactChain(artifactId: string, maxDepth?: number): ImpactChain;

  /** Build the full story for an artifact (narrative-ready chain) */
  buildArtifactStory(artifactId: string): ArtifactStory;

  /** Get statistics */
  getStats(): EntityGraphStats;

  /** Get artifact by ID */
  getArtifact(id: string): Artifact | undefined;

  /** Get links for an artifact */
  getLinks(artifactId: string): ArtifactLink[];
}

export interface TraversalOptions {
  maxHops?: number;
  linkTypes?: LinkType[];
  artifactTypes?: ArtifactType[];
  systems?: string[];
  minConfidence?: number;
  direction?: 'outbound' | 'inbound' | 'both';
}

export interface TraversalResult {
  rootArtifact: Artifact;
  /** Artifacts found at each hop level */
  hops: Array<{
    depth: number;
    artifacts: Artifact[];
    links: ArtifactLink[];
  }>;
  totalArtifacts: number;
  totalLinks: number;
  systemsSpanned: string[];
  domainsSpanned: string[];
}

export interface BridgePerson {
  personId: string;
  domains: string[];
  systems: string[];
  artifactCount: number;
  /** How central is this person in cross-domain communication? */
  bridgeScore: number;
}

export interface ImpactChain {
  rootArtifact: Artifact;
  /** Artifacts affected, ordered by proximity */
  affectedArtifacts: Array<{
    artifact: Artifact;
    linkPath: ArtifactLink[];
    depth: number;
    impactType: 'direct' | 'indirect';
  }>;
  domainsAffected: string[];
  customersAffected: Artifact[];
  estimatedBlastRadius: number;
}

export interface ArtifactStory {
  /** The root artifact this story is about */
  subject: Artifact;
  /** The narrative chain: what happened, in order */
  timeline: Array<{
    artifact: Artifact;
    link: ArtifactLink;
    timestamp: number;
    narrative: string;
  }>;
  /** People involved across the story */
  people: string[];
  /** Systems involved */
  systems: string[];
  /** Domains crossed */
  domains: string[];
  /** Natural language summary of the story */
  summary: string;
}

export interface EntityGraphStats {
  totalArtifacts: number;
  totalLinks: number;
  artifactsBySystem: Record<string, number>;
  artifactsByType: Record<string, number>;
  linksByType: Record<string, number>;
  linksByMethod: Record<string, number>;
  avgLinksPerArtifact: number;
  systemsConnected: number;
  domainsConnected: number;
  crossSystemLinks: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createCrossSystemEntityGraph(
  config?: CrossSystemEntityGraphConfig
): CrossSystemEntityGraphInstance {
  const maxArtifacts = config?.maxArtifacts ?? 100_000;
  const maxLinks = config?.maxLinks ?? 500_000;
  const minLinkConfidence = config?.minLinkConfidence ?? 0.3;

  // Primary storage
  const artifacts = new Map<string, Artifact>();
  const links = new Map<string, ArtifactLink>();

  // Indexes for fast traversal
  const outboundLinks = new Map<string, Set<string>>();  // artifactId → Set<linkId>
  const inboundLinks = new Map<string, Set<string>>();   // artifactId → Set<linkId>
  const participantIndex = new Map<string, Set<string>>(); // personId → Set<artifactId>
  const domainIndex = new Map<string, Set<string>>();      // domain → Set<artifactId>
  const systemIndex = new Map<string, Set<string>>();      // system → Set<artifactId>
  const typeIndex = new Map<string, Set<string>>();        // artifactType → Set<artifactId>

  // Temporal index for correlation discovery (sorted by time)
  const recentArtifacts: Array<{ id: string; createdAt: number }> = [];

  let _linkIdCounter = 0;
  function _nextLinkId(): string {
    return `link_${Date.now()}_${(++_linkIdCounter).toString(36)}`;
  }

  function _addToSetIndex<K>(map: Map<K, Set<string>>, key: K, value: string): void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(value);
  }

  function _getFromSetIndex<K>(map: Map<K, Set<string>>, key: K): string[] {
    return Array.from(map.get(key) || []);
  }

  // ────────────────────────────────────────────────────────────────────

  function registerArtifact(artifact: Artifact): void {
    if (artifacts.size >= maxArtifacts) {
      // Evict oldest artifact (LRU by lastActiveAt)
      let oldestId = '';
      let oldestTime = Infinity;
      for (const [id, a] of artifacts) {
        if (a.lastActiveAt < oldestTime) {
          oldestTime = a.lastActiveAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        // Clean up indexes
        const old = artifacts.get(oldestId)!;
        domainIndex.get(old.domain || '')?.delete(oldestId);
        systemIndex.get(old.system)?.delete(oldestId);
        typeIndex.get(old.artifactType)?.delete(oldestId);
        for (const p of old.participants) {
          participantIndex.get(p)?.delete(oldestId);
        }
        artifacts.delete(oldestId);
      }
    }

    // Upsert
    const existing = artifacts.get(artifact.id);
    if (existing) {
      // Update with newer data
      Object.assign(existing, artifact);
      existing.lastActiveAt = Math.max(existing.lastActiveAt, artifact.lastActiveAt);
    } else {
      artifacts.set(artifact.id, { ...artifact });
    }

    // Update indexes
    if (artifact.domain) _addToSetIndex(domainIndex, artifact.domain, artifact.id);
    _addToSetIndex(systemIndex, artifact.system, artifact.id);
    _addToSetIndex(typeIndex, artifact.artifactType, artifact.id);
    for (const p of artifact.participants) {
      _addToSetIndex(participantIndex, p, artifact.id);
    }

    // Add to temporal index
    recentArtifacts.push({ id: artifact.id, createdAt: artifact.createdAt });
    // Keep sorted and bounded
    if (recentArtifacts.length > maxArtifacts * 2) {
      recentArtifacts.sort((a, b) => b.createdAt - a.createdAt);
      recentArtifacts.length = maxArtifacts;
    }
  }

  function registerLink(input: Omit<ArtifactLink, 'id' | 'discoveredAt' | 'lastObservedAt' | 'observationCount'>): ArtifactLink {
    // Check for existing link between same artifacts
    const existingLinkId = _findExistingLink(input.sourceId, input.targetId, input.linkType);
    if (existingLinkId) {
      const existing = links.get(existingLinkId)!;
      existing.observationCount++;
      existing.lastObservedAt = Date.now();
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      existing.strength = Math.min(1, existing.strength + 0.02);
      existing.evidence.push(...input.evidence);
      // Keep evidence bounded
      if (existing.evidence.length > 20) {
        existing.evidence = existing.evidence.slice(-20);
      }
      return existing;
    }

    if (links.size >= maxLinks) {
      // Evict weakest link
      let weakestId = '';
      let weakestStrength = Infinity;
      for (const [id, link] of links) {
        if (link.strength < weakestStrength) {
          weakestStrength = link.strength;
          weakestId = id;
        }
      }
      if (weakestId) {
        const weak = links.get(weakestId)!;
        outboundLinks.get(weak.sourceId)?.delete(weakestId);
        inboundLinks.get(weak.targetId)?.delete(weakestId);
        links.delete(weakestId);
      }
    }

    const link: ArtifactLink = {
      ...input,
      id: _nextLinkId(),
      discoveredAt: Date.now(),
      lastObservedAt: Date.now(),
      observationCount: 1,
    };

    links.set(link.id, link);
    _addToSetIndex(outboundLinks, link.sourceId, link.id);
    _addToSetIndex(inboundLinks, link.targetId, link.id);

    return link;
  }

  function _findExistingLink(sourceId: string, targetId: string, linkType: LinkType): string | undefined {
    const outbound = outboundLinks.get(sourceId);
    if (!outbound) return undefined;
    for (const linkId of outbound) {
      const link = links.get(linkId);
      if (link && link.targetId === targetId && link.linkType === linkType) {
        return linkId;
      }
    }
    // Also check reverse for non-directional links
    const inbound = inboundLinks.get(sourceId);
    if (inbound) {
      for (const linkId of inbound) {
        const link = links.get(linkId);
        if (link && link.sourceId === targetId && link.linkType === linkType && !link.isDirectional) {
          return linkId;
        }
      }
    }
    return undefined;
  }

  function extractReferences(sourceArtifactId: string, textContent: string, sourceSystem: string): ArtifactLink[] {
    const discovered: ArtifactLink[] = [];
    const sourceArtifact = artifacts.get(sourceArtifactId);

    for (const refPattern of REFERENCE_PATTERNS) {
      // Skip self-system references for some patterns (e.g., #123 in GitHub is GitHub issue, not Jira)
      if (refPattern.system === sourceSystem && refPattern.artifactType === 'commit') continue;

      // Reset regex
      refPattern.pattern.lastIndex = 0;
      let match;
      while ((match = refPattern.pattern.exec(textContent)) !== null) {
        const externalId = refPattern.extractId(match);
        if (!externalId) continue;

        // Skip commit SHAs that are too short (avoid false positives)
        if (refPattern.artifactType === 'commit' && externalId.length < 7) continue;

        const targetArtifactId = `${refPattern.system}:${refPattern.artifactType}:${externalId}`;

        // Auto-register the target artifact if we don't know it
        if (!artifacts.has(targetArtifactId)) {
          registerArtifact({
            id: targetArtifactId,
            system: refPattern.system,
            artifactType: refPattern.artifactType,
            externalId,
            title: `${refPattern.artifactType} ${externalId}`,
            participants: [],
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          });
        }

        // Determine link type based on context
        const linkType = _inferLinkType(sourceSystem, sourceArtifact?.artifactType, refPattern.system, refPattern.artifactType, textContent, match[0]);

        const link = registerLink({
          sourceId: sourceArtifactId,
          targetId: targetArtifactId,
          linkType,
          discoveryMethod: 'explicit_reference',
          strength: 0.8,
          confidence: 0.9,
          isDirectional: true,
          evidence: [{
            method: 'explicit_reference',
            detail: `Found "${match[0]}" in ${sourceSystem} content`,
            confidence: 0.9,
            observedAt: Date.now(),
          }],
        });

        discovered.push(link);
      }
    }

    return discovered;
  }

  function _inferLinkType(
    sourceSystem: string,
    sourceType: ArtifactType | undefined,
    targetSystem: string,
    targetType: ArtifactType,
    _text: string,
    _matchStr: string
  ): LinkType {
    // PR → Ticket
    if (sourceType === 'pull_request' && (targetType === 'ticket' || targetType === 'bug' || targetType === 'story')) {
      return 'implements';
    }
    // Commit → Ticket
    if (sourceType === 'commit' && (targetType === 'ticket' || targetType === 'bug')) {
      return 'fixes';
    }
    // Message → anything
    if (sourceType === 'message' || sourceType === 'thread') {
      return 'discusses';
    }
    // Ticket → Ticket (cross-system)
    if (sourceSystem !== targetSystem && sourceType === 'ticket' && targetType === 'ticket') {
      return 'related_to';
    }
    // Incident → anything
    if (sourceType === 'incident') {
      return 'caused_by';
    }
    // Default
    return 'references';
  }

  function discoverTemporalLinks(windowMs?: number): ArtifactLink[] {
    const discovered: ArtifactLink[] = [];
    const now = Date.now();
    const lookback = windowMs || 24 * 60 * 60 * 1000; // 24 hours

    // Get recent artifacts
    const recent = recentArtifacts.filter(a => now - a.createdAt < lookback);

    // Compare pairs from different systems
    for (let i = 0; i < recent.length && i < 500; i++) {
      const a = artifacts.get(recent[i].id);
      if (!a) continue;

      for (let j = i + 1; j < recent.length && j < 500; j++) {
        const b = artifacts.get(recent[j].id);
        if (!b) continue;

        // Skip same-system pairs
        if (a.system === b.system) continue;

        // Check time window
        const timeDiff = Math.abs(a.createdAt - b.createdAt);
        const windowKey = `${a.artifactType}→${b.artifactType}`;
        const maxWindow = TEMPORAL_CORRELATION_WINDOWS[windowKey] || TEMPORAL_CORRELATION_WINDOWS['default'];

        if (timeDiff > maxWindow) continue;

        // Check participant overlap (strong signal)
        const participantOverlap = a.participants.filter(p => b.participants.includes(p));
        if (participantOverlap.length === 0 && timeDiff > maxWindow / 2) continue;

        // Calculate confidence based on time proximity and participant overlap
        const timeConfidence = 1 - (timeDiff / maxWindow);
        const participantBoost = Math.min(0.3, participantOverlap.length * 0.1);
        const confidence = Math.min(0.9, timeConfidence * 0.6 + participantBoost + 0.1);

        if (confidence < minLinkConfidence) continue;

        // Determine which came first
        const [earlier, later] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

        const linkType = _inferTemporalLinkType(earlier.artifactType, later.artifactType);

        const link = registerLink({
          sourceId: earlier.id,
          targetId: later.id,
          linkType,
          discoveryMethod: 'temporal_correlation',
          strength: confidence * 0.7,
          confidence,
          isDirectional: true,
          evidence: [{
            method: 'temporal_correlation',
            detail: `${earlier.artifactType} created ${Math.round(timeDiff / 1000)}s before ${later.artifactType}. ${participantOverlap.length} shared participants.`,
            confidence,
            observedAt: now,
          }],
        });

        discovered.push(link);
      }
    }

    return discovered;
  }

  function _inferTemporalLinkType(earlierType: ArtifactType, laterType: ArtifactType): LinkType {
    if (earlierType === 'ticket' && laterType === 'pull_request') return 'implements';
    if (earlierType === 'pull_request' && laterType === 'deployment') return 'deployed_in';
    if (earlierType === 'deployment' && laterType === 'incident') return 'caused_by';
    if (earlierType === 'message' && laterType === 'ticket') return 'discusses';
    if (earlierType === 'incident' && laterType === 'thread') return 'discusses';
    if (earlierType === 'incident' && laterType === 'postmortem') return 'resolved_by';
    return 'followed_by';
  }

  function traverse(artifactId: string, options?: TraversalOptions): TraversalResult {
    const maxHops = options?.maxHops ?? 3;
    const direction = options?.direction ?? 'both';
    const minConf = options?.minConfidence ?? 0;

    const rootArtifact = artifacts.get(artifactId);
    if (!rootArtifact) {
      return { rootArtifact: { id: artifactId, system: 'unknown', artifactType: 'custom', externalId: '', title: 'Unknown', participants: [], createdAt: 0, lastActiveAt: 0 }, hops: [], totalArtifacts: 0, totalLinks: 0, systemsSpanned: [], domainsSpanned: [] };
    }

    const visited = new Set<string>([artifactId]);
    const hops: TraversalResult['hops'] = [];
    let currentLevel = [artifactId];
    const allSystems = new Set<string>([rootArtifact.system]);
    const allDomains = new Set<string>();
    if (rootArtifact.domain) allDomains.add(rootArtifact.domain);

    for (let depth = 1; depth <= maxHops; depth++) {
      const hopArtifacts: Artifact[] = [];
      const hopLinks: ArtifactLink[] = [];

      for (const currentId of currentLevel) {
        const linkedIds = new Set<string>();

        // Outbound links
        if (direction === 'outbound' || direction === 'both') {
          for (const linkId of _getFromSetIndex(outboundLinks, currentId)) {
            const link = links.get(linkId);
            if (!link || link.confidence < minConf) continue;
            if (options?.linkTypes && !options.linkTypes.includes(link.linkType)) continue;
            if (!visited.has(link.targetId)) {
              linkedIds.add(link.targetId);
              hopLinks.push(link);
            }
          }
        }

        // Inbound links
        if (direction === 'inbound' || direction === 'both') {
          for (const linkId of _getFromSetIndex(inboundLinks, currentId)) {
            const link = links.get(linkId);
            if (!link || link.confidence < minConf) continue;
            if (options?.linkTypes && !options.linkTypes.includes(link.linkType)) continue;
            if (!visited.has(link.sourceId)) {
              linkedIds.add(link.sourceId);
              hopLinks.push(link);
            }
          }
        }

        for (const linkedId of linkedIds) {
          const artifact = artifacts.get(linkedId);
          if (!artifact) continue;
          if (options?.artifactTypes && !options.artifactTypes.includes(artifact.artifactType)) continue;
          if (options?.systems && !options.systems.includes(artifact.system)) continue;

          visited.add(linkedId);
          hopArtifacts.push(artifact);
          allSystems.add(artifact.system);
          if (artifact.domain) allDomains.add(artifact.domain);
        }
      }

      if (hopArtifacts.length === 0) break;

      hops.push({ depth, artifacts: hopArtifacts, links: hopLinks });
      currentLevel = hopArtifacts.map(a => a.id);
    }

    return {
      rootArtifact,
      hops,
      totalArtifacts: visited.size - 1,
      totalLinks: hops.reduce((s, h) => s + h.links.length, 0),
      systemsSpanned: Array.from(allSystems),
      domainsSpanned: Array.from(allDomains),
    };
  }

  function findPath(fromId: string, toId: string, maxHops?: number): ArtifactLink[] | null {
    const max = maxHops ?? 5;
    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: ArtifactLink[] }> = [{ id: fromId, path: [] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (path.length >= max) continue;

      // Check all links from this artifact
      for (const linkId of [..._getFromSetIndex(outboundLinks, id), ..._getFromSetIndex(inboundLinks, id)]) {
        const link = links.get(linkId);
        if (!link) continue;

        const nextId = link.sourceId === id ? link.targetId : link.sourceId;
        if (visited.has(nextId)) continue;
        visited.add(nextId);

        const newPath = [...path, link];
        if (nextId === toId) return newPath;
        queue.push({ id: nextId, path: newPath });
      }
    }

    return null;
  }

  function getArtifactsForEntity(entityId: string): Artifact[] {
    // Entity can be a participant
    return _getFromSetIndex(participantIndex, entityId)
      .map(id => artifacts.get(id))
      .filter(Boolean) as Artifact[];
  }

  function getArtifactsByDomain(domain: string): Artifact[] {
    return _getFromSetIndex(domainIndex, domain)
      .map(id => artifacts.get(id))
      .filter(Boolean) as Artifact[];
  }

  function findBridgePeople(minDomains?: number): BridgePerson[] {
    const min = minDomains ?? 2;
    const bridges: BridgePerson[] = [];

    for (const [personId, artifactIds] of participantIndex) {
      const domains = new Set<string>();
      const systems = new Set<string>();

      for (const aid of artifactIds) {
        const artifact = artifacts.get(aid);
        if (artifact) {
          if (artifact.domain) domains.add(artifact.domain);
          systems.add(artifact.system);
        }
      }

      if (domains.size >= min) {
        bridges.push({
          personId,
          domains: Array.from(domains),
          systems: Array.from(systems),
          artifactCount: artifactIds.size,
          bridgeScore: domains.size * systems.size * Math.log2(1 + artifactIds.size),
        });
      }
    }

    return bridges.sort((a, b) => b.bridgeScore - a.bridgeScore);
  }

  function getImpactChain(artifactId: string, maxDepth?: number): ImpactChain {
    const root = artifacts.get(artifactId);
    if (!root) {
      return { rootArtifact: { id: artifactId, system: 'unknown', artifactType: 'custom', externalId: '', title: 'Unknown', participants: [], createdAt: 0, lastActiveAt: 0 }, affectedArtifacts: [], domainsAffected: [], customersAffected: [], estimatedBlastRadius: 0 };
    }

    const traversal = traverse(artifactId, {
      maxHops: maxDepth ?? 4,
      direction: 'outbound',
      linkTypes: ['implements', 'fixes', 'closes', 'affects', 'triggers', 'caused', 'contributed_to', 'deployed_in', 'blocks', 'depends_on'],
    });

    const affected: ImpactChain['affectedArtifacts'] = [];
    const domains = new Set<string>();
    const customers: Artifact[] = [];

    for (const hop of traversal.hops) {
      for (const artifact of hop.artifacts) {
        affected.push({
          artifact,
          linkPath: hop.links,
          depth: hop.depth,
          impactType: hop.depth === 1 ? 'direct' : 'indirect',
        });
        if (artifact.domain) domains.add(artifact.domain);
        if (artifact.artifactType === 'customer' || artifact.artifactType === 'deal') {
          customers.push(artifact);
        }
      }
    }

    return {
      rootArtifact: root,
      affectedArtifacts: affected,
      domainsAffected: Array.from(domains),
      customersAffected: customers,
      estimatedBlastRadius: Math.min(1, affected.length / 20),
    };
  }

  function buildArtifactStory(artifactId: string): ArtifactStory {
    const subject = artifacts.get(artifactId);
    if (!subject) {
      return { subject: { id: artifactId, system: 'unknown', artifactType: 'custom', externalId: '', title: 'Unknown', participants: [], createdAt: 0, lastActiveAt: 0 }, timeline: [], people: [], systems: [], domains: [], summary: 'Unknown artifact' };
    }

    // Get all connected artifacts and links
    const traversal = traverse(artifactId, { maxHops: 3, direction: 'both' });

    // Build timeline from all hops
    const timeline: ArtifactStory['timeline'] = [];
    const allPeople = new Set<string>(subject.participants);
    const allSystems = new Set<string>([subject.system]);
    const allDomains = new Set<string>();
    if (subject.domain) allDomains.add(subject.domain);

    for (const hop of traversal.hops) {
      for (let i = 0; i < hop.artifacts.length; i++) {
        const artifact = hop.artifacts[i];
        const link = hop.links[i] || hop.links[0]; // Best match link

        for (const p of artifact.participants) allPeople.add(p);
        allSystems.add(artifact.system);
        if (artifact.domain) allDomains.add(artifact.domain);

        timeline.push({
          artifact,
          link,
          timestamp: artifact.createdAt,
          narrative: _generateNarrative(subject, artifact, link),
        });
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    // Generate summary
    const summary = _generateStorySummary(subject, timeline, Array.from(allSystems), Array.from(allDomains));

    return {
      subject,
      timeline,
      people: Array.from(allPeople),
      systems: Array.from(allSystems),
      domains: Array.from(allDomains),
      summary,
    };
  }

  function _generateNarrative(subject: Artifact, related: Artifact, link: ArtifactLink): string {
    const linkVerb = _linkTypeToVerb(link.linkType);
    return `${related.artifactType} "${related.title}" in ${related.system} ${linkVerb} ${subject.artifactType} "${subject.title}"`;
  }

  function _linkTypeToVerb(linkType: LinkType): string {
    const verbs: Record<LinkType, string> = {
      'implements': 'implements',
      'fixes': 'fixes',
      'closes': 'closes',
      'reverts': 'reverts',
      'discusses': 'discusses',
      'mentions': 'mentions',
      'references': 'references',
      'part_of': 'is part of',
      'contains': 'contains',
      'child_of': 'is child of',
      'depends_on': 'depends on',
      'blocks': 'blocks',
      'affects': 'affects',
      'reported_by': 'was reported by',
      'requested_by': 'was requested by',
      'deployed_in': 'was deployed in',
      'triggers': 'triggers',
      'caused_by': 'was caused by',
      'assigned_to': 'is assigned to',
      'authored_by': 'was authored by',
      'reviewed_by': 'was reviewed by',
      'preceded_by': 'was preceded by',
      'followed_by': 'was followed by',
      'concurrent_with': 'happened concurrently with',
      'caused': 'caused',
      'contributed_to': 'contributed to',
      'resolved_by': 'was resolved by',
      'related_to': 'is related to',
    };
    return verbs[linkType] || 'is related to';
  }

  function _generateStorySummary(subject: Artifact, timeline: ArtifactStory['timeline'], systems: string[], domains: string[]): string {
    const parts: string[] = [];
    parts.push(`${subject.artifactType} "${subject.title}" from ${subject.system}`);

    if (timeline.length > 0) {
      parts.push(`connects to ${timeline.length} artifacts across ${systems.length} systems`);
    }

    if (domains.length > 1) {
      parts.push(`spanning ${domains.join(', ')} domains`);
    }

    return parts.join(' ');
  }

  function getStats(): EntityGraphStats {
    const bySystem: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const linksByType: Record<string, number> = {};
    const linksByMethod: Record<string, number> = {};
    const allSystems = new Set<string>();
    const allDomains = new Set<string>();
    let crossSystem = 0;

    for (const [, artifact] of artifacts) {
      bySystem[artifact.system] = (bySystem[artifact.system] || 0) + 1;
      byType[artifact.artifactType] = (byType[artifact.artifactType] || 0) + 1;
      allSystems.add(artifact.system);
      if (artifact.domain) allDomains.add(artifact.domain);
    }

    for (const [, link] of links) {
      linksByType[link.linkType] = (linksByType[link.linkType] || 0) + 1;
      linksByMethod[link.discoveryMethod] = (linksByMethod[link.discoveryMethod] || 0) + 1;

      // Count cross-system links
      const source = artifacts.get(link.sourceId);
      const target = artifacts.get(link.targetId);
      if (source && target && source.system !== target.system) {
        crossSystem++;
      }
    }

    return {
      totalArtifacts: artifacts.size,
      totalLinks: links.size,
      artifactsBySystem: bySystem,
      artifactsByType: byType,
      linksByType,
      linksByMethod,
      avgLinksPerArtifact: artifacts.size > 0 ? links.size / artifacts.size : 0,
      systemsConnected: allSystems.size,
      domainsConnected: allDomains.size,
      crossSystemLinks: crossSystem,
    };
  }

  function getArtifact(id: string): Artifact | undefined {
    return artifacts.get(id);
  }

  function getLinks(artifactId: string): ArtifactLink[] {
    const result: ArtifactLink[] = [];
    for (const linkId of _getFromSetIndex(outboundLinks, artifactId)) {
      const link = links.get(linkId);
      if (link) result.push(link);
    }
    for (const linkId of _getFromSetIndex(inboundLinks, artifactId)) {
      const link = links.get(linkId);
      if (link) result.push(link);
    }
    return result;
  }

  return {
    registerArtifact,
    registerLink,
    extractReferences,
    discoverTemporalLinks,
    traverse,
    findPath,
    getArtifactsForEntity,
    getArtifactsByDomain,
    findBridgePeople,
    getImpactChain,
    buildArtifactStory,
    getStats,
    getArtifact,
    getLinks,
  };
}
