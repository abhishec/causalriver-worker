# 🚀 10M+ Scale Connector Architecture

## 📊 Scale Requirements

| Connector | Volume | Challenges |
|-----------|--------|------------|
| **GitHub** | 10M+ files, PRs, issues, commits | Rate limits (5000 req/hr), large repos, binary files |
| **Slack** | 10M+ messages across channels | Pagination, rate limits, historical data |
| **Jira** | 500K+ issues + comments | Complex data models, attachments, nested data |
| **Freshworks** | Tickets, contacts, conversations | Multi-product (Freshdesk, Freshsales), rate limits |

---

## 🏗️ Scalable Architecture Design

### Core Principles
1. **Streaming Ingestion** - Never load all data into memory
2. **Checkpointing** - Resume from last position on failure
3. **Rate Limit Handling** - Respect API limits with exponential backoff
4. **Partitioned Processing** - Parallelize across workers
5. **Incremental Sync** - Only fetch new/changed data after initial load
6. **Deduplication** - Use Redis/Postgres to avoid duplicate signals

---

## 📁 File Structure

```
packages/memory-stack/src/connectors/
├── base/
│   ├── connector-base.ts          # Abstract base class
│   ├── rate-limiter.ts             # Rate limiting with backoff
│   ├── checkpoint-manager.ts       # Resume capability
│   └── stream-processor.ts         # Streaming data handler
│
├── github/
│   ├── github-connector.ts         # Main connector
│   ├── github-tree-walker.ts       # File tree traversal
│   ├── github-pr-processor.ts      # Pull request ingestion
│   ├── github-issue-processor.ts   # Issue ingestion
│   └── github-commit-processor.ts  # Commit history
│
├── slack/
│   ├── slack-connector.ts          # Main connector
│   ├── slack-channel-walker.ts     # Channel enumeration
│   ├── slack-message-stream.ts     # Message pagination
│   └── slack-thread-resolver.ts    # Thread resolution
│
├── jira/
│   ├── jira-connector.ts           # Main connector
│   ├── jira-issue-stream.ts        # Issue pagination with JQL
│   ├── jira-comment-processor.ts   # Comment extraction
│   └── jira-attachment-handler.ts  # Attachment processing
│
└── freshworks/
    ├── freshdesk-connector.ts      # Support tickets
    ├── freshsales-connector.ts     # CRM data
    └── freshchat-connector.ts      # Chat conversations
```

---

## 🔧 Base Connector Architecture

```typescript
// packages/memory-stack/src/connectors/base/connector-base.ts

export abstract class ConnectorBase {
  abstract connectorType: string;
  protected rateLimiter: RateLimiter;
  protected checkpointManager: CheckpointManager;
  protected streamProcessor: StreamProcessor;

  constructor(
    protected organizationId: string,
    protected credentials: any,
    protected supabase: SupabaseClient,
    protected redis?: RedisClient
  ) {
    this.rateLimiter = new RateLimiter(this.getRateLimits());
    this.checkpointManager = new CheckpointManager(supabase, redis);
    this.streamProcessor = new StreamProcessor(supabase);
  }

  /**
   * Main ingestion entry point
   */
  async ingest(mode: 'initial' | 'incremental'): Promise<IngestionResult> {
    const checkpoint = await this.checkpointManager.getCheckpoint(
      this.organizationId,
      this.connectorType
    );

    if (mode === 'initial' && checkpoint) {
      // Resume from checkpoint
      return this.resumeIngestion(checkpoint);
    }

    return mode === 'initial'
      ? this.initialLoad()
      : this.incrementalSync();
  }

  /**
   * Initial load: fetch all historical data
   */
  protected abstract initialLoad(): Promise<IngestionResult>;

  /**
   * Incremental sync: fetch only new/changed data
   */
  protected abstract incrementalSync(): Promise<IngestionResult>;

  /**
   * Resume from checkpoint
   */
  protected abstract resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult>;

  /**
   * Rate limits for this connector
   */
  protected abstract getRateLimits(): RateLimitConfig;

  /**
   * Transform raw data to NexusBrain signal
   */
  protected abstract transformToSignal(rawData: any): Signal;

  /**
   * Batch insert signals with deduplication
   */
  protected async batchInsertSignals(signals: Signal[]): Promise<void> {
    await this.streamProcessor.processBatch(
      signals,
      this.organizationId,
      this.connectorType
    );
  }

  /**
   * Save checkpoint for resume capability
   */
  protected async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.checkpointManager.saveCheckpoint(
      this.organizationId,
      this.connectorType,
      checkpoint
    );
  }
}
```

---

## 📈 GitHub Connector (10M+ Files)

### Challenge: Massive Repos
- Linux kernel: 60K+ files
- Rate limit: 5000 requests/hour
- Binary files, large history

### Solution: Intelligent Tree Walking

```typescript
// packages/memory-stack/src/connectors/github/github-connector.ts

export class GitHubConnector extends ConnectorBase {
  connectorType = 'github';

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 5000,
      requestsPerMinute: 83,
      backoffMultiplier: 2,
      maxRetries: 3,
    };
  }

  /**
   * Initial load: Clone repo metadata + sample files
   */
  protected async initialLoad(): Promise<IngestionResult> {
    const repos = await this.getRepositories();
    let totalSignals = 0;

    for (const repo of repos) {
      // 1. Repo metadata
      await this.ingestRepoMetadata(repo);

      // 2. Recent commits (last 1000)
      await this.ingestRecentCommits(repo, 1000);

      // 3. Open PRs + issues
      await this.ingestPullRequests(repo, 'open');
      await this.ingestIssues(repo, 'open');

      // 4. File tree (streaming, skip binaries)
      await this.ingestFileTree(repo);

      // Save checkpoint after each repo
      await this.saveCheckpoint({
        lastRepo: repo.full_name,
        lastCommitSha: await this.getLatestCommitSha(repo),
        timestamp: new Date().toISOString(),
      });

      totalSignals += repo.signalCount;
    }

    return { success: true, signalsIngested: totalSignals };
  }

  /**
   * Incremental sync: Only new commits/PRs/issues since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    const checkpoint = await this.checkpointManager.getCheckpoint(
      this.organizationId,
      this.connectorType
    );

    const lastSyncTime = checkpoint?.timestamp || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const repos = await this.getRepositories();
    let totalSignals = 0;

    for (const repo of repos) {
      // Only new commits
      const newCommits = await this.getCommitsSince(repo, lastSyncTime);
      for (const commit of newCommits) {
        await this.ingestCommit(commit);
        totalSignals++;
      }

      // New/updated PRs
      const updatedPRs = await this.getPRsUpdatedSince(repo, lastSyncTime);
      for (const pr of updatedPRs) {
        await this.ingestPullRequest(pr);
        totalSignals++;
      }

      // New/updated issues
      const updatedIssues = await this.getIssuesUpdatedSince(repo, lastSyncTime);
      for (const issue of updatedIssues) {
        await this.ingestIssue(issue);
        totalSignals++;
      }
    }

    return { success: true, signalsIngested: totalSignals };
  }

  /**
   * Stream file tree without loading all into memory
   */
  private async ingestFileTree(repo: Repository): Promise<void> {
    const tree = await this.getGitTree(repo, 'HEAD', recursive: true);

    // Filter: only code files, skip binaries/node_modules
    const codeFiles = tree.tree.filter((file) => {
      if (file.type !== 'blob') return false;
      if (file.size > 1_000_000) return false; // Skip files > 1MB
      if (this.isBinaryFile(file.path)) return false;
      if (file.path.includes('node_modules')) return false;
      return true;
    });

    // Process in batches of 100 files
    for (let i = 0; i < codeFiles.length; i += 100) {
      const batch = codeFiles.slice(i, i + 100);

      // Parallel fetch with rate limiting
      const fileContents = await Promise.all(
        batch.map((file) => this.rateLimiter.throttle(() =>
          this.getFileContent(repo, file.path)
        ))
      );

      // Transform to signals
      const signals = fileContents.map((content, idx) =>
        this.transformFileToSignal(repo, batch[idx], content)
      );

      // Batch insert
      await this.batchInsertSignals(signals);

      // Save checkpoint every 1000 files
      if (i % 1000 === 0) {
        await this.saveCheckpoint({
          lastFile: batch[batch.length - 1].path,
          filesProcessed: i,
        });
      }
    }
  }

  /**
   * Transform GitHub file to NexusBrain signal
   */
  private transformFileToSignal(repo: Repository, file: TreeItem, content: string): Signal {
    return {
      source: 'github',
      type: 'code_file',
      content: content,
      metadata: {
        repo: repo.full_name,
        path: file.path,
        language: this.detectLanguage(file.path),
        size: file.size,
        sha: file.sha,
      },
      organization_id: this.organizationId,
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## 💬 Slack Connector (10M+ Messages)

### Challenge: Historical Messages
- Paginated API (200 messages/request)
- Rate limit: 50 requests/minute per workspace
- Threads, reactions, attachments

### Solution: Channel-by-Channel Streaming

```typescript
// packages/memory-stack/src/connectors/slack/slack-connector.ts

export class SlackConnector extends ConnectorBase {
  connectorType = 'slack';

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerMinute: 50,
      requestsPerSecond: 1,
      backoffMultiplier: 2,
      maxRetries: 5,
    };
  }

  /**
   * Initial load: Fetch all channels → all messages
   */
  protected async initialLoad(): Promise<IngestionResult> {
    const channels = await this.getAllChannels();
    let totalMessages = 0;

    for (const channel of channels) {
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        // Fetch 200 messages per page
        const response = await this.rateLimiter.throttle(() =>
          this.fetchMessages(channel.id, cursor)
        );

        // Transform to signals
        const signals = response.messages.map((msg) =>
          this.transformMessageToSignal(channel, msg)
        );

        // Insert batch
        await this.batchInsertSignals(signals);

        totalMessages += signals.length;
        hasMore = response.has_more;
        cursor = response.response_metadata?.next_cursor;

        // Save checkpoint every 10K messages
        if (totalMessages % 10_000 === 0) {
          await this.saveCheckpoint({
            lastChannel: channel.id,
            lastMessageTs: response.messages[response.messages.length - 1]?.ts,
            messagesProcessed: totalMessages,
          });
        }
      }
    }

    return { success: true, signalsIngested: totalMessages };
  }

  /**
   * Incremental sync: Only new messages since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    const checkpoint = await this.checkpointManager.getCheckpoint(
      this.organizationId,
      this.connectorType
    );

    const lastSyncTime = checkpoint?.timestamp || Date.now() - 24 * 60 * 60 * 1000;

    const channels = await this.getAllChannels();
    let totalMessages = 0;

    for (const channel of channels) {
      // Fetch only messages since last sync
      const newMessages = await this.fetchMessagesSince(channel.id, lastSyncTime);

      const signals = newMessages.map((msg) =>
        this.transformMessageToSignal(channel, msg)
      );

      await this.batchInsertSignals(signals);
      totalMessages += signals.length;
    }

    return { success: true, signalsIngested: totalMessages };
  }

  /**
   * Fetch messages with pagination
   */
  private async fetchMessages(channelId: string, cursor?: string) {
    const response = await fetch('https://slack.com/api/conversations.history', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        limit: 200,
        cursor,
      }),
    });

    return response.json();
  }

  /**
   * Transform Slack message to signal
   */
  private transformMessageToSignal(channel: Channel, message: SlackMessage): Signal {
    return {
      source: 'slack',
      type: 'message',
      content: message.text,
      metadata: {
        channel: channel.name,
        channel_id: channel.id,
        user: message.user,
        ts: message.ts,
        thread_ts: message.thread_ts,
        reactions: message.reactions,
      },
      organization_id: this.organizationId,
      timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
    };
  }
}
```

---

## 📋 Jira Connector (500K+ Issues)

### Solution: JQL Pagination + Parallel Processing

```typescript
export class JiraConnector extends ConnectorBase {
  connectorType = 'jira';

  protected async initialLoad(): Promise<IngestionResult> {
    let startAt = 0;
    const maxResults = 100;
    let totalIssues = 0;

    while (true) {
      // Fetch issues in batches using JQL
      const response = await this.rateLimiter.throttle(() =>
        this.searchIssues({
          jql: 'ORDER BY created DESC',
          startAt,
          maxResults,
          fields: ['summary', 'description', 'comment', 'status', 'assignee'],
        })
      );

      if (response.issues.length === 0) break;

      // Process issues + comments
      for (const issue of response.issues) {
        await this.ingestIssue(issue);
        await this.ingestComments(issue);
        totalIssues++;
      }

      startAt += maxResults;

      // Checkpoint every 1000 issues
      if (totalIssues % 1000 === 0) {
        await this.saveCheckpoint({ lastIssueKey: response.issues[response.issues.length - 1].key, issuesProcessed: totalIssues });
      }
    }

    return { success: true, signalsIngested: totalIssues };
  }
}
```

---

## 🆕 Freshworks Connector

### Freshdesk (Support Tickets)

```typescript
export class FreshdeskConnector extends ConnectorBase {
  connectorType = 'freshdesk';

  protected async initialLoad(): Promise<IngestionResult> {
    let page = 1;
    let totalTickets = 0;

    while (true) {
      const tickets = await this.rateLimiter.throttle(() =>
        this.fetchTickets(page, 100)
      );

      if (tickets.length === 0) break;

      const signals = tickets.map((ticket) => this.transformTicketToSignal(ticket));
      await this.batchInsertSignals(signals);

      totalTickets += tickets.length;
      page++;
    }

    return { success: true, signalsIngested: totalTickets };
  }

  private async fetchTickets(page: number, perPage: number) {
    const response = await fetch(
      `https://${this.credentials.domain}.freshdesk.com/api/v2/tickets?page=${page}&per_page=${perPage}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(this.credentials.api_key + ':X').toString('base64')}`,
        },
      }
    );

    return response.json();
  }
}
```

---

## ⚡ Performance Optimizations

### 1. **Parallel Processing**
```typescript
// Process 10 channels concurrently
const channelBatches = chunk(channels, 10);
for (const batch of channelBatches) {
  await Promise.all(batch.map((channel) => this.ingestChannel(channel)));
}
```

### 2. **Redis Deduplication**
```typescript
// Avoid re-processing same signal
const isDuplicate = await redis.sismember(
  `processed:${orgId}:${connectorType}`,
  signalId
);
if (!isDuplicate) {
  await processSignal(signal);
  await redis.sadd(`processed:${orgId}:${connectorType}`, signalId);
}
```

### 3. **Postgres Bulk Insert**
```typescript
// Insert 1000 signals at once
await supabase.from('signals').insert(signalBatch);
```

### 4. **Rate Limit Backoff**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  await sleep(retryAfter * 1000);
  return this.retry(request);
}
```

---

## 📊 Monitoring & Observability

```typescript
// Track ingestion progress
await supabase.from('connector_jobs').insert({
  organization_id: orgId,
  connector_type: 'github',
  status: 'in_progress',
  signals_ingested: 1500,
  progress_pct: 15,
  eta_seconds: 3600,
});
```

---

## ✅ Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Ingestion Orchestrator                                     │
│  - Schedules jobs per org                                   │
│  - Monitors progress                                        │
│  - Handles failures                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬───────────────┐
        │               │               │               │
        ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ GitHub       │ │ Slack        │ │ Jira         │ │ Freshworks   │
│ Connector    │ │ Connector    │ │ Connector    │ │ Connector    │
│              │ │              │ │              │ │              │
│ - Tree walk  │ │ - Paginate   │ │ - JQL query  │ │ - API poll   │
│ - Rate limit │ │ - Checkpoint │ │ - Batch      │ │ - Transform  │
│ - Checkpoint │ │ - Dedup      │ │ - Dedup      │ │              │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Stream Processor                                           │
│  - Batch insert (1000 signals)                              │
│  - Deduplication (Redis)                                    │
│  - Error handling                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase (signals table)                                   │
│  - 10M+ signals stored                                      │
│  - Partitioned by organization_id                           │
│  - Indexed by timestamp, source, type                       │
└─────────────────────────────────────────────────────────────┘
```

---

**Status: 🎯 READY TO BUILD**

Next: Implement the base classes and GitHub connector!
