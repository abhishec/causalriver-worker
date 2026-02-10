/**
 * Supply Chain & Operations Training Packs
 *
 * Deep supply chain and operations knowledge:
 * - Bullwhip Effect & Demand Amplification
 * - Lean Manufacturing & JIT Systems
 * - Supply Disruption & Resilience
 * - Procurement Optimization
 *
 * Sources: MIT Supply Chain research, McKinsey Operations, APICS/ASCM frameworks
 */

import type {
  TrainingPack,
} from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// 1. BULLWHIP EFFECT & DEMAND AMPLIFICATION
// ============================================================================

const bullwhipEffect: TrainingPack = {
  id: 'bullwhip-effect-demand-amplification',
  title: 'Bullwhip Effect & Demand Signal Distortion',
  source: 'Lee et al. Bullwhip Effect research, MIT Supply Chain Lab, Forrester Effect studies',
  industry: 'Manufacturing & Retail',
  domains: ['strategy', 'finance', 'product'],
  confidence: 0.83,
  tags: ['bullwhip', 'demand-amplification', 'inventory', 'forecast', 'supply-chain'],

  causalChains: [
    { source: 'marketing', target: 'strategy', metric: 'demand_signal_to_order_amplification', effectSize: 0.60, lagDays: 14, pValue: 0.001 },
    { source: 'strategy', target: 'finance', metric: 'inventory_amplification_to_working_capital_drain', effectSize: -0.55, lagDays: 30, pValue: 0.002 },
    { source: 'strategy', target: 'strategy', metric: 'batch_ordering_to_demand_distortion', effectSize: 0.50, lagDays: 7, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'demand_visibility_to_inventory_optimization', effectSize: -0.45, lagDays: 30, pValue: 0.005 },
    { source: 'finance', target: 'strategy', metric: 'price_fluctuation_to_forward_buying', effectSize: 0.40, lagDays: 7, pValue: 0.005 },
    { source: 'engineering', target: 'strategy', metric: 'edi_integration_to_demand_transparency', effectSize: -0.45, lagDays: 14, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'Bullwhip Amplification Alert',
      entityType: 'supply_chain',
      when: { logic: 'AND', conditions: [
        { field: 'operations.order_variance_ratio', operator: 'greater_than', value: 2.0 },
        { field: 'operations.demand_variance_ratio', operator: 'less_than', value: 1.2 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Order variance is 2x+ demand variance — classic bullwhip amplification. Each upstream tier amplifies by 2-5x. Implement vendor-managed inventory (VMI) and demand sensing to reduce distortion.' } },
      ],
      naturalLanguage: 'When order variance significantly exceeds actual demand variance, the bullwhip effect is amplifying signals upstream, causing excess inventory and capital waste.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'marketing', target: 'finance', type: 'blocks', severity: 'high',
      keywords: { source: ['demand', 'forecast', 'order', 'promotion', 'batch'], target: ['inventory', 'working-capital', 'cash', 'waste'] },
      reasonTemplate: 'The bullwhip effect amplifies demand signals upstream: a 5% retail demand change can create 40% swings at the supplier level. This distortion ties up 20-30% more working capital than necessary.' },
  ],

  patterns: [
    { name: 'Demand Amplification Cascade', domains: ['strategy', 'finance'], description: 'The bullwhip effect amplifies demand signals at each supply chain tier by 2-5x. A 10% retail demand increase becomes 20% at distributor, 40% at manufacturer, and 80% at raw materials. Four causes: demand forecast updating, order batching, price fluctuation, and rationing.', observed: 80, expected: 30, total: 100 },
    { name: 'VMI Bullwhip Dampening', domains: ['strategy'], description: 'Vendor-Managed Inventory (VMI) reduces bullwhip amplification by 30-50% by giving suppliers direct access to point-of-sale data. Walmart and P&G pioneered this approach, reducing inventory by 25% while improving fill rates.', observed: 76, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'inventory_reduction', predictedConfidence: 0.75, actual: 'inventory_reduced', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
    { predicted: 'demand_stability', predictedConfidence: 0.68, actual: 'demand_volatile', wasCorrect: false, sourceDomain: 'marketing', targetDomain: 'strategy' },
  ],

  narrative: 'The bullwhip effect is one of the most well-documented supply chain phenomena. First identified by Jay Forrester at MIT and formalized by Hau Lee at Stanford, it describes how small demand fluctuations at the consumer level get amplified dramatically as they propagate upstream. The four root causes — demand forecast updating, order batching, price fluctuations, and rationing/shortage gaming — each contribute to the amplification. Modern countermeasures include vendor-managed inventory, collaborative planning (CPFR), demand sensing with POS data, and reduction of order batching through EDI integration.',
};

// ============================================================================
// 2. LEAN MANUFACTURING & JIT
// ============================================================================

const leanManufacturing: TrainingPack = {
  id: 'lean-manufacturing-jit-systems',
  title: 'Lean Manufacturing, JIT & Toyota Production System',
  source: 'Toyota Production System, Lean Enterprise Institute, APICS body of knowledge',
  industry: 'Manufacturing',
  domains: ['strategy', 'finance', 'engineering'],
  confidence: 0.82,
  tags: ['lean', 'jit', 'tps', 'kaizen', 'kanban', 'waste-elimination'],

  causalChains: [
    { source: 'strategy', target: 'finance', metric: 'jit_to_inventory_cost_reduction', effectSize: -0.55, lagDays: 60, pValue: 0.002 },
    { source: 'strategy', target: 'strategy', metric: 'kaizen_to_continuous_improvement', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'waste_elimination_to_margin_improvement', effectSize: 0.50, lagDays: 90, pValue: 0.003 },
    { source: 'engineering', target: 'strategy', metric: 'kanban_to_flow_optimization', effectSize: 0.45, lagDays: 14, pValue: 0.005 },
    { source: 'strategy', target: 'strategy', metric: 'single_piece_flow_to_lead_time_reduction', effectSize: -0.50, lagDays: 30, pValue: 0.003 },
    { source: 'hr', target: 'strategy', metric: 'employee_empowerment_to_quality_improvement', effectSize: 0.40, lagDays: 60, pValue: 0.005 },
  ],

  businessRules: [
    {
      title: 'JIT Supply Risk Exposure',
      entityType: 'manufacturer',
      when: { logic: 'AND', conditions: [
        { field: 'operations.safety_stock_days', operator: 'less_than', value: 3 },
        { field: 'operations.single_source_components_pct', operator: 'greater_than', value: 0.30 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'JIT with < 3 days safety stock and 30%+ single-sourced components creates disruption vulnerability. While JIT reduces costs 25-50%, supply chain disruptions cost 3-5% of revenue. Balance efficiency with resilience.' } },
      ],
      naturalLanguage: 'Extreme JIT with minimal safety stock and concentrated suppliers creates fragility. Supply disruptions can halt production within days.',
      priority: 75,
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'enables', severity: 'high',
      keywords: { source: ['lean', 'jit', 'kanban', 'kaizen', 'waste'], target: ['cost', 'margin', 'inventory', 'efficiency'] },
      reasonTemplate: 'Lean manufacturing eliminates the 7 wastes (muda): overproduction, waiting, transport, processing, inventory, motion, defects. Toyota\'s TPS achieves 25-50% inventory reduction and 30-40% quality improvement through disciplined flow and pull systems.' },
  ],

  patterns: [
    { name: 'Seven Wastes Elimination', domains: ['strategy', 'finance'], description: 'Toyota\'s seven wastes framework identifies: overproduction (worst waste), waiting, transport, over-processing, excess inventory, unnecessary motion, and defects. Companies eliminating these achieve 20-40% cost reduction.', observed: 78, expected: 30, total: 100 },
    { name: 'Kanban Pull System', domains: ['strategy', 'engineering'], description: 'Kanban (pull-based production) reduces work-in-progress inventory by 30-60% compared to push systems. The visual signal system limits WIP, exposes bottlenecks, and enables continuous flow.', observed: 75, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'cost_reduction', predictedConfidence: 0.77, actual: 'costs_reduced', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
    { predicted: 'quality_improvement', predictedConfidence: 0.72, actual: 'quality_improved', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'strategy' },
  ],

  narrative: 'Lean manufacturing, rooted in the Toyota Production System (TPS), fundamentally changed global manufacturing. The core principle is eliminating waste (muda) in all forms: overproduction, waiting, transport, over-processing, inventory, motion, and defects. Just-In-Time (JIT) production ensures materials arrive exactly when needed, reducing inventory costs by 25-50%. Kanban visual signals create pull-based flow that limits work-in-progress and exposes constraints. Kaizen (continuous improvement) and Jidoka (automation with a human touch) form the two pillars of TPS. The Economic Order Quantity (EOQ) formula balances holding costs against ordering costs for optimal batch sizes.',
};

// ============================================================================
// 3. SUPPLY DISRUPTION & RESILIENCE
// ============================================================================

const supplyDisruption: TrainingPack = {
  id: 'supply-disruption-resilience',
  title: 'Supply Chain Disruption & Resilience Strategies',
  source: 'McKinsey Supply Chain Resilience 2023, MIT CTL, Gartner Supply Chain Research',
  industry: 'Cross-Industry',
  domains: ['strategy', 'finance', 'engineering'],
  confidence: 0.81,
  tags: ['disruption', 'resilience', 'risk', 'nearshoring', 'diversification'],

  causalChains: [
    { source: 'strategy', target: 'finance', metric: 'supply_disruption_to_revenue_loss', effectSize: -0.60, lagDays: 7, pValue: 0.001 },
    { source: 'strategy', target: 'strategy', metric: 'dual_sourcing_to_resilience', effectSize: 0.50, lagDays: 90, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'nearshoring_to_lead_time_reduction', effectSize: -0.40, lagDays: 180, pValue: 0.005 },
    { source: 'engineering', target: 'strategy', metric: 'digital_twin_to_disruption_prediction', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'strategy', target: 'finance', metric: 'strategic_stockpiling_to_buffer_cost', effectSize: 0.35, lagDays: 30, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Supply Chain Concentration Risk',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'operations.top_supplier_revenue_pct', operator: 'greater_than', value: 0.40 },
        { field: 'operations.supplier_geographic_concentration', operator: 'greater_than', value: 0.70 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'high', message: 'Over 40% revenue depends on top supplier with 70%+ geographic concentration. Supply chain disruptions cost companies 3-5% of revenue. Diversify suppliers and implement dual-sourcing for critical components.' } },
      ],
      naturalLanguage: 'When a single supplier controls 40%+ of supply and geographic concentration exceeds 70% in one region, a localized disruption can cascade into production shutdown.',
      priority: 85,
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'blocks', severity: 'critical',
      keywords: { source: ['disruption', 'shortage', 'supplier', 'logistics', 'port'], target: ['production', 'revenue', 'delivery', 'customer'] },
      reasonTemplate: 'Supply chain disruptions cascade rapidly: a single supplier failure can halt production within 48 hours, causing 3-5% annual revenue loss. The semiconductor shortage demonstrated how single-point failures propagate across industries.' },
  ],

  patterns: [
    { name: 'Disruption Cost Cascade', domains: ['strategy', 'finance'], description: 'Major supply chain disruptions cost companies 42% of one year\'s EBITDA on average. Companies with diversified supply bases recover 2x faster than concentrated ones. Geographic diversification reduces disruption probability by 30-50%.', observed: 79, expected: 30, total: 100 },
    { name: 'Nearshoring Resilience Trade-off', domains: ['strategy', 'finance'], description: 'Nearshoring reduces lead times by 40-60% but increases unit costs by 10-20%. Post-COVID, 60% of companies are reshoring or nearshoring critical components. The total cost equation includes disruption risk, not just unit cost.', observed: 74, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'disruption_recovery', predictedConfidence: 0.72, actual: 'recovered_slowly', wasCorrect: false, sourceDomain: 'strategy', targetDomain: 'finance' },
    { predicted: 'nearshoring_benefit', predictedConfidence: 0.70, actual: 'lead_time_improved', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'strategy' },
  ],

  narrative: 'Supply chain resilience became a board-level priority after COVID-19, the Suez Canal blockage, and the semiconductor shortage demonstrated the fragility of globalized supply chains. Companies must balance efficiency (JIT, single-sourcing, long-lead imports) with resilience (safety stock, dual-sourcing, nearshoring). The total cost of ownership must include disruption risk: a 3-5% annual revenue loss from supply disruption dwarfs the 10-20% unit cost savings from concentrated sourcing. Digital supply chain twins, real-time visibility platforms, and AI-powered demand sensing represent the technology frontier for disruption prediction and mitigation.',
};

// ============================================================================
// 4. PROCUREMENT OPTIMIZATION
// ============================================================================

const procurementOptimization: TrainingPack = {
  id: 'procurement-optimization-strategy',
  title: 'Strategic Procurement & Supplier Management',
  source: 'Kraljic Matrix, McKinsey Procurement, ISM Supply Management surveys',
  industry: 'Cross-Industry',
  domains: ['finance', 'strategy', 'engineering'],
  confidence: 0.80,
  tags: ['procurement', 'sourcing', 'supplier', 'cost-reduction', 'kraljic'],

  causalChains: [
    { source: 'finance', target: 'finance', metric: 'strategic_sourcing_to_cost_savings', effectSize: -0.50, lagDays: 90, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'supplier_consolidation_to_volume_leverage', effectSize: -0.40, lagDays: 60, pValue: 0.005 },
    { source: 'engineering', target: 'strategy', metric: 'eprocurement_to_process_efficiency', effectSize: 0.45, lagDays: 30, pValue: 0.005 },
    { source: 'strategy', target: 'strategy', metric: 'category_management_to_spend_visibility', effectSize: 0.50, lagDays: 60, pValue: 0.003 },
    { source: 'strategy', target: 'finance', metric: 'supplier_collaboration_to_innovation', effectSize: 0.35, lagDays: 180, pValue: 0.008 },
  ],

  businessRules: [
    {
      title: 'Maverick Spending Alert',
      entityType: 'company',
      when: { logic: 'AND', conditions: [
        { field: 'operations.off_contract_spend_pct', operator: 'greater_than', value: 0.25 },
      ]},
      then: [
        { type: 'trigger_alert', params: { severity: 'medium', message: 'Over 25% of spend is off-contract (maverick spending). Companies controlling maverick spend save 10-15% on procurement costs. Implement catalog enforcement and purchase order compliance.' } },
      ],
      naturalLanguage: 'Maverick spending (purchases outside negotiated contracts) above 25% indicates procurement process gaps that leak 10-15% in potential savings.',
      priority: 70,
    },
  ],

  cascades: [
    { source: 'strategy', target: 'finance', type: 'enables', severity: 'medium',
      keywords: { source: ['procurement', 'sourcing', 'supplier', 'contract', 'category'], target: ['savings', 'cost', 'margin', 'efficiency'] },
      reasonTemplate: 'Strategic procurement transforms purchasing from a cost center to a value driver. The Kraljic Matrix segments suppliers by profit impact and supply risk, enabling differentiated strategies that typically yield 8-15% cost savings.' },
  ],

  patterns: [
    { name: 'Kraljic Matrix Segmentation', domains: ['strategy', 'finance'], description: 'The Kraljic Matrix segments procurement into four quadrants: Strategic (high impact/high risk), Leverage (high impact/low risk), Bottleneck (low impact/high risk), Non-critical (low impact/low risk). Each quadrant requires a different supplier management strategy.', observed: 74, expected: 30, total: 100 },
    { name: 'E-Procurement Efficiency Gains', domains: ['engineering', 'strategy'], description: 'E-procurement platforms reduce purchase order processing costs by 60-80% (from $100+ to $20-30 per PO), improve compliance to 90%+, and provide spend visibility that enables further optimization.', observed: 72, expected: 30, total: 100 },
  ],

  outcomes: [
    { predicted: 'procurement_savings', predictedConfidence: 0.74, actual: 'savings_achieved', wasCorrect: true, sourceDomain: 'strategy', targetDomain: 'finance' },
    { predicted: 'compliance_improvement', predictedConfidence: 0.70, actual: 'compliance_improved', wasCorrect: true, sourceDomain: 'engineering', targetDomain: 'strategy' },
  ],

  narrative: 'Strategic procurement has evolved from a transactional cost center to a strategic value driver. The Kraljic Matrix provides the foundational framework for supplier segmentation, enabling companies to apply differentiated strategies: partnership for strategic suppliers, leverage for volume, diversification for bottleneck items, and automation for non-critical purchases. Best-in-class procurement organizations achieve 8-15% annual cost savings through category management, strategic sourcing events, supplier consolidation, and demand management. E-procurement platforms automate the transactional workload while providing the spend visibility needed for strategic analysis.',
};

// ============================================================================
// EXPORTS
// ============================================================================

export const SUPPLY_CHAIN_OPS_PACKS: TrainingPack[] = [
  bullwhipEffect,
  leanManufacturing,
  supplyDisruption,
  procurementOptimization,
];
