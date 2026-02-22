/**
 * Agent Template Versioning API
 * =============================
 *
 * GET /api/agent-templates/[templateId]/versions
 *   Returns version history for a template.
 *
 * POST /api/agent-templates/[templateId]/versions
 *   Create a new version snapshot.
 *   Body: { bump: "major" | "minor" | "patch", changelog: string }
 *
 * PUT /api/agent-templates/[templateId]/versions
 *   Rollback to a specific version.
 *   Body: { versionId: string }
 *
 * PATCH /api/agent-templates/[templateId]/versions
 *   Deprecate a specific version.
 *   Body: { versionId: string }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  createVersion,
  getVersionHistory,
  rollbackToVersion,
  deprecateVersion,
} from "@/lib/agents/version-manager";

interface Props {
  params: Promise<{ templateId: string }>;
}

export const dynamic = "force-dynamic";

/**
 * GET — Fetch version history for a template
 */
export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { templateId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await createServiceClient();
    const versions = await getVersionHistory(service, templateId);

    return NextResponse.json({ versions, count: versions.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[VersionsAPI] GET error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — Create a new version snapshot
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { templateId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { bump, changelog } = body as {
      bump?: "major" | "minor" | "patch";
      changelog?: string;
    };

    if (!bump || !["major", "minor", "patch"].includes(bump)) {
      return NextResponse.json(
        { error: "bump must be 'major', 'minor', or 'patch'" },
        { status: 400 }
      );
    }

    if (!changelog) {
      return NextResponse.json(
        { error: "changelog is required" },
        { status: 400 }
      );
    }

    // Verify user has access to the template's organization
    const service = await createServiceClient();
    const { data: template } = await service
      .from("agent_templates")
      .select("organization_id")
      .eq("id", templateId)
      .single();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", template.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const result = await createVersion(service, templateId, user.id, {
      type: bump,
      changelog,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      version: result.version,
      versionId: result.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[VersionsAPI] POST error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT — Rollback to a specific version
 */
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { templateId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { versionId } = body as { versionId?: string };

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    const service = await createServiceClient();
    const success = await rollbackToVersion(service, templateId, versionId, user.id);

    if (!success) {
      return NextResponse.json({ error: "Rollback failed — version not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Rolled back successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[VersionsAPI] PUT error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH — Deprecate a version
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { templateId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { versionId } = body as { versionId?: string };

    if (!versionId) {
      return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    const service = await createServiceClient();
    const success = await deprecateVersion(service, templateId, versionId);

    if (!success) {
      return NextResponse.json({ error: "Deprecation failed" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Version deprecated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[VersionsAPI] PATCH error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
