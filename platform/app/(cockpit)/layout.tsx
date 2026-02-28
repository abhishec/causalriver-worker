import type { Metadata } from "next";
import { WorkspaceProvider } from "@/lib/workspace-context";

export const metadata: Metadata = {
  title: "AI Worker — BrainOS",
};

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </WorkspaceProvider>
  );
}
