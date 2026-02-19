"use client";
import { StatGrid, StatCard, TechChip, ArtifactHeader } from "./shared";

export function ScaffoldingRenderer({ data }: { data: Record<string, any> }) {
  const files = data?.files ?? 24;
  const template = data?.template ?? "FastAPI";
  const features = data?.features ?? ["Health Check", "OpenTelemetry", "Structured Logging", "Alembic", "Docker Multi-stage"];
  const tree = data?.tree ?? `📁 src/
  📁 api/ — routes, middleware
  📁 core/ — config, deps
  📁 models/ — SQLAlchemy
  📁 services/ — business logic
  📁 consumers/ — Kafka
📁 tests/ — pytest
📁 docker/ — Dockerfile, compose
📄 pyproject.toml`;

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader icon="🏗️" title="Scaffold — FRAML Microservice" />
      <div className="flex-1 overflow-y-auto p-4">
        <StatGrid>
          <StatCard label="Files" value={files} color="blue" />
          <StatCard label="Template" value={template} color="purple" />
        </StatGrid>
        <div className="font-mono text-[11px] text-muted-foreground leading-relaxed p-2.5 bg-surface rounded-lg border border-border-subtle mt-2 whitespace-pre">
          {tree}
        </div>
        <div className="mt-2.5 flex flex-wrap">
          {features.map((f: string) => <TechChip key={f} label={f} />)}
        </div>
      </div>
    </div>
  );
}
