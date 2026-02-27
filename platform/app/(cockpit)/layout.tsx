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
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        {children}
      </div>
    </WorkspaceProvider>
  );
}
