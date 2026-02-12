import { Hero } from "@/components/landing/Hero";
import { LiveBrainPulse } from "@/components/landing/LiveBrainPulse";
import { BrainMetrics } from "@/components/landing/BrainMetrics";
import { BrainTimeline } from "@/components/landing/BrainTimeline";
import { BrainArchitecture } from "@/components/landing/BrainArchitecture";
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

      {/* 6. HOW IT WORKS — Brain regions (aspirational, not technical) */}
      <BrainArchitecture />

      {/* 7. PLATFORM — Anyone can connect */}
      <PlatformIntegration />

      {/* 8. DEVELOPER EXPERIENCE — Code examples */}
      <CodeExamples />

      {/* 9. CONNECTORS — What it plugs into */}
      <Connectors />

      {/* 10. USE CASES — Who it's for */}
      <UseCases />

      {/* 11. VS ALTERNATIVES — Why this is different */}
      <Comparison />

      {/* 12. CTA — Start building */}
      <CTA />
    </LandingPageWrapper>
  );
}
