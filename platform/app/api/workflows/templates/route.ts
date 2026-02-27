export const dynamic = "force-dynamic";
/**
 * Workflow Templates API — Get pre-built workflow templates
 * =========================================================
 *
 * GET /api/workflows/templates?service=seaas
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkflowTemplates } from "@/lib/workflows/templates";

export async function GET(request: NextRequest) {
  // Auth guard — templates are org-agnostic but endpoint must be authenticated
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = request.nextUrl.searchParams.get("service") || undefined;
    const templates = getWorkflowTemplates(service);
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
