/**
 * Agent Blackboard - Real-Time Inter-Agent Communication
 * 
 * Implements the Blackboard Architecture Pattern for enterprise AI agents.
 * Allows agents to share discoveries mid-execution, enabling true collaborative
 * intelligence like Manus-style multi-agent systems.
 * 
 * Part of Phase 8.3: Enterprise AI Agent Transformation
 */

// ============================================================================
// TYPES
// ============================================================================

export type EntryType = 'discovery' | 'alert' | 'hypothesis' | 'question' | 'insight' | 'warning';

export type EntryPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BlackboardEntry {
  id: string;
  agentId: string;
  domain: string;
  entryType: EntryType;
  priority: EntryPriority;
  content: Record<string, any>;
  metadata: {
    confidence: number;
    source?: string;
    relatedEntities?: string[];
  };
  timestamp: Date;
  relevantDomains: string[];
  consumed: boolean;
  consumedBy: string[];
}

export interface SubscriptionHandler {
  domain: string;
  handler: (entry: BlackboardEntry) => void | Promise<void>;
  filter?: (entry: BlackboardEntry) => boolean;
}

export interface BlackboardStats {
  totalEntries: number;
  entriesByType: Record<EntryType, number>;
  entriesByDomain: Record<string, number>;
  consumptionRate: number;
  averageLatency: number;
}

// ============================================================================
// AGENT BLACKBOARD CLASS
// ============================================================================

class AgentBlackboard {
  private entries: BlackboardEntry[] = [];
  private subscribers: Map<string, SubscriptionHandler[]> = new Map();
  private entryCounter: number = 0;
  private creationTimes: Map<string, number> = new Map();
  private consumptionTimes: Map<string, number[]> = new Map();
  
  constructor() {
    // Initialize with empty state
    this.entries = [];
    this.subscribers = new Map();
  }
  
  /**
   * Post a new entry to the blackboard
   * Notifies all relevant subscribers immediately
   */
  post(entry: Omit<BlackboardEntry, 'id' | 'consumed' | 'consumedBy'>): string {
    const id = `bb_${Date.now()}_${++this.entryCounter}`;
    
    const fullEntry: BlackboardEntry = {
      ...entry,
      id,
      consumed: false,
      consumedBy: []
    };
    
    this.entries.push(fullEntry);
    this.creationTimes.set(id, Date.now());
    
    console.log(`[Blackboard] New ${entry.entryType} posted by ${entry.agentId}: ${JSON.stringify(entry.content).substring(0, 100)}`);
    
    // Notify relevant subscribers
    this.notifySubscribers(fullEntry);
    
    return id;
  }
  
  /**
   * Subscribe to blackboard updates for a specific domain
   */
  subscribe(
    domain: string, 
    handler: (entry: BlackboardEntry) => void | Promise<void>,
    filter?: (entry: BlackboardEntry) => boolean
  ): () => void {
    const subscription: SubscriptionHandler = { domain, handler, filter };
    
    const existing = this.subscribers.get(domain) || [];
    existing.push(subscription);
    this.subscribers.set(domain, existing);
    
    console.log(`[Blackboard] ${domain} subscribed to updates`);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(domain) || [];
      const index = handlers.indexOf(subscription);
      if (index > -1) {
        handlers.splice(index, 1);
        this.subscribers.set(domain, handlers);
      }
    };
  }
  
  /**
   * Get all entries relevant to a specific domain
   * Marks entries as consumed by that domain
   */
  getRelevantEntries(domain: string, markConsumed: boolean = true): BlackboardEntry[] {
    const relevant = this.entries.filter(e => 
      e.relevantDomains.includes(domain) || e.relevantDomains.includes('all')
    );
    
    if (markConsumed) {
      for (const entry of relevant) {
        if (!entry.consumedBy.includes(domain)) {
          entry.consumedBy.push(domain);
          
          // Track consumption latency
          const creationTime = this.creationTimes.get(entry.id);
          if (creationTime) {
            const latency = Date.now() - creationTime;
            const times = this.consumptionTimes.get(entry.id) || [];
            times.push(latency);
            this.consumptionTimes.set(entry.id, times);
          }
          
          // Mark as consumed if all relevant domains have consumed
          if (entry.consumedBy.length >= entry.relevantDomains.length) {
            entry.consumed = true;
          }
        }
      }
    }
    
    return relevant;
  }
  
  /**
   * Get unconsumed entries for a domain (new entries since last check)
   */
  getNewEntries(domain: string): BlackboardEntry[] {
    return this.entries.filter(e => 
      (e.relevantDomains.includes(domain) || e.relevantDomains.includes('all')) &&
      !e.consumedBy.includes(domain)
    );
  }
  
  /**
   * Get entries by type across all domains
   */
  getEntriesByType(type: EntryType): BlackboardEntry[] {
    return this.entries.filter(e => e.entryType === type);
  }
  
  /**
   * Get high priority entries that need immediate attention
   */
  getCriticalEntries(): BlackboardEntry[] {
    return this.entries.filter(e => 
      e.priority === 'critical' && !e.consumed
    );
  }
  
  /**
   * Query the blackboard with custom filters
   */
  query(predicate: (entry: BlackboardEntry) => boolean): BlackboardEntry[] {
    return this.entries.filter(predicate);
  }
  
  /**
   * Get blackboard statistics for monitoring
   */
  getStats(): BlackboardStats {
    const entriesByType: Record<string, number> = {};
    const entriesByDomain: Record<string, number> = {};
    
    for (const entry of this.entries) {
      entriesByType[entry.entryType] = (entriesByType[entry.entryType] || 0) + 1;
      entriesByDomain[entry.domain] = (entriesByDomain[entry.domain] || 0) + 1;
    }
    
    const consumedCount = this.entries.filter(e => e.consumed).length;
    const consumptionRate = this.entries.length > 0 
      ? consumedCount / this.entries.length 
      : 0;
    
    // Calculate average consumption latency
    let totalLatency = 0;
    let latencyCount = 0;
    for (const times of this.consumptionTimes.values()) {
      for (const time of times) {
        totalLatency += time;
        latencyCount++;
      }
    }
    const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
    
    return {
      totalEntries: this.entries.length,
      entriesByType: entriesByType as Record<EntryType, number>,
      entriesByDomain,
      consumptionRate,
      averageLatency
    };
  }
  
  /**
   * v11.5.1: Persist all blackboard entries to cross_domain_signals + ai_memory
   * so discoveries survive beyond the batch run and feed future agent reasoning.
   */
  async persistToDatabase(
    supabase: any,
    organizationId: string
  ): Promise<{ signalsStored: number; patternsStored: number }> {
    if (this.entries.length === 0) return { signalsStored: 0, patternsStored: 0 };

    const { getClientForTableInEdge } = await import('./get-brain-client.ts');
    const brainClient = getClientForTableInEdge('cross_domain_signals');
    const memoryClient = getClientForTableInEdge('ai_memory');

    let signalsStored = 0;
    let patternsStored = 0;

    // Store all entries as cross_domain_signals
    const signalRows = this.entries.map(entry => ({
      organization_id: organizationId,
      source_domain: entry.domain,
      signal_type: `blackboard_${entry.entryType}`,
      signal_value: entry.metadata.confidence,
      entity_type: 'blackboard_entry',
      metadata: {
        agent_id: entry.agentId,
        priority: entry.priority,
        content: entry.content,
        relevant_domains: entry.relevantDomains,
        consumed_by: entry.consumedBy,
        timestamp: entry.timestamp
      }
    }));

    const { error: signalError } = await brainClient
      .from('cross_domain_signals')
      .insert(signalRows);

    if (!signalError) {
      signalsStored = signalRows.length;
    } else {
      console.error('[Blackboard] Signal persist error:', signalError);
    }

    // Store high-confidence discoveries/insights as ai_memory patterns
    const valuableEntries = this.entries.filter(e =>
      (e.entryType === 'discovery' || e.entryType === 'insight' || e.entryType === 'hypothesis') &&
      e.metadata.confidence >= 0.7
    );

    for (const entry of valuableEntries) {
      const { error: memError } = await memoryClient.from('ai_memory').insert({
        organization_id: organizationId,
        memory_type: entry.entryType === 'hypothesis' ? 'hypothesis' : 'pattern',
        entity_type: 'blackboard_discovery',
        title: `[${entry.domain}] ${JSON.stringify(entry.content).substring(0, 100)}`,
        content: {
          ...entry.content,
          source_domain: entry.domain,
          source_agent: entry.agentId,
          relevant_domains: entry.relevantDomains,
          priority: entry.priority
        },
        confidence: entry.metadata.confidence,
        severity: entry.priority === 'critical' ? 'critical' : entry.priority === 'high' ? 'high' : 'info',
        is_active: true
      });

      if (!memError) patternsStored++;
    }

    console.log(`[Blackboard] Persisted ${signalsStored} signals + ${patternsStored} patterns to brain`);
    return { signalsStored, patternsStored };
  }

  /**
   * Clear all entries (used between batch runs)
   */
  clear(): void {
    console.log(`[Blackboard] Clearing ${this.entries.length} entries`);
    this.entries = [];
    this.creationTimes.clear();
    this.consumptionTimes.clear();
    this.entryCounter = 0;
  }
  
  /**
   * Export entries for persistence
   */
  export(): BlackboardEntry[] {
    return [...this.entries];
  }
  
  /**
   * Notify all relevant subscribers of a new entry
   */
  private async notifySubscribers(entry: BlackboardEntry): Promise<void> {
    const relevantDomains = [...entry.relevantDomains];
    if (!relevantDomains.includes('all')) {
      relevantDomains.push('all'); // Also notify 'all' subscribers
    }
    
    for (const domain of relevantDomains) {
      const handlers = this.subscribers.get(domain) || [];
      for (const sub of handlers) {
        // Apply filter if specified
        if (sub.filter && !sub.filter(entry)) {
          continue;
        }
        
        try {
          await sub.handler(entry);
        } catch (error) {
          console.error(`[Blackboard] Handler error for ${domain}:`, error);
        }
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global blackboard instance for inter-agent communication
 * This is shared across all domain agents during a batch run
 */
export const blackboard = new AgentBlackboard();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convenience function to post a discovery
 */
export function postDiscovery(
  agentId: string,
  domain: string,
  content: Record<string, any>,
  relevantDomains: string[],
  priority: EntryPriority = 'medium',
  confidence: number = 0.8
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'discovery',
    priority,
    content,
    metadata: { confidence },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Convenience function to post a cross-domain alert
 */
export function postAlert(
  agentId: string,
  domain: string,
  alertType: string,
  message: string,
  relevantDomains: string[],
  relatedEntities: string[] = []
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'alert',
    priority: 'high',
    content: { alertType, message },
    metadata: { 
      confidence: 1.0,
      relatedEntities 
    },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Convenience function to post a hypothesis for other agents to validate
 */
export function postHypothesis(
  agentId: string,
  domain: string,
  hypothesis: string,
  evidence: any[],
  relevantDomains: string[],
  confidence: number = 0.6
): string {
  return blackboard.post({
    agentId,
    domain,
    entryType: 'hypothesis',
    priority: 'medium',
    content: { hypothesis, evidence },
    metadata: { confidence },
    timestamp: new Date(),
    relevantDomains
  });
}

/**
 * Format blackboard entries for inclusion in agent context
 */
export function formatBlackboardContext(domain: string): string {
  const entries = blackboard.getNewEntries(domain);
  
  if (entries.length === 0) {
    return '';
  }
  
  let context = '\n\n## 🔗 Cross-Domain Intelligence (Real-Time Blackboard)\n';
  context += 'Other agents have discovered the following relevant information:\n\n';
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  entries.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  for (const entry of entries.slice(0, 10)) {
    const icon = entry.entryType === 'alert' ? '🚨' :
                 entry.entryType === 'discovery' ? '🔍' :
                 entry.entryType === 'hypothesis' ? '💭' :
                 entry.entryType === 'warning' ? '⚠️' : '💡';
    
    context += `${icon} **${entry.domain.toUpperCase()} Agent** (${entry.priority}):\n`;
    context += `   ${JSON.stringify(entry.content).substring(0, 200)}\n`;
    
    if (entry.metadata.relatedEntities?.length) {
      context += `   Related: ${entry.metadata.relatedEntities.slice(0, 3).join(', ')}\n`;
    }
    
    context += '\n';
  }
  
  return context;
}

// ============================================================================
// EXPORT
// ============================================================================

export default blackboard;
