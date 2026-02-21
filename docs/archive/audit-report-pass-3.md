# NexusBrain Codebase Audit Report

**Generated:** 2026-02-18T12:17:50.900Z
**Pass:** 3 of 3
**Mode:** LIVE (fixes applied)

## Summary

| Pass | Issues Found | Issues Fixed | Duration |
|------|-------------|--------------|----------|
| 1 | 58 | 54 | 18153ms |
| 2 | 58 | 54 | 16638ms |
| 3 | 58 | 54 | 22645ms |

## Current Pass Issues by Category

| Category | Count |
|----------|-------|
| envvars | 4 |
| randomids | 54 |

## All Issues (Pass 3)

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
- **File:** `platform/lib/company-jarvis/synthetic-hubspot.ts`:330
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const idx = Math.floor(Math.random() * corePool.length);
- **Auto-fixable:** Yes

### RANDID-2 [MEDIUM]
- **File:** `platform/lib/company-jarvis/synthetic-hubspot.ts`:336
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const idx = Math.floor(Math.random() * addonPool.length);
- **Auto-fixable:** Yes

### RANDID-3 [MEDIUM]
- **File:** `platform/lib/company-jarvis/synthetic-slack.ts`:48
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: users: pickN(EMPLOYEES, Math.floor(Math.random() * 4) + 1).map(e => e.slackId),
- **Auto-fixable:** Yes

### RANDID-4 [MEDIUM]
- **File:** `platform/lib/company-jarvis/synthetic-slack.ts`:96
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: `Q${Math.ceil((month + 1) / 3)} quota check: I'm at ${Math.floor(rand(40, 110))}
- **Auto-fixable:** Yes

### RANDID-5 [MEDIUM]
- **File:** `platform/lib/company-jarvis/synthetic-slack.ts`:339
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: mentions: Math.random() > 0.7 ? [parentMsg.userId] : [],
- **Auto-fixable:** Yes

### RANDID-6 [MEDIUM]
- **File:** `platform/lib/company-jarvis/synthetic-slack.ts`:449
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: mentions: Math.random() > 0.75 ? [pick(channelEmployees).slackId] : [],
- **Auto-fixable:** Yes

### RANDID-7 [MEDIUM]
- **File:** `platform/lib/finance-jarvis/synthetic-xero.ts`:360
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const isPaid = Math.random() > 0.12;
- **Auto-fixable:** Yes

### RANDID-8 [MEDIUM]
- **File:** `platform/lib/finance-jarvis/synthetic-xero.ts`:407
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const isPaid = Math.random() > 0.08;
- **Auto-fixable:** Yes

### RANDID-9 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/brain-health.test.ts`:103
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const value = aValues[laggedIdx] * 0.8 + (Math.random() - 0.5) * 10;
- **Auto-fixable:** Yes

### RANDID-10 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/cognitive-layers-deep-7-15.test.ts`:68
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `signal_${Math.random().toString(36).slice(2)}`,
- **Auto-fixable:** Yes

### RANDID-11 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/cognitive-layers-full-stack.test.ts`:104
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: confidence: 0.5 + Math.random() * 0.4,
- **Auto-fixable:** Yes

### RANDID-12 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/cognitive-stack-integration.test.ts`:403
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: confidence: 0.3 + Math.random() * 0.5,
- **Auto-fixable:** Yes

### RANDID-13 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/cognitive-stack-integration.test.ts`:408
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: claim: `Prediction ${i}`, confidence: 0.5 + Math.random() * 0.4,
- **Auto-fixable:** Yes

### RANDID-14 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/consolidation.test.ts`:16
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const base = createTemporalMemory('test_' + Math.random().toString(36).slice(2),
- **Auto-fixable:** Yes

### RANDID-15 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/design-partner-e2e-simulation.test.ts`:146
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: : 4 + Math.floor(Math.random() * 6);  // mid-sprint: steady flow
- **Auto-fixable:** Yes

### RANDID-16 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/impact-attention.test.ts`:68
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
- **Auto-fixable:** Yes

### RANDID-17 [MEDIUM]
- **File:** `packages/memory-stack/src/__tests__/learning-integration.test.ts`:250
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: labelConfidence: 0.5 + Math.random() * 0.5,
- **Auto-fixable:** Yes

### RANDID-18 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/async-discovery-worker.ts`:294
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-19 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/cascade-tracker.ts`:586
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
- **Auto-fixable:** Yes

### RANDID-20 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/event-bus.ts`:480
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-21 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/event-bus.ts`:588
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-22 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/feedback-loop.ts`:809
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `pred-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
- **Auto-fixable:** Yes

### RANDID-23 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/intervention-effects.ts`:130
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
- **Auto-fixable:** Yes

### RANDID-24 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-deep-layers.ts`:749
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `decision_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
- **Auto-fixable:** Yes

### RANDID-25 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-deep-layers.ts`:901
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `wisdom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
- **Auto-fixable:** Yes

### RANDID-26 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-experimentation.ts`:164
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
- **Auto-fixable:** Yes

### RANDID-27 [MEDIUM]
- **File:** `packages/memory-stack/src/causality/leap-narrative.ts`:359
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const generateId = () => `narr_${Date.now()}_${Math.random().toString(36).substr
- **Auto-fixable:** Yes

### RANDID-28 [MEDIUM]
- **File:** `packages/memory-stack/src/connectors/logs/log-connector.ts`:545
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: item.id || `generic_${ts}_${Math.random().toString(36).slice(2)}`,
- **Auto-fixable:** Yes

### RANDID-29 [MEDIUM]
- **File:** `packages/memory-stack/src/core/entity-resolver.ts`:320
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const canonicalId = inserted?.id ?? `ent_${Date.now()}_${Math.random().toString(
- **Auto-fixable:** Yes

### RANDID-30 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/redis-streams-bus.ts`:386
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-31 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/security-hardened.ts`:377
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: await redis.zadd(windowKey, now, `${now}-${Math.random().toString(36).substr(2, 
- **Auto-fixable:** Yes

### RANDID-32 [MEDIUM]
- **File:** `packages/memory-stack/src/infra/worker-pool.ts`:339
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: id: `job_${Date.now()}_${++jobIdCounter}_${Math.random().toString(36).substr(2, 
- **Auto-fixable:** Yes

### RANDID-33 [MEDIUM]
- **File:** `packages/memory-stack/src/ingestion/batch-ingestion-engine.ts`:120
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
- **Auto-fixable:** Yes

### RANDID-34 [MEDIUM]
- **File:** `packages/memory-stack/src/ingestion/connector-signal-bridge.ts`:335
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-35 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/anomaly-detector.ts`:477
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: entityId: `historical_${Math.random()}`,
- **Auto-fixable:** Yes

### RANDID-36 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/calibration-engine.ts`:333
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const idx = Math.floor(Math.random() * matched.length);
- **Auto-fixable:** Yes

### RANDID-37 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/confidence-intervals.ts`:141
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const idx = Math.floor(Math.random() * data.length);
- **Auto-fixable:** Yes

### RANDID-38 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/pattern-detector.ts`:422
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: centroids.push([...vectors[Math.floor(Math.random() * n)]]);
- **Auto-fixable:** Yes

### RANDID-39 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/pattern-detector.ts`:601
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-40 [MEDIUM]
- **File:** `packages/memory-stack/src/learning/prediction-tracker.ts`:112
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-41 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/active-explorer.ts`:119
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `datareq-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-42 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/background-insight-engine.ts`:132
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `insight-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-43 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-agent-runtime.ts`:519
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const executionId = `bae_${Date.now()}_${Math.random().toString(36).substr(2, 9)
- **Auto-fixable:** Yes

### RANDID-44 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-commander.ts`:640
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: commandId: (mc.id as string) || `cmd_${Date.now()}_${Math.random().toString(36).
- **Auto-fixable:** Yes

### RANDID-45 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/brain-observability-bridge.ts`:216
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}_${Math.random().t
- **Auto-fixable:** Yes

### RANDID-46 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/closed-loop-learning-engine.ts`:1346
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `iw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-47 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/consolidation-engine.ts`:2226
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const runId = `consolidation-${Date.now()}-${Math.random().toString(36).substrin
- **Auto-fixable:** Yes

### RANDID-48 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/impact-scorer.ts`:721
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `priority-${Date.now()}-${Math.random().toString(36).substring(2, 8)}
- **Auto-fixable:** Yes

### RANDID-49 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/llm-response-layer.ts`:320
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-50 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/priorities-api.ts`:63
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: const id = `prio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-51 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/proactive-intelligence.ts`:239
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes

### RANDID-52 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/se-aas-security.ts`:498
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-53 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/se-aas-service.ts`:958
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
- **Auto-fixable:** Yes

### RANDID-54 [MEDIUM]
- **File:** `packages/memory-stack/src/orchestrator/session-memory.ts`:160
- **Category:** randomids
- **Message:** Math.random() used for ID generation — not collision-safe: return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
- **Auto-fixable:** Yes


---
*Generated by NexusBrain Codebase Auditor Agent (NB-070)*