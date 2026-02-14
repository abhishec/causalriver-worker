import { Hero } from "@/components/landing/Hero";
import { LiveBrainPulse } from "@/components/landing/LiveBrainPulse";
import { BrainMetrics } from "@/components/landing/BrainMetrics";
import { BrainTimeline } from "@/components/landing/BrainTimeline";
import { BrainArchitecture } from "@/components/landing/BrainArchitecture";
import { Benchmarks } from "@/components/landing/Benchmarks";
import { PlatformIntegration } from "@/components/landing/PlatformIntegration";
import { Problem } from "@/components/landing/Problem";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { Connectors } from "@/components/landing/Connectors";
import { UseCases } from "@/components/landing/UseCases";
import { Comparison } from "@/components/landing/Comparison";
import { CTA } from "@/components/landing/CTA";
import { LandingPageWrapper } from "@/components/landing/LandingPageWrapper";

export default function Home() {
  return (
    <LandingPageWrapper>
      {/* 1. HOOK — Living brain with typewriter thoughts */}
      <Hero />

      {/* 2. SHOW IT'S ALIVE — Neural network visualization + live activity feed */}
      <LiveBrainPulse />

      {/* 3. PROVE IT'S GETTING SMARTER — Animated metrics + improvement charts */}
      <BrainMetrics />

      {/* 4. SHOW WHAT IT LEARNED — Daily discovery timeline */}
      <BrainTimeline />

      {/* 5. THE PROBLEM IT SOLVES — Why you need this */}
      <Problem />

      {/* 6. HOW IT WORKS — 24 Brain regions with category filters */}
      <BrainArchitecture />

      {/* 7. COMPETITIVE BENCHMARKING — CausalRivers, CauseME, LongMemEval results */}
      <Benchmarks />

      {/* 8. PLATFORM — Anyone can connect */}
      <PlatformIntegration />

      {/* 9. DEVELOPER EXPERIENCE — Code examples */}
      <CodeExamples />

      {/* 10. CONNECTORS — What it plugs into */}
      <Connectors />

      {/* 11. USE CASES — Who it's for */}
      <UseCases />

      {/* 12. VS ALTERNATIVES — Why this is different */}
      <Comparison />

      {/* 13. CTA — Start building */}
      <CTA />
    </LandingPageWrapper>
  );
}
