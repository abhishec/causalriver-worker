# Org Creation Agent — Quick Start Card

---

## ⚡ 30-Second Start

```bash
# Fix all existing Jarvis orgs
npx tsx scripts/run-org-agent.ts fix-all-jarvis

# Create new org (interactive)
npx tsx scripts/run-org-agent.ts create
```

---

## 📋 Common Commands

### Create Org
```bash
# Interactive (recommended)
npx tsx scripts/run-org-agent.ts create

# Automated
npx tsx scripts/run-org-agent.ts create \
  --name="Sales Intel" \
  --slug="sales-intel" \
  --connectors="hubspot,slack,stripe"
```

### Fix Org
```bash
# Fix specific org
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --reinit-brain \
  --recalibrate

# Fix all Jarvis orgs
npx tsx scripts/run-org-agent.ts fix-all-jarvis
```

### Help
```bash
npx tsx scripts/run-org-agent.ts help
```

---

## ✅ What You Get

Every org created has:
- ✅ 93+ brain systems wired
- ✅ Core Brain federation (gets global knowledge)
- ✅ Autonomous learning (every 6 hours)
- ✅ Continuous learning (real-time)
- ✅ Calibration loop (learns from mistakes)
- ✅ Growth mechanisms (weekly consolidation)
- ✅ CTO-level health verification
- ✅ Production-ready copilot

---

## 🎯 Success = Scorecard ≥90/100

```
Brain Connectivity Scorecard: X/100
  ├─ Brain Regions (30%):         Y/30
  ├─ Autonomous Learning (20%):   Z/20
  ├─ Continuous Learning (20%):   Z/20
  ├─ Calibration Loop (15%):      Z/15
  └─ Core Brain Federation (15%): Z/15
```

**≥90**: 🎉 APPROVED — Production-ready
**70-89**: ⚠️ CONDITIONAL — Needs fixes
**<70**: ❌ REJECTED — Not ready

---

## 🔌 Supported Connectors

`slack`, `hubspot`, `github`, `stripe`, `xero`, `volopay`, `google-docs`, `jira`, `pagerduty`, `linear`, `notion`, `intercom`, `zendesk`, `salesforce`, `postgresql`, `mongodb`, `rest-api`

---

## 📖 Full Docs

- **Complete Guide**: `docs/ORG-CREATION-AGENT-GUIDE.md`
- **Summary**: `docs/ORG-AGENT-SUMMARY.md`
- **This Card**: `docs/ORG-AGENT-QUICKSTART.md`

---

**Version**: 1.0.0 | **Last Updated**: 2026-02-14
