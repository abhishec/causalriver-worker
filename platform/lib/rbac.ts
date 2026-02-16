import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export type Role = "owner" | "admin" | "analyst" | "viewer";

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  analyst: 2,
  viewer: 1,
};

/**
 * Permission definitions per role.
 * Each role inherits all permissions of lower roles.
 */
export const PERMISSIONS: Record<Role, string[]> = {
  viewer: [
    "dashboard:view",
    "brain:view",
    "predictions:view",
    "agents:view",
    "copilot:use",
    "layers:view",
    "regions:view",
  ],
  analyst: [
    "simulator:use",
    "training:view",
    "connectors:view",
    "costs:view",
    "code-intelligence:view",
    "integrate:view",
  ],
  admin: [
    "settings:view",
    "settings:edit",
    "api-keys:manage",
    "members:manage",
    "connectors:manage",
    "training:manage",
    "notifications:manage",
  ],
  owner: [
    "org:delete",
    "billing:manage",
    "roles:manage",
  ],
};

/**
 * Get all permissions for a given role (including inherited).
 */
export function getAllPermissions(role: Role): string[] {
  const level = ROLE_HIERARCHY[role];
  const allPerms: string[] = [];

  for (const [r, perms] of Object.entries(PERMISSIONS)) {
    if (ROLE_HIERARCHY[r as Role] <= level) {
      allPerms.push(...perms);
    }
  }

  return allPerms;
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, action: string): boolean {
  return getAllPermissions(role).includes(action);
}

/**
 * Check if a role meets or exceeds a minimum role level.
 */
export function meetsMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

/**
 * Get the current user's role in the current organization.
 * Defaults to "viewer" if not found.
 */
export async function getCurrentRole(): Promise<Role> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "viewer";

    const orgId = await getCurrentOrgId();

    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single();

    return (member?.role as Role) || "viewer";
  } catch {
    return "viewer";
  }
}

/**
 * Server-side guard: throws if user doesn't meet minimum role.
 * Use in server components and API routes.
 */
export async function requireRole(minRole: Role): Promise<Role> {
  const currentRole = await getCurrentRole();

  if (!meetsMinRole(currentRole, minRole)) {
    throw new Error(`Insufficient permissions. Required: ${minRole}, Current: ${currentRole}`);
  }

  return currentRole;
}

/**
 * Get the display label for a role.
 */
export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    owner: "Owner",
    admin: "Admin",
    analyst: "Analyst",
    viewer: "Viewer",
  };
  return labels[role] || "Viewer";
}

/**
 * Get the color classes for a role badge.
 */
export function getRoleBadgeColor(role: Role): string {
  const colors: Record<Role, string> = {
    owner: "bg-accent/10 text-accent",
    admin: "bg-info/10 text-info",
    analyst: "bg-success/10 text-success",
    viewer: "bg-muted/10 text-muted",
  };
  return colors[role] || "bg-muted/10 text-muted";
}
