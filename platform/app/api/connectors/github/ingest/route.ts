import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import {
  createCodeParser,
  createKnowledgeDependencyGraph,
  createExpertiseGraph,
  createCollaborationGraph,
} from "@nexus-ai/memory-stack";

/**
 * POST /api/connectors/github/ingest
 *
 * Full code intelligence pipeline:
 * 1. Fetch file tree from GitHub
 * 2. Fetch + parse source code files
 * 3. Build dependency graph from imports
 * 4. Build expertise graph from PR authors
 * 5. Build collaboration graph from reviews
 * 6. Persist all graphs
 *
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();

    // 2. Get token
    const body = await request.json();
    const { token } = body;
    if (!token) {
      return NextResponse.json(
        { error: "GitHub token is required for ingestion" },
        { status: 400 }
      );
    }

    // 3. Load connector config
    const service = await createServiceClient();
    const { data: connector } = await service
      .from("org_connectors")
      .select("id, config")
      .eq("organization_id", orgId)
      .eq("connector_type", "github")
      .maybeSingle();

    if (!connector) {
      return NextResponse.json(
        { error: "GitHub connector not set up" },
        { status: 404 }
      );
    }

    const config = connector.config as {
      owner: string;
      repo: string;
      defaultBranch: string;
    };
    const { owner, repo, defaultBranch } = config;

    // Helper to update progress
    const updateProgress = async (progress: Record<string, any>) => {
      await service
        .from("org_connectors")
        .update({
          config: { ...connector.config, ingestion_progress: progress },
        })
        .eq("id", connector.id);
    };

    // ── Step 1: Fetch file tree ──────────────────────────────────────
    await updateProgress({
      step: "fetching_tree",
      message: "Fetching repository file tree...",
      startedAt: new Date().toISOString(),
    });

    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch || "main"}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "NexusBrain-Platform",
        },
      }
    );

    if (!treeResponse.ok) {
      const errText = await treeResponse.text();
      await updateProgress({
        step: "error",
        message: `Failed to fetch file tree: ${errText}`,
      });
      return NextResponse.json(
        { error: `Failed to fetch file tree: ${errText}` },
        { status: treeResponse.status }
      );
    }

    const treeData = await treeResponse.json();
    const allFiles: Array<{ path: string; size: number }> = (treeData.tree || [])
      .filter((f: any) => f.type === "blob")
      .map((f: any) => ({ path: f.path, size: f.size || 0 }));

    // Filter for code files
    const CODE_EXTENSIONS = new Set([
      ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
      ".py", ".go", ".rs", ".java", ".rb", ".php",
      ".vue", ".svelte", ".astro",
    ]);
    const EXCLUDE_DIRS = new Set([
      "node_modules", ".next", "dist", "build", ".git",
      "vendor", "__pycache__", ".turbo", "coverage",
    ]);

    const codeFiles = allFiles.filter((f) => {
      const ext = f.path.substring(f.path.lastIndexOf("."));
      if (!CODE_EXTENSIONS.has(ext)) return false;
      const parts = f.path.split("/");
      return !parts.some((p) => EXCLUDE_DIRS.has(p));
    });

    // Limit to first 2000 files to stay within API limits
    const filesToProcess = codeFiles.slice(0, 2000);

    await updateProgress({
      step: "fetching_tree",
      message: `Found ${allFiles.length} total files, ${codeFiles.length} code files, processing ${filesToProcess.length}`,
      totalFiles: allFiles.length,
      codeFiles: codeFiles.length,
      processingFiles: filesToProcess.length,
    });

    // ── Step 2: Fetch + Parse files in batches ───────────────────────
    const parser = createCodeParser();
    const fileIndexes: any[] = [];
    const batchSize = 20;
    let filesProcessed = 0;
    let totalSymbols = 0;

    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);

      const fetchPromises = batch.map(async (file) => {
        try {
          const contentResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}?ref=${defaultBranch || "main"}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "NexusBrain-Platform",
              },
            }
          );

          if (!contentResponse.ok) return null;

          const contentData = await contentResponse.json();
          if (!contentData.content) return null;

          // Decode base64 content
          const content = Buffer.from(contentData.content, "base64").toString("utf-8");

          // Parse with code parser
          const fileIndex = parser.parseSource(content, file.path);
          return fileIndex;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      for (const fi of results) {
        if (fi) {
          fileIndexes.push(fi);
          totalSymbols += fi.symbols?.length || 0;
        }
      }

      filesProcessed += batch.length;
      await updateProgress({
        step: "parsing",
        message: `Parsed ${filesProcessed}/${filesToProcess.length} files, ${totalSymbols} symbols found`,
        filesProcessed,
        totalFiles: filesToProcess.length,
        symbolsFound: totalSymbols,
      });

      // Rate limit respect — small delay between batches
      if (i + batchSize < filesToProcess.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ── Step 3: Build Knowledge Dependency Graph ─────────────────────
    await updateProgress({
      step: "building_graphs",
      message: `Building dependency graph from ${fileIndexes.length} files...`,
      filesProcessed: fileIndexes.length,
      symbolsFound: totalSymbols,
    });

    const depGraph = createKnowledgeDependencyGraph();
    for (const fi of fileIndexes) {
      try {
        depGraph.recordFromFileIndex(fi);
      } catch {
        // Skip files that fail dependency recording
      }
    }

    const depStats = depGraph.getStats();

    // ── Step 4: Build Expertise Graph from PR data ───────────────────
    await updateProgress({
      step: "building_expertise",
      message: "Building expertise graph from contributor history...",
      depEdges: depStats.totalEdges,
      depEntities: depStats.uniqueEntities,
    });

    const expertiseGraph = createExpertiseGraph();

    // Load PR signals to build expertise from actual contributors
    const { data: prSignals } = await service
      .from("cross_domain_signals")
      .select("metadata, signal_type")
      .eq("organization_id", orgId)
      .eq("source_domain", "engineering")
      .in("signal_type", ["pr_merged", "pr_opened", "pr_review_submitted"])
      .limit(5000);

    if (prSignals) {
      for (const signal of prSignals) {
        const meta = signal.metadata as Record<string, any>;
        const contributor = meta?.author || meta?.reviewer || meta?.user;
        const files = meta?.file_paths || meta?.directories || [];

        if (contributor && files.length > 0) {
          for (const file of files.slice(0, 10)) {
            // Map file path to topic
            const topic = mapFileToTopic(file);
            expertiseGraph.recordExpertise({
              contributorId: contributor,
              contributorName: contributor,
              topic,
              evidenceType: signal.signal_type === "pr_review_submitted"
                ? "review"
                : "code_change",
            });
          }
        }
      }
    }

    // ── Step 5: Build Collaboration Graph from reviews ───────────────
    await updateProgress({
      step: "building_collaboration",
      message: "Building collaboration graph from review interactions...",
    });

    const collabGraph = createCollaborationGraph();

    if (prSignals) {
      // Group by PR to find co-authors and reviewers
      const prMap = new Map<string, { author: string; reviewers: string[] }>();
      for (const signal of prSignals) {
        const meta = signal.metadata as Record<string, any>;
        const prId = meta?.pr_number || meta?.pr_id;
        if (!prId) continue;

        if (signal.signal_type === "pr_merged" || signal.signal_type === "pr_opened") {
          if (!prMap.has(prId)) prMap.set(prId, { author: "", reviewers: [] });
          const entry = prMap.get(prId)!;
          entry.author = meta?.author || "";
        }
        if (signal.signal_type === "pr_review_submitted") {
          if (!prMap.has(prId)) prMap.set(prId, { author: "", reviewers: [] });
          const entry = prMap.get(prId)!;
          const reviewer = meta?.reviewer || meta?.user || "";
          if (reviewer && !entry.reviewers.includes(reviewer)) {
            entry.reviewers.push(reviewer);
          }
        }
      }

      // Record review interactions
      for (const [, { author, reviewers }] of prMap) {
        if (!author) continue;
        for (const reviewer of reviewers) {
          if (reviewer === author) continue;
          collabGraph.recordInteraction({
            contributorA: author,
            contributorB: reviewer,
            interactionType: "code_review",
          });
        }
      }
    }

    // ── Step 6: Persist graphs ───────────────────────────────────────
    await updateProgress({
      step: "persisting",
      message: "Persisting graphs to database...",
    });

    await depGraph.persist(service, orgId);
    await expertiseGraph.persist(service, orgId);
    await collabGraph.persist(service, orgId);

    // ── Step 7: Store file index metadata as signals ─────────────────
    const codeSignals = fileIndexes.map((fi) => ({
      organization_id: orgId,
      source_domain: "engineering",
      signal_type: "code_file_indexed",
      signal_value: (fi.symbols?.length || 0) / 100, // normalized
      entity_type: "code_file",
      entity_id: fi.filePath,
      signal_metadata: {
        language: fi.language,
        symbolCount: fi.symbols?.length || 0,
        importCount: fi.imports?.length || 0,
        exportCount: fi.exports?.length || 0,
      },
    }));

    // Insert in batches
    for (let i = 0; i < codeSignals.length; i += 100) {
      const batch = codeSignals.slice(i, i + 100);
      await service.from("cross_domain_signals").insert(batch);
    }

    // ── Final: Update progress to complete ───────────────────────────
    const expertiseStats = expertiseGraph.getStats();
    const collabStats = collabGraph.getStats();

    await updateProgress({
      step: "complete",
      message: "Code intelligence pipeline complete!",
      completedAt: new Date().toISOString(),
      stats: {
        filesProcessed: fileIndexes.length,
        symbolsFound: totalSymbols,
        dependencyEdges: depStats.totalEdges,
        dependencyEntities: depStats.uniqueEntities,
        expertiseEntries: expertiseStats.totalEdges,
        expertiseContributors: expertiseStats.uniqueContributors,
        collaborationEdges: collabStats.totalEdges,
        codeSignalsStored: codeSignals.length,
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        filesProcessed: fileIndexes.length,
        totalSymbols,
        dependencyEdges: depStats.totalEdges,
        dependencyEntities: depStats.uniqueEntities,
        expertiseEntries: expertiseStats.totalEdges,
        collaborationEdges: collabStats.totalEdges,
        cycleCount: depStats.cycleCount,
        domainBreakdown: depStats.byDomain,
      },
    });
  } catch (err: any) {
    console.error("Code ingestion error:", err);

    // Try to update progress with error
    try {
      const service = await createServiceClient();
      const orgId = await getCurrentOrgId();
      const { data: connector } = await service
        .from("org_connectors")
        .select("id, config")
        .eq("organization_id", orgId)
        .eq("connector_type", "github")
        .maybeSingle();

      if (connector) {
        await service
          .from("org_connectors")
          .update({
            config: {
              ...connector.config,
              ingestion_progress: {
                step: "error",
                message: err.message || "Ingestion failed",
                errorAt: new Date().toISOString(),
              },
            },
            error_message: err.message,
          })
          .eq("id", connector.id);
      }
    } catch {
      // Ignore progress update failure
    }

    return NextResponse.json(
      { error: err.message || "Ingestion failed" },
      { status: 500 }
    );
  }
}

/**
 * Map a file path to a meaningful topic for expertise tracking.
 */
function mapFileToTopic(filePath: string): string {
  const parts = filePath.toLowerCase().split("/");
  // Use the top-level meaningful directory as topic
  const meaningful = parts.find(
    (p) =>
      p !== "src" &&
      p !== "lib" &&
      p !== "app" &&
      p !== "packages" &&
      p !== "apps" &&
      p.length > 1
  );
  return meaningful || parts[0] || "general";
}
