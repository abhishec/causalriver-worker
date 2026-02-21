/**
 * @deprecated — This file is a backward-compat shim.
 * Import from "@/lib/workspace-helpers" instead.
 *
 * All exports are re-exported here so existing imports continue to work.
 */

export {
  getCurrentWorkspaceId as getCurrentOrgId,
  getCurrentWorkspaceId,
  getCurrentCustomer,
  CORE_WORKSPACE_ID,
  CORE_ORG_ID,
  type CurrentCustomer,
} from "@/lib/workspace-helpers";
