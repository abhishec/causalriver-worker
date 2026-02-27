/**
 * BrainOS MCP Endpoint
 * ====================
 * POST /api/mcp
 *
 * Implements JSON-RPC 2.0 over HTTP for the Model Context Protocol (MCP).
 * Any MCP-compatible agent (Claude Desktop, Cursor, etc.) can discover
 * and call BrainOS tools via this endpoint.
 *
 * Auth: Bearer token in Authorization header.
 *   Accepts: SE_AAS_WORKER_SECRET (machine-to-machine) or valid Supabase JWT.
 *
 * Supported methods:
 *   tools/list  — returns all available BrainOS tool definitions
 *   tools/call  — invokes a specific tool with arguments
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { TOOL_DEFINITIONS, callTool } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

// ── Auth: Bearer token validation ─────────────────────────────────────────

async function authenticate(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return false;

  // 1. Accept SE_AAS_WORKER_SECRET (machine-to-machine auth)
  const workerSecret = process.env.SE_AAS_WORKER_SECRET;
  if (workerSecret && token === workerSecret) return true;

  // 2. Accept valid Supabase JWT (user auth)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return true;
  } catch {
    // Supabase client may throw on Lambda cold start — fall through to reject
  }

  return false;
}

// ── JSON-RPC 2.0 helpers ───────────────────────────────────────────────────

function rpcSuccess(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { status: 200 });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth gate
  const authed = await authenticate(request);
  if (!authed) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
      { status: 401 }
    );
  }

  // Parse JSON-RPC body
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id = null, method, params = {} } = body;

  if (!method) {
    return rpcError(id, -32600, "Invalid Request: method is required");
  }

  logger.warn("[mcp] incoming", { method, id });

  // ── tools/list ────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    return rpcSuccess(id, { tools: TOOL_DEFINITIONS });
  }

  // ── tools/call ────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const toolName = params.name as string | undefined;
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

    if (!toolName) {
      return rpcError(id, -32602, "Invalid params: name is required for tools/call");
    }

    // Validate that tool exists
    const toolExists = TOOL_DEFINITIONS.some((t) => t.name === toolName);
    if (!toolExists) {
      return rpcError(id, -32602, `Unknown tool: ${toolName}`);
    }

    try {
      const result = await callTool(toolName, toolArgs);
      return rpcSuccess(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("[mcp] tool execution failed", { tool: toolName, error: message });
      return rpcError(id, -32603, `Tool execution error: ${message}`);
    }
  }

  // ── initialize (MCP handshake — return server capabilities) ──────────────
  if (method === "initialize") {
    return rpcSuccess(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "brainos-mcp",
        version: "1.0.0",
      },
    });
  }

  // ── Unknown method ────────────────────────────────────────────────────────
  return rpcError(id, -32601, `Method not found: ${method}`);
}

// MCP clients may also send GET to check liveness
export async function GET() {
  return NextResponse.json({
    name: "BrainOS MCP Server",
    version: "1.0.0",
    protocol: "MCP / JSON-RPC 2.0",
    tools: TOOL_DEFINITIONS.map((t) => t.name),
  });
}
