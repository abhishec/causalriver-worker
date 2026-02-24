import { WorkspaceProvider } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </WorkspaceProvider>
  );
}
