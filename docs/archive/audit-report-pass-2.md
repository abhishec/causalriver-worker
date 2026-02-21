# NexusBrain Codebase Audit Report

**Generated:** 2026-02-18T12:21:52.759Z
**Pass:** 2 of 2
**Mode:** LIVE (fixes applied)

## Summary

| Pass | Issues Found | Issues Fixed | Duration |
|------|-------------|--------------|----------|
| 1 | 38 | 34 | 31173ms |
| 2 | 38 | 34 | 15929ms |

## Current Pass Issues by Category

| Category | Count |
|----------|-------|
| envvars | 4 |
| randomids | 34 |

## All Issues (Pass 2)

### ENVVAR-1 [MEDIUM]
- **File:** `platform/app/api/se-aas/worker/route.ts`:22
- **Category:** envvars
- **Message:** SUPABASE_SERVICE_ROLE_KEY assigned but no null-guard before use
- **Auto-fixable:** No

### ENVVAR-2 [MEDIUM]
- **File:** `platform/lib/brain/orchestrator.ts`:268
- **Category:** envvars
- **Message:** NEXT_PUBLIC_SUPABASE_URL assigned but no null-guard before use
- **Auto-fixable:** No

### ENVVAR-3 [MEDIUM]
- **File:** `platform/lib/brain/orchestrator.ts`:269
- **Category:** envvars
- **Message:** SUPABASE_SERVICE_ROLE_KEY assigned but no null-guard before use
- **Auto-fixable:** No

### ENVVAR-4 [MEDIUM]
- **File:** `platform/lib/ids.ts`:270
- **Category:** envvars
- **Message:** SUPABASE_SERVICE_ROLE_KEY assigned but no null-guard before use
- **Auto-fixable:** No

### RANDID-1 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/async-discovery-worker.ts`:294
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-2 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/cascade-tracker.ts`:586
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
- **Auto-fixable:** Yes

### RANDID-3 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/event-bus.ts`:480
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-4 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/event-bus.ts`:588
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-5 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/feedback-loop.ts`:809
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `pred-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
- **Auto-fixable:** Yes

### RANDID-6 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/intervention-effects.ts`:130
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
- **Auto-fixable:** Yes

### RANDID-7 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-deep-layers.ts`:749
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
- **Auto-fixable:** Yes

### RANDID-8 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-deep-layers.ts`:901
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `wisdom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
- **Auto-fixable:** Yes

### RANDID-9 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-experimentation.ts`:164
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
- **Auto-fixable:** Yes

### RANDID-10 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-narrative.ts`:359
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const generateId = () => `narr_${Date.now()}_${Math.random().toString(36).substr
- **Auto-fixable:** Yes

### RANDID-11 [MEDIUM]
- **File:** `packages/memory-stack/src/connectors/logs/log-connector.ts`:545
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: item.id || `generic_${ts}_${Math.random().toString(36).slice(2)}`,
- **Auto-fixable:** Yes

### RANDID-12 [MEDIUM]
- **File:** `packages/memory-stack/src/core/entity-resolver.ts`:320
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const canonicalId = inserted?.id ?? `ent_${Date.now()}_${Math.random().toString(
- **Auto-fixable:** Yes

### RANDID-13 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/redis-streams-bus.ts`:386
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-14 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/security-hardened.ts`:377
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: await redis.zadd(windowKey, now, `${now}-${Math.random().toString(36).substr(2, 
- **Auto-fixable:** Yes

### RANDID-15 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/worker-pool.ts`:339
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `job_${Date.now()}_${++jobIdCounter}_${Math.random().toString(36).substr(2, 
- **Auto-fixable:** Yes

### RANDID-16 [MEDIUM]
- **File:** `packages/memory-stack/src/ingestion/batch-ingestion-engine.ts`:120
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
- **Auto-fixable:** Yes

### RANDID-17 [MEDIUM]
- **File:** `packages/memory-stack/src/ingestion/connector-signal-bridge.ts`:335
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-18 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/anomaly-detector.ts`:477
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: entityId: `historical_${Math.random()}`,
- **Auto-fixable:** Yes

### RANDID-19 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/pattern-detector.ts`:601
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-20 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/prediction-tracker.ts`:112
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-21 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/active-explorer.ts`:119
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `datareq-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-22 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/background-insight-engine.ts`:132
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `insight-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-23 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-agent-runtime.ts`:519
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const executionId = `bae_${Date.now()}_${Math.random().toString(36).substr(2, 9)
- **Auto-fixable:** Yes

### RANDID-24 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-commander.ts`:640
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: commandId: (mc.id as string) || `cmd_${Date.now()}_${Math.random().toString(36).
- **Auto-fixable:** Yes

### RANDID-25 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-observability-bridge.ts`:216
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}_${Math.random().t
- **Auto-fixable:** Yes

### RANDID-26 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/closed-loop-learning-engine.ts`:1346
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `iw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-27 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/consolidation-engine.ts`:2226
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const runId = `consolidation-${Date.now()}-${Math.random().toString(36).substrin
- **Auto-fixable:** Yes

### RANDID-28 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/impact-scorer.ts`:721
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `priority-${Date.now()}-${Math.random().toString(36).substring(2, 8)}
- **Auto-fixable:** Yes

### RANDID-29 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/llm-response-layer.ts`:320
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-30 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/priorities-api.ts`:63
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `prio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-31 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/proactive-intelligence.ts`:239
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-32 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/se-aas-security.ts`:498
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-33 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/se-aas-service.ts`:958
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-34 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/session-memory.ts`:160
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes


---
*Generated by NexusBrain Codebase Auditor Agent (NB-070)*