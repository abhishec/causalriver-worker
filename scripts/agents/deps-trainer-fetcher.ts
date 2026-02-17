/**
 * Dependency Intelligence Trainer — npm/PyPI Registry Fetcher
 *
 * Pulls package metadata from npm and PyPI to understand:
 * - Dependency freshness (how stale are packages?)
 * - Deprecated package exposure
 * - Breaking change cascade risk
 * - Ecosystem coupling
 *
 * Both registries are fully public, no auth needed.
 * npm: https://registry.npmjs.org/{package}
 * PyPI: https://pypi.org/pypi/{package}/json
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PackageData {
  name: string;
  ecosystem: 'npm' | 'pypi';
  latestVersion: string;
  publishedAt: string;        // ISO date of latest version
  deprecated: boolean;
  deprecationMessage: string | null;
  weeklyDownloads: number;
  dependencyCount: number;    // direct deps
  license: string | null;
  maintainerCount: number;
  daysSinceLastPublish: number;
  versions: PackageVersionInfo[];
}

export interface PackageVersionInfo {
  version: string;
  publishedAt: string;
  isPrerelease: boolean;
}

export interface RegistryData {
  ecosystem: 'npm' | 'pypi';
  packages: PackageData[];
  fetchedAt: Date;
}

export interface DepsFetchOptions {
  /** Rate limit delay in ms (default: 100) */
  rateLimitDelay?: number;
}

// ============================================================================
// PACKAGE LISTS — Most depended-on packages
// ============================================================================

/** Top npm packages by dependents — the backbone of JavaScript */
export const TOP_NPM_PACKAGES = [
  'lodash', 'chalk', 'commander', 'express', 'debug', 'uuid',
  'axios', 'moment', 'react', 'webpack', 'typescript', 'eslint',
  'next', 'prettier', 'jest', 'mocha', 'glob', 'minimatch',
  'semver', 'yargs', 'inquirer', 'dotenv', 'cors', 'body-parser',
  'jsonwebtoken', 'bcryptjs', 'mongoose', 'pg', 'redis', 'socket.io',
  'ws', 'node-fetch', 'form-data', 'multer', 'passport', 'helmet',
  'zod', 'ajv', 'date-fns', 'rxjs',
];

/** Top PyPI packages by downloads — the backbone of Python */
export const TOP_PYPI_PACKAGES = [
  'boto3', 'requests', 'urllib3', 'setuptools', 'certifi',
  'numpy', 'pandas', 'pip', 'wheel', 'pyyaml',
  'cryptography', 'typing-extensions', 'idna', 'charset-normalizer',
  'packaging', 'six', 'protobuf', 'grpcio', 'jinja2', 'markupsafe',
  'flask', 'django', 'fastapi', 'pydantic', 'click',
  'pillow', 'scipy', 'matplotlib', 'scikit-learn', 'torch',
  'sqlalchemy', 'alembic', 'celery', 'redis', 'httpx',
  'pytest', 'black', 'mypy', 'ruff', 'tqdm',
];

// ============================================================================
// FETCHERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNpmPackage(name: string): Promise<PackageData | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();

    const distTags = data['dist-tags'] || {};
    const latest = distTags.latest || '';
    const time = data.time || {};
    const latestTime = time[latest] || time.modified || new Date().toISOString();
    const latestInfo = data.versions?.[latest] || {};
    const deprecated = !!latestInfo.deprecated;

    // Get recent versions (last 10)
    const allVersions = Object.keys(time)
      .filter(v => v !== 'created' && v !== 'modified')
      .map(v => ({
        version: v,
        publishedAt: time[v],
        isPrerelease: /alpha|beta|rc|canary|next|dev|pre/i.test(v),
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 10);

    const deps = latestInfo.dependencies ? Object.keys(latestInfo.dependencies).length : 0;
    const maintainers = data.maintainers?.length || 1;
    const daysSince = (Date.now() - new Date(latestTime).getTime()) / (1000 * 60 * 60 * 24);

    return {
      name,
      ecosystem: 'npm',
      latestVersion: latest,
      publishedAt: latestTime,
      deprecated,
      deprecationMessage: deprecated ? (latestInfo.deprecated || 'deprecated') : null,
      weeklyDownloads: 0, // Would need npm downloads API
      dependencyCount: deps,
      license: latestInfo.license || data.license || null,
      maintainerCount: maintainers,
      daysSinceLastPublish: Math.round(daysSince),
      versions: allVersions,
    };
  } catch (err) {
    console.log(`[DepsFetcher] [npm/${name}] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchPyPIPackage(name: string): Promise<PackageData | null> {
  try {
    const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();

    const info = data.info || {};
    const releases = data.releases || {};
    const latestVersion = info.version || '';

    // Get release dates from upload_time
    const versionEntries = Object.entries(releases)
      .filter(([, files]: any) => Array.isArray(files) && files.length > 0)
      .map(([version, files]: any) => ({
        version,
        publishedAt: files[0]?.upload_time_iso_8601 || files[0]?.upload_time || new Date().toISOString(),
        isPrerelease: /alpha|beta|rc|dev|pre/i.test(version),
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 10);

    const latestTime = versionEntries[0]?.publishedAt || new Date().toISOString();
    const daysSince = (Date.now() - new Date(latestTime).getTime()) / (1000 * 60 * 60 * 24);
    const deps = info.requires_dist?.length || 0;

    // Check if yanked/deprecated
    const classifiers = info.classifiers || [];
    const deprecated = classifiers.some((c: string) => c.includes('Inactive') || c.includes('Obsolete'));

    return {
      name,
      ecosystem: 'pypi',
      latestVersion,
      publishedAt: latestTime,
      deprecated,
      deprecationMessage: deprecated ? 'Package marked as inactive/obsolete' : null,
      weeklyDownloads: 0,
      dependencyCount: deps,
      license: info.license || null,
      maintainerCount: info.author ? 1 : 0,
      daysSinceLastPublish: Math.round(daysSince),
      versions: versionEntries,
    };
  } catch (err) {
    console.log(`[DepsFetcher] [pypi/${name}] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function fetchAllDependencyData(
  options: DepsFetchOptions = {},
): Promise<RegistryData[]> {
  const delay = options.rateLimitDelay || 100;
  const results: RegistryData[] = [];

  // ── npm ──
  console.log(`[DepsFetcher] Fetching ${TOP_NPM_PACKAGES.length} npm packages...`);
  const npmPackages: PackageData[] = [];
  for (let i = 0; i < TOP_NPM_PACKAGES.length; i++) {
    const pkg = await fetchNpmPackage(TOP_NPM_PACKAGES[i]);
    if (pkg) npmPackages.push(pkg);
    if (i % 10 === 9) console.log(`[DepsFetcher] [npm] ${i + 1}/${TOP_NPM_PACKAGES.length} packages fetched`);
    await sleep(delay);
  }
  results.push({ ecosystem: 'npm', packages: npmPackages, fetchedAt: new Date() });
  console.log(`[DepsFetcher] [npm] DONE: ${npmPackages.length} packages`);

  // ── PyPI ──
  console.log(`[DepsFetcher] Fetching ${TOP_PYPI_PACKAGES.length} PyPI packages...`);
  const pypiPackages: PackageData[] = [];
  for (let i = 0; i < TOP_PYPI_PACKAGES.length; i++) {
    const pkg = await fetchPyPIPackage(TOP_PYPI_PACKAGES[i]);
    if (pkg) pypiPackages.push(pkg);
    if (i % 10 === 9) console.log(`[DepsFetcher] [pypi] ${i + 1}/${TOP_PYPI_PACKAGES.length} packages fetched`);
    await sleep(delay);
  }
  results.push({ ecosystem: 'pypi', packages: pypiPackages, fetchedAt: new Date() });
  console.log(`[DepsFetcher] [pypi] DONE: ${pypiPackages.length} packages`);

  const total = results.reduce((sum, r) => sum + r.packages.length, 0);
  console.log(`[DepsFetcher] Complete: ${total} packages across ${results.length} ecosystems`);

  return results;
}
