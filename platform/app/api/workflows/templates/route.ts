/**
 * Workflow Templates API — Get pre-built workflow templates
 * =========================================================
 *
 * GET /api/workflows/templates?service=seaas
 */

import { NextRequest, NextResponse } from "next/server";
import { getWorkflowTemplates } from "@/lib/workflows/templates";

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") || undefined;
  const templates = getWorkflowTemplates(service);
  return NextResponse.json({ templates });
}
