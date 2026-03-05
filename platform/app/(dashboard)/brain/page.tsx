import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BrainPageClient from "./brain-page-client";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Brain — BrainOS" };

export default async function BrainPage() {
  // ── Auth guard ─────────────────────────────────────────────────────────
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    redirect("/login");
  }

  if (!user) redirect("/login");

  return (
    <ErrorBoundary section="Brain">
      <BrainPageClient />
    </ErrorBoundary>
  );
}
