import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CopilotOverlay } from "@/components/copilot/CopilotOverlay";
import { OrgProvider } from "@/lib/org-context";

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
        <div className="flex-1 ml-64">
          <TopBar />
          <main className="p-6 bg-gradient-brain min-h-[calc(100vh-3.5rem)]">
            {children}
          </main>
        </div>
        <CopilotOverlay />
      </div>
    </OrgProvider>
  );
}
