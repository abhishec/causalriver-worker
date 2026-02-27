-- Process Engine Templates: 12 new templates for hackathon scenarios (Tasks 4–15)
-- Using INSERT ... ON CONFLICT DO NOTHING to be idempotent on re-run.
-- All templates are global (organization_id = NULL) — available to all orgs.

-- Task 4: Expense Approval (was in BPAAS_PROCESS_TYPES but not seeded)
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Expense Approval', 'expense_approval',
  'Employee expense claim processing with receipt validation and policy enforcement',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "COMPLETE", "on": "mutated"}
    ]
  }',
  '[
    {"id": "expense_threshold", "condition": "total_amount > 250", "action": "require_approval", "level": "manager", "threshold": 250, "description": "Expenses over $250 require manager approval"},
    {"id": "missing_receipts", "condition": "missing_receipts", "action": "block", "level": "finance", "description": "Expenses without receipts must be blocked until receipts are submitted"},
    {"id": "out_of_policy", "condition": "is_out_of_policy", "action": "escalate", "level": "manager", "description": "Out-of-policy expenses require manager escalation"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'expense_approval' AND organization_id IS NULL);

-- Task 5: Customer Onboarding (was in BPAAS_PROCESS_TYPES but not seeded)
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Customer Onboarding', 'customer_onboarding',
  'New customer onboarding workflow with KYC, provisioning, and welcome communications',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"}
    ]
  }',
  '[
    {"id": "kyc_required", "condition": "kyc_status !== verified", "action": "block", "level": "finance", "description": "KYC verification must be complete before account provisioning"},
    {"id": "high_risk_country", "condition": "country_risk_level === high", "action": "escalate", "level": "manager", "description": "High-risk country customers require compliance escalation"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'customer_onboarding' AND organization_id IS NULL);

-- Task 6: Insurance Claim Processing
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Insurance Claim Processing', 'insurance_claim',
  'End-to-end insurance claim evaluation with coverage sublimits, rider application, fraud detection, and partial approval',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "FRAUD_REVIEW", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "FRAUD_REVIEW", "on": "fraud_signals"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "FRAUD_REVIEW", "to": "APPROVAL_GATE", "on": "fraud_reviewed"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "escalated"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"}
    ]
  }',
  '[
    {"id": "filing_deadline", "condition": "days_since_incident > 30 && !hospitalization_exception", "action": "block", "level": "manager", "threshold": 30, "description": "Claims filed >30 days after incident are blocked unless hospitalization grace period applies"},
    {"id": "fraud_frequency", "condition": "prior_claims_18m >= 2", "action": "escalate", "level": "manager", "description": "Customers with 2+ claims in 18 months require frequency review (do NOT auto-deny)"},
    {"id": "preauth_required", "condition": "has_unpreauthorized_work", "action": "require_approval", "level": "manager", "threshold": 0, "description": "Expedited or non-preauthorized work requires manager review before inclusion in payout"},
    {"id": "coverage_limit", "condition": "claimed_amount > coverage_limit", "action": "require_approval", "level": "committee", "description": "Claims exceeding coverage limit require committee review"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'insurance_claim' AND organization_id IS NULL);

-- Task 7: Multi-Vendor Invoice Reconciliation
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Multi-Vendor Invoice Reconciliation', 'invoice_reconciliation',
  'Invoice matching against POs with duplicate detection, price variance checks, currency conversion, and early payment discounts',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "DUPLICATE_CHECK", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "DUPLICATE_CHECK", "on": "computed"},
      {"from": "DUPLICATE_CHECK", "to": "POLICY_CHECK", "on": "duplicates_resolved"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "variance_detected"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "COMPLETE", "on": "mutated"}
    ]
  }',
  '[
    {"id": "price_variance_2pct", "condition": "price_variance_pct > 2", "action": "require_approval", "level": "manager", "threshold": 2, "description": "Price variance >2% from PO requires manager approval"},
    {"id": "duplicate_invoice", "condition": "is_duplicate_from_related_entity", "action": "block", "level": "finance", "description": "Duplicate invoices from related entities must be flagged and not paid"},
    {"id": "fx_rate_variance", "condition": "fx_rate_variance_pct > 2", "action": "require_approval", "level": "finance", "threshold": 2, "description": "FX rate deviation >2% from invoice-date rate requires finance approval"},
    {"id": "po_overage", "condition": "total_invoiced > po_amount", "action": "require_approval", "level": "manager", "description": "Total invoiced amount exceeding PO value requires manager approval"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'invoice_reconciliation' AND organization_id IS NULL);

-- Task 8: SLA Breach Escalation
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'SLA Breach Escalation', 'sla_breach_escalation',
  'SLA compliance monitoring with breach calculation, credit computation, quiet-hours notification scheduling, and cascading escalation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "breach_confirmed"},
      {"from": "POLICY_CHECK", "to": "SCHEDULE_NOTIFY", "on": "pre_breach_warning"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "quiet_hours", "condition": "notification_hour >= 22 || notification_hour < 6", "action": "escalate", "level": "manager", "description": "Notifications during quiet hours (10PM-6AM local time) must be queued for 6AM"},
    {"id": "sla_breach_credit", "condition": "counted_downtime_minutes > sla_threshold_minutes", "action": "escalate", "level": "ciso", "description": "SLA breach triggers automatic credit calculation and CTO notification"},
    {"id": "client_caused_exclusion", "condition": "incident_root_cause === client", "action": "require_approval", "level": "manager", "description": "Client-caused downtime must be excluded from SLA calculation with manager confirmation"},
    {"id": "pre_breach_warning", "condition": "remaining_minutes_to_breach <= 5", "action": "escalate", "level": "manager", "description": "Pre-breach warning when within 5 minutes of SLA threshold"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'sla_breach_escalation' AND organization_id IS NULL);

-- Task 9: Multi-Leg Travel Rebooking
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Multi-Leg Travel Rebooking', 'travel_rebooking',
  'Complex travel itinerary modification with fare class rules, loyalty tier benefits, company travel policy enforcement, and downstream cancellation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "policy_violation"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"}
    ]
  }',
  '[
    {"id": "business_class_policy", "condition": "requested_class === business && flight_duration_hours < 6", "action": "require_approval", "level": "manager", "description": "Business class on domestic flights <6 hours requires VP pre-approval per company travel policy"},
    {"id": "route_change_fee", "condition": "is_route_change && fare_class === economy_saver", "action": "require_approval", "level": "manager", "threshold": 200, "description": "Route changes on Economy Saver fare incur $200 change fee (loyalty tier waiver does NOT apply to route changes)"},
    {"id": "non_refundable_cancel", "condition": "is_cancellation && fare_class === economy_saver", "action": "require_approval", "level": "manager", "description": "Non-refundable fare cancellation: customer receives airline credit, not cash refund"},
    {"id": "loyalty_credit_expiry", "condition": "loyalty_tier === gold && has_airline_credit", "action": "require_approval", "level": "manager", "description": "Gold tier extends airline credit expiry from 12 to 18 months"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'travel_rebooking' AND organization_id IS NULL);

-- Task 10: Regulatory Compliance Audit
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Regulatory Compliance Audit', 'compliance_audit',
  'KYC/AML compliance verification with document gap detection, PEP screening, remediation deadline assignment, and RM escalation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "rm_missing"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "dl_requires_utility_bill", "condition": "kyc_doc_type === drivers_license && !has_utility_bill", "action": "escalate", "level": "manager", "description": "Driver license KYC requires both DL AND utility bill (unlike passport which is standalone)"},
    {"id": "pep_potential_match", "condition": "pep_screening_result === potential_match", "action": "escalate", "level": "manager", "description": "PEP potential match requires Enhanced Due Diligence (EDD) — NOT account freeze (freeze only for confirmed match)"},
    {"id": "expired_doc_at_opening", "condition": "doc_expired_after_account_opening", "action": "require_approval", "level": "manager", "description": "Documents valid at account opening are currently OK — flag for next review cycle only, NOT as current gap"},
    {"id": "missing_rm_escalation", "condition": "assigned_rm_status === departed", "action": "escalate", "level": "hr", "description": "Missing/departed RM: must escalate remediation assignment to department head"},
    {"id": "kyc_gap_deadline", "condition": "has_kyc_gap", "action": "require_approval", "level": "manager", "threshold": 30, "description": "KYC gaps: 30-day remediation deadline from today"},
    {"id": "pep_deadline", "condition": "has_pep_gap", "action": "require_approval", "level": "manager", "threshold": 14, "description": "PEP screening gaps: 14-day remediation deadline (urgent)"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'compliance_audit' AND organization_id IS NULL);

-- Task 11: Customer Subscription Migration
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Customer Subscription Migration', 'subscription_migration',
  'Plan downgrade/upgrade with prorated refund calculation, feature conflict detection, compliance warnings, and multi-checkpoint confirmation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "conflicts_found"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "compliance_conflict"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "all_conflicts_confirmed"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "seat_reduction_warning", "condition": "new_plan_seats < active_users", "action": "require_approval", "level": "manager", "description": "Plan migration would reduce available seats below current active user count — must deactivate excess users first"},
    {"id": "storage_reduction_warning", "condition": "new_plan_storage_gb < current_usage_gb", "action": "require_approval", "level": "manager", "description": "Plan migration would exceed storage limit — must export/delete data before migration"},
    {"id": "compliance_retention_conflict", "condition": "new_plan_retention_days < compliance_required_retention_days", "action": "escalate", "level": "legal", "description": "CRITICAL: Migration would put customer in violation of their own compliance requirements — STRONG warning required"},
    {"id": "early_termination_fee", "condition": "remaining_months > 0 && plan_type === annual", "action": "require_approval", "level": "manager", "threshold": 10, "description": "Annual plan early termination: 10% fee on remaining value deducted from prorated refund"},
    {"id": "data_export_before_migration", "condition": "new_plan_storage_gb < current_usage_gb", "action": "block", "level": "manager", "description": "Data export must complete before migration executes (order dependency)"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'subscription_migration' AND organization_id IS NULL);

-- Task 12: Multi-Party Dispute Resolution
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Multi-Party Dispute Resolution', 'dispute_resolution',
  'E-commerce dispute handling with evidence review, buyer dispute frequency check, mandatory escalation for elevated-risk buyers, and transaction hold',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "EVIDENCE_REVIEW", "POLICY_CHECK", "APPROVAL_GATE", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "EVIDENCE_REVIEW", "on": "computed"},
      {"from": "EVIDENCE_REVIEW", "to": "POLICY_CHECK", "on": "evidence_reviewed"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "elevated_review_triggered"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "inconclusive_evidence"},
      {"from": "POLICY_CHECK", "to": "COMPLETE", "on": "policy_pass"},
      {"from": "APPROVAL_GATE", "to": "COMPLETE", "on": "resolved"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "dispute_frequency_elevated", "condition": "buyer_disputes_12m > 5", "action": "escalate", "level": "manager", "description": "Buyers with >5 disputes in 12 months require elevated review — agent CANNOT auto-resolve (must go to human reviewer)"},
    {"id": "inconclusive_evidence", "condition": "evidence_is_ambiguous", "action": "require_approval", "level": "manager", "description": "Ambiguous evidence (e.g. color perception disputes) requires human review, not AI resolution"},
    {"id": "transaction_hold", "condition": "dispute_status === under_review", "action": "require_approval", "level": "manager", "description": "Transaction amount must be placed on hold (not refunded or released) pending resolution"},
    {"id": "elevated_review_privacy", "condition": "elevated_review_triggered", "action": "escalate", "level": "manager", "description": "Do NOT disclose elevated review reason to buyer — privacy policy requires reason be hidden"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'dispute_resolution' AND organization_id IS NULL);

-- Task 13: Month-End Financial Close
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Month-End Financial Close', 'financial_close',
  'Month-end close: bank transaction reconciliation, P&L generation with revenue recognition, cash flow statement, and audit trail with suspense accounts',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "RECONCILE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "RECONCILE", "on": "computed"},
      {"from": "RECONCILE", "to": "POLICY_CHECK", "on": "reconciled"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "unidentified_transaction"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "disputed_transaction"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "MUTATE", "to": "COMPLETE", "on": "mutated"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "unidentified_wire_suspense", "condition": "transaction_has_no_reference && amount > 1000", "action": "escalate", "level": "cfo", "description": "Unidentified wire transfers >$1,000 must be booked to Suspense Account and escalated to CFO — do NOT guess the category"},
    {"id": "annual_contract_deferral", "condition": "invoice_type === annual_prepaid", "action": "require_approval", "level": "finance", "description": "Annual prepaid contracts: recognize only 1/12th as current revenue, defer 11/12ths to deferred revenue"},
    {"id": "capex_not_opex", "condition": "asset_purchase_amount > 2500", "action": "require_approval", "level": "finance", "threshold": 2500, "description": "Asset purchases >$2,500 must be capitalized (not expensed) — separate investing cash flow"},
    {"id": "duplicate_stripe_charge", "condition": "is_duplicate_payment_gateway_charge", "action": "block", "level": "finance", "description": "Suspected duplicate payment gateway charges must be flagged as disputed, NOT expensed"},
    {"id": "loan_payment_split", "condition": "transaction_type === loan_repayment", "action": "require_approval", "level": "finance", "description": "Loan repayments must split principal (financing activity) vs interest (operating activity) — cannot book as single line"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'financial_close' AND organization_id IS NULL);

-- Task 14: Product Story to Engineering Workflow
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Product Story to Engineering Workflow', 'product_workflow',
  'PM brief to Confluence PRD to Jira epic decomposition to sprint allocation with capacity/dependency checks and stakeholder notifications',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "dependency_conflict"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "confluence_before_jira", "condition": "jira_stories_created && !confluence_page_exists", "action": "block", "level": "manager", "description": "Jira stories must NOT be created before the Confluence PRD exists (correct order: PRD then Epic then Stories)"},
    {"id": "sprint_dependency_risk", "condition": "story_depends_on_same_sprint_completion", "action": "escalate", "level": "manager", "description": "Story dependencies on same-sprint completions are high-risk scheduling conflicts — must flag to sprint planner"},
    {"id": "capacity_overflow", "condition": "sprint_total_points > team_velocity", "action": "require_approval", "level": "manager", "description": "Sprint points exceed team velocity — requires capacity rebalancing"},
    {"id": "notifications_after_artifacts", "condition": "notification_sent && !artifacts_created", "action": "block", "level": "manager", "description": "Notifications (Slack, email) must be sent ONLY after Jira/Confluence artifacts are confirmed created"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'product_workflow' AND organization_id IS NULL);

-- Task 14 (cont): Accounts Receivable Collections
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Accounts Receivable Collections Workflow', 'ar_collections',
  'AR aging analysis with 6-path collection routing: enterprise exemption, credit note application, payment plans, bank feed reconciliation, bankruptcy write-off, government term reclassification',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "active_enterprise_customer"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "payment_plan_requested"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "enterprise_no_collections", "condition": "customer_status === active_enterprise && contract_renewal_within_months <= 6", "action": "escalate", "level": "manager", "description": "Active enterprise customers with renewal within 6 months: do NOT send to collections — escalate to Account Executive for personal contact"},
    {"id": "credit_note_first", "condition": "has_unapplied_credit_note", "action": "require_approval", "level": "finance", "description": "Unapplied credit notes must be applied before pursuing collection — reduces net owed amount"},
    {"id": "payment_plan_threshold", "condition": "outstanding_amount > 2000 && customer_payment_plan_requested", "action": "require_approval", "level": "manager", "threshold": 2000, "description": "Payment plans available for amounts >$2,000 if no prior defaults. Max 6 monthly installments at 1.5%/month interest."},
    {"id": "bankruptcy_writeoff", "condition": "customer_bankruptcy_status === filed", "action": "require_approval", "level": "finance", "description": "Customers with active bankruptcy filing: immediately write off receivable as bad debt"},
    {"id": "government_terms", "condition": "customer_entity_type === government", "action": "require_approval", "level": "manager", "description": "Government entities have Net 90 payment terms (not Net 30) — recalculate aging bucket before any collection action"},
    {"id": "check_bank_feed_first", "condition": "invoice_age_days >= 90", "action": "require_approval", "level": "finance", "description": "For all 90+ day invoices: check bank feed for unposted payments before initiating collection action"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'ar_collections' AND organization_id IS NULL);

-- Task 15: IT Incident Response & Post-Mortem
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'IT Incident Response & Post-Mortem', 'incident_response',
  'Production incident triage, root cause analysis with causal chain reasoning, remediation decision with PCI/security constraints, change request, and blameless post-mortem',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "RCA", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "RCA", "on": "computed"},
      {"from": "RCA", "to": "POLICY_CHECK", "on": "rca_complete"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "two_person_approval_required"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "security_conflict"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "payment_key_two_person", "condition": "change_type === payment_credential || change_type === api_key", "action": "require_approval", "level": "ciso", "description": "PCI compliance: payment API key changes require 2-person approval (primary + secondary approver). Agent CANNOT execute alone."},
    {"id": "cve_version_constraint", "condition": "proposed_rollback_has_known_cve", "action": "block", "level": "ciso", "description": "Cannot rollback to a version with a known CVE — security policy prohibits vulnerable version deployment"},
    {"id": "p1_sla", "condition": "incident_severity === P1", "action": "escalate", "level": "manager", "threshold": 60, "description": "P1 incidents: 1-hour SLA to resolve. Auto-escalate if approaching SLA breach."},
    {"id": "blameless_postmortem", "condition": "postmortem_contains_individual_blame", "action": "block", "level": "manager", "description": "Post-mortem must be blameless — individual names must not appear in blame context. Focus on system gaps."}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'incident_response' AND organization_id IS NULL);

-- Task 15 (cont): Quarterly Business Review Preparation
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active)
SELECT NULL, 'Quarterly Business Review Preparation', 'qbr_preparation',
  'Multi-source QBR data aggregation (Xero+Stripe+Hubspot+Intercom+GitHub), cross-system reconciliation, insight generation, stakeholder-specific deck variants, and sequenced distribution',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "RECONCILE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "RECONCILE", "on": "computed"},
      {"from": "RECONCILE", "to": "POLICY_CHECK", "on": "reconciled"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "cfo_review_required"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"},
      {"from": "ESCALATE", "to": "COMPLETE", "on": "escalated"}
    ]
  }',
  '[
    {"id": "board_cfo_review", "condition": "deck_type === board && !cfo_reviewed", "action": "block", "level": "cfo", "description": "Board deck with financial projections must be reviewed by CFO before distribution. Mark as DRAFT until reviewed."},
    {"id": "customer_anonymization", "condition": "deck_type === all_hands && contains_customer_name", "action": "block", "level": "manager", "description": "All-hands deck must anonymize customer names (replace with Enterprise Customer A etc.) without explicit permission"},
    {"id": "confidential_marking", "condition": "deck_type === leadership && !marked_confidential", "action": "block", "level": "manager", "description": "Leadership deck with competitive analysis must be marked CONFIDENTIAL — INTERNAL ONLY"},
    {"id": "distribution_sequencing", "condition": "notification_sent && !deck_created", "action": "block", "level": "manager", "description": "Distribution must happen AFTER deck is confirmed created. Board deck scheduled 48h before meeting."},
    {"id": "revenue_reconciliation", "condition": "revenue_discrepancy_pct > 5", "action": "escalate", "level": "cfo", "description": "Revenue discrepancy >5% between systems must be explained and reconciled before QBR — do NOT report two different numbers without explanation"}
  ]',
  true
WHERE NOT EXISTS (SELECT 1 FROM bpaas_process_definitions WHERE process_type = 'qbr_preparation' AND organization_id IS NULL);
