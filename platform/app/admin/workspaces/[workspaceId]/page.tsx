// Re-export workspace detail page at new /admin/workspaces/[workspaceId] URL
import OrgDetailPage from "@/app/admin/orgs/[orgId]/page";

export const dynamic = "force-dynamic";

export default function WorkspaceDetailPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  // Remap params to match the old component's expected shape
  const remappedParams = params.then(p => ({ orgId: p.workspaceId }));
  return OrgDetailPage({ params: remappedParams });
}
