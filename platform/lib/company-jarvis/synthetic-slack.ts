/**
 * Company Jarvis — Synthetic Slack Data Generator
 *
 * Generates ~18,000 Slack messages across 8 channels over 12 months.
 * Includes realistic threads, reactions, sentiment, and deliberately
 * seeded "hidden tensions" that the brain should detect.
 */

import type { SlackData, SlackMessage, SlackChannel, SlackUser, SlackReaction, Country } from './types';
import { EMPLOYEES, SLACK_CHANNELS, DEPT_CHANNELS, COMPETITORS, AML_TERMS, CUSTOMER_COMPANIES, rand, pick } from './constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

let msgCounter = 0;
function nextMsgId(): string { return `MSG-${String(++msgCounter).padStart(6, '0')}`; }

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function iso(d: Date): string { return d.toISOString(); }

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function weightedPick<T>(items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── Channel Message Templates ──────────────────────────────────────────────

const EMOJIS = [':thumbsup:', ':fire:', ':rocket:', ':eyes:', ':100:', ':pray:', ':tada:', ':thinking_face:', ':white_check_mark:', ':warning:'];

function randomReactions(maxCount: number = 3): SlackReaction[] {
  const count = Math.floor(Math.random() * (maxCount + 1));
  if (count === 0) return [];
  const emojis = pickN(EMOJIS, count);
  return emojis.map(emoji => ({
    emoji,
    users: pickN(EMPLOYEES, Math.floor(Math.random() * 4) + 1).map(e => e.slackId),
    count: Math.floor(Math.random() * 5) + 1,
  }));
}

// ── Engineering Channel Templates ────────────────────────────────────────

function engineeringMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const templates = [
    // Deployments
    `Just deployed v${2 + Math.floor(month / 3)}.${month % 3}.${Math.floor(Math.random() * 20)} to staging. Transaction monitoring latency down to ${Math.floor(rand(8, 25))}ms`,
    `Production deploy complete. ${pick(['Zero', 'No', 'Minimal'])} issues so far. Monitoring dashboards look clean.`,
    `Hotfix pushed for the ${pick(['PEP screening', 'sanctions matching', 'alert triage', 'name matching'])} module. ${pick(['False positive rate', 'Latency', 'Memory usage'])} should be back to normal.`,
    // Technical discussions
    `Been looking at the ${pick(['fuzzy matching', 'entity resolution', 'graph database', 'streaming pipeline'])} performance. We can probably ${pick(['cut latency by 40%', 'reduce false positives by 25%', 'handle 3x more transactions'])} if we ${pick(['switch to Rust for the hot path', 'add a caching layer', 'use a different algorithm', 'pre-compute the embeddings'])}`,
    `The ${pick(AML_TERMS)} module needs a refactor. Technical debt is getting out of hand. We patched it 3 times this month.`,
    `CI pipeline took ${Math.floor(rand(15, 45))} minutes today. We need to optimize the test suite or split it up.`,
    `Anyone else seeing flaky tests in the ${pick(['sanctions', 'KYC', 'transaction monitoring', 'risk scoring'])} test suite? Failed 3 times today.`,
    // Incidents
    `Alert: ${pick(['Staging', 'Production'])} ${pick(['API latency spike', 'database connection pool exhausted', 'webhook delivery failures', 'memory leak detected'])}. Investigating now.`,
    `Postmortem for yesterday's incident: Root cause was ${pick(['a missing index on the transactions table', 'an unhandled edge case in the batch processor', 'a race condition in the alert queue', 'stale cache entries after the migration'])}. Adding monitoring and tests.`,
    // Sprint updates
    `Sprint ${Math.floor(month * 2 + Math.random() * 2)} velocity: ${Math.floor(rand(28, 52))} points. ${Math.random() > 0.4 ? 'On track' : 'Slightly behind'}. Biggest blocker: ${pick(['API design review', 'dependency on product spec', 'waiting on infra provisioning', 'unclear requirements from compliance team'])}`,
    `PR review backlog is at ${Math.floor(rand(5, 18))} PRs. Can we commit to same-day reviews?`,
    `Architecture RFC for the new ${pick(['real-time alerting engine', 'ML-powered false positive reduction', 'multi-tenant isolation', 'API gateway v2'])} is ready for review.`,
    // General engineering chat
    `Upgraded ${pick(['PostgreSQL to 16', 'Node.js to 22', 'TypeScript to 5.5', 'Kubernetes to 1.29', 'Terraform to 1.7'])}. All tests passing.`,
    `The ${pick(CUSTOMER_COMPANIES).name} integration is ${pick(['live', 'in testing', 'pending their security review', 'blocked on their API access'])}`,
    `Code coverage for the ${pick(['core engine', 'API layer', 'webhook handlers', 'batch processor'])} is at ${Math.floor(rand(68, 94))}%. Goal is 85%.`,
  ];
  return pick(templates);
}

// ── Sales Channel Templates ─────────────────────────────────────────────

function salesMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const customer = pick(CUSTOMER_COMPANIES);
  const competitor = pick(COMPETITORS);
  const dealSize = Math.floor(rand(50, 450));
  const templates = [
    `Call with ${customer.name} (${customer.country}) went well. They're concerned about the ${pick(['MAS', 'BNM', 'FSC', 'AUSTRAC', 'BSP'])} deadline in Q${Math.ceil((month + 1) / 3)}. Pipeline: $${dealSize}K`,
    `${customer.name} is evaluating us against ${competitor}. Key differentiator they care about: ${pick(['real-time alerting', 'false positive reduction', 'regulatory reporting automation', 'API-first architecture', 'multi-jurisdiction support'])}`,
    `Closed-won: ${customer.name} - $${dealSize}K/year! ${pick(['Transaction Monitoring', 'Full platform', 'KYC + Sanctions bundle'])}. ${Math.floor(rand(3, 9))}-month sales cycle.`,
    `Deal update: ${customer.name} moved to ${pick(['Discovery', 'Proposal', 'Negotiation'])}. Contact: ${pick(['Head of Compliance', 'MLRO', 'CTO', 'CFO'])}. Next step: ${pick(['technical demo', 'POC setup', 'security review', 'pricing negotiation', 'legal review'])}`,
    `Lost ${customer.name} to ${competitor}. Reason: ${pick(['pricing', 'feature gap in batch screening', 'existing vendor relationship', 'budget frozen for this quarter', 'chose to build in-house'])}. $${dealSize}K out of pipeline.`,
    `Pipeline review: ${emp.country} region at ${Math.floor(rand(1.2, 4.5))}x coverage. ${Math.random() > 0.5 ? 'Looking healthy' : 'Need more top-of-funnel activity'}.`,
    `${pick(['Big', 'Major', 'Exciting'])} opportunity: ${customer.name} wants to expand from ${pick(['Transaction Monitoring only', 'KYC module only', 'basic screening'])} to full platform. Potential ${pick(['2x', '3x', '2.5x'])} expansion.`,
    `Competitive intel: ${competitor} just ${pick(['raised a round', 'launched a new feature', 'hired a sales team in our region', 'dropped their pricing by 20%', 'got a major bank as a reference customer'])}. We need to ${pick(['respond quickly', 'update our battlecard', 'differentiate on service quality', 'accelerate our roadmap'])}`,
    `Q${Math.ceil((month + 1) / 3)} quota check: I'm at ${Math.floor(rand(40, 110))}% of target. ${Math.random() > 0.5 ? 'Confident about hitting it.' : 'Going to be tight. Need help with a few stalled deals.'}`,
    `${pick(['Webinar', 'Conference', 'Roundtable'])} in ${pick(['Singapore', 'KL', 'Taipei', 'Sydney', 'Manila'])} generated ${Math.floor(rand(5, 25))} qualified leads. Following up this week.`,
    `Customer referral from ${pick(CUSTOMER_COMPANIES).name} — they introduced us to ${customer.name}. Warm lead, scheduling discovery call.`,
  ];
  return pick(templates);
}

// ── CS-Support Channel Templates ────────────────────────────────────────

function csSupportMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const customer = pick(CUSTOMER_COMPANIES);
  const templates = [
    `${customer.name} escalated — false positive rate on ${pick(['PEP screening', 'sanctions matching', 'transaction monitoring'])} up ${Math.floor(rand(15, 60))}% after last update. ${pick(['P1', 'P2'])} ticket raised.`,
    `Renewal risk: ${customer.name} (${customer.country}) contract up in ${Math.floor(rand(30, 90))} days. Health score: ${Math.floor(rand(25, 85))}/100. ${Math.random() > 0.5 ? 'Scheduling QBR' : 'Need executive engagement'}.`,
    `${customer.name} CSAT dropped from ${Math.floor(rand(3.5, 4.8)).toFixed(1)} to ${Math.floor(rand(2.0, 3.4)).toFixed(1)}. Root cause: ${pick(['slow response times', 'unresolved integration issue', 'missing feature they were promised', 'regulatory report formatting issues'])}.`,
    `NPS update for ${customer.country}: Average ${Math.floor(rand(-10, 75))}. ${Math.random() > 0.5 ? 'Improved from last quarter' : 'Declined since last quarter'}.`,
    `Support ticket #${Math.floor(rand(1000, 9999))}: ${customer.name} reporting ${pick(['API timeout errors', 'incorrect risk scores', 'duplicate alerts', 'missing transaction data', 'report generation failures'])}. Investigating.`,
    `Resolved: ${customer.name} issue was ${pick(['a configuration mismatch after their upgrade', 'a data feed delay from their core banking system', 'incorrect threshold settings', 'a known bug fixed in the latest release'])}. Resolution time: ${Math.floor(rand(2, 48))} hours.`,
    `${customer.name} feature request: ${pick(['custom dashboard for compliance officers', 'bulk case management', 'API for automated STR filing', 'multi-language support for their Taiwan team', 'real-time alert webhooks'])}. Logging for product review.`,
    `QBR with ${customer.name} completed. Key outcomes: ${pick(['renewing with 15% uplift', 'expanding to additional module', 'need to address 3 open tickets before renewal', 'requested POC for new AI triage feature'])}`,
    `Usage alert: ${customer.name} API calls dropped ${Math.floor(rand(20, 60))}% this month. Could indicate ${pick(['integration issues', 'reduced transaction volume', 'switching to a competitor', 'internal process change'])}. Reaching out.`,
    `Onboarding ${customer.name} (new customer). ${pick(['Going smoothly — data integration complete', 'Blocked on their IT team providing API credentials', 'Need engineering help with custom data mapping', 'Training sessions scheduled for next week'])}`,
  ];
  return pick(templates);
}

// ── Leadership Channel Templates ────────────────────────────────────────

function leadershipMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const templates = [
    `Board deck for Q${Math.ceil((month + 1) / 3)} is ${Math.random() > 0.5 ? 'ready for review' : 'still being finalized — need finance numbers by EOD'}`,
    `Headcount plan for next quarter: Engineering +${Math.floor(rand(2, 5))}, Sales +${Math.floor(rand(1, 3))}, CS +${Math.floor(rand(1, 2))}. Budget impact: $${Math.floor(rand(180, 350))}K/quarter.`,
    `Series B timing discussion: ${pick(['We should wait until ARR hits $15M', "Let's start conversations with investors now", 'Market conditions suggest we should extend runway instead', 'Need to show 3 consecutive quarters of 40%+ growth'])}`,
    `Regulatory update: ${pick(['MAS is tightening AML requirements — this is good for us', 'New AUSTRAC guidelines could require product changes', 'BSP circular on digital banks expands our TAM in Philippines', 'FSC Taiwan enforcement action against a bank — pipeline should accelerate'])}`,
    `Team performance review: ${pick(['Engineering velocity is up but quality metrics need attention', 'Sales pipeline is strong but win rate declining', 'CS team is stretched thin — need to hire', 'Product roadmap needs better alignment with what sales is promising'])}`,
    `Competitive alert: ${pick(COMPETITORS)} just ${pick(['closed a deal we were in', 'raised $50M', 'launched in our market', 'poached one of our engineers'])}. Discuss in next leadership meeting.`,
    `Cash position: $${Math.floor(rand(8, 14))}M in the bank. Burn rate: ~$${Math.floor(rand(650, 900))}K/month. Runway: ${Math.floor(rand(12, 20))} months.`,
    `India expansion: Should we ${pick(['enter next year', 'wait until we dominate APAC first', 'do a partnership instead', 'hire a country manager to explore'])}? Need alignment.`,
    `All-hands agenda for next week: ${pick(['Q results + roadmap preview', 'New hires introduction + culture update', 'Customer win celebration + pipeline review', 'Product demo + engineering achievements'])}`,
    `OKR check-in: ${pick(['Engineering O1 at 65% (on track)', 'Sales O1 at 45% (at risk)', 'CS O1 at 80% (ahead)', 'Product O1 at 55% (behind — blocked on eng capacity)'])}`,
  ];
  return pick(templates);
}

// ── Product Channel Templates ───────────────────────────────────────────

function productMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const templates = [
    `User research findings from ${Math.floor(rand(5, 12))} compliance officer interviews: Top pain point is ${pick(['too many false positives', 'slow case resolution workflow', 'lack of cross-border visibility', 'complex regulatory reporting', 'poor audit trail'])}`,
    `Feature spec draft ready: "${pick(['AI-Powered Alert Triage', 'Multi-Jurisdiction Dashboard', 'Automated STR Generation', 'Risk Score Explainability', 'Batch Screening Engine v2'])}" — please review by ${pick(['EOD Friday', 'next Monday', 'before sprint planning'])}`,
    `Roadmap prioritization: Customers asking for ${pick(['real-time screening API', 'graph-based entity resolution', 'custom rule builder', 'mobile compliance app'])} but engineering estimates ${Math.floor(rand(3, 8))} sprints. Worth it?`,
    `Competitive gap analysis: ${pick(COMPETITORS)} has ${pick(['better UX for case management', 'faster name matching', 'more pre-built regulatory templates', 'native AI/ML capabilities', 'better API documentation'])} than us. Closing this gap is ${pick(['critical for enterprise deals', 'nice-to-have', 'blocking 2 active deals'])}`,
    `Beta feedback on ${pick(['new dashboard', 'AI triage feature', 'batch screening', 'API v2'])}: ${Math.floor(rand(3, 8))} out of ${Math.floor(rand(10, 15))} users gave positive feedback. Main complaints: ${pick(['too slow', 'confusing UI', 'missing features', 'documentation unclear'])}`,
    `Sprint planning: ${Math.floor(rand(8, 15))} stories estimated. Capacity is ${Math.floor(rand(30, 50))} points. We'll need to ${pick(['defer the reporting feature', 'split the screening story', 'get more eng capacity', 'negotiate scope with sales'])}`,
    `DAU/MAU trend for the ${pick(['risk scoring module', 'case management portal', 'screening dashboard', 'alert inbox'])}: ${Math.floor(rand(40, 85))}% adoption. ${Math.random() > 0.5 ? 'Trending up.' : 'Flat — need to investigate drop-off.'}`,
    `Product-market fit signal: ${Math.floor(rand(3, 7))} inbound requests for ${pick(['multi-currency transaction monitoring', 'real-time sanctions webhook', 'compliance workflow automation'])} in the last month. This wasn't on our roadmap.`,
  ];
  return pick(templates);
}

// ── Marketing Channel Templates ─────────────────────────────────────────

function marketingMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const templates = [
    `Campaign results — "${pick(['APAC AML Summit', 'Future of Compliance', 'RegTech Innovation', 'Financial Crime Prevention'])}" webinar: ${Math.floor(rand(120, 450))} registrations, ${Math.floor(rand(40, 65))}% attendance, ${Math.floor(rand(15, 40))} MQLs`,
    `Blog post on "${pick(['5 AML Trends for 2025', 'How Banks Reduce False Positives by 40%', 'The APAC Regulatory Landscape', 'Building a Modern Compliance Stack'])}" published. ${Math.floor(rand(500, 3000))} views in first week.`,
    `LinkedIn ad performance: ${Math.floor(rand(15000, 50000))} impressions, ${Math.floor(rand(200, 800))} clicks, ${Math.floor(rand(5, 25))} form fills. CPL: $${Math.floor(rand(80, 250))}`,
    `Event: We're speaking at ${pick(['Singapore FinTech Festival', 'Money20/20 Asia', 'ACAMS APAC', 'RegTech Summit', 'Sibos Asia'])} in ${pick(['Singapore', 'Hong Kong', 'Taipei', 'Sydney'])}. Need sales team support for booth.`,
    `SEO update: Ranking #${Math.floor(rand(1, 8))} for "${pick(['AML software', 'transaction monitoring platform', 'KYC automation', 'compliance technology APAC'])}" — ${Math.random() > 0.5 ? 'up from last month' : 'dropped 2 positions'}`,
    `Case study with ${pick(CUSTOMER_COMPANIES).name} approved for publication. Headline metric: ${pick(['"60% reduction in false positives"', '"3x faster regulatory filing"', '"$2M annual compliance cost savings"', '"90% automation of KYC onboarding"'])}`,
    `MQL to SQL conversion rate this month: ${Math.floor(rand(12, 35))}%. ${Math.random() > 0.5 ? 'Improving' : 'Below target of 25%'}. Main drop-off: ${pick(['wrong ICP', 'slow sales follow-up', 'budget objection', 'timing mismatch'])}`,
    `Brand awareness survey results: ${Math.floor(rand(15, 45))}% unaided recall in ${pick(['Singapore', 'Malaysia', 'Australia'])}. Target: 50% by year-end.`,
  ];
  return pick(templates);
}

// ── General Channel Templates ───────────────────────────────────────────

function generalMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const templates = [
    `Welcome ${pick(['the new joiners this month', 'our newest team member', 'everyone back from the holidays'])}! ${pick(['Excited to have you all', 'Great to see the team growing', 'Looking forward to what we build together'])}`,
    `Reminder: ${pick(['Town hall this Friday at 3pm SGT', 'Holiday schedule updated on Confluence', 'Expense reports due by end of month', 'New office kitchen rules — please clean up after yourself'])}`,
    `Congrats to ${pick(EMPLOYEES).name} for ${pick(['closing the biggest deal this quarter', 'shipping the new feature ahead of schedule', 'getting promoted', "completing 2 years with the team", 'winning the hackathon'])}!`,
    `Team lunch ${pick(['this Thursday at the new ramen place', 'photos from Friday — great turnout!', "cancelled this week — too many people OOO", "poll: Italian or Korean BBQ?"])}`,
    `Office update: ${pick(['New standing desks arriving next week', 'WiFi upgrade this weekend — expect brief downtime', "KL office renovation complete — looks amazing", 'Sydney office lease renewed for 2 years'])}`,
    `PSA: ${pick(["Please update your LinkedIn profiles with our new branding", "IT security training is mandatory — deadline Friday", "Company swag orders are open", "Remember to log your time for client projects"])}`,
    `Happy ${pick(['Chinese New Year', 'Hari Raya', 'Christmas', 'Deepavali', 'National Day'])} to everyone celebrating!`,
    `Book recommendation: "${pick(["Compliance by Design", "The AML Officer's Handbook", "Zero to One", "The Hard Thing About Hard Things", "Good Strategy Bad Strategy"])}" — really relevant to what we're building`,
  ];
  return pick(templates);
}

// ── Regional Channel Templates ──────────────────────────────────────────

function regionalMessage(month: number, emp: typeof EMPLOYEES[number]): string {
  const country = emp.country;
  const reg = { SG: 'MAS', MY: 'BNM', TW: 'FSC', AU: 'AUSTRAC', PH: 'BSP' }[country] || 'regulator';
  const templates = [
    `${country} update: ${reg} just released ${pick(['new AML guidelines', 'updated reporting requirements', 'digital bank licensing rules', 'cross-border payment regulations'])}. Impact on our product: ${pick(['minimal', 'moderate — need product changes', 'significant — new feature required'])}`,
    `${country} market: ${pick(['Pipeline growing', 'Customer engagement strong', 'Competitive pressure increasing', 'Need more local sales presence'])}. ${Math.floor(rand(2, 8))} active opportunities worth $${Math.floor(rand(200, 800))}K total.`,
    `Local team update: ${pick(['Hiring going well', 'Office lease up for renewal', 'Team morale is high', 'Need more support from HQ', 'Regulatory event next month — need marketing help'])}`,
    `${country} customer feedback: ${pick(['They want more localized compliance templates', 'Language support is a pain point', 'Integration with local banking systems needed', 'Our pricing is competitive in this market'])}`,
    `${country} regulatory deadline: ${pick(['Q3 STR filing changes', 'New CDD requirements effective next month', 'Annual compliance certification due', 'Cross-border reporting threshold changes'])} — affects ${Math.floor(rand(3, 12))} customers`,
  ];
  return pick(templates);
}

// ─── Hidden Tensions (Deliberately Seeded) ──────────────────────────────

interface HiddenTension {
  month: number;
  channelName: string;
  messages: Array<{
    userId: string;
    text: string;
    sentiment: 'negative' | 'frustrated';
    topics: string[];
    isThread?: boolean;
  }>;
}

const HIDDEN_TENSIONS: HiddenTension[] = [
  // TENSION 1: Engineering frustrated with Sales promises (month 3-4)
  {
    month: 3,
    channelName: 'engineering',
    messages: [
      { userId: 'U011', text: "Sales promised real-time batch screening to Maybank by end of Q2. We haven't even started the design. This keeps happening.", sentiment: 'frustrated', topics: ['sales-engineering-tension', 'deadline-pressure'] },
      { userId: 'U010', text: "Agreed. Third time this quarter we're learning about customer commitments from Slack instead of sprint planning. @David Park can we sync?", sentiment: 'frustrated', topics: ['sales-engineering-tension', 'process-gap'] },
      { userId: 'U014', text: "I've been pulling 60-hour weeks to deliver the sanctions module that was also promised without eng input. Burnout is real.", sentiment: 'frustrated', topics: ['burnout', 'workload'] },
      { userId: 'U012', text: "Same. The codebase quality is suffering. We're shipping patches on patches. Technical debt is piling up.", sentiment: 'negative', topics: ['technical-debt', 'quality'] },
    ],
  },
  // TENSION 2: Taiwan office feeling ignored (month 5-6)
  {
    month: 5,
    channelName: 'apac-regional',
    messages: [
      { userId: 'U025', text: "Taiwan team has raised the localization issue 4 times now. FSC requirements are different from MAS but our product still defaults to Singapore templates. Our customers are frustrated.", sentiment: 'frustrated', topics: ['taiwan-ignored', 'localization'] },
      { userId: 'U026', text: "We've lost 2 deals in Taiwan this quarter because competitors offer native Mandarin UI. This was on the roadmap 6 months ago but keeps getting deprioritized.", sentiment: 'frustrated', topics: ['taiwan-ignored', 'competitive-loss'] },
      { userId: 'U044', text: "From the sales side — my pipeline is suffering. Prospects ask about Taiwan-specific features and I have to say 'coming soon' every time. It's embarrassing.", sentiment: 'negative', topics: ['taiwan-ignored', 'pipeline-risk'] },
      { userId: 'U053', text: "Customer health for our Taiwan accounts is declining. CTBC Bank specifically asked when we'll support FSC reporting natively. I don't have an answer.", sentiment: 'negative', topics: ['taiwan-ignored', 'customer-risk'] },
    ],
  },
  // TENSION 3: Two engineers privately discussing leaving (month 7)
  {
    month: 7,
    channelName: 'engineering',
    messages: [
      { userId: 'U017', text: "Anyone else feeling like we're just firefighting? I joined to build cutting-edge AML tech, not patch legacy code 80% of the time.", sentiment: 'frustrated', topics: ['attrition-risk', 'morale'] },
      { userId: 'U019', text: "Yeah honestly looking at what Napier AI is building — their engineering blog is impressive. Makes you think.", sentiment: 'negative', topics: ['attrition-risk', 'competitor-attraction'] },
      { userId: 'U017', text: "The lack of career growth conversations also bothers me. When was the last time anyone here had a proper 1:1 about career development?", sentiment: 'frustrated', topics: ['attrition-risk', 'career-growth'] },
    ],
  },
  // TENSION 4: CS team overwhelmed after botched release (month 8)
  {
    month: 8,
    channelName: 'cs-support',
    messages: [
      { userId: 'U050', text: "We have 47 open tickets right now. That's 3x our normal load. The v2.8 release broke alert thresholds for 12 customers. This shouldn't have happened.", sentiment: 'frustrated', topics: ['release-quality', 'cs-overwhelmed'] },
      { userId: 'U051', text: "DBS Bank is threatening to escalate to their board if we don't fix the false positive spike by Friday. They're our biggest account.", sentiment: 'negative', topics: ['customer-escalation', 'dbs-risk'] },
      { userId: 'U056', text: "I've been on calls since 7am. Three customers in Malaysia are all hitting the same bug. Engineering, is anyone looking at JIRA-4521?", sentiment: 'frustrated', topics: ['cs-overwhelmed', 'bug-impact'] },
      { userId: 'U057', text: "NPS is going to crater this month. We've already gotten 5 detractors from the last survey batch. All citing this release.", sentiment: 'negative', topics: ['nps-decline', 'release-quality'] },
    ],
  },
  // TENSION 5: Sales rep complaining about product velocity (month 9)
  {
    month: 9,
    channelName: 'sales',
    messages: [
      { userId: 'U045', text: "Lost another deal in Australia — Westpac chose NICE Actimize. Their feedback: our platform feels 'startup-grade, not enterprise-ready'. We need to invest in the product.", sentiment: 'frustrated', topics: ['competitive-loss', 'product-gap'] },
      { userId: 'U046', text: "Australia pipeline coverage is only 1.5x. Without product improvements, I can't build a credible story for tier 1 banks. They compare us to Actimize and SAS.", sentiment: 'negative', topics: ['au-pipeline-weak', 'product-gap'] },
      { userId: 'U040', text: "I'm hearing the same in Singapore. Enterprise prospects want SOC 2 Type II, and we're still on Type I. That's a blocker for 3 deals in my pipeline right now.", sentiment: 'frustrated', topics: ['compliance-gap', 'deal-blocker'] },
    ],
  },
  // TENSION 6: Leadership disagreement about India expansion (month 10)
  {
    month: 10,
    channelName: 'leadership',
    messages: [
      { userId: 'U001', text: "I think India is a massive opportunity — $2B TAM. We should hire a country manager and start building pipeline.", sentiment: 'neutral' as any, topics: ['india-expansion', 'strategic-disagreement'] },
      { userId: 'U003', text: "Strongly disagree. We haven't hit $15M ARR yet. Australia win rate is 25% and Taiwan needs attention. Expanding to India now would spread us too thin.", sentiment: 'negative', topics: ['india-expansion', 'strategic-disagreement'] },
      { userId: 'U002', text: "From a product perspective, India's RBI regulations are completely different. We'd need 4-6 months of product work. That's engineering capacity we don't have.", sentiment: 'negative', topics: ['india-expansion', 'resource-constraint'] },
      { userId: 'U005', text: "Sales perspective: I'd rather double down on Australia and Philippines where we have existing traction. India is a 2-year play minimum.", sentiment: 'negative', topics: ['india-expansion', 'strategic-disagreement'] },
      { userId: 'U001', text: "Noted. Let's table this for the next board discussion. But I don't want to miss the window — competitors are already there.", sentiment: 'neutral' as any, topics: ['india-expansion'] },
    ],
  },
  // TENSION 7: Product-Sales misalignment on roadmap (month 11)
  {
    month: 11,
    channelName: 'product',
    messages: [
      { userId: 'U006', text: "Reviewing the customer feature requests log. 8 of the top 10 are things Sales committed to customers without checking with Product first. We need a better process.", sentiment: 'frustrated', topics: ['product-sales-misalignment', 'process-gap'] },
      { userId: 'U060', text: "The biggest gap: Sales is telling customers we'll have AI-powered alert triage by Q1. Our earliest realistic ship date is Q3. That's going to be a problem.", sentiment: 'negative', topics: ['product-sales-misalignment', 'promise-gap'] },
      { userId: 'U061', text: "Three of our top 5 lost deal reasons are product gaps that are on the roadmap but keep getting bumped. We're losing deals to our own backlog.", sentiment: 'frustrated', topics: ['product-sales-misalignment', 'revenue-impact'] },
    ],
  },
  // TENSION 8: Quiet attrition signals in People/HR data (month 6)
  {
    month: 6,
    channelName: 'general',
    messages: [
      { userId: 'U088', text: "Quick update: Employee engagement survey results are in. Overall score: 3.6/5. Highlight: SG office at 4.1. Concern: TW office at 3.1 and engineering at 3.3. Will share full report in leadership channel.", sentiment: 'negative', topics: ['engagement-low', 'taiwan-morale', 'engineering-morale'] },
    ],
  },
];

// ─── Thread Generation ──────────────────────────────────────────────────

function generateThread(parentMsg: SlackMessage, channelName: string, month: number, channelEmployees: typeof EMPLOYEES): SlackMessage[] {
  const replyCount = Math.floor(rand(2, 7));
  const replies: SlackMessage[] = [];
  const parentTime = new Date(parentMsg.timestamp);

  for (let i = 0; i < replyCount; i++) {
    const replyEmp = pick(channelEmployees.filter(e => e.slackId !== parentMsg.userId));
    if (!replyEmp) continue;

    const replyTime = new Date(parentTime.getTime() + (i + 1) * rand(60000, 3600000)); // 1 min to 1 hour gaps
    const threadTemplates = [
      `+1 on this`,
      `Good point. Let me look into it.`,
      `Discussed this offline — we'll follow up in the next standup.`,
      `Thanks for flagging. I'll prioritize this.`,
      `Can you share more context? What's the timeline?`,
      `This is a bigger issue than it seems. We should schedule a meeting.`,
      `Agreed. Creating a JIRA ticket now.`,
      `Let's sync on this tomorrow morning.`,
      `I have some data on this — will share in a thread.`,
      `Not sure I agree. The priority should be ${pick(['customer retention', 'new features', 'bug fixes', 'scalability', 'compliance'])} right now.`,
    ];

    replies.push({
      id: nextMsgId(),
      channelId: parentMsg.channelId,
      channelName,
      userId: replyEmp.slackId,
      userName: replyEmp.name,
      text: pick(threadTemplates),
      timestamp: iso(replyTime),
      threadId: parentMsg.id,
      reactions: Math.random() > 0.7 ? randomReactions(2) : [],
      isEdited: Math.random() > 0.9,
      mentions: Math.random() > 0.7 ? [parentMsg.userId] : [],
      sentiment: 'neutral',
      topics: parentMsg.topics || [],
    });
  }

  return replies;
}

// ─── Main Generator ─────────────────────────────────────────────────────

const CHANNEL_GENERATORS: Record<string, (month: number, emp: typeof EMPLOYEES[number]) => string> = {
  engineering: engineeringMessage,
  sales: salesMessage,
  'cs-support': csSupportMessage,
  leadership: leadershipMessage,
  product: productMessage,
  marketing: marketingMessage,
  general: generalMessage,
  'apac-regional': regionalMessage,
};

// Messages per month per channel (weighted by activity)
const CHANNEL_VOLUME: Record<string, number> = {
  engineering: 350,
  sales: 250,
  'cs-support': 200,
  leadership: 60,
  product: 180,
  marketing: 120,
  general: 200,
  'apac-regional': 140,
};

export function generateSlackData(startDate?: Date): SlackData {
  msgCounter = 0;
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  // Build users from employees
  const users: SlackUser[] = EMPLOYEES.map(emp => ({
    id: emp.slackId,
    name: emp.name,
    displayName: emp.name.split(' ')[0],
    email: emp.email,
    department: emp.department,
    role: emp.role,
    country: emp.country,
    isActive: true,
  }));

  // Build channels
  const channels: SlackChannel[] = SLACK_CHANNELS.map(ch => ({
    ...ch,
    messageCount: 0,
  }));

  const allMessages: SlackMessage[] = [];

  // Generate 12 months of messages
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(start);
    monthStart.setMonth(monthStart.getMonth() + m);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Seasonal volume adjustments
    const monthIndex = monthStart.getMonth();
    let volumeFactor = 1.0;
    if (monthIndex === 11 || monthIndex === 0) volumeFactor = 0.7; // Dec/Jan holidays
    if (monthIndex === 1) volumeFactor = 0.75; // Feb (CNY)
    if (monthIndex === 8 || monthIndex === 9) volumeFactor = 1.15; // Sep/Oct (regulatory deadlines, budget season)

    for (const channel of SLACK_CHANNELS) {
      const generator = CHANNEL_GENERATORS[channel.name];
      if (!generator) continue;

      const baseVolume = CHANNEL_VOLUME[channel.name] || 100;
      const monthVolume = Math.floor(baseVolume * volumeFactor);

      // Get employees who post in this channel
      const channelEmployees = EMPLOYEES.filter(emp => {
        const deptChannels = DEPT_CHANNELS[emp.department] || ['general'];
        return deptChannels.includes(channel.name) || channel.name === 'general';
      });

      if (channelEmployees.length === 0) continue;

      for (let i = 0; i < monthVolume; i++) {
        const emp = pick(channelEmployees);
        const msgTime = randomDate(monthStart, monthEnd);
        // Skip weekends (mostly)
        if (msgTime.getDay() === 0 || msgTime.getDay() === 6) {
          if (Math.random() > 0.1) continue; // 90% skip weekends
        }

        const sentiment = Math.random() > 0.8
          ? (Math.random() > 0.5 ? 'positive' : 'negative')
          : 'neutral';

        const msg: SlackMessage = {
          id: nextMsgId(),
          channelId: channel.id,
          channelName: channel.name,
          userId: emp.slackId,
          userName: emp.name,
          text: generator(m, emp),
          timestamp: iso(msgTime),
          threadId: null,
          reactions: Math.random() > 0.6 ? randomReactions() : [],
          isEdited: Math.random() > 0.92,
          mentions: Math.random() > 0.75 ? [pick(channelEmployees).slackId] : [],
          sentiment: sentiment as SlackMessage['sentiment'],
          topics: [],
        };

        allMessages.push(msg);

        // ~25% of messages spawn threads
        if (Math.random() < 0.25) {
          const threadReplies = generateThread(msg, channel.name, m, channelEmployees);
          allMessages.push(...threadReplies);
        }
      }
    }

    // Inject hidden tensions for this month
    const tensionsThisMonth = HIDDEN_TENSIONS.filter(t => t.month === m);
    for (const tension of tensionsThisMonth) {
      const channel = SLACK_CHANNELS.find(c => c.name === tension.channelName);
      if (!channel) continue;

      const baseTime = new Date(monthStart);
      baseTime.setDate(baseTime.getDate() + Math.floor(rand(5, 25)));

      let parentMsgId: string | null = null;
      for (let i = 0; i < tension.messages.length; i++) {
        const tmsg = tension.messages[i];
        const msgTime = new Date(baseTime.getTime() + i * rand(120000, 1800000));
        const emp = EMPLOYEES.find(e => e.slackId === tmsg.userId);

        const msg: SlackMessage = {
          id: nextMsgId(),
          channelId: channel.id,
          channelName: tension.channelName,
          userId: tmsg.userId,
          userName: emp?.name || 'Unknown',
          text: tmsg.text,
          timestamp: iso(msgTime),
          threadId: i > 0 && tmsg.isThread !== false ? parentMsgId : null,
          reactions: i === 0 ? randomReactions(4) : randomReactions(2),
          isEdited: false,
          mentions: [],
          sentiment: tmsg.sentiment,
          topics: tmsg.topics,
        };

        if (i === 0) parentMsgId = msg.id;
        allMessages.push(msg);
      }
    }
  }

  // Sort all messages by timestamp
  allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Update channel message counts
  for (const ch of channels) {
    ch.messageCount = allMessages.filter(m => m.channelName === ch.name).length;
  }

  return { users, channels, messages: allMessages };
}
