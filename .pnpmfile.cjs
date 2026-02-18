/**
 * .pnpmfile.cjs — pnpm hook to force-patch nested ajv versions.
 *
 * NB-062: ajv@6.12.6 has a moderate CVE (GHSA-2g4f-4pwh-qvx6).
 * The vuln is in eslint's nested dep chain:
 *   @typescript-eslint/parser → eslint → @eslint/eslintrc → ajv@6.12.6
 * pnpm overrides in package.json can't reach nested hoisted copies.
 * This hook patches the dep at resolution time.
 *
 * Note: this is a dev-only dep chain — ajv@6.12.6 is never in the
 * production runtime bundle. Risk is limited to CI environment.
 */
function readPackage(pkg) {
  // Force any package that depends on ajv@6.12.6 to use 6.12.7 instead
  if (pkg.dependencies && pkg.dependencies.ajv === '6.12.6') {
    pkg.dependencies.ajv = '^6.12.7';
  }
  if (pkg.devDependencies && pkg.devDependencies.ajv === '6.12.6') {
    pkg.devDependencies.ajv = '^6.12.7';
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
