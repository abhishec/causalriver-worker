import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CopilotOverlay } from "@/components/copilot/CopilotOverlay";
import { OrgProvider } from "@/lib/org-context";
import { DashboardShell } from "./dashboard-shell";

// Force dynamic rendering for all dashboard pages (require Supabase at runtime)
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <DashboardShell>
          <TopBar />
          <main className="p-6 bg-gradient-brain min-h-[calc(100vh-3.5rem)]">
            <div className="animate-fade-in-up">
              {children}
            </div>
          </main>
        </DashboardShell>
        <CopilotOverlay />
      </div>
    </OrgProvider>
  );
}
