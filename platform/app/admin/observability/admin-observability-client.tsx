"use client";

import { useState } from "react";
import { TabGroup } from "@/components/ui/TabGroup";
import { StatValue } from "@/components/ui/StatValue";
import { TimeRangeSelector, type TimeRange } from "@/components/ui/TimeRangeSelector";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn, formatNumber } from "@/lib/utils";

interface AdminObservabilityClientProps {
  signalIngestion: any[];
  causalCalcs: any[];
  connectorOps: any[];
  agentExecutions: any[];
  layerHealth: any[];
  alerts: any[];
}

export function AdminObservabilityClient({
  signalIngestion,
  causalCalcs,
  connectorOps,
  agentExecutions,
  layerHealth,
  alerts,
}: AdminObservabilityClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const activeAlerts = alerts.filter((a) => a.status === "active" || a.status === "triggered").length;
  const errorOps = connectorOps.filter((o) => o.status === "error").length;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "signals", label: "Signals", count: signalIngestion.length },
    { id: "brain", label: "Brain", count: causalCalcs.length },
    { id: "connectors", label: "Connectors", count: connectorOps.length },
    { id: "agents", label: "Agents", count: agentExecutions.length },
    { id: "alerts", label: "Alerts", count: activeAlerts },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Platform Observability</h1>
          <p className="text-xs text-muted mt-0.5">Cross-workspace system monitoring</p>
        </div>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatValue label="Total Signals" value={formatNumber(signalIngestion.length)} subtitle="7 days" />
        <StatValue label="Causal Calcs" value={formatNumber(causalCalcs.length)} subtitle="7 days" />
        <StatValue label="Connector Ops" value={formatNumber(connectorOps.length)} subtitle="7 days" />
        <StatValue label="Agent Runs" value={formatNumber(agentExecutions.length)} subtitle="7 days" />
        <StatValue
          label="Active Alerts"
          value={String(activeAlerts)}
          change={errorOps > 0 ? `${errorOps} errors` : undefined}
          trend={activeAlerts > 0 ? "up" : undefined}
        />
      </div>

      <TabGroup tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Layer Health Grid */}
          <h3 className="text-sm font-medium">Layer Health</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {layerHealth.slice(0, 15).map((layer, i) => (
              <div
                key={layer.id || i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle"
              >
                <span className="text-xs font-bold text-muted w-6">{layer.layer_id || `L${i + 1}`}</span>
                <div className="flex-1">
                  <div className="text-xs font-medium">{layer.layer_name || `Layer ${i + 1}`}</div>
                  <div className="text-[10px] text-muted">{layer.organizations?.name || "Global"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{layer.health_score || 0}%</span>
                  <StatusDot
                    type={(layer.health_score || 0) >= 90 ? "active" : (layer.health_score || 0) >= 70 ? "warning" : "error"}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Recent Alerts */}
          <h3 className="text-sm font-medium mt-6">Recent Alerts</h3>
          {alerts.length === 0 ? (
            <div className="rounded-xl bg-card border border-border-subtle p-6 text-center text-sm text-muted">
              No alerts in the last 7 days
            </div>
          ) : (
            <DataTable
              columns={[
                {
                  key: "severity",
                  header: "Severity",
                  render: (row) => (
                    <Badge variant={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "info"} size="xs">
                      {row.severity}
                    </Badge>
                  ),
                },
                { key: "title", header: "Title" },
                {
                  key: "org",
                  header: "Workspace",
                  render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => (
                    <div className="flex items-center gap-1.5">
                      <StatusDot
                        type={row.status === "active" ? "alert" : "inactive"}
                        size="sm"
                        pulse={row.status === "active"}
                      />
                      <span className="text-xs">{row.status}</span>
                    </div>
                  ),
                },
                {
                  key: "created_at",
                  header: "Time",
                  render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
                },
              ]}
              data={alerts.slice(0, 20)}
              compact
            />
          )}
        </div>
      )}

      {/* Signals Tab */}
      {activeTab === "signals" && (
        <DataTable
          columns={[
            { key: "connector_type", header: "Connector", sortable: true },
            {
              key: "org",
              header: "Workspace",
              render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
            },
            { key: "signal_type", header: "Type", sortable: true },
            {
              key: "quality_score",
              header: "Quality",
              sortable: true,
              render: (row) => <span className="text-xs font-mono">{((row.quality_score || 0) * 100).toFixed(0)}%</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge variant={row.status === "success" ? "success" : "danger"} size="xs">{row.status || "ok"}</Badge>
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
          searchFields={["connector_type", "signal_type"]}
          compact
        />
      )}

      {/* Brain Tab */}
      {activeTab === "brain" && (
        <DataTable
          columns={[
            { key: "method", header: "Method", sortable: true },
            {
              key: "org",
              header: "Workspace",
              render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
            },
            { key: "source_entity", header: "Source" },
            { key: "target_entity", header: "Target" },
            {
              key: "result",
              header: "Result",
              render: (row) => (
                <Badge variant={row.result === "edge_created" ? "success" : "default"} size="xs">{row.result || "ok"}</Badge>
              ),
            },
            {
              key: "created_at",
              header: "Time",
              sortable: true,
              render: (row) => <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>,
            },
          ]}
          data={causalCalcs}
          searchable
          searchFields={["method", "source_entity", "target_entity"]}
          compact
        />
      )}

      {/* Connectors Tab */}
      {activeTab === "connectors" && (
        <DataTable
          columns={[
            { key: "connector_type", header: "Connector", sortable: true },
            {
              key: "org",
              header: "Workspace",
              render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
            },
            { key: "operation", header: "Operation" },
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
              render: (row) => <span className="text-xs font-mono">{formatNumber(row.records_processed || 0)}</span>,
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
          searchFields={["connector_type", "operation", "status"]}
          compact
        />
      )}

      {/* Agents Tab */}
      {activeTab === "agents" && (
        <DataTable
          columns={[
            { key: "agent_type", header: "Agent", sortable: true },
            {
              key: "org",
              header: "Workspace",
              render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
            },
            { key: "action", header: "Action" },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge variant={row.status === "success" ? "success" : "danger"} size="xs">{row.status}</Badge>
              ),
            },
            {
              key: "tokens_used",
              header: "Tokens",
              render: (row) => <span className="text-xs font-mono">{formatNumber(row.tokens_used || 0)}</span>,
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
          searchFields={["agent_type", "action"]}
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
              render: (row) => (
                <Badge variant={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "info"} size="xs">
                  {row.severity}
                </Badge>
              ),
            },
            { key: "alert_type", header: "Type", sortable: true },
            { key: "title", header: "Title" },
            {
              key: "org",
              header: "Workspace",
              render: (row) => <span className="text-xs">{row.organizations?.name || "—"}</span>,
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <div className="flex items-center gap-1.5">
                  <StatusDot type={row.status === "active" ? "alert" : "inactive"} size="sm" />
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
          searchFields={["alert_type", "title", "severity"]}
          compact
        />
      )}
    </div>
  );
}
