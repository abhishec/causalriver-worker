/**
 * SonarCloud Trainer — Public Code Quality Metrics Fetcher
 *
 * SonarCloud exposes code quality metrics for public open-source projects.
 * API: https://sonarcloud.io/api/
 * Auth: None required for public projects.
 *
 * Targets: 40+ well-known open-source organizations with public SonarCloud analysis.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SonarProject {
  key: string;               // e.g. "apache_kafka"
  name: string;              // e.g. "Apache Kafka"
  organization: string;      // SonarCloud org
  qualifier: string;         // TRK (project), BRC (sub-project)
}

export interface SonarMeasure {
  metric: string;
  value: string;
}

export interface ProjectQuality {
  projectKey: string;
  projectName: string;
  organization: string;
  measures: {
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    coverage: number;
    duplicatedLinesDensity: number;
    ncloc: number;           // lines of code
    reliabilityRating: number;  // 1=A, 2=B, 3=C, 4=D, 5=E
    securityRating: number;
    sqaleRating: number;     // maintainability
    alertStatus: string;     // OK or ERROR (quality gate)
  };
}

export interface OrgQualityData {
  organization: string;
  projects: ProjectQuality[];
  fetchedAt: Date;
}

export interface SonarFetchOptions {
  /** Rate limit delay in ms (default: 500) */
  rateLimitDelay?: number;
  /** Max projects per org (default: 20) */
  maxProjectsPerOrg?: number;
}

// ============================================================================
// TARGET ORGANIZATIONS
// ============================================================================

/**
 * Well-known open-source organizations on SonarCloud.
 * These have public quality analysis enabled.
 */
export const TARGET_ORGS: string[] = [
  // Apache projects (many have SonarCloud)
  'apache',
  // Spring ecosystem
  'spring-projects',
  // JetBrains
  'jetbrains',
  // Eclipse Foundation
  'eclipse',
  // Elastic
  'elastic',
  // SonarSource (dog-fooding!)
  'sonarsource',
];

/**
 * Direct project keys for repos we know are on SonarCloud.
 * (Sometimes org search doesn't work, so we query these directly)
 */
export const DIRECT_PROJECT_SEARCHES: string[] = [
  'kafka',
  'spring-boot',
  'elastic',
  'sonarqube',
  'hibernate',
  'junit',
  'maven',
  'gradle',
  'tomcat',
  'commons',
  'guava',
  'jackson',
  'netty',
  'grpc',
  'protobuf',
  'mockito',
  'assertj',
  'log4j',
  'slf4j',
  'reactor',
];

// ============================================================================
// API FUNCTIONS
// ============================================================================

const SONAR_API = 'https://sonarcloud.io/api';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSonarAPI<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<T | null> {
  const searchParams = new URLSearchParams(params);
  const url = `${SONAR_API}${endpoint}?${searchParams.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NexusBrain-SonarCloudTrainer/1.0' },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('[SonarFetcher] Rate limited, waiting 30s...');
        await sleep(30000);
        return fetchSonarAPI(endpoint, params);
      }
      return null;
    }

    return await response.json();
  } catch (err) {
    console.log(`[SonarFetcher] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function searchProjects(
  query: string,
  options: SonarFetchOptions,
): Promise<SonarProject[]> {
  const maxProjects = options.maxProjectsPerOrg || 20;

  // Note: /components/search_projects returns projects WITHOUT a `qualifier` field.
  // All results from this endpoint are projects (TRK), so no qualifier filter needed.
  // It also includes a `visibility` field ('public'|'private').
  const data = await fetchSonarAPI<{
    components: Array<{
      key: string;
      name: string;
      organization: string;
      visibility: string;
    }>;
  }>('/components/search_projects', {
    filter: `query = "${query}"`,
    ps: String(Math.min(maxProjects, 100)),
  });

  if (!data || !data.components) return [];

  return data.components
    .filter(c => c.visibility === 'public')  // Only public projects
    .map(c => ({
      key: c.key,
      name: c.name,
      organization: c.organization,
      qualifier: 'TRK',  // search_projects only returns projects
    }));
}

async function fetchProjectMeasures(
  projectKey: string,
): Promise<SonarMeasure[]> {
  const metrics = [
    'bugs', 'vulnerabilities', 'code_smells', 'coverage',
    'duplicated_lines_density', 'ncloc', 'reliability_rating',
    'security_rating', 'sqale_rating', 'alert_status',
  ].join(',');

  const data = await fetchSonarAPI<{
    component: {
      measures: SonarMeasure[];
    };
  }>('/measures/component', {
    component: projectKey,
    metricKeys: metrics,
  });

  return data?.component?.measures || [];
}

function parseMeasures(measures: SonarMeasure[]): ProjectQuality['measures'] {
  const getVal = (metric: string): string => {
    const m = measures.find(m => m.metric === metric);
    return m?.value || '0';
  };

  return {
    bugs: parseInt(getVal('bugs'), 10) || 0,
    vulnerabilities: parseInt(getVal('vulnerabilities'), 10) || 0,
    codeSmells: parseInt(getVal('code_smells'), 10) || 0,
    coverage: parseFloat(getVal('coverage')) || 0,
    duplicatedLinesDensity: parseFloat(getVal('duplicated_lines_density')) || 0,
    ncloc: parseInt(getVal('ncloc'), 10) || 0,
    reliabilityRating: parseFloat(getVal('reliability_rating')) || 1,
    securityRating: parseFloat(getVal('security_rating')) || 1,
    sqaleRating: parseFloat(getVal('sqale_rating')) || 1,
    alertStatus: getVal('alert_status') || 'NONE',
  };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function fetchAllSonarCloudData(
  options: SonarFetchOptions = {},
): Promise<OrgQualityData[]> {
  const delay = options.rateLimitDelay || 500;
  const results: OrgQualityData[] = [];
  const seenKeys = new Set<string>();

  console.log(`[SonarFetcher] Searching SonarCloud for public projects...`);

  // Phase 1: Search by direct project name queries
  const allProjects: SonarProject[] = [];
  for (let i = 0; i < DIRECT_PROJECT_SEARCHES.length; i++) {
    const query = DIRECT_PROJECT_SEARCHES[i];
    console.log(`[${i + 1}/${DIRECT_PROJECT_SEARCHES.length}] Searching: "${query}"`);

    const projects = await searchProjects(query, options);
    for (const p of projects) {
      if (!seenKeys.has(p.key)) {
        seenKeys.add(p.key);
        allProjects.push(p);
      }
    }
    await sleep(delay);
  }

  console.log(`[SonarFetcher] Found ${allProjects.length} unique projects`);

  // Phase 2: Fetch measures for each project
  const projectsByOrg = new Map<string, ProjectQuality[]>();

  for (let i = 0; i < allProjects.length; i++) {
    const project = allProjects[i];
    if (i % 10 === 0) {
      console.log(`[SonarFetcher] Fetching measures: ${i + 1}/${allProjects.length}...`);
    }

    const measures = await fetchProjectMeasures(project.key);
    if (measures.length > 0) {
      const parsed = parseMeasures(measures);
      // Skip projects with 0 lines of code (empty/junk)
      if (parsed.ncloc < 100) {
        await sleep(delay);
        continue;
      }

      const quality: ProjectQuality = {
        projectKey: project.key,
        projectName: project.name,
        organization: project.organization,
        measures: parsed,
      };

      const orgKey = project.organization || 'unknown';
      if (!projectsByOrg.has(orgKey)) projectsByOrg.set(orgKey, []);
      projectsByOrg.get(orgKey)!.push(quality);
    }

    await sleep(delay);
  }

  // Build results grouped by organization
  for (const [org, projects] of projectsByOrg) {
    results.push({
      organization: org,
      projects,
      fetchedAt: new Date(),
    });
    console.log(`[SonarFetcher] [${org}] ${projects.length} projects with quality metrics`);
  }

  const totalProjects = results.reduce((sum, r) => sum + r.projects.length, 0);
  console.log(`[SonarFetcher] Complete: ${totalProjects} projects across ${results.length} organizations`);

  return results;
}
