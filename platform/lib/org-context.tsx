"use client";

/**
 * @deprecated — This file is a backward-compat shim.
 * Import from "@/lib/workspace-context" instead.
 *
 * All types, the Provider, and the hook are re-exported here so
 * existing imports continue to work during the migration.
 */

export {
  type Workspace as Organization,
  type WorkspaceMembership as OrgMembership,
  type CustomerInfo,
  WorkspaceProvider as OrgProvider,
  useWorkspace as useOrg,
} from "@/lib/workspace-context";

// Also export the new names so consumers can gradually migrate
export {
  type Workspace,
  type WorkspaceMembership,
  WorkspaceProvider,
  useWorkspace,
} from "@/lib/workspace-context";
