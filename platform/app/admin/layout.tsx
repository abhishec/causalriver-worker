import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("org_members")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .eq("is_platform_admin", true)
    .single();

  if (!member) redirect("/overview");

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      {/* Main — same ml-60 as org dashboard */}
      <div className="flex-1 ml-60">
        {/* Top bar — mirrors org TopBar style */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-background/80 backdrop-blur-xl px-6">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-semibold uppercase tracking-wider">
              Admin
            </span>
            <span className="text-sm text-muted">Platform Console</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />
            <span>All Systems Operational</span>
          </div>
        </header>
        <main className="p-6 bg-gradient-brain min-h-[calc(100vh-3.5rem)]">
          <div className="animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
