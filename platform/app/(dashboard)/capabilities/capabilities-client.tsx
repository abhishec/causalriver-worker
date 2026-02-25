"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/* ── Service Pack Definitions ────────────────────────────────────────────── */

interface ServicePack {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: "active" | "available" | "coming-soon";
  capabilityCount: number;
  icon: string; // SVG path
  color: { gradient: string; border: string; text: string; badge: string };
  dashboardHref: string | null;
  filterKey: string; // maps to CAPABILITIES category filter
}

const SERVICE_PACKS: ServicePack[] = [
  {
    id: "swe-aas",
    name: "Software Engineering",
    tagline: "AI-powered dev capabilities",
    description: "17 capabilities (2 P0 + 15 P1) spanning Brain Intelligence, Copilot NL, TDD, impact analysis, SQL optimization, incident diagnosis, and more.",
    status: "active",
    capabilityCount: 17,
    icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
    color: {
      gradient: "from-blue-500/8 to-indigo-500/8",
      border: "border-blue-500/20 hover:border-blue-500/40",
      text: "text-blue-400",
      badge: "bg-blue-500/15 text-blue-400",
    },
    dashboardHref: null,
    filterKey: "swe",
  },
  {
    id: "accounting-aas",
    name: "Accounting",
    tagline: "AI bookkeeping + GL intelligence",
    description: "2 requirements: Phase 1 (Core Bookkeeping — pure GL processing) + Phase 1.5 (Brain OS Causal Layer — cross-system intelligence). Powered by real Xero GL data from PH Accounting org.",
    status: "active",
    capabilityCount: 2,
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    color: {
      gradient: "from-emerald-500/8 to-teal-500/8",
      border: "border-emerald-500/20 hover:border-emerald-500/40",
      text: "text-emerald-400",
      badge: "bg-emerald-500/15 text-emerald-400",
    },
    dashboardHref: "/aaas",
    filterKey: "accounting",
  },
  {
    id: "hr-aas",
    name: "HR & People",
    tagline: "Workforce intelligence",
    description: "Attrition prediction, compensation benchmarking, culture analytics, onboarding optimization, and workforce planning.",
    status: "coming-soon",
    capabilityCount: 0,
    icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
    color: {
      gradient: "from-purple-500/8 to-pink-500/8",
      border: "border-purple-500/20 hover:border-purple-500/30",
      text: "text-purple-400",
      badge: "bg-purple-500/15 text-purple-400",
    },
    dashboardHref: null,
    filterKey: "hr",
  },
  {
    id: "sales-aas",
    name: "Sales & Revenue",
    tagline: "Pipeline intelligence",
    description: "Deal scoring, churn prediction, pricing optimization, revenue forecasting, and customer health monitoring.",
    status: "coming-soon",
    capabilityCount: 0,
    icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
    color: {
      gradient: "from-amber-500/8 to-orange-500/8",
      border: "border-amber-500/20 hover:border-amber-500/30",
      text: "text-amber-400",
      badge: "bg-amber-500/15 text-amber-400",
    },
    dashboardHref: null,
    filterKey: "sales",
  },
];

/* ── Capability Definitions ──────────────────────────────────────────────── */

interface Capability {
  id: string;
  name: string;
  servicePack: string; // links to ServicePack.id
  category: string;
  categoryLabel: string;
  description: string;
  status: "live" | "copilot" | "coming-soon";
  domainType?: string;
  examplePrompts: string[];
  dataRequired: string[];
  brainIntegration: string;
  icon: string;
}

const CAPABILITIES: Capability[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // SWE-aaS: 17 Capabilities (2 P0 + 15 P1)
  // ══════════════════════════════════════════════════════════════════════════

  // ── P0: Early Warning (2 Use Cases) ──────────────────────────────────
  {
    id: "velocity-collapse", name: "Deploy Velocity Collapse Warning", servicePack: "swe-aas",
    category: "early-warning", categoryLabel: "P0 — Early Warning",
    description: "Predicts deploy velocity drops before they happen. Uses GitHub PR flow metrics, review latency, WIP counts, and sprint history to forecast next-sprint velocity via gradient boosted trees. Triggers alert when predicted velocity < 80% of historical mean with >70% confidence.",
    status: "live", domainType: "velocity-collapse",
    examplePrompts: ["Why is velocity collapsing?", "Predict next sprint's deploy velocity", "Show me the velocity collapse risk forecast"],
    dataRequired: ["GitHub connector", "Jira/Linear connector"],
    brainIntegration: "Brain computes rolling 14-day PR flow metrics, review latency, WIP trends, and lagged sprint features. Backtest engine validates on 6+ months history.",
    icon: "M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181",
  },
  {
    id: "bottleneck-risk", name: "Bottleneck Concentration Risk", servicePack: "swe-aas",
    category: "early-warning", categoryLabel: "P0 — Early Warning",
    description: "Detects reviewer concentration risk using graph centrality analysis. Builds author-reviewer bipartite graphs from PR data. Computes Gini coefficient, HHI, betweenness centrality, and top-reviewer share. Risk score 0–100 with alert thresholds at 40% single-reviewer share or HHI > 0.25.",
    status: "live", domainType: "bottleneck-risk",
    examplePrompts: ["Show me the bottleneck concentration risk", "Who is the biggest review bottleneck?", "What's the reviewer Gini coefficient?"],
    dataRequired: ["GitHub connector", "PR review data"],
    brainIntegration: "Brain constructs engineer-PR bipartite graphs, computes centrality metrics (in-degree, betweenness, eigenvector), and correlates with velocity dips.",
    icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  },

  // ── P1: Development Speed ─────────────────────────────────────────────────
  {
    id: "tdd-code-gen", name: "TDD Code Generator", servicePack: "swe-aas",
    category: "speed", categoryLabel: "Development Speed",
    description: "Accelerate feature development with Test-Driven Development. Generates tests first, then writes code to satisfy them with iterative refinement.",
    status: "live", domainType: "tdd",
    examplePrompts: ["Write TDD code for a user authentication service", "Generate tests and implementation for a payment processing module", "Implement a caching layer with TDD approach"],
    dataRequired: ["Feature requirements or user story", "Target language/framework"],
    brainIntegration: "Brain provides codebase patterns, known failure modes, and test coverage gaps from historical data.",
    icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5",
  },
  {
    id: "boilerplate-scaffold", name: "Boilerplate & Scaffolding", servicePack: "swe-aas",
    category: "speed", categoryLabel: "Development Speed",
    description: "Eliminate repetitive code setup. Generates project scaffolding, CRUD operations, API endpoints, and boilerplate following company standards.",
    status: "copilot",
    examplePrompts: ["Generate a new API endpoint for user management with CRUD", "Scaffold a new microservice with logging, error handling, and metrics", "Create a React component with tests and Storybook"],
    dataRequired: ["Codebase context", "Company coding standards"],
    brainIntegration: "Brain analyzes existing codebase patterns to ensure generated code matches your team's conventions.",
    icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z",
  },
  {
    id: "pr-review", name: "PR Review Assistant", servicePack: "swe-aas",
    category: "speed", categoryLabel: "Development Speed",
    description: "Speed up code review cycles. Auto-reviews PRs for bugs, security issues, style violations and suggests improvements.",
    status: "copilot",
    examplePrompts: ["Review this PR for security issues and performance", "Check test coverage on changed code in PR #245", "Suggest improvements for the authentication changes"],
    dataRequired: ["GitHub connection", "PR diff data"],
    brainIntegration: "Brain correlates review patterns with downstream incidents to flag high-risk changes.",
    icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "dependency-upgrade", name: "Dependency Upgrade", servicePack: "swe-aas",
    category: "speed", categoryLabel: "Development Speed",
    description: "Keep dependencies current without breaking changes. Identifies outdated packages, analyzes breaking changes, generates migration code.",
    status: "live", domainType: "dependency-upgrade",
    examplePrompts: ["Check for outdated dependencies in my project", "Analyze breaking changes if I upgrade React to v19", "Generate migration code for the Express 5 upgrade"],
    dataRequired: ["package.json / requirements.txt", "Current codebase"],
    brainIntegration: "Brain tracks which upgrades historically caused incidents and warns about risky version jumps.",
    icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  },
  {
    id: "design-doc", name: "HLD/LLD Generator", servicePack: "swe-aas",
    category: "speed", categoryLabel: "Development Speed",
    description: "Generate and maintain design documents. Forward mode: requirements to design. Reverse mode: code to design extraction.",
    status: "live", domainType: "design-doc",
    examplePrompts: ["Generate an HLD for our new payment processing system", "Reverse-engineer a design doc from this codebase", "Create an LLD with sequence diagrams for the auth flow"],
    dataRequired: ["Requirements/PRD or existing codebase", "System context"],
    brainIntegration: "Brain detects drift between design docs and implementation, flags architectural deviations.",
    icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
  },

  // ── Development Accuracy ──────────────────────────────────────────────
  {
    id: "data-lineage", name: "Data Lineage Mapper", servicePack: "swe-aas",
    category: "accuracy", categoryLabel: "Development Accuracy",
    description: "Understand data flow and column population sources. Shows complete lineage from source through transformations to destination.",
    status: "live", domainType: "lineage",
    examplePrompts: ["Show the data lineage for the users.subscription_status column", "Map all transformations from raw events to analytics tables", "Identify where customer_id gets populated across services"],
    dataRequired: ["DB schemas", "ETL code", "Service code"],
    brainIntegration: "Brain discovers cross-domain data dependencies and flags inconsistencies in data population.",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
  {
    id: "impact-analysis", name: "Impact Analysis", servicePack: "swe-aas",
    category: "accuracy", categoryLabel: "Development Accuracy",
    description: "Predict ripple effects of code changes. Maps dependent code paths, downstream systems, and suggests additional test coverage.",
    status: "live", domainType: "impact",
    examplePrompts: ["What's the blast radius if I change the User model schema?", "Analyze impact of removing the legacy auth middleware", "Which services break if I modify the payment webhook handler?"],
    dataRequired: ["Codebase access", "Service dependency graph"],
    brainIntegration: "Brain uses causal graph to predict downstream business impact (not just code dependencies).",
    icon: "M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "sql-analyzer", name: "SQL Analyzer", servicePack: "swe-aas",
    category: "accuracy", categoryLabel: "Development Accuracy",
    description: "Ensure correct and performant database queries. Analyzes correctness, identifies N+1 problems, suggests optimizations.",
    status: "live", domainType: "sql-analyze",
    examplePrompts: ["Analyze this SQL query for performance issues", "Check for missing indexes in these queries", "Identify SQL injection vulnerabilities in this code"],
    dataRequired: ["SQL queries", "Database schema"],
    brainIntegration: "Brain correlates slow queries with production incidents to prioritize optimizations.",
    icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  },

  // ── Production Support ────────────────────────────────────────────────
  {
    id: "log-query", name: "Log Query Agent", servicePack: "swe-aas",
    category: "production", categoryLabel: "Production Support",
    description: "Accelerate root cause analysis. Accepts natural language, translates to log query syntax, correlates across services.",
    status: "live", domainType: "log-query",
    examplePrompts: ["Show me errors for user X in the last hour", "Find all 500 errors in the payment service today", "Correlate auth failures with the deploy at 2pm"],
    dataRequired: ["Log infrastructure access", "Service metadata"],
    brainIntegration: "Brain surfaces similar past incidents and learned root cause patterns from AI Worker history.",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  },
  {
    id: "incident-diagnosis", name: "Incident Diagnosis", servicePack: "swe-aas",
    category: "production", categoryLabel: "Production Support",
    description: "Reduce MTTR for production issues. Aggregates signals from logs, metrics, traces. Builds incident timeline.",
    status: "live", domainType: "incident",
    examplePrompts: ["Diagnose why the checkout service is timing out", "Build a timeline of events leading to the outage", "What's the blast radius of the current database issue?"],
    dataRequired: ["Monitoring data", "Service topology", "Alert history"],
    brainIntegration: "Brain links incidents to causal chains: deploy to error spike to customer churn, with statistical confidence.",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  },
  {
    id: "performance-profile", name: "Performance Profiler", servicePack: "swe-aas",
    category: "production", categoryLabel: "Production Support",
    description: "Identify and resolve performance bottlenecks. Analyzes APM data, pinpoints slow endpoints, suggests optimization strategies.",
    status: "live", domainType: "performance-profile",
    examplePrompts: ["Profile the /api/checkout endpoint for performance issues", "Identify the slowest database queries in production", "Suggest optimizations for the report generation pipeline"],
    dataRequired: ["APM data", "Trace data", "Query logs"],
    brainIntegration: "Brain predicts performance degradation impact on business metrics (conversion rate, user satisfaction).",
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  },

  // ── Code Understanding ────────────────────────────────────────────────
  {
    id: "codebase-qa", name: "Codebase Q&A", servicePack: "swe-aas",
    category: "understanding", categoryLabel: "Code Understanding",
    description: "Understand unfamiliar code quickly. Answer natural language questions about the codebase, explain complex functions, show code flow.",
    status: "copilot",
    examplePrompts: ["How does the payment processing pipeline work?", "Where is the user authentication logic implemented?", "Explain the order fulfillment state machine"],
    dataRequired: ["Codebase indexed via GitHub connector"],
    brainIntegration: "Brain provides AI Worker context — who owns what code, historical change patterns, known issues.",
    icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
  },
  {
    id: "dead-code", name: "Dead Code Detector", servicePack: "swe-aas",
    category: "understanding", categoryLabel: "Code Understanding",
    description: "Identify and safely remove unused code. Analyzes code usage, finds unused dependencies, generates safe removal suggestions.",
    status: "live", domainType: "dead-code",
    examplePrompts: ["Find dead code in the authentication module", "Identify unused exports across the project", "Which dependencies are no longer used?"],
    dataRequired: ["Codebase access", "Import/export analysis"],
    brainIntegration: "Brain tracks code usage patterns to distinguish truly dead code from rarely-used emergency paths.",
    icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
  },

  // ── Testing & Quality ─────────────────────────────────────────────────
  {
    id: "test-cases", name: "Test Case Generator", servicePack: "swe-aas",
    category: "testing", categoryLabel: "Testing & Quality",
    description: "Increase test coverage efficiently. Analyzes code to identify gaps, generates unit tests, creates integration scenarios.",
    status: "live", domainType: "test-cases",
    examplePrompts: ["Generate test cases for the UserService class", "Create integration tests for the checkout flow", "Write edge case tests for the date parsing utility"],
    dataRequired: ["Source code", "Existing test suite"],
    brainIntegration: "Brain identifies which code paths have historically caused production issues — prioritizes test generation there.",
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "test-data", name: "Test Data Generator", servicePack: "swe-aas",
    category: "testing", categoryLabel: "Testing & Quality",
    description: "Generate realistic test data fixtures. Creates mock data matching your schemas, seeds databases for testing.",
    status: "live", domainType: "test-data",
    examplePrompts: ["Generate test data for a user with multiple subscriptions", "Create seed data for the e-commerce test environment", "Generate edge case data for the billing calculation tests"],
    dataRequired: ["Database schema", "Data model definitions"],
    brainIntegration: "Brain uses real data distribution patterns to generate statistically realistic test data.",
    icon: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M11.25 12h.008v.008h-.008V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCOUNTING-aaS: 2 Requirements (Phase 1 + Phase 1.5)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "acct-phase1", name: "Core Bookkeeping", servicePack: "accounting-aas",
    category: "accounting-core", categoryLabel: "Phase 1 — Core Bookkeeping",
    description: "Pure GL processing pipeline for PH Accounting: account classification, journal entries, trial balance, P&L, Balance Sheet, and transaction pattern analysis. 6 AI agents processing 49,684 real Xero GL transactions from the PH Accounting org.",
    status: "live", domainType: "acct-phase1",
    examplePrompts: ["Show me the profit and loss breakdown", "Classify all accounts in the general ledger", "Analyse transaction patterns to detect unusual activity"],
    dataRequired: ["Xero GL export (xlsx) — PH Accounting org", "Chart of accounts"],
    brainIntegration: "Phase 1 operates as a standalone GL intelligence engine for PH Accounting — no Brain dependency. Validates pure accounting accuracy before layering causal intelligence.",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  {
    id: "acct-phase15", name: "Brain OS Causal Layer", servicePack: "accounting-aas",
    category: "accounting-causal", categoryLabel: "Phase 1.5 — Causal Intelligence",
    description: "Cross-system intelligence on top of PH Accounting GL data. Correlates financial signals (revenue drops, expense spikes, margin compression) with operational signals (velocity collapse, team churn, deploy frequency) via the Brain's causal knowledge graph. Enables predictions like 'revenue dropped because deploy velocity collapsed 3 sprints ago'.",
    status: "live", domainType: "acct-phase15",
    examplePrompts: ["Why did revenue drop last quarter?", "Correlate expense spikes with engineering events", "What operational signals predict margin compression?"],
    dataRequired: ["Phase 1 GL data", "Brain Intelligence Engine", "GitHub + Jira connectors"],
    brainIntegration: "This IS the Brain integration. Connects accounting nodes to the causal knowledge graph — financial metrics become first-class brain entities with causal edges to engineering, product, and operational domains.",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
];

const SWE_CATEGORIES = ["early-warning", "speed", "accuracy", "production", "understanding", "testing"];
const ACCT_CATEGORIES = ["accounting-core", "accounting-causal"];
const ALL_CATEGORY_ORDER = [...SWE_CATEGORIES, ...ACCT_CATEGORIES];

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "early-warning": { bg: "bg-red-500/5", border: "border-red-500/20", text: "text-red-400" },
  speed: { bg: "bg-blue-500/5", border: "border-blue-500/20", text: "text-blue-400" },
  accuracy: { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
  production: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
  understanding: { bg: "bg-purple-500/5", border: "border-purple-500/20", text: "text-purple-400" },
  testing: { bg: "bg-cyan-500/5", border: "border-cyan-500/20", text: "text-cyan-400" },
  "accounting-core": { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
  "accounting-causal": { bg: "bg-indigo-500/5", border: "border-indigo-500/20", text: "text-indigo-400" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-success/10 text-success" },
  copilot: { label: "Via Copilot", className: "bg-accent/10 text-accent" },
  "coming-soon": { label: "Coming Soon", className: "bg-surface text-muted" },
};

/* ── Component ──────────────────────────────────────────────────────────────── */

interface CapabilitiesClientProps {
  domainCounts: Record<string, number>;
  recentArtifacts: Array<{
    id: string;
    domain_type: string;
    created_at: string;
    metadata: any;
  }>;
  activeJobs: Array<{
    id: string;
    task_type: string;
    status: string;
    created_at: string;
  }>;
}

export function CapabilitiesClient({
  domainCounts,
  recentArtifacts,
  activeJobs,
}: CapabilitiesClientProps) {
  const router = useRouter();
  const [activePackId, setActivePackId] = useState<string>("swe-aas");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activePack = SERVICE_PACKS.find((p) => p.id === activePackId);
  const packCapabilities = CAPABILITIES.filter((c) => c.servicePack === activePackId);

  // Group capabilities by category within the selected pack
  const categoryOrder = activePackId === "swe-aas" ? SWE_CATEGORIES : ACCT_CATEGORIES;
  const grouped = categoryOrder.map((cat) => ({
    category: cat,
    label: packCapabilities.find((c) => c.category === cat)?.categoryLabel || cat,
    items: packCapabilities.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  const totalCapabilities = CAPABILITIES.filter((c) => c.status !== "coming-soon").length;
  const liveCount = CAPABILITIES.filter((c) => c.status === "live").length;

  return (
    <div className="space-y-6">
      {/* ── Service Packs Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SERVICE_PACKS.map((pack) => {
          const isActive = activePackId === pack.id;
          const isComingSoon = pack.status === "coming-soon";

          return (
            <button
              key={pack.id}
              onClick={() => {
                if (isComingSoon) return;
                if (pack.dashboardHref && !isActive) {
                  setActivePackId(pack.id);
                } else {
                  setActivePackId(pack.id);
                }
              }}
              disabled={isComingSoon}
              className={cn(
                "relative rounded-xl border p-4 text-left transition-all",
                `bg-gradient-to-br ${pack.color.gradient}`,
                isActive
                  ? `${pack.color.border} ring-1 ring-accent/30`
                  : isComingSoon
                  ? "border-border-subtle/50 opacity-60 cursor-not-allowed"
                  : pack.color.border,
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", pack.color.badge)}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={pack.icon} />
                  </svg>
                </div>
                <span className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                  pack.status === "active"
                    ? "bg-success/10 text-success"
                    : "bg-surface text-muted"
                )}>
                  {pack.status === "active" ? "Active" : "Soon"}
                </span>
              </div>
              <h3 className="text-sm font-semibold mb-0.5">{pack.name}</h3>
              <p className="text-[10px] text-muted leading-relaxed">{pack.tagline}</p>
              {pack.capabilityCount > 0 && (
                <div className={cn("text-[10px] font-medium mt-2", pack.color.text)}>
                  {pack.capabilityCount} capabilities
                </div>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Pack Header ─────────────────────────────────────────────── */}
      {activePack && activePack.status === "active" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activePack.color.badge)}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={activePack.icon} />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold">{activePack.name} as a Service</h2>
              <p className="text-[10px] text-muted">{activePack.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activePack.dashboardHref && (
              <Link
                href={activePack.dashboardHref}
                className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border-subtle hover:border-accent/30 transition-colors"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/copilot"
              className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors"
            >
              Open Copilot
            </Link>
          </div>
        </div>
      )}

      {/* ── Stats Strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums">{totalCapabilities}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Total Capabilities</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums text-success">{liveCount}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Live</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums">
            {Object.values(domainCounts).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Artifacts Generated</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums">{SERVICE_PACKS.filter((p) => p.status === "active").length}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Active Service Packs</div>
        </div>
      </div>

      {/* ── Capability Cards by Category ───────────────────────────────────── */}
      {grouped.map((group) => (
        <div key={group.category} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{group.label}</h2>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              {group.items.length} {group.items.length === 1 ? "capability" : "capabilities"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map((cap) => {
              const colors = CATEGORY_COLORS[cap.category] || CATEGORY_COLORS["accounting-core"] || { bg: "bg-muted/5", border: "border-muted/20", text: "text-muted" };
              const badge = STATUS_BADGES[cap.status];
              const artifactCount = cap.domainType ? domainCounts[cap.domainType] || 0 : 0;
              const isExpanded = expandedId === cap.id;
              const hasActiveJob = activeJobs.some((j) => j.task_type === cap.domainType);

              return (
                <div
                  key={cap.id}
                  className={cn(
                    "rounded-xl border p-4 transition-all cursor-pointer",
                    colors.bg, colors.border,
                    isExpanded ? "ring-1 ring-accent/30" : "hover:ring-1 hover:ring-border"
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : cap.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", colors.bg, colors.text)}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={cap.icon} />
                        </svg>
                      </div>
                      <h3 className="text-sm font-medium leading-tight">{cap.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasActiveJob && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                      <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider", badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted leading-relaxed mb-3">{cap.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[10px] text-muted">
                      {artifactCount > 0 && <span>{artifactCount} artifact{artifactCount > 1 ? "s" : ""}</span>}
                      <span className={colors.text}>
                        {cap.status === "live" ? "API + Copilot" : cap.status === "copilot" ? "Copilot NL" : "Planned"}
                      </span>
                    </div>
                    {cap.status !== "coming-soon" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const svcParam = cap.servicePack === "swe-aas" ? "seaas" : cap.servicePack === "accounting-aas" ? "aas" : "general";
                          router.push(`/copilot?q=${encodeURIComponent(cap.examplePrompts[0])}&service=${svcParam}`);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-[10px] font-medium hover:bg-accent/20 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                        </svg>
                        Run
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-border-subtle space-y-3">
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5">Try in Copilot</div>
                        <div className="space-y-1">
                          {cap.examplePrompts.map((prompt, i) => (
                            <Link
                              key={i}
                              href={`/copilot?q=${encodeURIComponent(prompt)}&service=${cap.servicePack === "swe-aas" ? "seaas" : cap.servicePack === "accounting-aas" ? "aas" : "general"}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block text-xs text-foreground hover:text-accent transition-colors p-1.5 rounded bg-surface/50 hover:bg-surface"
                            >
                              &quot;{prompt}&quot;
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Brain Integration</div>
                        <p className="text-xs text-muted">{cap.brainIntegration}</p>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">Data Required</div>
                        <div className="flex flex-wrap gap-1">
                          {cap.dataRequired.map((d, i) => (
                            <span key={i} className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-surface text-muted">{d}</span>
                          ))}
                        </div>
                      </div>
                      {cap.status === "live" && cap.domainType && (
                        <div>
                          <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">API Endpoint</div>
                          <code className="text-[10px] font-mono text-accent bg-surface px-2 py-1 rounded block">
                            POST /api/{cap.servicePack === "accounting-aas" ? "aas" : "se-aas"}/{cap.domainType}
                          </code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Recent Artifacts ────────────────────────────────────────────────── */}
      {recentArtifacts.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Recent Artifacts</h3>
          <div className="space-y-2">
            {recentArtifacts.slice(0, 5).map((artifact) => {
              const cap = CAPABILITIES.find((c) => c.domainType === artifact.domain_type);
              return (
                <div key={artifact.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center bg-surface">
                      <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cap?.icon || "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"} />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-medium">{cap?.name || artifact.domain_type}</div>
                      <div className="text-[10px] text-muted">
                        {new Date(artifact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted font-mono">{artifact.id.slice(0, 8)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Cross-System Intelligence ──────────────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium">Brain-Powered Cross-System Intelligence</h3>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Every service pack is enhanced by the Brain&apos;s causal knowledge graph.
          Connect your tools to unlock cross-system intelligence that no single tool provides alone.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: "GitHub", desc: "Code + PRs", href: "/connectors" },
            { label: "Jira", desc: "Tickets", href: "/connectors" },
            { label: "Slack", desc: "Communication", href: "/connectors" },
            { label: "Xero", desc: "Accounting", href: "/connectors" },
            { label: "Volopay", desc: "Expenses", href: "/connectors" },
          ].map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="flex items-center gap-2 p-2 rounded-lg bg-surface/50 hover:bg-surface transition-colors"
            >
              <div>
                <div className="text-xs font-medium">{c.label}</div>
                <div className="text-[9px] text-muted">{c.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
