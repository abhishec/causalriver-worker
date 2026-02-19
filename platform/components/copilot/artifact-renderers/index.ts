// Barrel export — all artifact renderers
// SE-aaS: P0 Delivery Intelligence
export { EarlyWarningRenderer } from "./EarlyWarningRenderer";
export { EngagementHealthRenderer } from "./EngagementHealthRenderer";
export { PodMatchRenderer } from "./PodMatchRenderer";
export { ScopeCreepRenderer } from "./ScopeCreepRenderer";

// SE-aaS: P1 Code Intelligence
export { PRReviewRenderer } from "./PRReviewRenderer";
export { TDDRenderer } from "./TDDRenderer";
export { ScaffoldingRenderer } from "./ScaffoldingRenderer";
export { DepUpgradeRenderer } from "./DepUpgradeRenderer";
export { HLDLLDRenderer } from "./HLDLLDRenderer";

// SE-aaS: Test Intelligence
export { TestCasesRenderer } from "./TestCasesRenderer";
export { TestDataRenderer } from "./TestDataRenderer";

// SE-aaS: SWE Codebase Intelligence
export { CodebaseQARenderer } from "./CodebaseQARenderer";
export { DeadCodeRenderer } from "./DeadCodeRenderer";
export { ImpactRenderer } from "./ImpactRenderer";
export { ArchitectureRenderer } from "./ArchitectureRenderer";

// SE-aaS: Observability
export { IncidentRenderer } from "./IncidentRenderer";
export { LogQueryRenderer } from "./LogQueryRenderer";
export { PerfRenderer } from "./PerfRenderer";

// SE-aaS: Data Intelligence
export { SQLRenderer } from "./SQLRenderer";
export { LineageRenderer } from "./LineageRenderer";

// AAS: Benchmark
export { BenchmarkRenderer } from "./BenchmarkRenderer";

// General: Fallback intelligence
export { GenericIntelRenderer } from "./GenericIntelRenderer";
