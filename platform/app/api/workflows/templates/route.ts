export const dynamic = "force-dynamic";
/**
 * Workflow Templates API — Get pre-built workflow templates
 * =========================================================
 *
 * GET /api/workflows/templates?service=seaas
 */

import { NextRequest, NextResponse } from "next/server";
import { getWorkflowTemplates } from "@/lib/workflows/templates";

export async function GET(request: NextRequest) {
  try {
    const service = request.nextUrl.searchParams.get("service") || undefined;
    const templates = getWorkflowTemplates(service);
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load templates" },
      { status: 500 }
    );
  }
}
