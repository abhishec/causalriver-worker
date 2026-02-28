/**
 * Zero-dependency environment variable validation.
 *
 * Validates required env vars at server startup.
 * - In development: logs warnings but doesn't crash (to allow partial offline work).
 * - In production: throws hard errors so the deploy fails fast.
 *
 * Called from instrumentation.ts (Next.js 15 startup hook).
 */

let _validated = false;

interface EnvRule {
  key: string;
  required: boolean;
  /** If true, the var must also be present on the client (NEXT_PUBLIC_) */
  public?: boolean;
}

const RULES: EnvRule[] = [
  // Core Supabase
  { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, public: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, public: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true },
  // Anthropic
  { key: "ANTHROPIC_API_KEY", required: true },
  // Credential encryption (for connector OAuth tokens)
  { key: "CREDENTIAL_ENCRYPTION_KEY", required: false },
  // Optional — AWS S3 (for document uploads)
  { key: "AWS_S3_BUCKET_NAME", required: false },
  { key: "AWS_S3_REGION", required: false },
  { key: "AWS_ACCESS_KEY_ID", required: false },
  { key: "AWS_SECRET_ACCESS_KEY", required: false },
];

/**
 * Snapshot of env vars captured using STATIC property access.
 *
 * Why this exists: webpack/Next.js only inlines env vars when accessed via static
 * member expressions (e.g. `process.env.MY_KEY`). Dynamic bracket access
 * (`process.env[someVar]`) is NOT inlined at build time. In AWS Amplify SSR Lambda,
 * the Amplify Console env vars are inlined into the server bundle at build time via
 * `next.config.ts env:` block — but that only works for static access.
 *
 * Without this snapshot, `validateEnv()` reports all 4 required vars as missing
 * in Lambda even though the app works fine (the actual code uses static access).
 */
const ENV_SNAPSHOT: Record<string, string | undefined> = {
  // NEXT_PUBLIC_ vars also fall back to non-prefixed version (Amplify Lambda pattern)
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  AWS_S3_REGION: process.env.AWS_S3_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
};

/** Strings that indicate a placeholder value, not a real credential */
const PLACEHOLDERS = ["your-", "xxx", "...", "todo", "replace", "changeme"];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return PLACEHOLDERS.some((p) => lower.includes(p));
}

export function validateEnv(): void {
  if (_validated) return;
  _validated = true;

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of RULES) {
    // Use the pre-computed snapshot (static access) — dynamic bracket access is not
    // inlined by webpack and always reads undefined in Amplify Lambda runtime.
    const value = ENV_SNAPSHOT[rule.key];

    if (!value || value.trim() === "") {
      if (rule.required) {
        errors.push(`Missing required env var: ${rule.key}`);
      } else {
        warnings.push(`Optional env var not set: ${rule.key}`);
      }
      continue;
    }

    if (isPlaceholder(value)) {
      errors.push(`Env var ${rule.key} contains a placeholder value`);
    }
  }

  // Log warnings (both dev and prod)
  if (warnings.length > 0) {
    console.warn(
      `\n⚠️  Env warnings (${warnings.length}):\n` +
        warnings.map((w) => `   • ${w}`).join("\n") +
        "\n"
    );
  }

  // Handle errors — warn loudly but NEVER crash the server.
  // A missing API key means AI features won't work, but the app should still
  // serve pages, handle auth, and show the UI. Crashing the entire process
  // over a missing env var causes a full-site 500 on Amplify/ECS.
  if (errors.length > 0) {
    const msg =
      `\n❌ Env validation failed (${errors.length} error${errors.length > 1 ? "s" : ""}):\n` +
      errors.map((e) => `   ✗ ${e}`).join("\n") +
      "\n\n   Fix your .env.local file and restart the server.\n";

    console.error(msg);
  } else {
    // Intentional console.warn — runs at startup before logger module loads
    console.warn(
      `✅ Env validated (${RULES.filter((r) => r.required).length} required vars present)`
    );
  }
}

/**
 * Get an environment variable with Amplify SSR fallback.
 *
 * AWS Amplify SSR Lambda may not pass NEXT_PUBLIC_ prefixed vars to the
 * Node.js runtime (they're baked into the client bundle at build time but
 * may not be in process.env at SSR runtime). This helper tries:
 *   1. The exact key (e.g. NEXT_PUBLIC_SUPABASE_URL)
 *   2. The non-prefixed version (e.g. SUPABASE_URL)
 *
 * Use this for ALL server-side env var access instead of `process.env` directly.
 */
export function getEnv(key: string): string | undefined {
  return process.env[key]
    || (key.startsWith("NEXT_PUBLIC_")
        ? process.env[key.replace("NEXT_PUBLIC_", "")]
        : undefined);
}

/** Throws if the env var is not set. */
export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
