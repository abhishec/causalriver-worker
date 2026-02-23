"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { usePathname } from "next/navigation";

/**
 * Access tiers mapped to roles:
 *   full     = owner, admin, platform_admin → ALL pages
 *   standard = member → analytics, copilot, predictions, SE-aaS (no brain/connectors/settings)
 *   readonly = viewer → same as standard but read-only actions
 */
type AccessTier = "full" | "standard" | "readonly" | "none";

const ROLE_TO_TIER: Record<string, AccessTier> = {
  owner: "full",
  admin: "full",
  member: "standard",
  viewer: "readonly",
};

/**
 * Routes that require "full" access (admin/owner only).
 * Standard and readonly users see an "Access Restricted" screen.
 */
const FULL_ACCESS_ROUTES = [
  "/brain",
  "/layers",
  "/observability",
  "/connectors",
  "/settings",
  "/training",
  "/simulator",
  "/regions",
  "/agent-studio",
];

/**
 * Routes accessible to ALL authenticated users (standard + readonly + full).
 * These are analytics, copilot, and operational pages.
 */
const STANDARD_ACCESS_ROUTES = [
  "/overview",
  "/copilot",
  "/predictions",
  "/early-warning",
  "/se-aas",
  "/tasks",
  "/workflows",
  "/artifacts",
  "/releases",
  "/capabilities",
  "/code-intelligence",
  "/costs",
  "/inbox",
  "/demo-chat",
  "/finance-jarvis",
];

function getAccessTier(role: string | null, isPlatformAdmin: boolean): AccessTier {
  if (isPlatformAdmin) return "full";
  if (!role) return "none";
  return ROLE_TO_TIER[role] ?? "none";
}

function routeRequiresFullAccess(pathname: string): boolean {
  return FULL_ACCESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

interface RoleGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side role guard that wraps dashboard content.
 * Checks the current user's role against the current route and shows
 * an "Access Restricted" screen if they don't have sufficient permissions.
 *
 * This is a defense-in-depth measure — API routes should ALSO check roles.
 */
export function RoleGuard({ children }: RoleGuardProps) {
  const { currentRole, isPlatformAdmin, isLoading, currentWorkspace } = useWorkspace();
  const pathname = usePathname();

  // Don't block while loading
  if (isLoading || !currentWorkspace) return <>{children}</>;

  const tier = getAccessTier(currentRole, isPlatformAdmin);

  // Full access users can go anywhere
  if (tier === "full") return <>{children}</>;

  // Check if current route requires full access
  if (pathname && routeRequiresFullAccess(pathname)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-md text-center space-y-4">
          {/* Lock icon */}
          <div className="w-16 h-16 mx-auto rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This section requires admin or owner access. Your current role
              (<span className="font-medium text-foreground">{currentRole ?? "none"}</span>) has access
              to analytics, copilot, predictions, and engineering tools.
            </p>
          </div>

          {/* Accessible pages hint */}
          <div className="rounded-xl bg-surface border border-border-subtle p-4 text-left">
            <p className="text-xs font-medium text-muted-foreground mb-2">You can access:</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Overview", icon: "📊" },
                { label: "Copilot", icon: "🤖" },
                { label: "Predictions", icon: "🔮" },
                { label: "Early Warning", icon: "⚠️" },
                { label: "SE-aaS", icon: "🛠️" },
                { label: "Tasks", icon: "📋" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted">
            Contact your workspace admin to request elevated access.
          </p>
        </div>
      </div>
    );
  }

  // Standard/readonly users can access non-restricted routes
  return <>{children}</>;
}

/**
 * Hook to check if the current user has access to a specific feature.
 * Use in components that need to conditionally show/hide elements.
 */
export function useAccessTier(): {
  tier: AccessTier;
  canAccessBrain: boolean;
  canAccessConnectors: boolean;
  canAccessSettings: boolean;
  canWrite: boolean;
  isAdmin: boolean;
} {
  const { currentRole, isPlatformAdmin } = useWorkspace();
  const tier = getAccessTier(currentRole, isPlatformAdmin);

  return {
    tier,
    canAccessBrain: tier === "full",
    canAccessConnectors: tier === "full",
    canAccessSettings: tier === "full",
    canWrite: tier === "full" || tier === "standard",
    isAdmin: tier === "full",
  };
}
