/**
 * Security Trainer — OSV + GitHub Advisory Data Fetcher
 *
 * Pulls vulnerability data from:
 * 1. OSV.dev API — Open Source Vulnerability database (Google)
 * 2. GitHub Advisory Database API — GHSA advisories
 *
 * Both are free, public, no auth needed (OSV), or included in GITHUB_TOKEN (GHSA).
 * Zero rate limit concerns — these are designed for bulk access.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VulnerabilityData {
  id: string;               // e.g. "GHSA-xxxx" or "CVE-2024-xxxx"
  summary: string;
  severity: string;         // CRITICAL, HIGH, MEDIUM, LOW
  published: string;        // ISO date
  modified: string;
  ecosystem: string;        // npm, PyPI, Go, Maven, crates.io, etc.
  affectedPackage: string;  // e.g. "lodash", "express"
  cwes: string[];           // CWE IDs
  patchAvailable: boolean;
  fixedVersions: string[];
}

export interface EcosystemSecurityData {
  ecosystem: string;
  vulnerabilities: VulnerabilityData[];
  fetchedAt: Date;
}

export interface SecurityFetchOptions {
  /** Max vulnerabilities per ecosystem (default: 500) */
  maxVulns?: number;
  /** Only fetch vulns modified since this date (ISO string) */
  since?: string;
  /** Rate limit delay in ms (default: 100) */
  rateLimitDelay?: number;
}

// ============================================================================
// OSV.dev API
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOSV(ecosystem: string, options: SecurityFetchOptions): Promise<VulnerabilityData[]> {
  const maxVulns = options.maxVulns || 500;
  const vulns: VulnerabilityData[] = [];
  let pageToken: string | undefined;

  while (vulns.length < maxVulns) {
    try {
      const body: any = {
        ecosystem,
        page_size: Math.min(100, maxVulns - vulns.length),
      };
      if (pageToken) body.page_token = pageToken;

      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // OSV query endpoint may not support ecosystem-only queries well
        // Fall back to the list endpoint
        break;
      }

      const data = await response.json();
      if (!data.vulns || data.vulns.length === 0) break;

      for (const v of data.vulns) {
        const severity = extractSeverity(v);
        const affected = v.affected?.[0] || {};
        const pkg = affected.package?.name || 'unknown';
        const fixed = extractFixedVersions(affected.ranges || []);

        vulns.push({
          id: v.id,
          summary: (v.summary || v.details || '').substring(0, 200),
          severity,
          published: v.published || v.modified || new Date().toISOString(),
          modified: v.modified || v.published || new Date().toISOString(),
          ecosystem,
          affectedPackage: pkg,
          cwes: extractCWEs(v),
          patchAvailable: fixed.length > 0,
          fixedVersions: fixed,
        });
      }

      pageToken = data.next_page_token;
      if (!pageToken) break;

      await sleep(options.rateLimitDelay || 100);
    } catch (err) {
      console.log(`[SecurityFetcher] [OSV/${ecosystem}] Error: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  return vulns.slice(0, maxVulns);
}

// ============================================================================
// GitHub Advisory Database API (REST)
// ============================================================================

async function fetchGHSA(ecosystem: string, options: SecurityFetchOptions): Promise<VulnerabilityData[]> {
  const maxVulns = options.maxVulns || 500;
  const vulns: VulnerabilityData[] = [];
  const ghEcosystem = mapToGHSAEcosystem(ecosystem);
  let page = 1;
  const perPage = 100;

  while (vulns.length < maxVulns) {
    try {
      const params = new URLSearchParams({
        ecosystem: ghEcosystem,
        per_page: String(perPage),
        page: String(page),
        sort: 'updated',
        direction: 'desc',
      });
      if (options.since) {
        params.set('updated', `>=${options.since.substring(0, 10)}`);
      }

      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'NexusBrain-SecurityTrainer/1.0',
      };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const response = await fetch(
        `https://api.github.com/advisories?${params.toString()}`,
        { headers },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.log(`[SecurityFetcher] [GHSA/${ecosystem}] HTTP ${response.status}: ${body.substring(0, 200)}`);
        break;
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const adv of data) {
        const severity = (adv.severity || 'unknown').toUpperCase();
        const pkg = adv.vulnerabilities?.[0]?.package?.name || 'unknown';
        const fixed = adv.vulnerabilities?.[0]?.patched_versions || '';

        vulns.push({
          id: adv.ghsa_id || adv.cve_id || `GHSA-${adv.id}`,
          summary: (adv.summary || '').substring(0, 200),
          severity: severity === 'UNKNOWN' ? 'MEDIUM' : severity,
          published: adv.published_at || adv.created_at || new Date().toISOString(),
          modified: adv.updated_at || adv.published_at || new Date().toISOString(),
          ecosystem,
          affectedPackage: pkg,
          cwes: (adv.cwes || []).map((c: any) => c.cwe_id || c),
          patchAvailable: !!fixed && fixed !== '0',
          fixedVersions: fixed ? [fixed] : [],
        });
      }

      page++;
      if (data.length < perPage) break;
      await sleep(options.rateLimitDelay || 100);
    } catch (err) {
      console.log(`[SecurityFetcher] [GHSA/${ecosystem}] Error: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  return vulns.slice(0, maxVulns);
}

// ============================================================================
// HELPERS
// ============================================================================

function extractSeverity(vuln: any): string {
  // Check CVSS
  if (vuln.database_specific?.severity) return vuln.database_specific.severity.toUpperCase();
  if (vuln.severity) {
    for (const s of vuln.severity) {
      if (s.type === 'CVSS_V3' && s.score) {
        if (s.score >= 9.0) return 'CRITICAL';
        if (s.score >= 7.0) return 'HIGH';
        if (s.score >= 4.0) return 'MEDIUM';
        return 'LOW';
      }
    }
  }
  return 'MEDIUM'; // default
}

function extractFixedVersions(ranges: any[]): string[] {
  const fixed: string[] = [];
  for (const range of ranges) {
    for (const event of range.events || []) {
      if (event.fixed) fixed.push(event.fixed);
    }
  }
  return fixed;
}

function extractCWEs(vuln: any): string[] {
  const cwes: string[] = [];
  if (vuln.database_specific?.cwe_ids) cwes.push(...vuln.database_specific.cwe_ids);
  if (vuln.aliases) {
    for (const alias of vuln.aliases) {
      if (alias.startsWith('CWE-')) cwes.push(alias);
    }
  }
  return [...new Set(cwes)];
}

function mapToGHSAEcosystem(ecosystem: string): string {
  const map: Record<string, string> = {
    npm: 'npm',
    PyPI: 'pip',
    'crates.io': 'rust',
    Go: 'go',
    Maven: 'maven',
    NuGet: 'nuget',
    RubyGems: 'rubygems',
  };
  return map[ecosystem] || ecosystem.toLowerCase();
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/** Target ecosystems — cover the major package registries */
export const TARGET_ECOSYSTEMS = ['npm', 'PyPI', 'Go', 'Maven', 'crates.io'];

export async function fetchAllSecurityData(
  ecosystems: string[],
  options: SecurityFetchOptions = {},
): Promise<EcosystemSecurityData[]> {
  const results: EcosystemSecurityData[] = [];

  console.log(`[SecurityFetcher] Fetching vulnerability data for ${ecosystems.length} ecosystems...`);

  for (let i = 0; i < ecosystems.length; i++) {
    const ecosystem = ecosystems[i];
    console.log(`[${i + 1}/${ecosystems.length}] -- ${ecosystem} --`);

    try {
      // Fetch from GHSA (more reliable for our use case)
      const vulns = await fetchGHSA(ecosystem, options);

      results.push({
        ecosystem,
        vulnerabilities: vulns,
        fetchedAt: new Date(),
      });

      const critical = vulns.filter(v => v.severity === 'CRITICAL').length;
      const high = vulns.filter(v => v.severity === 'HIGH').length;
      const patched = vulns.filter(v => v.patchAvailable).length;
      console.log(`[SecurityFetcher] [${ecosystem}] DONE: ${vulns.length} vulns (${critical} critical, ${high} high, ${patched} patched)`);

      if (i < ecosystems.length - 1) await sleep(options.rateLimitDelay || 100);
    } catch (err) {
      console.log(`[SecurityFetcher] [${ecosystem}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalVulns = results.reduce((sum, e) => sum + e.vulnerabilities.length, 0);
  console.log(`[SecurityFetcher] Complete: ${totalVulns} vulnerabilities across ${results.length} ecosystems`);

  return results;
}
