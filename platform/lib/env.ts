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
  // Optional — AWS S3 (for document uploads)
  { key: "AWS_S3_BUCKET_NAME", required: false },
  { key: "AWS_S3_REGION", required: false },
  { key: "AWS_ACCESS_KEY_ID", required: false },
  { key: "AWS_SECRET_ACCESS_KEY", required: false },
];

/** Strings that indicate a placeholder value, not a real credential */
const PLACEHOLDERS = ["your-", "xxx", "...", "todo", "replace", "changeme"];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return PLACEHOLDERS.some((p) => lower.includes(p));
}

export function validateEnv(): void {
  if (_validated) return;
  _validated = true;

  const isProd = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of RULES) {
    const value = process.env[rule.key];

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

  // Handle errors
  if (errors.length > 0) {
    const msg =
      `\n❌ Env validation failed (${errors.length} error${errors.length > 1 ? "s" : ""}):\n` +
      errors.map((e) => `   ✗ ${e}`).join("\n") +
      "\n\n   Fix your .env.local file and restart the server.\n";

    if (isProd) {
      throw new Error(msg);
    } else {
      // In dev, warn loudly but don't crash
      console.error(msg);
    }
  } else {
    console.log(
      `✅ Env validated (${RULES.filter((r) => r.required).length} required vars present)`
    );
  }
}
