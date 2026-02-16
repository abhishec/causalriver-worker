"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CausalEdge {
  id: string;
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  lag_periods: number;
  method: string;
  domain: string;
}

interface GraphNode {
  id: string;
  label: string;
  domain: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connectionCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
  domain: string;
}

interface CausalGraphProps {
  edges: CausalEdge[];
  domainFilter: string;
  onNodeClick?: (nodeId: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DOMAIN_COLORS: Record<string, string> = {
  financial: "#10b981",
  customer: "#8b5cf6",
  product: "#06b6d4",
  marketing: "#f59e0b",
  sales: "#f43f5e",
  support: "#ec4899",
  engineering: "#3b82f6",
  hr: "#14b8a6",
  operations: "#a78bfa",
  legal: "#64748b",
  executive: "#f97316",
  default: "#6b7280",
};

const WIDTH = 800;
const HEIGHT = 500;
const NODE_RADIUS_MIN = 6;
const NODE_RADIUS_MAX = 18;
const REPULSION = 5000;
const ATTRACTION = 0.005;
const DAMPING = 0.85;
const CENTER_GRAVITY = 0.01;

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function CausalGraph({ edges, domainFilter, onNodeClick }: CausalGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animFrameRef = useRef<number>(0);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Build graph data from edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const filtered = domainFilter === "all"
      ? edges
      : edges.filter((e) => e.domain === domainFilter);

    const nodeMap = new Map<string, { domain: string; count: number }>();
    const edgeList: GraphEdge[] = [];

    for (const edge of filtered) {
      const src = edge.source_entity;
      const tgt = edge.target_entity;

      if (!nodeMap.has(src)) nodeMap.set(src, { domain: edge.domain, count: 0 });
      if (!nodeMap.has(tgt)) nodeMap.set(tgt, { domain: edge.domain, count: 0 });

      nodeMap.get(src)!.count++;
      nodeMap.get(tgt)!.count++;

      edgeList.push({
        source: src,
        target: tgt,
        strength: edge.strength,
        domain: edge.domain,
      });
    }

    // Position nodes in a circle initially
    const nodeArr: GraphNode[] = [];
    const entries = Array.from(nodeMap.entries());
    const angleStep = (2 * Math.PI) / Math.max(entries.length, 1);

    entries.forEach(([id, data], i) => {
      const angle = angleStep * i;
      const r = Math.min(WIDTH, HEIGHT) * 0.3;
      nodeArr.push({
        id,
        label: id,
        domain: data.domain,
        x: WIDTH / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: HEIGHT / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        connectionCount: data.count,
      });
    });

    return { initialNodes: nodeArr, initialEdges: edgeList };
  }, [edges, domainFilter]);

  // Initialize simulation
  useEffect(() => {
    setNodes(initialNodes);
    setGraphEdges(initialEdges);
    setSelectedNode(null);
  }, [initialNodes, initialEdges]);

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    let frame = 0;
    const maxFrames = 200; // Stop after convergence

    function simulate() {
      if (frame >= maxFrames) return;
      frame++;

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));

        // Repulsion between all nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction along edges
        for (const edge of graphEdges) {
          const src = next.find((n) => n.id === edge.source);
          const tgt = next.find((n) => n.id === edge.target);
          if (!src || !tgt) continue;

          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * ATTRACTION * (edge.strength || 0.5);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          src.vx += fx;
          src.vy += fy;
          tgt.vx -= fx;
          tgt.vy -= fy;
        }

        // Center gravity
        for (const node of next) {
          node.vx += (WIDTH / 2 - node.x) * CENTER_GRAVITY;
          node.vy += (HEIGHT / 2 - node.y) * CENTER_GRAVITY;
        }

        // Apply velocity + damping + bounds
        for (const node of next) {
          node.vx *= DAMPING;
          node.vy *= DAMPING;
          node.x += node.vx;
          node.y += node.vy;
          // Keep within bounds
          node.x = Math.max(30, Math.min(WIDTH - 30, node.x));
          node.y = Math.max(30, Math.min(HEIGHT - 30, node.y));
        }

        return next;
      });

      animFrameRef.current = requestAnimationFrame(simulate);
    }

    animFrameRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [nodes.length, graphEdges]);

  function getNodeRadius(node: GraphNode): number {
    const maxCount = Math.max(...nodes.map((n) => n.connectionCount), 1);
    const t = node.connectionCount / maxCount;
    return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
  }

  function getNodeColor(domain: string): string {
    return DOMAIN_COLORS[domain] || DOMAIN_COLORS.default;
  }

  function isEdgeHighlighted(edge: GraphEdge): boolean {
    if (!selectedNode && !hoveredNode) return true;
    const focus = selectedNode || hoveredNode;
    return edge.source === focus || edge.target === focus;
  }

  function isNodeHighlighted(node: GraphNode): boolean {
    if (!selectedNode && !hoveredNode) return true;
    const focus = selectedNode || hoveredNode;
    if (node.id === focus) return true;
    return graphEdges.some(
      (e) =>
        (e.source === focus && e.target === node.id) ||
        (e.target === focus && e.source === node.id)
    );
  }

  // Mouse handlers for pan/zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(3, prev - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-muted text-sm">
        No edges to visualize. Try adjusting your filters.
      </div>
    );
  }

  // Collect unique domains for legend
  const uniqueDomains = [...new Set(nodes.map((n) => n.domain))].sort();

  return (
    <div className="space-y-3">
      {/* Graph */}
      <div className="relative rounded-lg bg-surface/30 border border-border-subtle overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${WIDTH / zoom} ${HEIGHT / zoom}`}
          className="w-full"
          style={{ height: "400px", cursor: isPanning.current ? "grabbing" : "grab" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#6b7280" opacity="0.6" />
            </marker>
          </defs>

          {/* Edges */}
          {graphEdges.map((edge, i) => {
            const src = nodes.find((n) => n.id === edge.source);
            const tgt = nodes.find((n) => n.id === edge.target);
            if (!src || !tgt) return null;

            const highlighted = isEdgeHighlighted(edge);
            const color = getNodeColor(edge.domain);

            return (
              <line
                key={`edge-${i}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={highlighted ? color : "#3f3f46"}
                strokeWidth={Math.max(0.5, edge.strength * 3)}
                opacity={highlighted ? 0.6 : 0.1}
                markerEnd="url(#arrowhead)"
                className="transition-opacity duration-200"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const r = getNodeRadius(node);
            const color = getNodeColor(node.domain);
            const highlighted = isNodeHighlighted(node);
            const isSelected = selectedNode === node.id;
            const isHovered = hoveredNode === node.id;

            return (
              <g
                key={node.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedNode(selectedNode === node.id ? null : node.id);
                  onNodeClick?.(node.id);
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Glow ring for selected/hovered */}
                {(isSelected || isHovered) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                )}

                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={highlighted ? color : "#27272a"}
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={highlighted ? 1 : 0.3}
                  className="transition-opacity duration-200"
                />

                {/* Label */}
                <text
                  x={node.x}
                  y={node.y + r + 12}
                  textAnchor="middle"
                  fill={highlighted ? "#e4e4e7" : "#52525b"}
                  fontSize="9"
                  fontWeight={isSelected ? "600" : "400"}
                  className="pointer-events-none select-none transition-opacity duration-200"
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + "..." : node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            className="w-7 h-7 rounded bg-surface border border-border-subtle text-muted hover:text-foreground flex items-center justify-center text-xs"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="w-7 h-7 rounded bg-surface border border-border-subtle text-muted hover:text-foreground flex items-center justify-center text-xs"
          >
            -
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setSelectedNode(null); }}
            className="px-2 h-7 rounded bg-surface border border-border-subtle text-muted hover:text-foreground flex items-center justify-center text-[10px]"
          >
            Reset
          </button>
        </div>

        {/* Selected node info */}
        {selectedNode && (
          <div className="absolute top-3 left-3 px-3 py-2 rounded-lg bg-card border border-border-subtle text-xs max-w-xs">
            <div className="font-medium">{selectedNode}</div>
            <div className="text-muted mt-0.5">
              {graphEdges.filter((e) => e.source === selectedNode || e.target === selectedNode).length} connections
            </div>
          </div>
        )}
      </div>

      {/* Domain legend */}
      <div className="flex flex-wrap gap-3">
        {uniqueDomains.map((domain) => (
          <div key={domain} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getNodeColor(domain) }}
            />
            <span className="text-[10px] text-muted capitalize">{domain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
