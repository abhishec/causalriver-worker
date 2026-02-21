/**
 * @deprecated — This file is a backward-compat shim.
 * Import from "@/lib/workspace-resource-guard" instead.
 */

export {
  checkWorkspaceResources as checkOrgResources,
  checkWorkspaceResources,
  incrementResource,
  decrementResource,
  hasPermission,
  type ResourceType,
  type ResourceCheckResult,
} from "@/lib/workspace-resource-guard";
