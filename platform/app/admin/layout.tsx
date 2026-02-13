import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "./admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is platform admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user is a platform admin
  const { data: member } = await supabase
    .from("org_members")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .eq("is_platform_admin", true)
    .single();

  // If not a platform admin, redirect to org dashboard
  if (!member) {
    redirect("/overview");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 ml-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-danger/10 text-danger text-[10px] font-semibold uppercase">Admin</span>
            <span className="text-xs text-muted">Platform Administration</span>
          </div>
        </header>
        <main className="p-6 bg-gradient-brain min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}
