import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { DashboardShell } from "./dashboard-shell";
import { CopilotLazy } from "./copilot-lazy";

// Force dynamic rendering for all dashboard pages (require Supabase at runtime)
export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <DashboardShell>
          <TopBar />
          <main className="p-6 bg-gradient-brain min-h-[calc(100vh-3.5rem)]">
            <div className="animate-fade-in-up">
              <RoleGuard>
                {children}
              </RoleGuard>
            </div>
          </main>
        </DashboardShell>
        <CopilotLazy />
      </div>
    </WorkspaceProvider>
  );
}
