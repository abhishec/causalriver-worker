"use client";

import { useState } from "react";
import { TabGroup } from "@/components/ui/TabGroup";
import { StatValue } from "@/components/ui/StatValue";
import { TimeRangeSelector, type TimeRange } from "@/components/ui/TimeRangeSelector";
import { Card, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { cn, formatNumber } from "@/lib/utils";

interface ObservabilityClientProps {
  signalIngestion: any[];
  causalCalcs: any[];
  entityResolution: any[];
  connectorOps: any[];
  agentExecutions: any[];
  layerHealth: any[];
  alerts: any[];
}

export function ObservabilityClient({
  signalIngestion,
  causalCalcs,
  entityResolution,
  connectorOps,
  agentExecutions,
  layerHealth,
  alerts,
}: ObservabilityClientProps) {
  const [activeTab, setActiveTab] = useState("pipeline");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  // Summary stats
  const totalSignals = signalIngestion.length;
  const totalCalcs = causalCalcs.length;
  const totalOps = connectorOps.length;
  const activeAlerts = alerts.filter((a) => a.status === "active" || a.status === "triggered").length;

  // Derived health metrics
  const signalSuccessRate = totalSignals > 0
    ? Math.round((signalIngestion.filter((s) => s.status === "success" || !s.status).length / totalSignals) * 100)
    : 100;
  const connectorSuccessRate = totalOps > 0
    ? Math.round((connectorOps.filter((c) => c.status === "success").length / totalOps) * 100)
    : 100;
  const avgLayerHealth = layerHealth.length > 0
    ? Math.round(layerHealth.reduce((sum, l) => sum + (l.health_score || 0), 0) / layerHealth.length)
    : 100;
  const agentSuccessRate = agentExecutions.length > 0
    ? Math.round((agentExecutions.filter((a) => a.status === "success" || a.status === "completed").length / agentExecutions.length) * 100)
    : 100;

  const tabs = [
    { id: "pipeline", label: "Pipeline Health", count: totalSignals },
    { id: "brain", label: "Brain Processing", count: totalCalcs },
    { id: "connectors", label: "Connector Ops", count: totalOps },
    { id: "agents", label: "Agents", count: agentExecutions.length },
    { id: "alerts", label: "Alerts", count: activeAlerts },
    { id: "layers", label: "Layer Health" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Observability</h1>
          <p className="text-xs text-muted mt-0.5">Monitor brain pipeline, connectors, and system health</p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* System Health Heatmap */}
      <div className="rounded-xl bg-card border border-border-subtle p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">System Health</h3>
            <LiveIndicator variant="pulse" color="green" label="All Systems" />
          </div>
          <span className="text-[10px] text-muted">7-day window</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col items-center gap-2">
            <ProgressRing value={signalSuccessRate} size={52} strokeWidth={4} color={signalSuccessRate >= 90 ? "success" : signalSuccessRate >= 70 ? "warning" : "danger"} />
            <span className="text-[10px] text-muted font-medium">Pipeline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ProgressRing value={connectorSuccessRate} size={52} strokeWidth={4} color={connectorSuccessRate >= 90 ? "success" : connectorSuccessRate >= 70 ? "warning" : "danger"} />
            <span className="text-[10px] text-muted font-medium">Connectors</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ProgressRing value={avgLayerHealth} size={52} strokeWidth={4} color={avgLayerHealth >= 90 ? "success" : avgLayerHealth >= 70 ? "warning" : "danger"} />
            <span className="text-[10px] text-muted font-medium">Layers</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ProgressRing value={agentSuccessRate} size={52} strokeWidth={4} color={agentSuccessRate >= 90 ? "success" : agentSuccessRate >= 70 ? "warning" : "danger"} />
            <span className="text-[10px] text-muted font-medium">Agents</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Signals Processed" value={formatNumber(totalSignals)} subtitle="Last 7 days" />
        <StatValue label="Causal Calculations" value={formatNumber(totalCalcs)} subtitle="Last 7 days" />
        <StatValue label="Connector Syncs" value={formatNumber(totalOps)} subtitle="Last 7 days" />
        <StatValue
          label="Active Alerts"
          value={String(activeAlerts)}
          trend={activeAlerts > 0 ? "up" : undefined}
          change={activeAlerts > 0 ? `${activeAlerts} active` : undefined}
        />
      </div>

      {/* Tabs */}
      <TabGroup tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />

      {/* Pipeline Health Tab */}
      {activeTab === "pipeline" && (
        <div className="space-y-4">
          <DataTable
            columns={[
              { key: "connector_type", header: "Connector", sortable: true },
              { key: "signal_type", header: "Signal Type", sortable: true },
              {
                key: "quality_score",
                header: "Quality",
                sortable: true,
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          (row.quality_score || 0) >= 0.8 ? "bg-success" : (row.quality_score || 0) >= 0.5 ? "bg-warning" : "bg-danger"
                        )}
                        style={{ width: `${(row.quality_score || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono">{((row.quality_score || 0) * 100).toFixed(0)}%</span>
                  </div>
                ),
              },
              {
                key: "processing_time_ms",
                header: "Latency",
                sortable: true,
                render: (row) => <span className="text-xs font-mono">{row.processing_time_ms || 0}ms</span>,
              },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.status === "success" ? "success" : row.status === "error" ? "danger" : "warning"} size="xs">
                    {row.status || "processed"}
                  </Badge>
                ),
              },
              {
                key: "created_at",
                header: "Time",
                sortable: true,
                render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
              },
            ]}
            data={signalIngestion}
            searchable
            searchPlaceholder="Search signals..."
            searchFields={["connector_type", "signal_type", "status"]}
            compact
          />
        </div>
      )}

      {/* Brain Processing Tab */}
      {activeTab === "brain" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardTitle className="mb-2">Entity Resolution</CardTitle>
              <div className="text-2xl font-semibold tabular-nums">{entityResolution.length}</div>
              <div className="text-xs text-muted mt-0.5">resolutions this week</div>
            </Card>
            <Card>
              <CardTitle className="mb-2">Causal Discoveries</CardTitle>
              <div className="text-2xl font-semibold tabular-nums">{causalCalcs.filter((c) => c.result === "edge_created").length}</div>
              <div className="text-xs text-muted mt-0.5">new edges created</div>
            </Card>
            <Card>
              <CardTitle className="mb-2">Methods Used</CardTitle>
              <div className="text-2xl font-semibold tabular-nums">
                {new Set(causalCalcs.map((c) => c.method).filter(Boolean)).size}
              </div>
              <div className="text-xs text-muted mt-0.5">statistical methods</div>
            </Card>
          </div>

          <DataTable
            columns={[
              { key: "method", header: "Method", sortable: true },
              { key: "source_entity", header: "Source", sortable: true },
              { key: "target_entity", header: "Target", sortable: true },
              {
                key: "result",
                header: "Result",
                render: (row) => (
                  <Badge
                    variant={row.result === "edge_created" ? "success" : row.result === "rejected" ? "danger" : "default"}
                    size="xs"
                  >
                    {row.result || "processed"}
                  </Badge>
                ),
              },
              {
                key: "computation_time_ms",
                header: "Time",
                sortable: true,
                render: (row) => <span className="text-xs font-mono">{row.computation_time_ms || 0}ms</span>,
              },
              {
                key: "created_at",
                header: "When",
                sortable: true,
                render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
              },
            ]}
            data={causalCalcs}
            searchable
            searchPlaceholder="Search calculations..."
            searchFields={["method", "source_entity", "target_entity", "result"]}
            compact
          />
        </div>
      )}

      {/* Connector Ops Tab */}
      {activeTab === "connectors" && (
        <DataTable
          columns={[
            { key: "connector_type", header: "Connector", sortable: true },
            { key: "operation", header: "Operation", sortable: true },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge variant={row.status === "success" ? "success" : row.status === "error" ? "danger" : "warning"} size="xs">
                  {row.status}
                </Badge>
              ),
            },
            {
              key: "records_processed",
              header: "Records",
              sortable: true,
              render: (row) => <span className="text-xs font-mono">{formatNumber(row.records_processed || 0)}</span>,
            },
            {
              key: "duration_ms",
              header: "Duration",
              sortable: true,
              render: (row) => <span className="text-xs font-mono">{row.duration_ms || 0}ms</span>,
            },
            {
              key: "error_message",
              header: "Error",
              render: (row) => row.error_message ? (
                <span className="text-xs text-danger truncate max-w-[200px] block">{row.error_message}</span>
              ) : <span className="text-xs text-muted">—</span>,
            },
            {
              key: "created_at",
              header: "Time",
              sortable: true,
              render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
            },
          ]}
          data={connectorOps}
          searchable
          searchPlaceholder="Search connector ops..."
          searchFields={["connector_type", "operation", "status", "error_message"]}
          compact
        />
      )}

      {/* Agents Tab */}
      {activeTab === "agents" && (
        <DataTable
          columns={[
            { key: "agent_type", header: "Agent", sortable: true },
            { key: "action", header: "Action", sortable: true },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge variant={row.status === "success" ? "success" : row.status === "error" ? "danger" : "warning"} size="xs">
                  {row.status}
                </Badge>
              ),
            },
            {
              key: "tokens_used",
              header: "Tokens",
              sortable: true,
              render: (row) => <span className="text-xs font-mono">{formatNumber(row.tokens_used || 0)}</span>,
            },
            {
              key: "duration_ms",
              header: "Duration",
              sortable: true,
              render: (row) => <span className="text-xs font-mono">{row.duration_ms || 0}ms</span>,
            },
            {
              key: "created_at",
              header: "Time",
              sortable: true,
              render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
            },
          ]}
          data={agentExecutions}
          searchable
          searchPlaceholder="Search agent executions..."
          searchFields={["agent_type", "action", "status"]}
          compact
        />
      )}

      {/* Alerts Tab */}
      {activeTab === "alerts" && (
        <DataTable
          columns={[
            {
              key: "severity",
              header: "Severity",
              sortable: true,
              render: (row) => (
                <Badge
                  variant={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "info"}
                  size="xs"
                >
                  {row.severity}
                </Badge>
              ),
            },
            { key: "alert_type", header: "Type", sortable: true },
            { key: "title", header: "Title", sortable: true },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <div className="flex items-center gap-1.5">
                  <StatusDot
                    type={row.status === "active" || row.status === "triggered" ? "alert" : "inactive"}
                    size="sm"
                    pulse={row.status === "active" || row.status === "triggered"}
                  />
                  <span className="text-xs">{row.status}</span>
                </div>
              ),
            },
            {
              key: "created_at",
              header: "Triggered",
              sortable: true,
              render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
            },
          ]}
          data={alerts}
          searchable
          searchPlaceholder="Search alerts..."
          searchFields={["alert_type", "title", "severity", "status"]}
          compact
        />
      )}

      {/* Layer Health Tab */}
      {activeTab === "layers" && (
        <div className="space-y-2">
          {layerHealth.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-sm text-muted">No layer health data available</p>
            </Card>
          ) : (
            layerHealth.map((layer, i) => (
              <div
                key={layer.id || i}
                className="flex items-center gap-4 px-5 py-4 rounded-xl bg-card border border-border-subtle"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-xs font-bold text-muted shrink-0">
                  {layer.layer_id || `L${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{layer.layer_name || `Layer ${i + 1}`}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {layer.requests_processed || 0} requests | {layer.errors || 0} errors | p50: {layer.latency_p50 || 0}ms
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-muted">Health</span>
                      <span className="text-xs font-mono">{layer.health_score || 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          (layer.health_score || 0) >= 90 ? "bg-success" : (layer.health_score || 0) >= 70 ? "bg-warning" : "bg-danger"
                        )}
                        style={{ width: `${Math.min(100, layer.health_score || 0)}%` }}
                      />
                    </div>
                  </div>
                  <StatusDot
                    type={(layer.health_score || 0) >= 90 ? "active" : (layer.health_score || 0) >= 70 ? "warning" : "error"}
                    size="sm"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
