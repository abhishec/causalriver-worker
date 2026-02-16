"use client";

import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";

export default function AdminSystemPage() {
  const ecsCluster = "nexusbrain-training";
  const taskDefinitions = [
    { name: "nexusbrain-trainer", revision: 2, cpu: "1 vCPU", memory: "4 GB", schedule: "Every 6h" },
    { name: "nexusbrain-consolidation", revision: 2, cpu: "1 vCPU", memory: "4 GB", schedule: "Daily 2 AM UTC" },
    { name: "nexusbrain-dmn", revision: 2, cpu: "0.5 vCPU", memory: "2 GB", schedule: "Every 4h" },
  ];
  const eventBridgeRules = [
    { name: "nexusbrain-trainer-schedule", schedule: "cron(0 0,6,12,18 * * ? *)", status: "ENABLED" },
    { name: "nexusbrain-consolidation-schedule", schedule: "cron(0 2 * * ? *)", status: "ENABLED" },
    { name: "nexusbrain-dmn-schedule", schedule: "cron(0 0,4,8,12,16,20 * * ? *)", status: "ENABLED" },
  ];
  const ssmParams = [
    "/nexusbrain/SUPABASE_URL",
    "/nexusbrain/SUPABASE_SERVICE_ROLE_KEY",
    "/nexusbrain/ANTHROPIC_API_KEY",
    "/nexusbrain/OPENAI_API_KEY",
    "/nexusbrain/FRED_API_KEY",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System Status</h1>
        <p className="text-xs text-muted mt-0.5">AWS infrastructure health and configuration</p>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { name: "ECS Cluster", status: "healthy" },
          { name: "EventBridge", status: "healthy" },
          { name: "ECR Registry", status: "healthy" },
          { name: "Supabase", status: "healthy" },
          { name: "CloudWatch", status: "healthy" },
        ].map((svc) => (
          <Card key={svc.name}>
            <div className="flex items-center gap-2 mb-1">
              <StatusDot type={svc.status === "healthy" ? "active" : "error"} size="sm" pulse={svc.status === "healthy"} />
              <span className="text-xs font-medium">{svc.name}</span>
            </div>
            <span className={`text-[10px] ${svc.status === "healthy" ? "text-success" : "text-danger"}`}>
              {svc.status === "healthy" ? "Operational" : "Down"}
            </span>
          </Card>
        ))}
      </div>

      {/* ECS Cluster */}
      <Card>
        <CardTitle className="mb-1">ECS Cluster</CardTitle>
        <p className="text-xs text-muted mb-4">Cluster: <code className="text-accent">{ecsCluster}</code></p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                <th className="text-left py-2 font-medium">Task Definition</th>
                <th className="text-left py-2 font-medium">Revision</th>
                <th className="text-left py-2 font-medium">CPU</th>
                <th className="text-left py-2 font-medium">Memory</th>
                <th className="text-left py-2 font-medium">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {taskDefinitions.map((td) => (
                <tr key={td.name} className="border-b border-border-subtle/50">
                  <td className="py-2 font-mono text-xs text-accent">{td.name}</td>
                  <td className="py-2 text-xs">v{td.revision}</td>
                  <td className="py-2 text-xs">{td.cpu}</td>
                  <td className="py-2 text-xs">{td.memory}</td>
                  <td className="py-2 text-xs text-muted">{td.schedule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* EventBridge Rules */}
      <Card>
        <CardTitle className="mb-4">EventBridge Schedules</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                <th className="text-left py-2 font-medium">Rule</th>
                <th className="text-left py-2 font-medium">Schedule</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {eventBridgeRules.map((rule) => (
                <tr key={rule.name} className="border-b border-border-subtle/50">
                  <td className="py-2 font-mono text-xs">{rule.name}</td>
                  <td className="py-2 font-mono text-xs text-muted">{rule.schedule}</td>
                  <td className="py-2">
                    <Badge variant={rule.status === "ENABLED" ? "success" : "danger"} size="xs">
                      {rule.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SSM Parameters */}
      <Card>
        <CardTitle className="mb-4">SSM Parameter Store</CardTitle>
        <div className="space-y-1">
          {ssmParams.map((param) => (
            <div key={param} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface/30 transition-colors">
              <span className="font-mono text-xs text-muted-foreground">{param}</span>
              <Badge variant="success" size="xs">Set</Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Docker Image */}
      <Card>
        <CardTitle className="mb-4">Docker Image (ECR)</CardTitle>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Repository</span>
            <code className="text-xs text-accent">848269696611.dkr.ecr.us-east-1.amazonaws.com/nexusbrain-trainer</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Tag</span>
            <code className="text-xs">latest</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Build Project</span>
            <code className="text-xs">nexusbrain-docker-build</code>
          </div>
        </div>
      </Card>
    </div>
  );
}
