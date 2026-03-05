import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProcessesClient from "./processes-client";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Process Intelligence — BrainOS" };

export default async function ProcessesPage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login");
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    redirect("/login");
  }

  if (!user) redirect("/login");

  return (
    <ErrorBoundary section="Process Intelligence">
      <ProcessesClient />
    </ErrorBoundary>
  );
}
