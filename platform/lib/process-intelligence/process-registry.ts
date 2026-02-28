import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// BPaaS process types — NEVER use these as se-aas domain names
// Domain prefix in RL/prediction_records MUST always be "bpaas.<processType>"
export const BPAAS_PROCESS_TYPES = [
  "hr_offboarding",
  "procurement",
  "order_management",
  "expense_approval",
  "customer_onboarding",
  // Tasks 4-10
  "insurance_claim",
  "invoice_reconciliation",
  "sla_breach_escalation",
  "travel_rebooking",
  "compliance_audit",
  "subscription_migration",
  "dispute_resolution",
  // Tasks 11-15
  "financial_close",
  "product_workflow",
  "ar_collections",
  "incident_response",
  "qbr_preparation",
] as const;

export type BPaaSProcessType = (typeof BPAAS_PROCESS_TYPES)[number];

export interface FSMTransition {
  from: string;
  to: string;
  on: string;
}

export interface ProcessDefinition {
  processType: BPaaSProcessType | string;
  name: string;
  description: string;
  initialState: string;
  states: string[];
  transitions: FSMTransition[];
  defaultPolicyRules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  condition: string; // e.g. "total_amount > 500"
  action: "require_approval" | "escalate" | "block";
  level: "manager" | "committee" | "hr" | "finance" | "legal" | "cfo" | "ciso";
  threshold?: number;
  description: string;
}

// Hardcoded fallback definitions (match the seeded DB templates)
const BUILTIN_DEFINITIONS: Record<string, ProcessDefinition> = {
  hr_offboarding: {
    processType: "hr_offboarding",
    name: "HR Employee Offboarding",
    description: "End-to-end employee offboarding process",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "SCHEDULE_NOTIFY",
      "COMPLETE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "pto_balance",
        condition: "pto_balance > 0",
        action: "require_approval",
        level: "manager",
        description: "Positive PTO balance requires manager sign-off",
      },
      {
        id: "severance",
        condition: "tenure_years > 2",
        action: "require_approval",
        level: "hr",
        description: "Severance for employees > 2 years requires HR approval",
      },
      {
        id: "equity",
        condition: "has_unvested_equity",
        action: "escalate",
        level: "legal",
        description: "Unvested equity requires legal review",
      },
    ],
  },
  procurement: {
    processType: "procurement",
    name: "Procurement Request",
    description: "Purchase order processing with approval routing",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "COMPLETE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "MUTATE", to: "COMPLETE", on: "mutated" },
    ],
    defaultPolicyRules: [
      {
        id: "amount_500",
        condition: "total_amount > 500",
        action: "require_approval",
        level: "manager",
        threshold: 500,
        description: "Purchases > $500 require manager approval",
      },
      {
        id: "amount_5000",
        condition: "total_amount > 5000",
        action: "require_approval",
        level: "committee",
        threshold: 5000,
        description: "Purchases > $5000 require committee approval",
      },
      {
        id: "new_vendor",
        condition: "vendor_is_new",
        action: "require_approval",
        level: "finance",
        description: "New vendors require finance vetting",
      },
    ],
  },
  order_management: {
    processType: "order_management",
    name: "Order Modification",
    description: "Customer order modification with refund/charge recalculation",
    initialState: "DECOMPOSE",
    states: [
      "DECOMPOSE",
      "ASSESS",
      "COMPUTE",
      "POLICY_CHECK",
      "APPROVAL_GATE",
      "MUTATE",
      "SCHEDULE_NOTIFY",
      "COMPLETE",
      "ESCALATE",
    ],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "requires_approval" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "escalated" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalation_complete" },
    ],
    defaultPolicyRules: [
      {
        id: "refund_100",
        condition: "refund_amount > 100",
        action: "require_approval",
        level: "manager",
        threshold: 100,
        description: "Refunds > $100 require manager approval",
      },
      {
        id: "price_delta_approval",
        condition: "price_delta > 0 && price_delta_pct > 10",
        action: "require_approval",
        level: "manager",
        threshold: 10,
        description: "Substitute item price increase > 10% requires manager approval before charging customer",
      },
      {
        id: "promo_gift_card_non_refundable",
        condition: "promo_gift_card_amount > 0 && is_refund",
        action: "require_approval",
        level: "manager",
        description: "Promotional gift card portion is non-refundable — customer receives store credit only, not cash refund",
      },
      {
        id: "gift_card_capacity",
        condition: "gift_card_balance_after < 0",
        action: "escalate",
        level: "finance",
        description: "Order total exceeds gift card balance — must collect remaining balance via alternate payment method",
      },
      {
        id: "gift_card_500_limit",
        condition: "gift_card_balance_after > 500",
        action: "escalate",
        level: "finance",
        threshold: 500,
        description: "Gift card balance cannot exceed $500 maximum — excess refund must be issued via original payment method",
      },
    ],
  },
  expense_approval: {
    processType: "expense_approval",
    name: "Expense Approval",
    description: "Employee expense claim processing with receipt validation and policy enforcement",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "COMPLETE", on: "mutated" },
    ],
    defaultPolicyRules: [
      {
        id: "expense_threshold",
        condition: "total_amount > 250",
        action: "require_approval",
        level: "manager",
        threshold: 250,
        description: "Expenses over $250 require manager approval",
      },
      {
        id: "missing_receipts",
        condition: "missing_receipts",
        action: "block",
        level: "finance",
        description: "Expenses without receipts must be blocked until receipts are submitted",
      },
      {
        id: "out_of_policy",
        condition: "is_out_of_policy",
        action: "escalate",
        level: "manager",
        description: "Out-of-policy expenses require manager escalation",
      },
    ],
  },
  customer_onboarding: {
    processType: "customer_onboarding",
    name: "Customer Onboarding",
    description: "New customer onboarding workflow with KYC, provisioning, and welcome communications",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "kyc_required",
        condition: "kyc_status !== 'verified'",
        action: "block",
        level: "finance",
        description: "KYC verification must be complete before account provisioning",
      },
      {
        id: "high_risk_country",
        condition: "country_risk_level === 'high'",
        action: "escalate",
        level: "manager",
        description: "High-risk country customers require compliance escalation",
      },
    ],
  },
  insurance_claim: {
    processType: "insurance_claim",
    name: "Insurance Claim Processing",
    description: "End-to-end insurance claim evaluation with coverage sublimits, rider application, fraud detection, and partial approval",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "FRAUD_REVIEW", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "FRAUD_REVIEW", on: "fraud_signals" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "FRAUD_REVIEW", to: "APPROVAL_GATE", on: "fraud_reviewed" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "escalated" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "filing_deadline",
        condition: "days_since_incident > 30 && !hospitalization_exception",
        action: "block",
        level: "manager",
        threshold: 30,
        description: "Claims filed >30 days after incident are blocked unless hospitalization grace period applies",
      },
      {
        id: "fraud_frequency",
        condition: "prior_claims_18m >= 2",
        action: "escalate",
        level: "manager",
        description: "Customers with 2+ claims in 18 months require frequency review (do NOT auto-deny)",
      },
      {
        id: "preauth_required",
        condition: "has_unpreauthorized_work",
        action: "require_approval",
        level: "manager",
        threshold: 0,
        description: "Expedited or non-preauthorized work requires manager review before inclusion in payout",
      },
      {
        id: "coverage_limit",
        condition: "claimed_amount > coverage_limit",
        action: "require_approval",
        level: "committee",
        description: "Claims exceeding coverage limit require committee review",
      },
    ],
  },
  invoice_reconciliation: {
    processType: "invoice_reconciliation",
    name: "Multi-Vendor Invoice Reconciliation",
    description: "Invoice matching against POs with duplicate detection, price variance checks, currency conversion, and early payment discounts",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "DUPLICATE_CHECK", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "DUPLICATE_CHECK", on: "computed" },
      { from: "DUPLICATE_CHECK", to: "POLICY_CHECK", on: "duplicates_resolved" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "variance_detected" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "COMPLETE", on: "mutated" },
    ],
    defaultPolicyRules: [
      {
        id: "price_variance_2pct",
        condition: "price_variance_pct > 2",
        action: "require_approval",
        level: "manager",
        threshold: 2,
        description: "Price variance >2% from PO requires manager approval",
      },
      {
        id: "duplicate_invoice",
        condition: "is_duplicate_from_related_entity",
        action: "block",
        level: "finance",
        description: "Duplicate invoices from related entities must be flagged and not paid",
      },
      {
        id: "fx_rate_variance",
        condition: "fx_rate_variance_pct > 2",
        action: "require_approval",
        level: "finance",
        threshold: 2,
        description: "FX rate deviation >2% from invoice-date rate requires finance approval",
      },
      {
        id: "po_overage",
        condition: "total_invoiced > po_amount",
        action: "require_approval",
        level: "manager",
        description: "Total invoiced amount exceeding PO value requires manager approval",
      },
    ],
  },
  sla_breach_escalation: {
    processType: "sla_breach_escalation",
    name: "SLA Breach Escalation",
    description: "SLA compliance monitoring with breach calculation, credit computation, quiet-hours notification scheduling, and cascading escalation",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "breach_confirmed" },
      { from: "POLICY_CHECK", to: "SCHEDULE_NOTIFY", on: "pre_breach_warning" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "quiet_hours",
        condition: "notification_hour >= 22 || notification_hour < 6",
        action: "escalate",
        level: "manager",
        description: "Notifications during quiet hours (10PM-6AM local time) must be queued for 6AM",
      },
      {
        id: "sla_breach_credit",
        condition: "counted_downtime_minutes > sla_threshold_minutes",
        action: "escalate",
        level: "ciso",
        description: "SLA breach triggers automatic credit calculation and CTO notification",
      },
      {
        id: "client_caused_exclusion",
        condition: "incident_root_cause === 'client'",
        action: "require_approval",
        level: "manager",
        description: "Client-caused downtime must be excluded from SLA calculation with manager confirmation",
      },
      {
        id: "pre_breach_warning",
        condition: "remaining_minutes_to_breach <= 5",
        action: "escalate",
        level: "manager",
        description: "Pre-breach warning when within 5 minutes of SLA threshold",
      },
    ],
  },
  travel_rebooking: {
    processType: "travel_rebooking",
    name: "Multi-Leg Travel Rebooking",
    description: "Complex travel itinerary modification with fare class rules, loyalty tier benefits, company travel policy enforcement, and downstream cancellation",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "policy_violation" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "policy_fail" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
    ],
    defaultPolicyRules: [
      {
        id: "business_class_policy",
        condition: "requested_class === 'business' && flight_duration_hours < 6",
        action: "require_approval",
        level: "manager",
        description: "Business class on domestic flights <6 hours requires VP pre-approval per company travel policy",
      },
      {
        id: "route_change_fee",
        condition: "is_route_change && fare_class === 'economy_saver'",
        action: "require_approval",
        level: "manager",
        threshold: 200,
        description: "Route changes on Economy Saver fare incur $200 change fee (loyalty tier waiver does NOT apply to route changes)",
      },
      {
        id: "non_refundable_cancel",
        condition: "is_cancellation && fare_class === 'economy_saver'",
        action: "require_approval",
        level: "manager",
        description: "Non-refundable fare cancellation: customer receives airline credit, not cash refund",
      },
      {
        id: "loyalty_credit_expiry",
        condition: "loyalty_tier === 'gold' && has_airline_credit",
        action: "require_approval",
        level: "manager",
        description: "Gold tier extends airline credit expiry from 12 to 18 months",
      },
    ],
  },
  compliance_audit: {
    processType: "compliance_audit",
    name: "Regulatory Compliance Audit",
    description: "KYC/AML compliance verification with document gap detection, PEP screening, remediation deadline assignment, and RM escalation",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "rm_missing" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "dl_requires_utility_bill",
        condition: "kyc_doc_type === 'drivers_license' && !has_utility_bill",
        action: "escalate",
        level: "manager",
        description: "Driver's license KYC requires both DL AND utility bill (unlike passport which is standalone)",
      },
      {
        id: "pep_potential_match",
        condition: "pep_screening_result === 'potential_match'",
        action: "escalate",
        level: "manager",
        description: "PEP potential match requires Enhanced Due Diligence (EDD) — NOT account freeze (freeze only for confirmed match)",
      },
      {
        id: "expired_doc_at_opening",
        condition: "doc_expired_after_account_opening",
        action: "require_approval",
        level: "manager",
        description: "Documents valid at account opening are currently OK — flag for next review cycle only, NOT as current gap",
      },
      {
        id: "missing_rm_escalation",
        condition: "assigned_rm_status === 'departed'",
        action: "escalate",
        level: "hr",
        description: "Missing/departed RM: must escalate remediation assignment to department head",
      },
      {
        id: "kyc_gap_deadline",
        condition: "has_kyc_gap",
        action: "require_approval",
        level: "manager",
        threshold: 30,
        description: "KYC gaps: 30-day remediation deadline from today",
      },
      {
        id: "pep_deadline",
        condition: "has_pep_gap",
        action: "require_approval",
        level: "manager",
        threshold: 14,
        description: "PEP screening gaps: 14-day remediation deadline (urgent)",
      },
    ],
  },
  subscription_migration: {
    processType: "subscription_migration",
    name: "Customer Subscription Migration",
    description: "Plan downgrade/upgrade with prorated refund calculation, feature conflict detection, compliance warnings, and multi-checkpoint confirmation",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "conflicts_found" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "compliance_conflict" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "all_conflicts_confirmed" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "seat_reduction_warning",
        condition: "new_plan_seats < active_users",
        action: "require_approval",
        level: "manager",
        description: "Plan migration would reduce available seats below current active user count — must deactivate excess users first",
      },
      {
        id: "storage_reduction_warning",
        condition: "new_plan_storage_gb < current_usage_gb",
        action: "require_approval",
        level: "manager",
        description: "Plan migration would exceed storage limit — must export/delete data before migration",
      },
      {
        id: "compliance_retention_conflict",
        condition: "new_plan_retention_days < compliance_required_retention_days",
        action: "escalate",
        level: "legal",
        description: "CRITICAL: Migration would put customer in violation of their own compliance requirements — STRONG warning required",
      },
      {
        id: "early_termination_fee",
        condition: "remaining_months > 0 && plan_type === 'annual'",
        action: "require_approval",
        level: "manager",
        threshold: 10,
        description: "Annual plan early termination: 10% fee on remaining value deducted from prorated refund",
      },
      {
        id: "data_export_before_migration",
        condition: "new_plan_storage_gb < current_usage_gb",
        action: "block",
        level: "manager",
        description: "Data export must complete before migration executes (order dependency)",
      },
    ],
  },
  dispute_resolution: {
    processType: "dispute_resolution",
    name: "Multi-Party Dispute Resolution",
    description: "E-commerce dispute handling with evidence review, buyer dispute frequency check, mandatory escalation for elevated-risk buyers, and transaction hold",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "EVIDENCE_REVIEW", "POLICY_CHECK", "APPROVAL_GATE", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "EVIDENCE_REVIEW", on: "computed" },
      { from: "EVIDENCE_REVIEW", to: "POLICY_CHECK", on: "evidence_reviewed" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "elevated_review_triggered" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "inconclusive_evidence" },
      { from: "POLICY_CHECK", to: "COMPLETE", on: "policy_pass" },
      { from: "APPROVAL_GATE", to: "COMPLETE", on: "resolved" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "dispute_frequency_elevated",
        condition: "buyer_disputes_12m > 5",
        action: "escalate",
        level: "manager",
        description: "Buyers with >5 disputes in 12 months require elevated review — agent CANNOT auto-resolve (must go to human reviewer)",
      },
      {
        id: "inconclusive_evidence",
        condition: "evidence_is_ambiguous",
        action: "require_approval",
        level: "manager",
        description: "Ambiguous evidence (e.g., color perception disputes) requires human review, not AI resolution",
      },
      {
        id: "transaction_hold",
        condition: "dispute_status === 'under_review'",
        action: "require_approval",
        level: "manager",
        description: "Transaction amount must be placed on hold (not refunded or released) pending resolution",
      },
      {
        id: "elevated_review_privacy",
        condition: "elevated_review_triggered",
        action: "escalate",
        level: "manager",
        description: "Do NOT disclose elevated review reason to buyer — privacy policy requires reason be hidden",
      },
    ],
  },
  financial_close: {
    processType: "financial_close",
    name: "Month-End Financial Close",
    description: "Month-end close: bank transaction reconciliation, P&L generation with revenue recognition, cash flow statement, and audit trail with suspense accounts",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "RECONCILE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "RECONCILE", on: "computed" },
      { from: "RECONCILE", to: "POLICY_CHECK", on: "reconciled" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "unidentified_transaction" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "disputed_transaction" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "MUTATE", to: "COMPLETE", on: "mutated" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "unidentified_wire_suspense",
        condition: "transaction_has_no_reference && amount > 1000",
        action: "escalate",
        level: "cfo",
        description: "Unidentified wire transfers >$1,000 must be booked to Suspense Account and escalated to CFO — do NOT guess the category",
      },
      {
        id: "annual_contract_deferral",
        condition: "invoice_type === 'annual_prepaid'",
        action: "require_approval",
        level: "finance",
        description: "Annual prepaid contracts: recognize only 1/12th as current revenue, defer 11/12ths to deferred revenue",
      },
      {
        id: "capex_not_opex",
        condition: "asset_purchase_amount > 2500",
        action: "require_approval",
        level: "finance",
        threshold: 2500,
        description: "Asset purchases >$2,500 must be capitalized (not expensed) — separate investing cash flow",
      },
      {
        id: "duplicate_stripe_charge",
        condition: "is_duplicate_payment_gateway_charge",
        action: "block",
        level: "finance",
        description: "Suspected duplicate payment gateway charges must be flagged as disputed, NOT expensed",
      },
      {
        id: "loan_payment_split",
        condition: "transaction_type === 'loan_repayment'",
        action: "require_approval",
        level: "finance",
        description: "Loan repayments must split principal (financing activity) vs interest (operating activity) — cannot book as single line",
      },
    ],
  },
  product_workflow: {
    processType: "product_workflow",
    name: "Product Story to Engineering Workflow",
    description: "PM brief to Confluence PRD to Jira epic decomposition to sprint allocation with capacity/dependency checks and stakeholder notifications",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "dependency_conflict" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "confluence_before_jira",
        condition: "jira_stories_created && !confluence_page_exists",
        action: "block",
        level: "manager",
        description: "Jira stories must NOT be created before the Confluence PRD exists (correct order: PRD then Epic then Stories)",
      },
      {
        id: "sprint_dependency_risk",
        condition: "story_depends_on_same_sprint_completion",
        action: "escalate",
        level: "manager",
        description: "Story dependencies on same-sprint completions are high-risk scheduling conflicts — must flag to sprint planner",
      },
      {
        id: "capacity_overflow",
        condition: "sprint_total_points > team_velocity",
        action: "require_approval",
        level: "manager",
        description: "Sprint points exceed team velocity — requires capacity rebalancing",
      },
      {
        id: "notifications_after_artifacts",
        condition: "notification_sent && !artifacts_created",
        action: "block",
        level: "manager",
        description: "Notifications (Slack, email) must be sent ONLY after Jira/Confluence artifacts are confirmed created",
      },
    ],
  },
  ar_collections: {
    processType: "ar_collections",
    name: "Accounts Receivable Collections Workflow",
    description: "AR aging analysis with 6-path collection routing: enterprise exemption, credit note application, payment plans, bank feed reconciliation, bankruptcy write-off, government term reclassification",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "POLICY_CHECK", on: "computed" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "active_enterprise_customer" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "payment_plan_requested" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "enterprise_no_collections",
        condition: "customer_status === 'active_enterprise' && contract_renewal_within_months <= 6",
        action: "escalate",
        level: "manager",
        description: "Active enterprise customers with renewal within 6 months: do NOT send to collections — escalate to Account Executive for personal contact",
      },
      {
        id: "credit_note_first",
        condition: "has_unapplied_credit_note",
        action: "require_approval",
        level: "finance",
        description: "Unapplied credit notes must be applied before pursuing collection — reduces net owed amount",
      },
      {
        id: "payment_plan_threshold",
        condition: "outstanding_amount > 2000 && customer_payment_plan_requested",
        action: "require_approval",
        level: "manager",
        threshold: 2000,
        description: "Payment plans available for amounts >$2,000 if no prior defaults. Max 6 monthly installments at 1.5%/month interest.",
      },
      {
        id: "bankruptcy_writeoff",
        condition: "customer_bankruptcy_status === 'filed'",
        action: "require_approval",
        level: "finance",
        description: "Customers with active bankruptcy filing: immediately write off receivable as bad debt",
      },
      {
        id: "government_terms",
        condition: "customer_entity_type === 'government'",
        action: "require_approval",
        level: "manager",
        description: "Government entities have Net 90 payment terms (not Net 30) — recalculate aging bucket before any collection action",
      },
      {
        id: "check_bank_feed_first",
        condition: "invoice_age_days >= 90",
        action: "require_approval",
        level: "finance",
        description: "For all 90+ day invoices: check bank feed for unposted payments before initiating collection action",
      },
    ],
  },
  incident_response: {
    processType: "incident_response",
    name: "IT Incident Response & Post-Mortem",
    description: "Production incident triage, root cause analysis with causal chain reasoning, remediation decision with PCI/security constraints, change request, and blameless post-mortem",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "RCA", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "RCA", on: "computed" },
      { from: "RCA", to: "POLICY_CHECK", on: "rca_complete" },
      { from: "POLICY_CHECK", to: "APPROVAL_GATE", on: "two_person_approval_required" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "security_conflict" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "APPROVAL_GATE", to: "MUTATE", on: "approved" },
      { from: "APPROVAL_GATE", to: "ESCALATE", on: "rejected" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "payment_key_two_person",
        condition: "change_type === 'payment_credential' || change_type === 'api_key'",
        action: "require_approval",
        level: "ciso",
        description: "PCI compliance: payment API key changes require 2-person approval (primary + secondary approver). Agent CANNOT execute alone.",
      },
      {
        id: "cve_version_constraint",
        condition: "proposed_rollback_has_known_cve",
        action: "block",
        level: "ciso",
        description: "Cannot rollback to a version with a known CVE — security policy prohibits vulnerable version deployment",
      },
      {
        id: "p1_sla",
        condition: "incident_severity === 'P1'",
        action: "escalate",
        level: "manager",
        threshold: 60,
        description: "P1 incidents: 1-hour SLA to resolve. Auto-escalate if approaching SLA breach.",
      },
      {
        id: "blameless_postmortem",
        condition: "postmortem_contains_individual_blame",
        action: "block",
        level: "manager",
        description: "Post-mortem must be blameless — individual names must not appear in blame context. Focus on system gaps.",
      },
    ],
  },
  qbr_preparation: {
    processType: "qbr_preparation",
    name: "Quarterly Business Review Preparation",
    description: "Multi-source QBR data aggregation (Xero+Stripe+Hubspot+Intercom+GitHub), cross-system reconciliation, insight generation, stakeholder-specific deck variants, and sequenced distribution",
    initialState: "DECOMPOSE",
    states: ["DECOMPOSE", "ASSESS", "COMPUTE", "RECONCILE", "POLICY_CHECK", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE", "ESCALATE"],
    transitions: [
      { from: "DECOMPOSE", to: "ASSESS", on: "decomposed" },
      { from: "ASSESS", to: "COMPUTE", on: "assessed" },
      { from: "COMPUTE", to: "RECONCILE", on: "computed" },
      { from: "RECONCILE", to: "POLICY_CHECK", on: "reconciled" },
      { from: "POLICY_CHECK", to: "ESCALATE", on: "cfo_review_required" },
      { from: "POLICY_CHECK", to: "MUTATE", on: "policy_pass" },
      { from: "MUTATE", to: "SCHEDULE_NOTIFY", on: "mutated" },
      { from: "SCHEDULE_NOTIFY", to: "COMPLETE", on: "notified" },
      { from: "ESCALATE", to: "COMPLETE", on: "escalated" },
    ],
    defaultPolicyRules: [
      {
        id: "board_cfo_review",
        condition: "deck_type === 'board' && !cfo_reviewed",
        action: "block",
        level: "cfo",
        description: "Board deck with financial projections must be reviewed by CFO before distribution. Mark as DRAFT until reviewed.",
      },
      {
        id: "customer_anonymization",
        condition: "deck_type === 'all_hands' && contains_customer_name",
        action: "block",
        level: "manager",
        description: "All-hands deck must anonymize customer names (replace with 'Enterprise Customer A', etc.) without explicit permission",
      },
      {
        id: "confidential_marking",
        condition: "deck_type === 'leadership' && !marked_confidential",
        action: "block",
        level: "manager",
        description: "Leadership deck with competitive analysis must be marked CONFIDENTIAL — INTERNAL ONLY",
      },
      {
        id: "distribution_sequencing",
        condition: "notification_sent && !deck_created",
        action: "block",
        level: "manager",
        description: "Distribution must happen AFTER deck is confirmed created. Board deck scheduled 48h before meeting.",
      },
      {
        id: "revenue_reconciliation",
        condition: "revenue_discrepancy_pct > 5",
        action: "escalate",
        level: "cfo",
        description: "Revenue discrepancy >5% between systems must be explained and reconciled before QBR — do NOT report two different numbers without explanation",
      },
    ],
  },
};

/**
 * Get process definition — tries DB first, falls back to builtin.
 * DB templates can override/extend builtins for org-specific customization.
 */
export async function getProcessDefinition(
  processType: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<ProcessDefinition> {
  try {
    const { data } = await supabase
      .from("bpaas_process_definitions")
      .select("fsm_definition, policy_rules, name, description")
      .eq("process_type", processType)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("organization_id", { nullsFirst: false }) // org-specific first
      .limit(1)
      .single();

    if (data?.fsm_definition) {
      const fsmDef = data.fsm_definition as {
        initial_state: string;
        states: string[];
        transitions: FSMTransition[];
      };
      return {
        processType,
        name: data.name as string,
        description: data.description as string,
        initialState: fsmDef.initial_state,
        states: fsmDef.states,
        transitions: fsmDef.transitions,
        defaultPolicyRules: (data.policy_rules as PolicyRule[]) ?? [],
      };
    }
  } catch (err) {
    logger.warn("[BPaaS/ProcessRegistry] DB lookup failed, using builtin", {
      processType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const builtin = BUILTIN_DEFINITIONS[processType];
  if (!builtin) {
    throw new Error(
      `Unknown BPaaS process type: ${processType}. Valid types: ${BPAAS_PROCESS_TYPES.join(", ")}`
    );
  }
  return builtin;
}

export function isBPaaSProcessType(value: string): value is BPaaSProcessType {
  return BPAAS_PROCESS_TYPES.includes(value as BPaaSProcessType);
}

/** RL domain prefix — always "bpaas.<processType>" */
export function bpaasDomain(processType: string): string {
  return `bpaas.${processType}`;
}
