/**
 * Mailing List Trainer — Apache Pony Mail Archive Fetcher
 *
 * Apache has a public mailing list archive with JSON API at lists.apache.org.
 * This is the deepest form of engineering communication — design decisions,
 * patch reviews, release planning, all in threaded email form.
 *
 * Target lists: dev@kafka, dev@spark, dev@hadoop, etc.
 * API: https://lists.apache.org/api/stats.lua?list=dev&domain=kafka.apache.org
 *      https://lists.apache.org/api/mbox.lua?list=dev@kafka.apache.org&date=YYYY-MM
 *
 * No auth needed. Rate limit: be nice (~2 req/sec).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MailingListMessage {
  id: string;
  subject: string;
  from: string;         // author email/name
  date: string;         // ISO date
  inReplyTo: string | null;  // threading — null = new thread
  references: string[];
  listName: string;     // e.g. "dev@kafka.apache.org"
}

export interface MailingListData {
  listName: string;      // e.g. "dev@kafka.apache.org"
  messages: MailingListMessage[];
  threads: MailingListThread[];
  fetchedAt: Date;
}

export interface MailingListThread {
  rootId: string;
  subject: string;
  messageCount: number;
  uniqueAuthors: number;
  startDate: string;
  lastDate: string;
  durationHours: number;
}

export interface MailingListFetchOptions {
  /** How many months back to fetch (default: 3) */
  monthsBack?: number;
  /** Rate limit delay in ms (default: 500) */
  rateLimitDelay?: number;
}

// ============================================================================
// APACHE PONY MAIL API
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PONYMAIL_BASE = 'https://lists.apache.org/api';

async function fetchMailboxMonth(
  list: string,
  domain: string,
  year: number,
  month: number,
): Promise<MailingListMessage[]> {
  const dateStr = `${year}-${String(month).padStart(2, '0')}`;
  const url = `${PONYMAIL_BASE}/mbox.lua?list=${list}@${domain}&date=${dateStr}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NexusBrain-MailingListTrainer/1.0' },
    });
    if (!response.ok) {
      // Some months may have no data
      return [];
    }
    const data = await response.json();
    const messages: MailingListMessage[] = [];

    // Pony Mail returns messages in an object keyed by message ID
    const emails = data.emails || data.thread || [];
    if (Array.isArray(emails)) {
      for (const email of emails) {
        messages.push({
          id: email.id || email.mid || `${dateStr}-${messages.length}`,
          subject: email.subject || '(no subject)',
          from: email.from || 'unknown',
          date: email.date || email.epoch ? new Date((email.epoch || 0) * 1000).toISOString() : `${dateStr}-01T00:00:00Z`,
          inReplyTo: email['in-reply-to'] || email.irt || null,
          references: email.references ? email.references.split(/\s+/) : [],
          listName: `${list}@${domain}`,
        });
      }
    }

    return messages;
  } catch (err) {
    console.log(`[MailingListFetcher] [${list}@${domain}] ${dateStr}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function buildThreads(messages: MailingListMessage[]): MailingListThread[] {
  // Build thread tree from inReplyTo relationships
  const byId = new Map<string, MailingListMessage>();
  const children = new Map<string, string[]>();
  const roots = new Set<string>();

  for (const msg of messages) {
    byId.set(msg.id, msg);
    if (!msg.inReplyTo) {
      roots.add(msg.id);
    } else {
      if (!children.has(msg.inReplyTo)) children.set(msg.inReplyTo, []);
      children.get(msg.inReplyTo)!.push(msg.id);
    }
  }

  // For messages referencing unknown parents, treat as roots
  for (const msg of messages) {
    if (msg.inReplyTo && !byId.has(msg.inReplyTo)) {
      roots.add(msg.id);
    }
  }

  // Build threads from roots
  const threads: MailingListThread[] = [];
  for (const rootId of roots) {
    const rootMsg = byId.get(rootId);
    if (!rootMsg) continue;

    // BFS to collect all messages in thread
    const threadMsgs: MailingListMessage[] = [rootMsg];
    const queue = [rootId];
    const visited = new Set([rootId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const childId of children.get(current) || []) {
        if (!visited.has(childId)) {
          visited.add(childId);
          const child = byId.get(childId);
          if (child) {
            threadMsgs.push(child);
            queue.push(childId);
          }
        }
      }
    }

    const authors = new Set(threadMsgs.map(m => m.from));
    const dates = threadMsgs.map(m => new Date(m.date).getTime()).filter(t => !isNaN(t));
    const startDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : rootMsg.date;
    const lastDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : rootMsg.date;
    const durationHours = dates.length >= 2
      ? (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60)
      : 0;

    threads.push({
      rootId,
      subject: rootMsg.subject,
      messageCount: threadMsgs.length,
      uniqueAuthors: authors.size,
      startDate,
      lastDate,
      durationHours,
    });
  }

  return threads.sort((a, b) => b.messageCount - a.messageCount);
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const TARGET_LISTS: Array<{ list: string; domain: string }> = [
  { list: 'dev', domain: 'kafka.apache.org' },
  { list: 'dev', domain: 'spark.apache.org' },
  { list: 'dev', domain: 'hadoop.apache.org' },
  { list: 'dev', domain: 'flink.apache.org' },
  { list: 'dev', domain: 'cassandra.apache.org' },
  { list: 'dev', domain: 'hbase.apache.org' },
  { list: 'dev', domain: 'hive.apache.org' },
];

export async function fetchAllMailingListData(
  lists: Array<{ list: string; domain: string }>,
  options: MailingListFetchOptions = {},
): Promise<MailingListData[]> {
  const monthsBack = options.monthsBack || 3;
  const delay = options.rateLimitDelay || 500;
  const results: MailingListData[] = [];

  console.log(`[MailingListFetcher] Fetching ${lists.length} Apache mailing lists (${monthsBack} months)...`);

  const now = new Date();

  for (let i = 0; i < lists.length; i++) {
    const { list, domain } = lists[i];
    const listName = `${list}@${domain}`;
    console.log(`[${i + 1}/${lists.length}] -- ${listName} --`);

    const allMessages: MailingListMessage[] = [];

    for (let m = 0; m < monthsBack; m++) {
      const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const msgs = await fetchMailboxMonth(list, domain, date.getFullYear(), date.getMonth() + 1);
      allMessages.push(...msgs);
      await sleep(delay);
    }

    const threads = buildThreads(allMessages);

    results.push({
      listName,
      messages: allMessages,
      threads,
      fetchedAt: new Date(),
    });

    const deepThreads = threads.filter(t => t.messageCount >= 5).length;
    console.log(`[MailingListFetcher] [${listName}] DONE: ${allMessages.length} messages, ${threads.length} threads (${deepThreads} deep)`);

    if (i < lists.length - 1) await sleep(delay);
  }

  const totalMsgs = results.reduce((sum, r) => sum + r.messages.length, 0);
  console.log(`[MailingListFetcher] Complete: ${totalMsgs} messages across ${results.length} lists`);

  return results;
}
