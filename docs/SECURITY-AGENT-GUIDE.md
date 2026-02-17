# Security Hardening Agent — Complete Guide

> **Brain Region:** Amygdala (Threat Detection & Response)
> **Version:** 1.0.0
> **Status:** Production Ready

## Overview

The **Security Hardening Agent** is a Manus-native autonomous agent that continuously scans your entire infrastructure for security vulnerabilities and **automatically patches** them where safe to do so.

### What It Does

1. **Scans** — Comprehensive security vulnerability detection across:
   - Supabase database (RLS policies, SECURITY DEFINER functions, API keys)
   - Application code (OWASP Top 10, SQL injection, XSS, secrets)
   - API routes (CORS, CSRF, rate limiting, authentication)
   - Dependencies (npm audit for known CVEs)
   - AWS infrastructure (IAM, S3, security groups)
   - Compliance (GDPR, SOC2, OWASP readiness)

2. **Remediates** — Automatically fixes vulnerabilities with high confidence:
   - Creates migration files for database security issues
   - Generates PRs for code vulnerabilities
   - Updates AWS policies via IaC
   - Rotates compromised credentials
   - Sends Slack alerts for critical issues

3. **Learns** — Calibrates its confidence based on remediation outcomes:
   - Tracks prediction accuracy
   - Adjusts auto-fix thresholds
   - Improves detection patterns over time

---

## Quick Start

### Installation

```bash
# Install dependencies (if not already done)
pnpm install

# Verify environment variables
cat .env | grep -E 'SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY'
```

### Run Your First Scan

```bash
# Dry run (scan only, no auto-fixes)
npm run security:scan:dry

# Full scan with auto-remediation
npm run security:scan

# Verbose output
npm run security:scan:verbose
```

### Expected Output

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                   NEXUSBRAIN SECURITY HARDENING AGENT                     ║
║                                                                           ║
║  Brain Region: Amygdala (Threat Detection & Response)                    ║
║  Mode: ACTIVE (scan + auto-patch)                                        ║
║  Motor Commands: ENABLED                                                 ║
╚═══════════════════════════════════════════════════════════════════════════╝

🔍 Starting security scan...

════════════════════════════════════════════════════════════════════════════
INITIALIZING COMPREHENSIVE BRAIN (93+ SYSTEMS)
════════════════════════════════════════════════════════════════════════════
[BRAIN] Initialized 89/93 systems in 1234ms
[BRAIN] Skipped: 4 systems
[BRAIN] Comprehensive brain initialization complete ✓

════════════════════════════════════════════════════════════════════════════
SECURITY VULNERABILITY SCAN
════════════════════════════════════════════════════════════════════════════
[SCAN] Scanning Supabase database security...
[SCAN] Scanning code for security issues...
[SCAN] Scanning API routes for vulnerabilities...
[SCAN] Scanning npm dependencies...
[SCAN] Running compliance checks...
[SCAN] Found 12 vulnerabilities (2 critical, 5 high)

════════════════════════════════════════════════════════════════════════════
EXECUTING MOTOR COMMANDS
════════════════════════════════════════════════════════════════════════════
[MOTOR] Generated 7 motor command(s)
[MOTOR] Executed 5/7 commands
[MOTOR] Pending approval: 2

════════════════════════════════════════════════════════════════════════════
SECURITY SCAN RESULTS
════════════════════════════════════════════════════════════════════════════
Duration: 45.2s
Signals Generated: 12
Training Packs: 1

MOTOR COMMANDS (AUTO-REMEDIATION)
─────────────────────────────────────────────────────────────────────────────
Generated: 7
Executed: 5
Failed: 0
Pending Approval: 2
```

---

## Architecture

### Integration with Agent Framework

The Security Agent is a **Manus-native agent**, meaning it:

1. **Self-registers** to the Agent Registry
2. **Uses Motor Commands** to execute actions (migrations, PRs, Slack alerts)
3. **Tracks calibration** to improve accuracy over time
4. **Integrates with Brain Pipeline** as a neurological subsystem

```typescript
// Auto-registration (runs on import)
ManusNativeAgent.registerManusAgent.call(SecurityHardeningAgent, {
  name: 'security-hardening-agent',
  description: 'Continuous security vulnerability detection and automated patching',
  version: '1.0.0',
  brainRegion: 'Amygdala',
  neurologicalFunction: 'Threat detection & response',
  schedule: '0 0 * * *', // Daily at midnight
  tags: ['security', 'compliance', 'infrastructure'],
});
```

### Brain Region Analogy

**Amygdala (Threat Detection & Response)**

Just as the amygdala detects threats in the human brain and triggers immediate responses, this agent:
- Continuously monitors for security threats
- Assesses severity (critical, high, medium, low)
- Triggers immediate automated responses (patches, alerts)
- Learns from false positives to improve detection

---

## Vulnerability Categories

### 1. Supabase Database Security

**What It Scans:**
- Tables without Row Level Security (RLS)
- `SECURITY DEFINER` functions without authorization checks
- Exposed service role keys in client code
- Missing RLS policies
- Overly permissive policies

**Auto-Remediation:**
```sql
-- Example: Enable RLS on missing table
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_data_service_all ON user_data
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY user_data_read_org ON user_data
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
```

**Severity Mapping:**
| Issue | Severity | Auto-Fix |
|-------|----------|----------|
| Missing RLS | High | ✅ Yes |
| SECURITY DEFINER without auth | Critical | ❌ Manual review |
| Service key in client code | Critical | ✅ Yes (with approval) |

---

### 2. Code Security (OWASP Top 10)

**What It Scans:**
- SQL injection patterns (template literals, string concatenation)
- Hardcoded secrets (API keys, tokens, passwords)
- Cross-site scripting (XSS) vulnerabilities
- Command injection
- Path traversal

**Detection Patterns:**
```typescript
// ❌ SQL Injection (detected)
const query = `SELECT * FROM users WHERE id = ${req.body.userId}`;

// ✅ Safe (parameterized)
const query = supabase.from('users').select('*').eq('id', userId);

// ❌ Hardcoded secret (detected)
const apiKey = 'sk_live_abcd1234567890';

// ✅ Safe (environment variable)
const apiKey = process.env.STRIPE_API_KEY;
```

**Auto-Remediation:**
- Creates PR with safe code patterns
- Flags secrets for rotation
- Provides code review comments

---

### 3. API Security

**What It Scans:**
- Missing CORS headers
- Missing rate limiting
- Missing authentication checks
- Missing CSRF protection
- Overly permissive endpoints

**Auto-Remediation:**
```typescript
// Before (vulnerable)
export async function POST(request: NextRequest) {
  const data = await request.json();
  // ... process data
}

// After (hardened)
import { enforceSessionSecurity, corsHeaders } from '@/lib/security-middleware';

export async function POST(request: NextRequest) {
  const security = await enforceSessionSecurity(request, { requireAuth: true });
  if (!security.ok) return security.response;

  const data = await request.json();
  // ... process data

  return NextResponse.json(result, { headers: corsHeaders(request) });
}
```

---

### 4. Dependency Vulnerabilities

**What It Scans:**
- Known CVEs via `npm audit`
- Outdated packages with security patches
- Transitive dependency vulnerabilities

**Auto-Remediation:**
```bash
# Automatically runs
npm audit fix --force

# Or creates PR with package updates
```

**Severity Thresholds:**
- **Critical/High:** Auto-fix (if safe)
- **Medium/Low:** Create PR for review
- **Info:** Log only

---

### 5. AWS Infrastructure

**What It Scans:**
- Overly permissive IAM policies
- Public S3 buckets
- Missing security groups
- CloudTrail not enabled
- Unencrypted resources

**Auto-Remediation:**
```json
// Example: Restrict S3 bucket policy
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::bucket-name/*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

---

### 6. Compliance Checks

**What It Scans:**
- **GDPR:** Data retention policies, right to deletion, consent tracking
- **SOC2:** Audit logging, access controls, encryption at rest/in transit
- **OWASP:** Top 10 vulnerabilities coverage

**Auto-Remediation:**
- Generates compliance documentation
- Creates missing audit log tables
- Implements data retention policies

---

## Motor Commands (Auto-Remediation)

### How It Works

1. **Vulnerability Detected** → Agent creates `MotorCommand`
2. **Confidence Check** → If confidence ≥ 0.9, auto-execute; else, require approval
3. **Execution** → Motor Command Engine executes the action
4. **Feedback** → Calibration Loop tracks outcome

### Command Types

| Action Type | Target | Confidence Threshold | Approval |
|-------------|--------|----------------------|----------|
| `execute_migration` | Supabase | 0.95 | Auto (critical), Manual (high) |
| `create_pr` | GitHub | 0.80 | Manual |
| `slack_send_message` | Slack | 1.0 | Auto |
| `rotate_credentials` | AWS/Supabase | 0.70 | Manual |
| `update_aws_policy` | AWS | 0.85 | Manual |

### Example: RLS Policy Creation

```typescript
{
  id: 'patch_rls_missing_user_data',
  actionType: 'execute_migration',
  target: 'supabase',
  parameters: {
    sql: `
      ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
      CREATE POLICY user_data_service_all ON user_data ...
    `,
    description: 'Enable RLS on user_data table',
  },
  confidence: 0.95, // High confidence → auto-execute
  approvalMode: 'auto',
  priority: 'critical',
  targetDomains: ['security', 'database'],
  evidence: 'CRITICAL vulnerability: Table user_data missing RLS',
  sourceArtifactType: 'security_scan',
  expectedImpact: 'Patch Table user_data missing Row Level Security',
}
```

---

## Configuration

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEFAULT_ORG_ID=00000000-0000-4000-a000-000000000001

# Optional (for enhanced features)
GITHUB_TOKEN=ghp_...                    # For creating PRs
SLACK_TOKEN=xoxb-...                    # For Slack alerts
ANTHROPIC_API_KEY=sk-ant-...            # For LLM-enhanced detection
AWS_ACCESS_KEY_ID=AKIA...               # For AWS scanning
AWS_SECRET_ACCESS_KEY=...
```

### Agent Configuration

```typescript
const config: BrainNativeAgentConfig & ManusCapabilitiesConfig = {
  organizationId: process.env.DEFAULT_ORG_ID!,
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // Execution mode
  dryRun: false, // Set true for scan-only
  verbose: true,

  // Manus capabilities
  enableMotorCommands: true, // Enable auto-remediation
  enableCalibration: true,   // Track accuracy
  enableAgentRegistry: true, // Self-register

  // Auto-execution threshold (0-1)
  motorCommandAutoExecuteThreshold: 0.9, // 90% confidence required

  // Brain regions
  brainRegionConfig: {
    enableAll: true,
    verbose: true,
  },
};
```

---

## Daily Automation

### GitHub Actions (Recommended)

The agent runs automatically via GitHub Actions:

```yaml
# .github/workflows/security-scan.yml
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC
  workflow_dispatch: # Manual trigger
```

**What Happens:**
1. Scans entire codebase for vulnerabilities
2. Auto-patches high-confidence issues
3. Creates PRs for manual review items
4. Sends Slack alerts for critical findings
5. Creates GitHub issues for tracking

### Manual Scheduling (Alternative)

```bash
# Cron job (runs daily at 2 AM)
0 2 * * * cd /path/to/nexusbrain && npm run security:daily >> /var/log/security-scan.log 2>&1
```

---

## Remediation Workflow

### Auto-Fix (Confidence ≥ 90%)

```
Vulnerability Detected
  ↓
Confidence Check (≥0.9)
  ↓
Auto-Execute Motor Command
  ↓
Apply Fix (migration/PR/config)
  ↓
Calibration Feedback
  ↓
Done ✅
```

### Manual Review (Confidence < 90%)

```
Vulnerability Detected
  ↓
Confidence Check (<0.9)
  ↓
Create Approval Request
  ↓
Notify Team (Slack/GitHub)
  ↓
Human Approval
  ↓
Execute Motor Command
  ↓
Done ✅
```

---

## Monitoring & Reporting

### Scan Results

All scan results are stored in the brain's time-series database:

```sql
-- View recent security scans
SELECT
  timestamp,
  metric_name,
  value,
  metadata->>'severity' as severity,
  metadata->>'category' as category
FROM connector_signals
WHERE domain = 'security'
ORDER BY timestamp DESC
LIMIT 100;
```

### Calibration Metrics

Track the agent's accuracy over time:

```typescript
// Get calibration report
const report = await calibrationLoop.generateCalibrationReport({
  agentId: 'security-hardening-agent',
  minSampleSize: 10,
});

console.log(`Accuracy: ${report.accuracy * 100}%`);
console.log(`Verified: ${report.verifiedPredictions}/${report.totalPredictions}`);
```

### Slack Alerts

Configure Slack webhook to receive real-time alerts:

```bash
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX
```

**Alert Format:**
```
🚨 Security Scan Complete

Critical: 2 | High: 5 | Medium: 3

Auto-remediation: 4 vulnerabilities auto-patched.

View full report: /security/reports/scan_1234567890
```

---

## Extending the Agent

### Add Custom Scanners

```typescript
// Add to SecurityHardeningAgent class
private async scanCustomCategory(): Promise<SecurityVulnerability[]> {
  const vulnerabilities: SecurityVulnerability[] = [];

  // Your custom scanning logic
  // ...

  return vulnerabilities;
}

// Wire into fetch()
async fetch(): Promise<FetchResult> {
  // ... existing scans
  vulnerabilities.push(...await this.scanCustomCategory());
  // ...
}
```

### Add Custom Remediation

```typescript
protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
  const commands = await super.generateMotorCommands(trainResult);

  // Add custom motor command
  commands.push({
    id: 'custom_action',
    actionType: 'custom_action_type',
    // ... command config
  });

  return commands;
}
```

---

## Troubleshooting

### Common Issues

**1. "Missing required environment variables"**
```bash
# Check environment
cat .env | grep SUPABASE

# Set missing variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**2. "Permission denied on RLS policy creation"**
```sql
-- Ensure service role has permission
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
```

**3. "Motor commands not executing"**
```typescript
// Check motor command engine initialization
const motorEngine = this.getBrainSystem('motorCommandEngine');
console.log('Motor engine:', motorEngine ? 'OK' : 'NOT INITIALIZED');
```

**4. "Scan fails on npm audit"**
```bash
# Update npm
npm install -g npm@latest

# Clear cache
npm cache clean --force

# Retry
npm run security:scan
```

---

## Best Practices

### 1. Start with Dry Runs

Always do a dry run first to understand what the agent will do:

```bash
npm run security:scan:dry
```

### 2. Review Auto-Patches

Even with high confidence, review auto-generated migrations and PRs before merging:

```bash
# Review pending migrations
ls -la supabase/migrations/*security*

# Review PRs
gh pr list --label security
```

### 3. Tune Confidence Thresholds

Adjust thresholds based on your risk tolerance:

```typescript
// Conservative (manual review for everything)
motorCommandAutoExecuteThreshold: 0.99

// Balanced (auto-fix high-confidence only)
motorCommandAutoExecuteThreshold: 0.9

// Aggressive (auto-fix most issues)
motorCommandAutoExecuteThreshold: 0.7
```

### 4. Monitor Calibration

Track accuracy weekly:

```bash
npm run security:scan:verbose | grep "Calibration"
```

### 5. Keep Agent Updated

```bash
git pull origin main
pnpm install
npm run security:scan:dry # Test before production
```

---

## Security Considerations

### Agent Security

The security agent itself must be secured:

1. **Service Role Key Protection**
   - Never commit to Git
   - Store in GitHub Secrets for CI/CD
   - Rotate periodically (quarterly)

2. **Rate Limiting**
   - Prevent runaway scans
   - Limit motor command execution
   - Throttle API calls

3. **Audit Logging**
   - All agent runs logged to database
   - Motor commands tracked in `motor_command_log`
   - Calibration events recorded

### False Positive Handling

1. **Whitelist Patterns**
   ```typescript
   // Ignore test files
   if (file.includes('.test.') || file.includes('mock')) {
     continue;
   }
   ```

2. **Confidence Calibration**
   - Tracks false positives
   - Adjusts detection thresholds
   - Learns from manual overrides

---

## Roadmap

### v1.1 (Next Release)
- [ ] AWS security scanning (IAM, S3, CloudTrail)
- [ ] Container security (Docker, Kubernetes)
- [ ] Secret rotation automation
- [ ] Compliance report generation (PDF)

### v1.2
- [ ] ML-based anomaly detection
- [ ] Integration with SIEM tools
- [ ] Automated penetration testing
- [ ] Zero-day vulnerability tracking

### v2.0
- [ ] Multi-cloud support (GCP, Azure)
- [ ] Real-time threat detection
- [ ] Autonomous incident response
- [ ] Blockchain audit trail

---

## Support & Contributing

### Get Help

- **Documentation:** `/docs/SECURITY-AGENT-GUIDE.md` (this file)
- **GitHub Issues:** https://github.com/your-org/nexusbrain/issues
- **Slack:** #security-alerts

### Contributing

We welcome contributions! See `/CONTRIBUTING.md` for guidelines.

**Areas for Contribution:**
- New vulnerability scanners
- Auto-remediation patterns
- Compliance frameworks
- Detection accuracy improvements

---

## License

MIT License — see `/LICENSE`

---

**Built with ❤️ by the NexusBrain Security Team**

*Last updated: 2025-02-14*
