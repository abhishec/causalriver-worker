/**
 * Pharmaceutical & Healthcare Training Packs
 *
 * Drug development lifecycle and healthcare business models:
 * - Drug Development Pipeline & Clinical Trials
 * - Healthcare Business Models & Payer Dynamics
 * - Biotech Investment & Portfolio Strategy
 *
 * Sources: FDA approval data, PhRMA industry reports, Tufts CSDD drug cost study,
 * McKinsey Healthcare, IQVIA Institute, Evaluate Pharma
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. DRUG DEVELOPMENT PIPELINE & CLINICAL TRIALS
// ============================================================================

const drugDevelopmentPipeline: TrainingPack = {
  id: 'drug-development-pipeline-clinical-trials',
  title: 'Drug Development — Phase Transitions, Attrition Rates, Cost Economics',
  source: 'FDA, Tufts CSDD ($2.6B per drug study), IQVIA Clinical Development Report, BIO Industry Analysis',
  industry: 'Pharmaceutical',
  domains: ['engineering', 'finance', 'strategy'],
  confidence: 0.85,
  tags: ['pharma', 'clinical-trial', 'fda', 'drug-pipeline', 'phase-transition', 'attrition', 'r&d'],

  causalChains: [
    // Preclinical success → Phase 1 entry → 10-15 year journey
    { source: 'engineering', target: 'engineering', metric: 'preclinical_to_phase1_transition', effectSize: 0.30, lagDays: 730, pValue: 0.001 },
    // Phase 2 attrition → portfolio value destruction → R&D write-off
    { source: 'engineering', target: 'finance', metric: 'phase2_failure_to_writeoff', effectSize: -0.55, lagDays: 365, pValue: 0.001 },
    // FDA approval → revenue ramp → patent clock starts
    { source: 'engineering', target: 'finance', metric: 'fda_approval_to_revenue_ramp', effectSize: 0.70, lagDays: 365, pValue: 0.001 },
    // Patent cliff → generic entry → 80-90% revenue decline
    { source: 'strategy', target: 'finance', metric: 'patent_cliff_to_revenue_decline', effectSize: -0.80, lagDays: 180, pValue: 0.001 },
    // R&D productivity decline → cost per NME increase → portfolio strategy shift
    { source: 'finance', target: 'strategy', metric: 'rd_productivity_decline_to_strategy_shift', effectSize: 0.45, lagDays: 365, pValue: 0.003 },
    // Real-world evidence → label expansion → revenue growth
    { source: 'engineering', target: 'finance', metric: 'rwe_to_label_expansion', effectSize: 0.35, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Pipeline Concentration Risk',
      entityType: 'pharma_company',
      when: { logic: 'AND', conditions: [
        { field: 'strategy.pipeline_drugs_phase3_plus', operator: 'less_than', value: 3 },
        { field: 'finance.top_drug_revenue_pct', operator: 'greater_than', value: 0.50 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'critical', message: 'Pipeline concentration risk: < 3 Phase 3+ candidates with > 50% revenue from top drug. Phase 3 failure rate: ~50%. Patent expiry averages 12-15 years from filing. If top drug faces generic competition or Phase 3 fails, revenue cliff is existential. Mitigation: licensing deals, acquisitions, platform technology for faster follow-on development.' } },
      ],
      naturalLanguage: 'Pharma companies dependent on a single blockbuster with thin late-stage pipeline face existential risk from patent cliffs and clinical failures.',
    },
  ],

  cascades: [
    { source: 'engineering', target: 'finance', type: 'impacts', severity: 'critical',
      keywords: { source: ['clinical-trial', 'phase-transition', 'fda-approval', 'nda-filing'], target: ['pipeline-value', 'npv', 'revenue-forecast', 'market-cap'] },
      reasonTemplate: 'Drug development economics: $2.6B average cost per approved drug (Tufts CSDD). Only 10-12% of drugs entering Phase 1 reach approval. Phase 2 is the "valley of death" with ~67% failure rate. A Phase 3 success typically creates $1-5B in NPV. A Phase 3 failure destroys $500M-2B in invested capital. Pipeline value accounts for 30-60% of large pharma market cap.' },
    { source: 'strategy', target: 'finance', type: 'triggers', severity: 'critical',
      keywords: { source: ['patent-expiry', 'generic-entry', 'biosimilar', 'loe'], target: ['revenue-cliff', 'margin-compression', 'market-share-loss'] },
      reasonTemplate: 'Patent cliffs are the most predictable risk in pharma: generic entry causes 80-90% revenue loss within 18 months for small molecules. Biosimilar erosion is slower (30-50% in year 1) but accelerating. The "patent cliff" forces constant R&D reinvestment or M&A to replace lost revenue.' },
  ],

  patterns: [
    { name: 'Clinical Trial Phase Economics', domains: ['finance', 'engineering'], description: 'Preclinical: $5-25M, 3-6 years. Phase 1 (safety): $15-30M, 1-2 years, success rate ~65%. Phase 2 (efficacy): $20-50M, 2-3 years, success rate ~33%. Phase 3 (pivotal): $50-200M, 2-4 years, success rate ~50%. FDA Review: $5-10M, 1-2 years, success rate ~85%. Total: 10-15 years, $2.6B average including failures.', observed: 90, expected: 20, total: 100 },
    { name: 'Pharma Business Model Metrics', domains: ['finance'], description: 'R&D as % of revenue: 15-25% (vs 10-15% tech). Gross margins: 70-85% for branded drugs. SG&A: 25-35% of revenue (large sales force). Peak sales timeline: 3-7 years post-launch. LOE (loss of exclusivity) revenue loss: 80-90% within 18 months. Price per prescription: avg $150 brand vs $15 generic.', observed: 88, expected: 20, total: 100 },
    { name: 'Drug Modality Evolution', domains: ['engineering', 'strategy'], description: 'Small molecule: traditional, oral bioavailability, generic-able. Biologics: larger, injected, biosimilar erosion slower. Gene therapy: one-time cure, extreme pricing ($1-3M). Cell therapy: CAR-T, personalized, manufacturing challenge. mRNA: COVID proved platform, oncology next. AI drug discovery: 30-50% faster lead identification, still early in clinical validation.', observed: 82, expected: 25, total: 100 },
  ],

  outcomes: [
    { metric: 'pipeline_npv', expectedChange: 0.20, timeframeDays: 365, condition: 'phase2_data_positive AND regulatory_path_clear' },
    { metric: 'revenue_sustainability', expectedChange: 0.15, timeframeDays: 1095, condition: 'patent_portfolio_diversified AND pipeline_broad' },
  ],

  narrative: `Drug development is the highest-risk, highest-reward business model: $2.6B average cost per approved drug, 10-15 year timelines, and only 10-12% of Phase 1 candidates reach market. Phase 2 is the "valley of death" with ~67% failure rate. Yet successful drugs generate extraordinary returns — blockbusters produce $5-50B+ in cumulative revenue. The patent cliff is pharma's existential challenge: generic entry causes 80-90% revenue loss within 18 months. This forces a perpetual R&D reinvestment cycle or M&A acquisition strategy. Drug modalities are evolving from small molecules to biologics, gene therapy, and AI-accelerated discovery, each with different economics and risk profiles.`,
};

// ============================================================================
// 2. HEALTHCARE BUSINESS MODELS & PAYER DYNAMICS
// ============================================================================

const healthcareBusinessModels: TrainingPack = {
  id: 'healthcare-business-models-payer-dynamics',
  title: 'Healthcare Business Models — Payer Mix, Value-Based Care, Digital Health',
  source: 'CMS Medicare data, McKinsey Healthcare, KFF Health Tracker, Rock Health Digital Health',
  industry: 'Healthcare',
  domains: ['finance', 'strategy', 'product', 'cs'],
  confidence: 0.83,
  tags: ['healthcare', 'payer', 'value-based-care', 'digital-health', 'reimbursement', 'medicare', 'telehealth'],

  causalChains: [
    // Payer mix shift → reimbursement pressure → margin compression
    { source: 'finance', target: 'finance', metric: 'payer_mix_to_reimbursement_rate', effectSize: -0.40, lagDays: 365, pValue: 0.002 },
    // Value-based care adoption → outcome improvement → shared savings
    { source: 'strategy', target: 'finance', metric: 'vbc_adoption_to_shared_savings', effectSize: 0.35, lagDays: 365, pValue: 0.005 },
    // Digital health engagement → care gap closure → quality score improvement
    { source: 'product', target: 'cs', metric: 'digital_health_to_care_gap_closure', effectSize: 0.40, lagDays: 180, pValue: 0.003 },
    // Provider shortage → access bottleneck → patient experience decline
    { source: 'strategy', target: 'cs', metric: 'provider_shortage_to_access_bottleneck', effectSize: -0.45, lagDays: 365, pValue: 0.002 },
    // Regulatory change → compliance cost → margin impact
    { source: 'strategy', target: 'finance', metric: 'regulatory_change_to_compliance_cost', effectSize: -0.30, lagDays: 365, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Fee-for-Service Dependency Risk',
      entityType: 'healthcare_organization',
      when: { logic: 'AND', conditions: [
        { field: 'finance.ffs_revenue_pct', operator: 'greater_than', value: 0.80 },
        { field: 'strategy.vbc_contracts', operator: 'less_than', value: 3 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 80% FFS revenue with minimal VBC contracts. CMS target: 100% of Medicare in VBC arrangements by 2030. Private payers following. FFS rewards volume, VBC rewards value. Organizations slow to transition face: declining reimbursement, exclusion from networks, inability to compete. Start with shared savings (downside risk-free) before full capitation.' } },
      ],
      naturalLanguage: 'Fee-for-service healthcare is being phased out. Organizations dependent on volume-based reimbursement face structural revenue decline as payers shift to value-based models.',
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'impacts', severity: 'high',
      keywords: { source: ['value-based-care', 'capitation', 'shared-savings', 'bundled-payment'], target: ['reimbursement', 'margin', 'revenue-model', 'risk-sharing'] },
      reasonTemplate: 'Healthcare reimbursement is shifting from fee-for-service (pay per procedure) to value-based care (pay for outcomes). VBC spectrum: shared savings (lowest risk) → bundled payments → capitation (full risk). CMS goal: 100% of Medicare beneficiaries in VBC by 2030. Early VBC adopters (Kaiser, Intermountain) achieve 15-20% lower costs with equal or better outcomes.' },
  ],

  patterns: [
    { name: 'Healthcare Revenue Model Spectrum', domains: ['finance', 'strategy'], description: 'Fee-for-Service: pay per procedure, volume-incentivized. Shared Savings: baseline cost target, split savings. Bundled Payments: fixed per episode (joint replacement, cardiac). Capitation: fixed per patient per month, provider bears full risk. Direct Primary Care: subscription model, bypasses insurance. Cash-pay: self-pay, transparent pricing.', observed: 85, expected: 25, total: 100 },
    { name: 'Digital Health Adoption Curve', domains: ['product', 'strategy'], description: 'Telehealth: 38x surge in COVID, stabilized at 15-20% of visits. Remote patient monitoring: 30M+ patients by 2025. AI diagnostics: radiology and pathology leading. Mental health digital: fastest growing segment. Barriers: reimbursement parity, licensure across states, elderly digital literacy. Funded by VC: $15B+ annually (Rock Health).', observed: 80, expected: 30, total: 100 },
  ],

  outcomes: [
    { metric: 'care_cost_reduction', expectedChange: -0.15, timeframeDays: 365, condition: 'vbc_model_implemented AND digital_health_engagement_above_40pct' },
    { metric: 'quality_score_improvement', expectedChange: 0.10, timeframeDays: 365, condition: 'care_coordination_platform AND provider_alignment' },
  ],

  narrative: `Healthcare is transitioning from fee-for-service (volume) to value-based care (outcomes). CMS aims for 100% of Medicare in VBC by 2030, and private payers are following. The VBC spectrum ranges from low-risk shared savings to full capitation where providers bear complete financial risk. Digital health accelerated during COVID — telehealth stabilized at 15-20% of visits, and remote patient monitoring reaches 30M+ patients. The provider shortage creates access bottlenecks, making technology-enabled care delivery essential. The organizations that thrive will be those that can manage population health risk while leveraging digital tools for efficient care delivery.`,
};

// ============================================================================
// EXPORTS
// ============================================================================

export const PHARMA_HEALTHCARE_PACKS: TrainingPack[] = [
  drugDevelopmentPipeline,
  healthcareBusinessModels,
];
