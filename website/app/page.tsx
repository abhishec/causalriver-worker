import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { BrainArchitecture } from "@/components/landing/BrainArchitecture";
import { CausalEngine } from "@/components/landing/CausalEngine";
import { IntegrationTiers } from "@/components/landing/IntegrationTiers";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { Connectors } from "@/components/landing/Connectors";
import { UseCases } from "@/components/landing/UseCases";
import { Comparison } from "@/components/landing/Comparison";
import { Stats } from "@/components/landing/Stats";
import { CTA } from "@/components/landing/CTA";

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Problem />
      <BrainArchitecture />
      <CausalEngine />
      <IntegrationTiers />
      <CodeExamples />
      <Connectors />
      <UseCases />
      <Comparison />
      <CTA />
    </>
  );
}
