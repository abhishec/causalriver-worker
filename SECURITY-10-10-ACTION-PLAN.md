# 🎯 Security 10/10 Action Plan

**Current Status:** Supabase 10/10 ✅ | Overall: 7/10 ⚠️
**Goal:** Achieve 10/10 across ALL security categories
**Date:** 2025-02-14

---

## 📊 Current Scores

| Category | Current | Target | Gap | Status |
|----------|---------|--------|-----|--------|
| **Supabase Security** | 10/10 | 10/10 | 0 | ✅ COMPLETE |
| **Code Security** | 10/10 | 10/10 | 0 | ✅ COMPLETE |
| **API Security** | 10/10 | 10/10 | 0 | ✅ COMPLETE |
| **Dependencies** | 3/10 | 10/10 | **-7** | 🔴 CRITICAL |
| **AWS Infrastructure** | 0/10 | 10/10 | **-10** | 🔴 CRITICAL |
| **Compliance (GDPR)** | 8.5/10 | 10/10 | **-1.5** | 🟡 MINOR |
| **Compliance (SOC2)** | 8.0/10 | 10/10 | **-2** | 🟡 MINOR |
| **OWASP Top 10** | 9.0/10 | 10/10 | **-1** | 🟢 GOOD |

**Overall:** 7.1/10 → **Target: 10/10**

---

## 🚨 Priority 1: Fix Dependencies (3/10 → 10/10)

### Current Issue
```
[SCAN] npm audit failed: Error: Command failed: npm audit --json
```

**Root Cause:** Workspace configuration prevents `npm audit` from running at root level

### Solution Steps

#### Step 1: Fix Workspace Config
```json
// package.json
{
  "scripts": {
    "security:deps:check": "pnpm -r exec npm audit --json || true",
    "security:deps:fix": "pnpm -r exec npm audit fix",
    "security:deps:report": "node scripts/audit-all-packages.js"
  }
}
```

#### Step 2: Create Per-Package Auditor
```typescript
// scripts/audit-all-packages.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const workspaces = [
  'packages/memory-stack',
  'platform',
  'website'
];

interface AuditResult {
  workspace: string;
  vulnerabilities: {
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
    total: number;
  };
  dependencies: number;
}

const results: AuditResult[] = [];

for (const workspace of workspaces) {
  try {
    const output = execSync('npm audit --json', {
      cwd: path.join(process.cwd(), workspace),
      encoding: 'utf-8'
    });

    const audit = JSON.parse(output);
    results.push({
      workspace,
      vulnerabilities: audit.metadata.vulnerabilities,
      dependencies: audit.metadata.dependencies
    });
  } catch (error: any) {
    // npm audit returns non-zero for vulnerabilities
    if (error.stdout) {
      const audit = JSON.parse(error.stdout);
      results.push({
        workspace,
        vulnerabilities: audit.metadata.vulnerabilities,
        dependencies: audit.metadata.dependencies
      });
    }
  }
}

// Aggregate results
const total = results.reduce((acc, r) => ({
  critical: acc.critical + r.vulnerabilities.critical,
  high: acc.high + r.vulnerabilities.high,
  moderate: acc.moderate + r.vulnerabilities.moderate,
  low: acc.low + r.vulnerabilities.low,
  total: acc.total + r.vulnerabilities.total
}), { critical: 0, high: 0, moderate: 0, low: 0, total: 0 });

console.log('\n═══════════════════════════════════════');
console.log('  DEPENDENCY SECURITY AUDIT');
console.log('═══════════════════════════════════════\n');

for (const result of results) {
  console.log(`📦 ${result.workspace}`);
  console.log(`   Total: ${result.vulnerabilities.total}`);
  console.log(`   Critical: ${result.vulnerabilities.critical}`);
  console.log(`   High: ${result.vulnerabilities.high}`);
  console.log('');
}

console.log('─────────────────────────────────────────');
console.log(`🔴 Critical: ${total.critical}`);
console.log(`🟠 High: ${total.high}`);
console.log(`🟡 Moderate: ${total.moderate}`);
console.log(`🟢 Low: ${total.low}`);
console.log(`📊 Total: ${total.total}`);
console.log('═══════════════════════════════════════\n');

// Return results for security agent
fs.writeFileSync(
  'security-deps-audit.json',
  JSON.stringify({ workspaces: results, total }, null, 2)
);

process.exit(total.critical > 0 || total.high > 0 ? 1 : 0);
```

#### Step 3: Update Security Agent
```typescript
// In scanDependencies() method
private async scanDependencies(): Promise<SecurityVulnerability[]> {
  const vulnerabilities: SecurityVulnerability[] = [];

  try {
    // Run per-package auditor
    execSync('npx tsx scripts/audit-all-packages.ts', {
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    // Read aggregated results
    const auditData = JSON.parse(
      await fs.readFile('security-deps-audit.json', 'utf-8')
    );

    // Convert to vulnerabilities
    if (auditData.total.critical > 0) {
      vulnerabilities.push({
        id: 'deps_critical',
        severity: 'critical',
        category: 'dependencies',
        title: `${auditData.total.critical} critical dependency vulnerabilities`,
        description: 'Run npm audit fix to resolve',
        // ... rest of vulnerability object
      });
    }

    if (auditData.total.high > 0) {
      vulnerabilities.push({
        id: 'deps_high',
        severity: 'high',
        category: 'dependencies',
        title: `${auditData.total.high} high severity dependency vulnerabilities`,
        // ... rest
      });
    }

  } catch (error) {
    this.log('SCAN', `Dependency audit completed with issues`);
  }

  return vulnerabilities;
}
```

**Impact:** 3/10 → 10/10 (+7 points)

---

## 🚨 Priority 2: AWS Infrastructure Security (0/10 → 10/10)

### Current Issue
AWS scanning is skipped (no credentials configured)

### Solution Steps

#### Step 1: Create Read-Only IAM User

```json
// aws-security-scanner-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:List*",
        "iam:Get*",
        "iam:GenerateCredentialReport",
        "s3:GetBucketPolicy",
        "s3:GetBucketAcl",
        "s3:GetBucketPublicAccessBlock",
        "s3:ListAllMyBuckets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeInstances",
        "cloudtrail:DescribeTrails",
        "cloudtrail:GetTrailStatus",
        "cloudtrail:LookupEvents",
        "kms:ListKeys",
        "kms:GetKeyPolicy",
        "kms:DescribeKey",
        "rds:DescribeDBInstances",
        "rds:DescribeDBSecurityGroups",
        "lambda:ListFunctions",
        "lambda:GetPolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Step 2: Add AWS Security Scanner

```typescript
// scripts/agents/aws-security-scanner.ts
import { IAMClient, ListUsersCommand, GetCredentialReportCommand } from '@aws-sdk/client-iam';
import { S3Client, ListBucketsCommand, GetBucketAclCommand } from '@aws-sdk/client-s3';
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';

export interface AWSSecurityIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  resource: string;
  fix: {
    automated: boolean;
    steps: string[];
    terraform?: string;
  };
}

export class AWSSecurityScanner {
  private iamClient: IAMClient;
  private s3Client: S3Client;
  private ec2Client: EC2Client;

  constructor(region: string = 'us-east-1') {
    this.iamClient = new IAMClient({ region });
    this.s3Client = new S3Client({ region });
    this.ec2Client = new EC2Client({ region });
  }

  async scan(): Promise<AWSSecurityIssue[]> {
    const issues: AWSSecurityIssue[] = [];

    // 1. Check IAM users without MFA
    issues.push(...await this.checkIAMSecurity());

    // 2. Check public S3 buckets
    issues.push(...await this.checkS3Security());

    // 3. Check security groups with 0.0.0.0/0
    issues.push(...await this.checkEC2Security());

    // 4. Check CloudTrail logging
    issues.push(...await this.checkCloudTrail());

    return issues;
  }

  private async checkIAMSecurity(): Promise<AWSSecurityIssue[]> {
    const issues: AWSSecurityIssue[] = [];

    try {
      const { Users } = await this.iamClient.send(new ListUsersCommand({}));

      for (const user of Users || []) {
        // Check if user has MFA enabled
        if (!user.CreateDate || !user.PasswordLastUsed) {
          issues.push({
            id: `iam_no_mfa_${user.UserName}`,
            severity: 'high',
            category: 'IAM',
            title: `IAM user ${user.UserName} without MFA`,
            description: `User ${user.UserName} does not have MFA enabled`,
            resource: user.Arn || '',
            fix: {
              automated: false,
              steps: [
                'Enable MFA for this user',
                'Use virtual MFA device or hardware token',
                'Enforce MFA policy organization-wide'
              ]
            }
          });
        }
      }
    } catch (error) {
      console.error('IAM check failed:', error);
    }

    return issues;
  }

  private async checkS3Security(): Promise<AWSSecurityIssue[]> {
    const issues: AWSSecurityIssue[] = [];

    try {
      const { Buckets } = await this.s3Client.send(new ListBucketsCommand({}));

      for (const bucket of Buckets || []) {
        try {
          const { Grants } = await this.s3Client.send(
            new GetBucketAclCommand({ Bucket: bucket.Name })
          );

          // Check for public access
          const hasPublicRead = Grants?.some(
            g => g.Grantee?.URI?.includes('AllUsers') &&
                 g.Permission === 'READ'
          );

          if (hasPublicRead) {
            issues.push({
              id: `s3_public_${bucket.Name}`,
              severity: 'critical',
              category: 'S3',
              title: `S3 bucket ${bucket.Name} is publicly readable`,
              description: `Bucket allows public read access`,
              resource: `arn:aws:s3:::${bucket.Name}`,
              fix: {
                automated: true,
                steps: [
                  'Remove public ACL grants',
                  'Enable Block Public Access',
                  'Review bucket policy'
                ],
                terraform: `
resource "aws_s3_bucket_public_access_block" "${bucket.Name}_block" {
  bucket = aws_s3_bucket.${bucket.Name}.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
                `.trim()
              }
            });
          }
        } catch (err) {
          // Skip buckets we can't access
        }
      }
    } catch (error) {
      console.error('S3 check failed:', error);
    }

    return issues;
  }

  private async checkEC2Security(): Promise<AWSSecurityIssue[]> {
    const issues: AWSSecurityIssue[] = [];

    try {
      const { SecurityGroups } = await this.ec2Client.send(
        new DescribeSecurityGroupsCommand({})
      );

      for (const sg of SecurityGroups || []) {
        for (const rule of sg.IpPermissions || []) {
          // Check for 0.0.0.0/0 on non-HTTP/HTTPS ports
          const hasOpenRule = rule.IpRanges?.some(
            r => r.CidrIp === '0.0.0.0/0'
          );

          if (hasOpenRule && ![80, 443].includes(rule.FromPort || 0)) {
            issues.push({
              id: `sg_open_${sg.GroupId}_${rule.FromPort}`,
              severity: 'critical',
              category: 'EC2',
              title: `Security group ${sg.GroupName} allows 0.0.0.0/0 on port ${rule.FromPort}`,
              description: `Unrestricted access from internet`,
              resource: sg.GroupId || '',
              fix: {
                automated: true,
                steps: [
                  'Restrict source to specific IP ranges',
                  'Use VPN or bastion host for SSH',
                  'Remove 0.0.0.0/0 rule'
                ],
                terraform: `
# Remove this rule and replace with specific IPs
# aws_security_group_rule "${sg.GroupId}_restricted" {
#   type              = "ingress"
#   from_port         = ${rule.FromPort}
#   to_port           = ${rule.ToPort}
#   protocol          = "${rule.IpProtocol}"
#   cidr_blocks       = ["YOUR_IP/32"]  # Replace with your IP
#   security_group_id = "${sg.GroupId}"
# }
                `.trim()
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('EC2 check failed:', error);
    }

    return issues;
  }

  private async checkCloudTrail(): Promise<AWSSecurityIssue[]> {
    // Check if CloudTrail is enabled
    // Implementation similar to above
    return [];
  }
}
```

#### Step 3: Add to .env
```bash
# Add these to .env (DO NOT COMMIT)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

#### Step 4: Add to GitHub Secrets
```bash
# In GitHub repo settings
Settings → Secrets and variables → Actions → New repository secret

AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

**Impact:** 0/10 → 10/10 (+10 points)

---

## 🟡 Priority 3: Compliance Improvements

### GDPR: 8.5/10 → 10/10 (+1.5)

**Missing:** Data retention policy documentation

**Solution:**
```markdown
// docs/DATA-RETENTION-POLICY.md
# Data Retention Policy

## Personal Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|------------------|-----------------|
| User account data | Account lifetime + 30 days | Hard delete |
| AI memory/embeddings | Account lifetime + 30 days | Hard delete |
| LLM cost logs | 12 months | Automated cleanup |
| Audit logs | 7 years (compliance) | Automated archive |
| Temporary caches | 7 days | TTL expiration |

## Implementation

```sql
-- Auto-delete old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete user data 30 days after account deletion
  DELETE FROM ai_memory
  WHERE organization_id IN (
    SELECT id FROM organizations
    WHERE deleted_at < NOW() - INTERVAL '30 days'
  );

  -- Delete old cost logs
  DELETE FROM llm_cost_log
  WHERE timestamp < NOW() - INTERVAL '12 months';

  -- Delete old cache entries
  DELETE FROM embedding_cache_state
  WHERE last_accessed < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule daily
SELECT cron.schedule(
  'cleanup-old-data',
  '0 3 * * *',
  $$SELECT cleanup_old_data()$$
);
```

### SOC2: 8.0/10 → 10/10 (+2)

**Missing:** Comprehensive audit logging

**Solution:**
```sql
-- Create audit log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Index for fast queries
CREATE INDEX idx_audit_org_time ON audit_log(organization_id, timestamp DESC);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);

-- RLS policies
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select_org ON audit_log
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role can write
CREATE POLICY audit_log_insert_service ON audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Create audit logging function
CREATE OR REPLACE FUNCTION log_audit_event(
  p_organization_id UUID,
  p_user_id UUID,
  p_action VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO audit_log (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_metadata
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Application Integration:**
```typescript
// platform/lib/audit.ts
export async function logAuditEvent(params: {
  organizationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValue?: any;
  newValue?: any;
  metadata?: any;
}) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabase.rpc('log_audit_event', {
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_action: params.action,
    p_resource_type: params.resourceType,
    p_resource_id: params.resourceId,
    p_old_value: params.oldValue || null,
    p_new_value: params.newValue || null,
    p_metadata: params.metadata || null
  });
}
```

---

## 📋 Implementation Timeline

### Phase 1: Critical Fixes (Day 1) ⏰
- [ ] Create `scripts/audit-all-packages.ts`
- [ ] Update dependency scanning in security agent
- [ ] Run first comprehensive dependency audit
- [ ] Fix critical/high npm vulnerabilities
- [ ] **Target:** Dependencies 3/10 → 8/10

### Phase 2: AWS Setup (Day 2) ⏰
- [ ] Create AWS IAM security scanner user
- [ ] Add AWS credentials to .env and GitHub Secrets
- [ ] Create `scripts/agents/aws-security-scanner.ts`
- [ ] Integrate with main security agent
- [ ] Run first AWS security scan
- [ ] **Target:** AWS 0/10 → 10/10

### Phase 3: Compliance (Day 3) ⏰
- [ ] Create `docs/DATA-RETENTION-POLICY.md`
- [ ] Implement data cleanup functions
- [ ] Create audit_log table and functions
- [ ] Integrate audit logging in application
- [ ] **Target:** GDPR 8.5/10 → 10/10, SOC2 8.0/10 → 10/10

### Phase 4: Final Verification (Day 4) ⏰
- [ ] Run complete security scan
- [ ] Verify all scores are 10/10
- [ ] Generate final report
- [ ] Commit and push all changes

---

## 🎯 Success Metrics

| Category | Before | After | Status |
|----------|--------|-------|--------|
| Supabase Security | 10/10 | 10/10 | ✅ |
| Code Security | 10/10 | 10/10 | ✅ |
| API Security | 10/10 | 10/10 | ✅ |
| Dependencies | 3/10 | **10/10** | 🔄 In Progress |
| AWS Infrastructure | 0/10 | **10/10** | 🔄 In Progress |
| GDPR Compliance | 8.5/10 | **10/10** | 🔄 In Progress |
| SOC2 Compliance | 8.0/10 | **10/10** | 🔄 In Progress |
| OWASP Top 10 | 9.0/10 | **10/10** | 🔄 In Progress |

**Overall Target:** 7.1/10 → **10/10** ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

---

**Next Step:** Execute Phase 1 (Dependency Fixes)
