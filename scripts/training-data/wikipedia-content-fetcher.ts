/**
 * Wikipedia Content Fetcher — Extracts Real Knowledge from Wikipedia Articles
 *
 * Unlike the pageview fetcher (which only gets view counts), this module
 * extracts ACTUAL ARTICLE CONTENT from Wikipedia's free REST API and
 * converts it into structured signals and training data.
 *
 * Covers:
 * - Venture Capital & Startup metrics
 * - Company financials & business models
 * - Software engineering best practices
 * - Business strategy & case studies
 * - Economics & finance concepts
 * - Industry verticals (fintech, healthtech, etc.)
 *
 * API: https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *      https://en.wikipedia.org/w/api.php?action=parse (for full content)
 *
 * Free, no auth required, ~200 req/period limit.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WikiArticleContent {
  title: string;
  extract: string;         // Plain text summary (1-3 paragraphs)
  description?: string;    // Short Wikidata description
  categories: string[];    // Article categories
  links: string[];         // Internal wiki links (related concepts)
  sections: WikiSection[]; // Parsed section headings + content
  infobox: Record<string, string>; // Parsed infobox key-value data
  fetchedAt: Date;
  domain: string;          // NexusBrain domain classification
  subDomain: string;       // More specific classification
}

export interface WikiSection {
  title: string;
  level: number;
  content: string;
}

export interface WikiKnowledgeSignal {
  article: string;
  domain: string;
  subDomain: string;
  signalType: string;
  concept: string;
  description: string;
  relatedConcepts: string[];
  confidence: number;
  metadata: Record<string, any>;
}

// ============================================================================
// ARTICLE CATALOG — Comprehensive coverage across all domains
// ============================================================================

export const WIKIPEDIA_KNOWLEDGE_CATALOG: Array<{
  title: string;
  domain: string;
  subDomain: string;
}> = [
  // ═══════════════════════════════════════════════════════════════════════════
  // VENTURE CAPITAL & STARTUP METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Venture_capital', domain: 'finance', subDomain: 'vc' },
  { title: 'Angel_investor', domain: 'finance', subDomain: 'vc' },
  { title: 'Series_A_round', domain: 'finance', subDomain: 'vc' },
  { title: 'Seed_money', domain: 'finance', subDomain: 'vc' },
  { title: 'Unicorn_(finance)', domain: 'finance', subDomain: 'vc' },
  { title: 'Startup_company', domain: 'finance', subDomain: 'vc' },
  { title: 'Initial_public_offering', domain: 'finance', subDomain: 'vc' },
  { title: 'Convertible_note', domain: 'finance', subDomain: 'vc' },
  { title: 'Pre-money_valuation', domain: 'finance', subDomain: 'vc' },
  { title: 'Post-money_valuation', domain: 'finance', subDomain: 'vc' },
  { title: 'Capitalization_table', domain: 'finance', subDomain: 'vc' },
  { title: 'Term_sheet', domain: 'finance', subDomain: 'vc' },
  { title: 'Liquidation_preference', domain: 'finance', subDomain: 'vc' },
  { title: 'Anti-dilution_provision', domain: 'finance', subDomain: 'vc' },
  { title: 'Burn_rate', domain: 'finance', subDomain: 'vc' },
  { title: 'Runway_(finance)', domain: 'finance', subDomain: 'vc' },
  { title: 'Private_equity', domain: 'finance', subDomain: 'vc' },
  { title: 'SPAC', domain: 'finance', subDomain: 'vc' },
  { title: 'Carried_interest', domain: 'finance', subDomain: 'vc' },
  { title: 'Due_diligence', domain: 'finance', subDomain: 'vc' },
  { title: 'Pitch_deck', domain: 'finance', subDomain: 'vc' },
  { title: 'Mezzanine_capital', domain: 'finance', subDomain: 'vc' },
  { title: 'Growth_equity', domain: 'finance', subDomain: 'vc' },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY FINANCIALS & BUSINESS MODELS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Revenue', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Gross_margin', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Operating_margin', domain: 'finance', subDomain: 'company-financials' },
  { title: 'EBITDA', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Free_cash_flow', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Return_on_equity', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Return_on_investment', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Price%E2%80%93earnings_ratio', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Earnings_per_share', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Working_capital', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Balance_sheet', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Income_statement', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Cash_flow_statement', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Annual_recurring_revenue', domain: 'finance', subDomain: 'saas-metrics' },
  { title: 'Monthly_recurring_revenue', domain: 'finance', subDomain: 'saas-metrics' },
  { title: 'Customer_lifetime_value', domain: 'finance', subDomain: 'saas-metrics' },
  { title: 'Customer_acquisition_cost', domain: 'finance', subDomain: 'saas-metrics' },
  { title: 'Churn_rate', domain: 'finance', subDomain: 'saas-metrics' },
  { title: 'Net_promoter_score', domain: 'cs', subDomain: 'saas-metrics' },
  { title: 'Revenue_recognition', domain: 'finance', subDomain: 'company-financials' },
  { title: 'Unit_economics', domain: 'finance', subDomain: 'saas-metrics' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SaaS & SUBSCRIPTION BUSINESS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Software_as_a_service', domain: 'product', subDomain: 'saas' },
  { title: 'Platform_as_a_service', domain: 'engineering', subDomain: 'saas' },
  { title: 'Infrastructure_as_a_service', domain: 'engineering', subDomain: 'saas' },
  { title: 'Multi-tenancy', domain: 'engineering', subDomain: 'saas' },
  { title: 'Subscription_business_model', domain: 'finance', subDomain: 'saas' },
  { title: 'Freemium', domain: 'marketing', subDomain: 'saas' },
  { title: 'Product-led_growth', domain: 'product', subDomain: 'saas' },
  { title: 'Customer_success', domain: 'cs', subDomain: 'saas' },
  { title: 'Land_and_expand', domain: 'marketing', subDomain: 'saas' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR TECH COMPANIES (Financial & Business Data)
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Apple_Inc.', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Microsoft', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Alphabet_Inc.', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Amazon_(company)', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Meta_Platforms', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Nvidia', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Tesla,_Inc.', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Salesforce', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Snowflake_Inc.', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Stripe_(company)', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Shopify', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Palantir_Technologies', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Datadog', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Twilio', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'HubSpot', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Atlassian', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'ServiceNow', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'Workday_(company)', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'CrowdStrike', domain: 'finance', subDomain: 'tech-companies' },
  { title: 'MongoDB_Inc.', domain: 'finance', subDomain: 'tech-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOFTWARE ENGINEERING BEST PRACTICES
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Agile_software_development', domain: 'engineering', subDomain: 'practices' },
  { title: 'Scrum_(software_development)', domain: 'engineering', subDomain: 'practices' },
  { title: 'Kanban_(development)', domain: 'engineering', subDomain: 'practices' },
  { title: 'DevOps', domain: 'engineering', subDomain: 'practices' },
  { title: 'Continuous_integration', domain: 'engineering', subDomain: 'practices' },
  { title: 'Continuous_delivery', domain: 'engineering', subDomain: 'practices' },
  { title: 'Test-driven_development', domain: 'engineering', subDomain: 'practices' },
  { title: 'Code_review', domain: 'engineering', subDomain: 'practices' },
  { title: 'Technical_debt', domain: 'engineering', subDomain: 'practices' },
  { title: 'Software_architecture', domain: 'engineering', subDomain: 'practices' },
  { title: 'Microservices', domain: 'engineering', subDomain: 'practices' },
  { title: 'Monolithic_application', domain: 'engineering', subDomain: 'practices' },
  { title: 'Design_pattern', domain: 'engineering', subDomain: 'practices' },
  { title: 'SOLID', domain: 'engineering', subDomain: 'practices' },
  { title: 'Don%27t_repeat_yourself', domain: 'engineering', subDomain: 'practices' },
  { title: 'Pair_programming', domain: 'engineering', subDomain: 'practices' },
  { title: 'Refactoring', domain: 'engineering', subDomain: 'practices' },
  { title: 'Software_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Site_reliability_engineering', domain: 'engineering', subDomain: 'practices' },
  { title: 'Infrastructure_as_code', domain: 'engineering', subDomain: 'practices' },
  { title: 'Twelve-Factor_App_methodology', domain: 'engineering', subDomain: 'practices' },
  { title: 'Feature_toggle', domain: 'engineering', subDomain: 'practices' },
  { title: 'A/B_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Observability_(software)', domain: 'engineering', subDomain: 'practices' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOFTWARE BUGS & QUALITY
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Software_bug', domain: 'engineering', subDomain: 'quality' },
  { title: 'Race_condition', domain: 'engineering', subDomain: 'quality' },
  { title: 'Memory_leak', domain: 'engineering', subDomain: 'quality' },
  { title: 'Buffer_overflow', domain: 'engineering', subDomain: 'quality' },
  { title: 'Null_pointer', domain: 'engineering', subDomain: 'quality' },
  { title: 'Deadlock', domain: 'engineering', subDomain: 'quality' },
  { title: 'Regression_testing', domain: 'engineering', subDomain: 'quality' },
  { title: 'Software_quality_assurance', domain: 'engineering', subDomain: 'quality' },
  { title: 'Mean_time_to_repair', domain: 'engineering', subDomain: 'quality' },
  { title: 'Service-level_agreement', domain: 'engineering', subDomain: 'quality' },
  { title: 'Incident_management', domain: 'engineering', subDomain: 'quality' },
  { title: 'Root_cause_analysis', domain: 'engineering', subDomain: 'quality' },
  { title: 'Software_deployment', domain: 'engineering', subDomain: 'quality' },
  { title: 'Canary_release', domain: 'engineering', subDomain: 'quality' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS STRATEGY (Harvard Business School concepts)
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Porter%27s_five_forces_analysis', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Competitive_advantage', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Value_chain', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Blue_Ocean_Strategy', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Disruptive_innovation', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'First-mover_advantage', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Network_effect', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Platform_economy', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Switching_cost', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Barriers_to_entry', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Market_segmentation', domain: 'marketing', subDomain: 'frameworks' },
  { title: 'Product-market_fit', domain: 'product', subDomain: 'frameworks' },
  { title: 'Lean_startup', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Minimum_viable_product', domain: 'product', subDomain: 'frameworks' },
  { title: 'Business_model_canvas', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Growth_hacking', domain: 'marketing', subDomain: 'frameworks' },
  { title: 'Flywheel_(business)', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Economies_of_scale', domain: 'finance', subDomain: 'frameworks' },
  { title: 'Economies_of_scope', domain: 'finance', subDomain: 'frameworks' },
  { title: 'The_Innovator%27s_Dilemma', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Crossing_the_Chasm', domain: 'marketing', subDomain: 'frameworks' },
  { title: 'Technology_adoption_life_cycle', domain: 'marketing', subDomain: 'frameworks' },
  { title: 'SWOT_analysis', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'OKR', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Balanced_scorecard', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'BCG_matrix', domain: 'strategy', subDomain: 'frameworks' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MERGERS & ACQUISITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Mergers_and_acquisitions', domain: 'finance', subDomain: 'ma' },
  { title: 'Leveraged_buyout', domain: 'finance', subDomain: 'ma' },
  { title: 'Management_buyout', domain: 'finance', subDomain: 'ma' },
  { title: 'Hostile_takeover', domain: 'finance', subDomain: 'ma' },
  { title: 'Synergy', domain: 'finance', subDomain: 'ma' },
  { title: 'Earnout', domain: 'finance', subDomain: 'ma' },
  { title: 'Corporate_spin-off', domain: 'finance', subDomain: 'ma' },
  { title: 'Acqui-hiring', domain: 'hr', subDomain: 'ma' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ECONOMICS & MACROECONOMICS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Gross_domestic_product', domain: 'finance', subDomain: 'economics' },
  { title: 'Inflation', domain: 'finance', subDomain: 'economics' },
  { title: 'Interest_rate', domain: 'finance', subDomain: 'economics' },
  { title: 'Federal_Reserve', domain: 'finance', subDomain: 'economics' },
  { title: 'Yield_curve', domain: 'finance', subDomain: 'economics' },
  { title: 'Economic_recession', domain: 'finance', subDomain: 'economics' },
  { title: 'Business_cycle', domain: 'finance', subDomain: 'economics' },
  { title: 'Supply_and_demand', domain: 'finance', subDomain: 'economics' },
  { title: 'Monetary_policy', domain: 'finance', subDomain: 'economics' },
  { title: 'Fiscal_policy', domain: 'finance', subDomain: 'economics' },
  { title: 'Quantitative_easing', domain: 'finance', subDomain: 'economics' },
  { title: 'Consumer_Price_Index', domain: 'finance', subDomain: 'economics' },
  { title: 'Unemployment', domain: 'finance', subDomain: 'economics' },
  { title: 'Stock_market', domain: 'finance', subDomain: 'economics' },
  { title: 'Bond_market', domain: 'finance', subDomain: 'economics' },
  { title: 'Exchange_rate', domain: 'finance', subDomain: 'economics' },
  { title: 'Market_capitalization', domain: 'finance', subDomain: 'economics' },

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRY VERTICALS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Fintech', domain: 'finance', subDomain: 'verticals' },
  { title: 'Health_technology', domain: 'product', subDomain: 'verticals' },
  { title: 'E-commerce', domain: 'marketing', subDomain: 'verticals' },
  { title: 'Edtech', domain: 'product', subDomain: 'verticals' },
  { title: 'Proptech', domain: 'product', subDomain: 'verticals' },
  { title: 'Insurtech', domain: 'finance', subDomain: 'verticals' },
  { title: 'Regtech', domain: 'finance', subDomain: 'verticals' },
  { title: 'Legaltech', domain: 'product', subDomain: 'verticals' },
  { title: 'Martech', domain: 'marketing', subDomain: 'verticals' },
  { title: 'Agritech', domain: 'product', subDomain: 'verticals' },
  { title: 'Cleantech', domain: 'product', subDomain: 'verticals' },
  { title: 'Foodtech', domain: 'product', subDomain: 'verticals' },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI & MACHINE LEARNING
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Artificial_intelligence', domain: 'engineering', subDomain: 'ai' },
  { title: 'Machine_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Deep_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Large_language_model', domain: 'engineering', subDomain: 'ai' },
  { title: 'Generative_artificial_intelligence', domain: 'engineering', subDomain: 'ai' },
  { title: 'Transformer_(deep_learning_architecture)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Natural_language_processing', domain: 'engineering', subDomain: 'ai' },
  { title: 'Computer_vision', domain: 'engineering', subDomain: 'ai' },
  { title: 'Reinforcement_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Neural_network_(machine_learning)', domain: 'engineering', subDomain: 'ai' },
  { title: 'AI_alignment', domain: 'engineering', subDomain: 'ai' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES & MARKETING
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Sales_process_engineering', domain: 'marketing', subDomain: 'sales' },
  { title: 'Lead_generation', domain: 'marketing', subDomain: 'sales' },
  { title: 'Sales_funnel', domain: 'marketing', subDomain: 'sales' },
  { title: 'Account-based_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Content_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Search_engine_optimization', domain: 'marketing', subDomain: 'sales' },
  { title: 'Conversion_rate_optimization', domain: 'marketing', subDomain: 'sales' },
  { title: 'Marketing_automation', domain: 'marketing', subDomain: 'sales' },
  { title: 'Customer_relationship_management', domain: 'marketing', subDomain: 'sales' },
  { title: 'Sales_operations', domain: 'marketing', subDomain: 'sales' },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEOPLE & HR
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Employee_engagement', domain: 'hr', subDomain: 'people' },
  { title: 'Employee_retention', domain: 'hr', subDomain: 'people' },
  { title: 'Organizational_culture', domain: 'hr', subDomain: 'people' },
  { title: 'Remote_work', domain: 'hr', subDomain: 'people' },
  { title: 'Employee_stock_option', domain: 'hr', subDomain: 'people' },
  { title: 'Onboarding', domain: 'hr', subDomain: 'people' },
  { title: 'Performance_appraisal', domain: 'hr', subDomain: 'people' },
  { title: 'Talent_management', domain: 'hr', subDomain: 'people' },
  { title: 'Employer_branding', domain: 'hr', subDomain: 'people' },
  { title: 'Layoff', domain: 'hr', subDomain: 'people' },
  { title: 'Quiet_quitting', domain: 'hr', subDomain: 'people' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CYBERSECURITY & DATA
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Computer_security', domain: 'engineering', subDomain: 'security' },
  { title: 'Ransomware', domain: 'engineering', subDomain: 'security' },
  { title: 'Data_breach', domain: 'engineering', subDomain: 'security' },
  { title: 'Zero-day_(computing)', domain: 'engineering', subDomain: 'security' },
  { title: 'Phishing', domain: 'engineering', subDomain: 'security' },
  { title: 'Multi-factor_authentication', domain: 'engineering', subDomain: 'security' },
  { title: 'SOC_2', domain: 'engineering', subDomain: 'security' },
  { title: 'General_Data_Protection_Regulation', domain: 'engineering', subDomain: 'security' },
  { title: 'Data_governance', domain: 'engineering', subDomain: 'security' },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Product_management', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'User_experience_design', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'User_story', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Product_roadmap', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Feature_creep', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Usability_testing', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Design_thinking', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Jobs_to_be_done', domain: 'product', subDomain: 'product-mgmt' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD & INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Cloud_computing', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Amazon_Web_Services', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Microsoft_Azure', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Google_Cloud_Platform', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Serverless_computing', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Containerization_(computing)', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Kubernetes', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Docker_(software)', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Edge_computing', domain: 'engineering', subDomain: 'cloud' },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Business_intelligence', domain: 'product', subDomain: 'data' },
  { title: 'Data_warehouse', domain: 'engineering', subDomain: 'data' },
  { title: 'Data_lake', domain: 'engineering', subDomain: 'data' },
  { title: 'ETL', domain: 'engineering', subDomain: 'data' },
  { title: 'Data_pipeline', domain: 'engineering', subDomain: 'data' },
  { title: 'Apache_Kafka', domain: 'engineering', subDomain: 'data' },
  { title: 'Data-driven_decision-making', domain: 'strategy', subDomain: 'data' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCKCHAIN & CRYPTO
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Blockchain', domain: 'engineering', subDomain: 'crypto' },
  { title: 'Cryptocurrency', domain: 'finance', subDomain: 'crypto' },
  { title: 'Bitcoin', domain: 'finance', subDomain: 'crypto' },
  { title: 'Ethereum', domain: 'finance', subDomain: 'crypto' },
  { title: 'Decentralized_finance', domain: 'finance', subDomain: 'crypto' },
  { title: 'Non-fungible_token', domain: 'finance', subDomain: 'crypto' },
  { title: 'Smart_contract', domain: 'engineering', subDomain: 'crypto' },
  { title: 'Web3', domain: 'engineering', subDomain: 'crypto' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAMOUS BUSINESS CASE STUDIES (public knowledge)
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Dot-com_bubble', domain: 'finance', subDomain: 'case-studies' },
  { title: 'WeWork', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Theranos', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Enron_scandal', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Uber', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Airbnb', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Netflix', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Slack_(software)', domain: 'product', subDomain: 'case-studies' },
  { title: 'Zoom_Video_Communications', domain: 'product', subDomain: 'case-studies' },
  { title: 'Y_Combinator', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Sequoia_Capital', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Andreessen_Horowitz', domain: 'finance', subDomain: 'case-studies' },
  { title: 'FTX_(company)', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Silicon_Valley_Bank', domain: 'finance', subDomain: 'case-studies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // VC-FUNDED COMPANIES — Real stories, strategies, financials
  // ═══════════════════════════════════════════════════════════════════════════
  // ── Mega Unicorns ($10B+) ──
  { title: 'SpaceX', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'ByteDance', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Canva', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Databricks', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Revolut', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Klarna', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Instacart', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Discord', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Figma', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Notion_(productivity_software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Plaid_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Rippling_(company)', domain: 'hr', subDomain: 'vc-companies' },
  { title: 'Brex_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Airtable', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Miro_(software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Scale_AI', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'OpenAI', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Anthropic', domain: 'engineering', subDomain: 'vc-companies' },
  // ── Late-Stage Startups ──
  { title: 'Vercel', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Supabase', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Linear_(software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Retool', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Loom_(software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Calendly', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Gusto_(company)', domain: 'hr', subDomain: 'vc-companies' },
  { title: 'Deel', domain: 'hr', subDomain: 'vc-companies' },
  { title: 'Ramp_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Checkout.com', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Faire_(company)', domain: 'marketing', subDomain: 'vc-companies' },
  { title: 'Wiz_(company)', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Snyk', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Grafana_Labs', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'HashiCorp', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'GitLab', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Confluent_(software)', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Amplitude_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Segment_(company)', domain: 'marketing', subDomain: 'vc-companies' },
  { title: 'LaunchDarkly', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'PagerDuty', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Sentry_(software)', domain: 'engineering', subDomain: 'vc-companies' },
  // ── IPO Success Stories ──
  { title: 'Palantir_Technologies', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'DoorDash', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Coinbase', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Asana_(software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Cloudflare', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Fastly', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'UiPath', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Toast_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Monday.com', domain: 'product', subDomain: 'vc-companies' },
  { title: 'JFrog', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Elastic_NV', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Okta', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Zscaler', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'SentinelOne', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Gitlab', domain: 'engineering', subDomain: 'vc-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLICLY LISTED COMPANIES — Blue chips, tech, finance
  // ═══════════════════════════════════════════════════════════════════════════
  // ── Top Tech (not already listed) ──
  { title: 'Oracle_Corporation', domain: 'finance', subDomain: 'public-companies' },
  { title: 'SAP', domain: 'finance', subDomain: 'public-companies' },
  { title: 'IBM', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Intel', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Advanced_Micro_Devices', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Qualcomm', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Broadcom_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Texas_Instruments', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Cisco', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Adobe_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Intuit', domain: 'finance', subDomain: 'public-companies' },
  { title: 'PayPal', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Block,_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Snap_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Pinterest', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Spotify', domain: 'finance', subDomain: 'public-companies' },
  { title: 'DocuSign', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Zoom_Video_Communications', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Dropbox_(service)', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Zendesk', domain: 'finance', subDomain: 'public-companies' },
  // ── Finance & Banking ──
  { title: 'JPMorgan_Chase', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Goldman_Sachs', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Morgan_Stanley', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Bank_of_America', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Citigroup', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Wells_Fargo', domain: 'finance', subDomain: 'public-companies' },
  { title: 'BlackRock', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Visa_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Mastercard', domain: 'finance', subDomain: 'public-companies' },
  { title: 'American_Express', domain: 'finance', subDomain: 'public-companies' },
  // ── Healthcare ──
  { title: 'UnitedHealth_Group', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Johnson_%26_Johnson', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Pfizer', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Moderna', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Abbott_Laboratories', domain: 'finance', subDomain: 'public-companies' },
  // ── Consumer ──
  { title: 'The_Walt_Disney_Company', domain: 'finance', subDomain: 'public-companies' },
  { title: 'The_Coca-Cola_Company', domain: 'finance', subDomain: 'public-companies' },
  { title: 'PepsiCo', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Nike,_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'McDonald%27s', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Starbucks', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Procter_%26_Gamble', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Walmart', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Costco', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Target_Corporation', domain: 'finance', subDomain: 'public-companies' },
  // ── Industrial & Energy ──
  { title: 'General_Electric', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Boeing', domain: 'finance', subDomain: 'public-companies' },
  { title: 'ExxonMobil', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Chevron_Corporation', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Berkshire_Hathaway', domain: 'finance', subDomain: 'public-companies' },
  // ── Global Tech ──
  { title: 'Samsung_Electronics', domain: 'finance', subDomain: 'public-companies' },
  { title: 'TSMC', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Alibaba_Group', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Tencent', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Sony_Group_Corporation', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Toyota', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Reliance_Industries', domain: 'finance', subDomain: 'public-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // VC FIRMS & INVESTORS — Their strategies and portfolios
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Accel_(company)', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Kleiner_Perkins', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Benchmark_(venture_capital_firm)', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Lightspeed_Venture_Partners', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'General_Catalyst', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Tiger_Global_Management', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'SoftBank_Vision_Fund', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Insight_Partners', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Bessemer_Venture_Partners', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Greylock_Partners', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Index_Ventures', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Founders_Fund', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Battery_Ventures', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Khosla_Ventures', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'NEA_(venture_capital_firm)', domain: 'finance', subDomain: 'vc-firms' },
  { title: '500_Global', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Techstars', domain: 'finance', subDomain: 'vc-firms' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAMOUS FOUNDERS & BUSINESS LEADERS — Their strategies
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Elon_Musk', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Jeff_Bezos', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Mark_Zuckerberg', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Satya_Nadella', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Tim_Cook', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Jensen_Huang', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Sam_Altman', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Peter_Thiel', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Marc_Andreessen', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Reed_Hastings', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Brian_Chesky', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Patrick_Collison', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Stewart_Butterfield', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Drew_Houston', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Daniel_Ek', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Warren_Buffett', domain: 'finance', subDomain: 'leaders' },
  { title: 'Jamie_Dimon', domain: 'finance', subDomain: 'leaders' },
  { title: 'Jack_Ma', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Sundar_Pichai', domain: 'strategy', subDomain: 'leaders' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL VC-FUNDED COMPANIES — Unicorns & Decacorns Worldwide
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Grab_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Gojek', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Coupang', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Rappi', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Nubank', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Razorpay', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'CRED_(fintech_company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Meesho', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Swiggy', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Zerodha', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Flipkart', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Ola_Cabs', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'N26_(bank)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Wise_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Robinhood_Markets', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Chime_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Bolt_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Celonis', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Grammarly', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Freshworks', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Mural_(software)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Carta_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Pipe_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Rapyd', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Gorillas_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Getir', domain: 'product', subDomain: 'vc-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE PUBLICLY LISTED TECH COMPANIES — Semiconductor, Enterprise, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'ASML_Holding', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Arm_(company)', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Marvell_Technology', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Micron_Technology', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Applied_Materials', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Lam_Research', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Synopsys', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Cadence_Design_Systems', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Palo_Alto_Networks', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Fortinet', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Splunk', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Veeva_Systems', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Autodesk', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Ansys', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Dynatrace', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Nutanix', domain: 'finance', subDomain: 'public-companies' },
  { title: 'NetSuite', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Tableau_Software', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Teradata', domain: 'finance', subDomain: 'public-companies' },
  { title: 'VMware', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Dell_Technologies', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Hewlett_Packard_Enterprise', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Lenovo', domain: 'finance', subDomain: 'public-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL CONCEPTS — Options, Derivatives, Hedge Funds, Sovereign Wealth
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Option_(finance)', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Call_option', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Put_option', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Derivative_(finance)', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Futures_contract', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Swap_(finance)', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Credit_default_swap', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Hedge_fund', domain: 'finance', subDomain: 'investment' },
  { title: 'Sovereign_wealth_fund', domain: 'finance', subDomain: 'investment' },
  { title: 'Mutual_fund', domain: 'finance', subDomain: 'investment' },
  { title: 'Exchange-traded_fund', domain: 'finance', subDomain: 'investment' },
  { title: 'Index_fund', domain: 'finance', subDomain: 'investment' },
  { title: 'Short_(finance)', domain: 'finance', subDomain: 'investment' },
  { title: 'Margin_(finance)', domain: 'finance', subDomain: 'investment' },
  { title: 'Collateralized_debt_obligation', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Mortgage-backed_security', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Black%E2%80%93Scholes_model', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Value_at_risk', domain: 'finance', subDomain: 'risk' },
  { title: 'Capital_asset_pricing_model', domain: 'finance', subDomain: 'investment' },
  { title: 'Modern_portfolio_theory', domain: 'finance', subDomain: 'investment' },
  { title: 'Efficient-market_hypothesis', domain: 'finance', subDomain: 'investment' },
  { title: 'Government_Pension_Fund_of_Norway', domain: 'finance', subDomain: 'investment' },
  { title: 'Abu_Dhabi_Investment_Authority', domain: 'finance', subDomain: 'investment' },
  { title: 'GIC_(sovereign_wealth_fund)', domain: 'finance', subDomain: 'investment' },
  { title: 'Temasek_Holdings', domain: 'finance', subDomain: 'investment' },
  { title: 'Bridgewater_Associates', domain: 'finance', subDomain: 'investment' },
  { title: 'Renaissance_Technologies', domain: 'finance', subDomain: 'investment' },
  { title: 'Two_and_twenty', domain: 'finance', subDomain: 'investment' },
  { title: 'Discounted_cash_flow', domain: 'finance', subDomain: 'valuation' },
  { title: 'Net_present_value', domain: 'finance', subDomain: 'valuation' },
  { title: 'Internal_rate_of_return', domain: 'finance', subDomain: 'valuation' },
  { title: 'Weighted_average_cost_of_capital', domain: 'finance', subDomain: 'valuation' },
  { title: 'Enterprise_value', domain: 'finance', subDomain: 'valuation' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS STRATEGY CONCEPTS — Porter, BCG, McKinsey frameworks
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Porter%27s_generic_strategies', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Growth%E2%80%93share_matrix', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'GE%E2%80%93McKinsey_nine-box_matrix', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'PEST_analysis', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Ansoff_matrix', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Core_competency', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Experience_curve_effects', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Resource-based_view', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Strategic_planning', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Corporate_governance', domain: 'strategy', subDomain: 'governance' },
  { title: 'Vertical_integration', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Horizontal_integration', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Diversification_(marketing_strategy)', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Scenario_planning', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Total_addressable_market', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Moore%27s_law', domain: 'strategy', subDomain: 'tech-trends' },
  { title: 'Metcalfe%27s_law', domain: 'strategy', subDomain: 'tech-trends' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOFTWARE ENGINEERING — CI/CD, Containers, Architecture, APIs
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'CI/CD', domain: 'engineering', subDomain: 'practices' },
  { title: 'Jenkins_(software)', domain: 'engineering', subDomain: 'devops' },
  { title: 'GitHub_Actions', domain: 'engineering', subDomain: 'devops' },
  { title: 'GitOps', domain: 'engineering', subDomain: 'devops' },
  { title: 'Helm_(package_manager)', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Terraform_(software)', domain: 'engineering', subDomain: 'devops' },
  { title: 'Ansible_(software)', domain: 'engineering', subDomain: 'devops' },
  { title: 'Prometheus_(software)', domain: 'engineering', subDomain: 'devops' },
  { title: 'Grafana', domain: 'engineering', subDomain: 'devops' },
  { title: 'Service_mesh', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Istio', domain: 'engineering', subDomain: 'cloud' },
  { title: 'API', domain: 'engineering', subDomain: 'architecture' },
  { title: 'REST', domain: 'engineering', subDomain: 'architecture' },
  { title: 'GraphQL', domain: 'engineering', subDomain: 'architecture' },
  { title: 'gRPC', domain: 'engineering', subDomain: 'architecture' },
  { title: 'WebSocket', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Message_queue', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Event-driven_architecture', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Domain-driven_design', domain: 'engineering', subDomain: 'architecture' },
  { title: 'CQRS', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Load_balancing_(computing)', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Database_sharding', domain: 'engineering', subDomain: 'architecture' },
  { title: 'CAP_theorem', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Eventual_consistency', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Blue%E2%80%93green_deployment', domain: 'engineering', subDomain: 'devops' },
  { title: 'Rolling_deployment', domain: 'engineering', subDomain: 'devops' },
  { title: 'OAuth', domain: 'engineering', subDomain: 'security' },
  { title: 'JSON_Web_Token', domain: 'engineering', subDomain: 'security' },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SCIENCE / ML CONCEPTS — Neural Nets, Transformers, GANs, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Generative_adversarial_network', domain: 'engineering', subDomain: 'ai' },
  { title: 'Convolutional_neural_network', domain: 'engineering', subDomain: 'ai' },
  { title: 'Recurrent_neural_network', domain: 'engineering', subDomain: 'ai' },
  { title: 'Long_short-term_memory', domain: 'engineering', subDomain: 'ai' },
  { title: 'Attention_(machine_learning)', domain: 'engineering', subDomain: 'ai' },
  { title: 'BERT_(language_model)', domain: 'engineering', subDomain: 'ai' },
  { title: 'GPT-4', domain: 'engineering', subDomain: 'ai' },
  { title: 'Diffusion_model', domain: 'engineering', subDomain: 'ai' },
  { title: 'Stable_Diffusion', domain: 'engineering', subDomain: 'ai' },
  { title: 'Transfer_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Fine-tuning_(deep_learning)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Supervised_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Unsupervised_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Random_forest', domain: 'engineering', subDomain: 'ai' },
  { title: 'Gradient_boosting', domain: 'engineering', subDomain: 'ai' },
  { title: 'Support_vector_machine', domain: 'engineering', subDomain: 'ai' },
  { title: 'K-means_clustering', domain: 'engineering', subDomain: 'ai' },
  { title: 'Principal_component_analysis', domain: 'engineering', subDomain: 'ai' },
  { title: 'Backpropagation', domain: 'engineering', subDomain: 'ai' },
  { title: 'Overfitting', domain: 'engineering', subDomain: 'ai' },
  { title: 'Batch_normalization', domain: 'engineering', subDomain: 'ai' },
  { title: 'Word_embedding', domain: 'engineering', subDomain: 'ai' },
  { title: 'Retrieval-augmented_generation', domain: 'engineering', subDomain: 'ai' },
  { title: 'Recommender_system', domain: 'engineering', subDomain: 'ai' },
  { title: 'Feature_engineering', domain: 'engineering', subDomain: 'ai' },
  { title: 'MLOps', domain: 'engineering', subDomain: 'ai' },
  { title: 'Prompt_engineering', domain: 'engineering', subDomain: 'ai' },
  { title: 'Hallucination_(artificial_intelligence)', domain: 'engineering', subDomain: 'ai' },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTABLE ACQUISITIONS — Major tech M&A deals
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Acquisition_of_Instagram_by_Facebook', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_WhatsApp_by_Facebook', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_LinkedIn_by_Microsoft', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_GitHub_by_Microsoft', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Activision_Blizzard_by_Microsoft', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_YouTube_by_Google', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Android_Inc._by_Google', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Whole_Foods_Market_by_Amazon', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_21st_Century_Fox_by_Disney', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Red_Hat_by_IBM', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Slack_Technologies_by_Salesforce', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_VMware_by_Broadcom', domain: 'finance', subDomain: 'acquisitions' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAMOUS BUSINESS CASE STUDIES — Disruption, Failure, Pivots
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Kodak', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Nokia', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Blockbuster_LLC', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'BlackBerry', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Myspace', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Yahoo!', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Xerox', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Sears', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Toys_%22R%22_Us', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Lehman_Brothers', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Bear_Stearns', domain: 'finance', subDomain: 'case-studies' },
  { title: 'WorldCom', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Wirecard', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Luckin_Coffee', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Groupon', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Quibi', domain: 'strategy', subDomain: 'case-studies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES & MARKETING CONCEPTS — Funnel, ABM, Demand Gen, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Demand_generation', domain: 'marketing', subDomain: 'sales' },
  { title: 'Inbound_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Outbound_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Email_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Affiliate_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Influencer_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Pay-per-click', domain: 'marketing', subDomain: 'sales' },
  { title: 'Cost_per_action', domain: 'marketing', subDomain: 'sales' },
  { title: 'Marketing_mix', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Brand_equity', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Brand_awareness', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Viral_marketing', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Referral_marketing', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Customer_retention', domain: 'marketing', subDomain: 'sales' },
  { title: 'Upselling', domain: 'marketing', subDomain: 'sales' },
  { title: 'Cross-selling', domain: 'marketing', subDomain: 'sales' },
  { title: 'Go-to-market_strategy', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Search_engine_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Social_media_marketing', domain: 'marketing', subDomain: 'sales' },

  // ═══════════════════════════════════════════════════════════════════════════
  // HR / PEOPLE CONCEPTS — OKR, KPI, Performance, Compensation
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Key_performance_indicator', domain: 'hr', subDomain: 'people' },
  { title: 'Performance_indicator', domain: 'hr', subDomain: 'people' },
  { title: '360-degree_feedback', domain: 'hr', subDomain: 'people' },
  { title: 'Compensation_and_benefits', domain: 'hr', subDomain: 'people' },
  { title: 'Diversity,_equity,_and_inclusion', domain: 'hr', subDomain: 'people' },
  { title: 'Psychological_safety', domain: 'hr', subDomain: 'people' },
  { title: 'Succession_planning', domain: 'hr', subDomain: 'people' },
  { title: 'Human_resource_management', domain: 'hr', subDomain: 'people' },
  { title: 'Workforce_planning', domain: 'hr', subDomain: 'people' },
  { title: 'Executive_compensation', domain: 'hr', subDomain: 'people' },
  { title: 'Stock_option', domain: 'hr', subDomain: 'compensation' },
  { title: 'Restricted_stock', domain: 'hr', subDomain: 'compensation' },
  { title: 'Vesting', domain: 'hr', subDomain: 'compensation' },

  // ═══════════════════════════════════════════════════════════════════════════
  // REGULATORY & COMPLIANCE — GDPR, SOX, HIPAA, PCI-DSS, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Sarbanes%E2%80%93Oxley_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Health_Insurance_Portability_and_Accountability_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Payment_Card_Industry_Data_Security_Standard', domain: 'engineering', subDomain: 'compliance' },
  { title: 'California_Consumer_Privacy_Act', domain: 'engineering', subDomain: 'compliance' },
  { title: 'Dodd%E2%80%93Frank_Wall_Street_Reform_and_Consumer_Protection_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Basel_III', domain: 'finance', subDomain: 'compliance' },
  { title: 'Anti-money_laundering', domain: 'finance', subDomain: 'compliance' },
  { title: 'Know_your_customer', domain: 'finance', subDomain: 'compliance' },
  { title: 'Securities_and_Exchange_Commission', domain: 'finance', subDomain: 'compliance' },
  { title: 'Federal_Trade_Commission', domain: 'finance', subDomain: 'compliance' },
  { title: 'ISO_27001', domain: 'engineering', subDomain: 'compliance' },
  { title: 'EU_Artificial_Intelligence_Act', domain: 'engineering', subDomain: 'compliance' },

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL TECH COMPANIES — Asian, European, Emerging Markets
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Baidu', domain: 'finance', subDomain: 'global-tech' },
  { title: 'JD.com', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Pinduoduo', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Meituan', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Xiaomi', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Huawei', domain: 'finance', subDomain: 'global-tech' },
  { title: 'SoftBank_Group', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Rakuten_Group', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Infosys', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Tata_Consultancy_Services', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Wipro', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Sea_Limited', domain: 'finance', subDomain: 'global-tech' },
  { title: 'MercadoLibre', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Kakao_(company)', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Naver_Corporation', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Dassault_Syst%C3%A8mes', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Siemens', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Adyen', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Foxconn', domain: 'finance', subDomain: 'global-tech' },
  { title: 'SK_Hynix', domain: 'finance', subDomain: 'global-tech' },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAMOUS INVESTORS & BUSINESS LEADERS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Charlie_Munger', domain: 'finance', subDomain: 'leaders' },
  { title: 'Ray_Dalio', domain: 'finance', subDomain: 'leaders' },
  { title: 'George_Soros', domain: 'finance', subDomain: 'leaders' },
  { title: 'Carl_Icahn', domain: 'finance', subDomain: 'leaders' },
  { title: 'Bill_Ackman', domain: 'finance', subDomain: 'leaders' },
  { title: 'Cathie_Wood', domain: 'finance', subDomain: 'leaders' },
  { title: 'Jim_Simons', domain: 'finance', subDomain: 'leaders' },
  { title: 'John_Doerr', domain: 'finance', subDomain: 'leaders' },
  { title: 'Vinod_Khosla', domain: 'finance', subDomain: 'leaders' },
  { title: 'Masayoshi_Son', domain: 'finance', subDomain: 'leaders' },
  { title: 'Larry_Ellison', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Bill_Gates', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Steve_Jobs', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Andy_Grove', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Mary_Meeker', domain: 'finance', subDomain: 'leaders' },
  { title: 'Ben_Horowitz', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Reid_Hoffman', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Travis_Kalanick', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Dara_Khosrowshahi', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Lisa_Su', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Arvind_Krishna', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Mukesh_Ambani', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Pony_Ma', domain: 'strategy', subDomain: 'leaders' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL ECONOMICS & FINANCE
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Financial_crisis_of_2007%E2%80%932008', domain: 'finance', subDomain: 'economics' },
  { title: 'Great_Recession', domain: 'finance', subDomain: 'economics' },
  { title: 'Stagflation', domain: 'finance', subDomain: 'economics' },
  { title: 'Deflation', domain: 'finance', subDomain: 'economics' },
  { title: 'Purchasing_power_parity', domain: 'finance', subDomain: 'economics' },
  { title: 'Trade_deficit', domain: 'finance', subDomain: 'economics' },
  { title: 'National_debt_of_the_United_States', domain: 'finance', subDomain: 'economics' },
  { title: 'Venture_debt', domain: 'finance', subDomain: 'vc' },
  { title: 'Revenue-based_financing', domain: 'finance', subDomain: 'vc' },
  { title: 'Crowdfunding', domain: 'finance', subDomain: 'vc' },
  { title: 'GameStop_short_squeeze', domain: 'finance', subDomain: 'case-studies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL PRODUCT & UX
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'User_interface_design', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Information_architecture', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Interaction_design', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Persona_(user_experience)', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Wireframe_(design)', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Prototype', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Accessibility', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Design_system', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Product_analytics', domain: 'product', subDomain: 'product-mgmt' },
  { title: 'Cohort_analysis', domain: 'product', subDomain: 'product-mgmt' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL DATABASES & DATA ENGINEERING
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'PostgreSQL', domain: 'engineering', subDomain: 'data' },
  { title: 'Redis', domain: 'engineering', subDomain: 'data' },
  { title: 'Apache_Spark', domain: 'engineering', subDomain: 'data' },
  { title: 'Apache_Hadoop', domain: 'engineering', subDomain: 'data' },
  { title: 'Apache_Airflow', domain: 'engineering', subDomain: 'data' },
  { title: 'Elasticsearch', domain: 'engineering', subDomain: 'data' },
  { title: 'Apache_Flink', domain: 'engineering', subDomain: 'data' },
  { title: 'DuckDB', domain: 'engineering', subDomain: 'data' },
  { title: 'ClickHouse', domain: 'engineering', subDomain: 'data' },
  { title: 'Vector_database', domain: 'engineering', subDomain: 'data' },
  { title: 'Graph_database', domain: 'engineering', subDomain: 'data' },
  { title: 'Data_mesh', domain: 'engineering', subDomain: 'data' },
  { title: 'Lakehouse_(data_management)', domain: 'engineering', subDomain: 'data' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL VC-FUNDED COMPANIES — More Unicorns & Decacorns Worldwide
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Shein', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Devoted_Health', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Fanatics_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Gopuff', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Relativity_Space', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Anduril_Industries', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Articulate_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Webflow', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Notion_Labs', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Dbt_Labs', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Cohere_(company)', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Mistral_AI', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Navan_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Zip_(company)', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Vanta_(company)', domain: 'engineering', subDomain: 'vc-companies' },
  { title: 'Wefox', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'OYO_(company)', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Dream11', domain: 'product', subDomain: 'vc-companies' },
  { title: 'PhonePe', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Zomato', domain: 'product', subDomain: 'vc-companies' },
  { title: 'Pine_Labs', domain: 'finance', subDomain: 'vc-companies' },
  { title: 'Paytm', domain: 'finance', subDomain: 'vc-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE PUBLICLY LISTED TECH — Semiconductor, Enterprise Software, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'KLA_Corporation', domain: 'finance', subDomain: 'public-companies' },
  { title: 'ON_Semiconductor', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Analog_Devices', domain: 'finance', subDomain: 'public-companies' },
  { title: 'NXP_Semiconductors', domain: 'finance', subDomain: 'public-companies' },
  { title: 'MediaTek', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Infineon_Technologies', domain: 'finance', subDomain: 'public-companies' },
  { title: 'STMicroelectronics', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Renesas_Electronics', domain: 'finance', subDomain: 'public-companies' },
  { title: 'GlobalFoundries', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Wolfspeed', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Arista_Networks', domain: 'finance', subDomain: 'public-companies' },
  { title: 'NetApp', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Pure_Storage', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Commvault', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Akamai_Technologies', domain: 'finance', subDomain: 'public-companies' },
  { title: 'F5,_Inc.', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Juniper_Networks', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Varonis_Systems', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Rapid7', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Qualys', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Proofpoint_(company)', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Sophos', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Coupa_Software', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Informatica', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Pegasystems', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Manhattan_Associates', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Paycom', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Paylocity', domain: 'finance', subDomain: 'public-companies' },
  { title: 'WiseTech_Global', domain: 'finance', subDomain: 'public-companies' },
  { title: 'Xero_(software)', domain: 'finance', subDomain: 'public-companies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE FINANCIAL CONCEPTS — Options Greeks, Structured Products, Banking
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Greeks_(finance)', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Volatility_(finance)', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Implied_volatility', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Straddle', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Iron_condor', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Covered_call', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Protective_put', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Forward_contract', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Interest_rate_swap', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Structured_product', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Securitization', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Asset-backed_security', domain: 'finance', subDomain: 'derivatives' },
  { title: 'Repo', domain: 'finance', subDomain: 'investment' },
  { title: 'Convertible_bond', domain: 'finance', subDomain: 'investment' },
  { title: 'Junk_bond', domain: 'finance', subDomain: 'investment' },
  { title: 'Zero-coupon_bond', domain: 'finance', subDomain: 'investment' },
  { title: 'Sharpe_ratio', domain: 'finance', subDomain: 'investment' },
  { title: 'Alpha_(finance)', domain: 'finance', subDomain: 'investment' },
  { title: 'Beta_(finance)', domain: 'finance', subDomain: 'investment' },
  { title: 'Algorithmic_trading', domain: 'finance', subDomain: 'investment' },
  { title: 'High-frequency_trading', domain: 'finance', subDomain: 'investment' },
  { title: 'Dark_pool', domain: 'finance', subDomain: 'investment' },
  { title: 'Market_maker', domain: 'finance', subDomain: 'investment' },
  { title: 'Venture_capital_financing', domain: 'finance', subDomain: 'vc' },
  { title: 'Mezzanine_financing', domain: 'finance', subDomain: 'vc' },
  { title: 'Preferred_stock', domain: 'finance', subDomain: 'investment' },
  { title: 'Dividend', domain: 'finance', subDomain: 'investment' },
  { title: 'Stock_split', domain: 'finance', subDomain: 'investment' },
  { title: 'Share_repurchase', domain: 'finance', subDomain: 'investment' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE BUSINESS STRATEGY CONCEPTS — Consulting Frameworks, Pricing, Ops
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'McKinsey_7S_Framework', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Lean_manufacturing', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Six_Sigma', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Theory_of_constraints', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Kaizen', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Value_proposition', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Pricing_strategies', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Dynamic_pricing', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Price_discrimination', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Loss_leader', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Razor_and_blades_model', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Winner-take-all_market', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Vendor_lock-in', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Two-sided_market', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Franchising', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Joint_venture', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Strategic_alliance', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Outsourcing', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Offshoring', domain: 'strategy', subDomain: 'frameworks' },
  { title: 'Supply_chain_management', domain: 'strategy', subDomain: 'operations' },
  { title: 'Inventory_management', domain: 'strategy', subDomain: 'operations' },
  { title: 'Just-in-time_manufacturing', domain: 'strategy', subDomain: 'operations' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE SOFTWARE ENGINEERING — Patterns, Languages, Tools
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Chaos_engineering', domain: 'engineering', subDomain: 'practices' },
  { title: 'Trunk-based_development', domain: 'engineering', subDomain: 'practices' },
  { title: 'Behavior-driven_development', domain: 'engineering', subDomain: 'practices' },
  { title: 'Acceptance_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Integration_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Unit_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Performance_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Load_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Mutation_testing', domain: 'engineering', subDomain: 'practices' },
  { title: 'Static_program_analysis', domain: 'engineering', subDomain: 'practices' },
  { title: 'Dependency_injection', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Model%E2%80%93view%E2%80%93controller', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Saga_pattern', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Circuit_breaker_design_pattern', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Sidecar_pattern', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Strangler_fig_pattern', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Idempotence', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Two-phase_commit_protocol', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Distributed_computing', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Consensus_(computer_science)', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Raft_(algorithm)', domain: 'engineering', subDomain: 'architecture' },
  { title: 'MapReduce', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Content_delivery_network', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Reverse_proxy', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Rate_limiting', domain: 'engineering', subDomain: 'architecture' },
  { title: 'Git', domain: 'engineering', subDomain: 'devops' },
  { title: 'GitHub', domain: 'engineering', subDomain: 'devops' },
  { title: 'Nginx', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Apache_HTTP_Server', domain: 'engineering', subDomain: 'cloud' },
  { title: 'Linux', domain: 'engineering', subDomain: 'cloud' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE DATA SCIENCE / ML — Statistical Learning, NLP, Vision, Ethics
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Logistic_regression', domain: 'engineering', subDomain: 'ai' },
  { title: 'Linear_regression', domain: 'engineering', subDomain: 'ai' },
  { title: 'Decision_tree_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Naive_Bayes_classifier', domain: 'engineering', subDomain: 'ai' },
  { title: 'XGBoost', domain: 'engineering', subDomain: 'ai' },
  { title: 'Ensemble_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Autoencoder', domain: 'engineering', subDomain: 'ai' },
  { title: 'Variational_autoencoder', domain: 'engineering', subDomain: 'ai' },
  { title: 'Boltzmann_machine', domain: 'engineering', subDomain: 'ai' },
  { title: 'Residual_neural_network', domain: 'engineering', subDomain: 'ai' },
  { title: 'Dropout_(neural_networks)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Stochastic_gradient_descent', domain: 'engineering', subDomain: 'ai' },
  { title: 'Adam_(optimization_algorithm)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Hyperparameter_optimization', domain: 'engineering', subDomain: 'ai' },
  { title: 'Cross-validation_(statistics)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Confusion_matrix', domain: 'engineering', subDomain: 'ai' },
  { title: 'F-score', domain: 'engineering', subDomain: 'ai' },
  { title: 'ROC_curve', domain: 'engineering', subDomain: 'ai' },
  { title: 'Bias%E2%80%93variance_tradeoff', domain: 'engineering', subDomain: 'ai' },
  { title: 'Regularization_(mathematics)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Data_augmentation', domain: 'engineering', subDomain: 'ai' },
  { title: 'Semantic_segmentation', domain: 'engineering', subDomain: 'ai' },
  { title: 'Object_detection', domain: 'engineering', subDomain: 'ai' },
  { title: 'Image_segmentation', domain: 'engineering', subDomain: 'ai' },
  { title: 'Sentiment_analysis', domain: 'engineering', subDomain: 'ai' },
  { title: 'Named-entity_recognition', domain: 'engineering', subDomain: 'ai' },
  { title: 'Text_mining', domain: 'engineering', subDomain: 'ai' },
  { title: 'Topic_model', domain: 'engineering', subDomain: 'ai' },
  { title: 'AI_safety', domain: 'engineering', subDomain: 'ai' },
  { title: 'Explainable_artificial_intelligence', domain: 'engineering', subDomain: 'ai' },
  { title: 'Federated_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Multi-task_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Zero-shot_learning', domain: 'engineering', subDomain: 'ai' },
  { title: 'Few-shot_learning_(natural_language_processing)', domain: 'engineering', subDomain: 'ai' },
  { title: 'Reinforcement_learning_from_human_feedback', domain: 'engineering', subDomain: 'ai' },
  { title: 'TensorFlow', domain: 'engineering', subDomain: 'ai' },
  { title: 'PyTorch', domain: 'engineering', subDomain: 'ai' },
  { title: 'Hugging_Face', domain: 'engineering', subDomain: 'ai' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE NOTABLE ACQUISITIONS — Major Tech & Business M&A
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Acquisition_of_Arm_Ltd_by_SoftBank_Group', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Skype_by_Microsoft', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Beats_Electronics_by_Apple', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Fitbit_by_Google', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Tableau_Software_by_Salesforce', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Waze_by_Google', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Twitch_by_Amazon', domain: 'finance', subDomain: 'acquisitions' },
  { title: 'Acquisition_of_Mojang_Studios_by_Microsoft', domain: 'finance', subDomain: 'acquisitions' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE FAMOUS BUSINESS CASE STUDIES — Disruption, Turnarounds, Scandals
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Polaroid_Corporation', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Compaq', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Palm,_Inc.', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'AOL', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Sun_Microsystems', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Digital_Equipment_Corporation', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Nortel', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Solyndra', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Pets.com', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Webvan', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Juicero', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Jawbone_(company)', domain: 'strategy', subDomain: 'case-studies' },
  { title: 'Better.com', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Peloton_Interactive', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Zillow', domain: 'finance', subDomain: 'case-studies' },
  { title: 'Rivian', domain: 'finance', subDomain: 'case-studies' },
  { title: 'IronClad_scandal', domain: 'finance', subDomain: 'case-studies' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE SALES & MARKETING CONCEPTS — Funnel, ABM, Channel, Branding
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Product_marketing', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Customer_segmentation', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Market_research', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Competitive_analysis', domain: 'marketing', subDomain: 'strategy' },
  { title: 'AIDA_(marketing)', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Marketing_funnel', domain: 'marketing', subDomain: 'sales' },
  { title: 'Lead_scoring', domain: 'marketing', subDomain: 'sales' },
  { title: 'Direct_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Drip_marketing', domain: 'marketing', subDomain: 'sales' },
  { title: 'Customer_data_platform', domain: 'marketing', subDomain: 'sales' },
  { title: 'Growth_marketing', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Channel_partner', domain: 'marketing', subDomain: 'sales' },
  { title: 'Value-added_reseller', domain: 'marketing', subDomain: 'sales' },
  { title: 'Pricing_psychology', domain: 'marketing', subDomain: 'strategy' },
  { title: 'Lifetime_value', domain: 'marketing', subDomain: 'sales' },
  { title: 'Return_on_marketing_investment', domain: 'marketing', subDomain: 'strategy' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE REGULATORY & COMPLIANCE — Global Regulations
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'MiFID_II', domain: 'finance', subDomain: 'compliance' },
  { title: 'Regulation_of_algorithms', domain: 'engineering', subDomain: 'compliance' },
  { title: 'CAN-SPAM_Act_of_2003', domain: 'marketing', subDomain: 'compliance' },
  { title: 'Digital_Markets_Act', domain: 'engineering', subDomain: 'compliance' },
  { title: 'Digital_Services_Act', domain: 'engineering', subDomain: 'compliance' },
  { title: 'ePrivacy_Directive', domain: 'engineering', subDomain: 'compliance' },
  { title: 'Bank_Secrecy_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Fair_Credit_Reporting_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Gramm%E2%80%93Leach%E2%80%93Bliley_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'Foreign_Corrupt_Practices_Act', domain: 'finance', subDomain: 'compliance' },
  { title: 'SOC_1', domain: 'engineering', subDomain: 'compliance' },
  { title: 'FedRAMP', domain: 'engineering', subDomain: 'compliance' },
  { title: 'NIST_Cybersecurity_Framework', domain: 'engineering', subDomain: 'compliance' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE GLOBAL COMPANIES — Asian Tech, European Tech, Emerging Markets
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'NetEase', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Kuaishou', domain: 'finance', subDomain: 'global-tech' },
  { title: 'DiDi', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Ant_Group', domain: 'finance', subDomain: 'global-tech' },
  { title: 'BYD_Company', domain: 'finance', subDomain: 'global-tech' },
  { title: 'CATL', domain: 'finance', subDomain: 'global-tech' },
  { title: 'NIO_(car_company)', domain: 'finance', subDomain: 'global-tech' },
  { title: 'LG_Electronics', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Panasonic', domain: 'finance', subDomain: 'global-tech' },
  { title: 'LINE_(software)', domain: 'finance', subDomain: 'global-tech' },
  { title: 'HCL_Technologies', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Tech_Mahindra', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Ericsson', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Nokia_Networks', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Amadeus_IT_Group', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Temenos', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Prosus', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Naspers', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Delivery_Hero', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Just_Eat_Takeaway', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Careem', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Tokopedia', domain: 'finance', subDomain: 'global-tech' },
  { title: 'Bukalapak', domain: 'finance', subDomain: 'global-tech' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE FAMOUS INVESTORS & BUSINESS LEADERS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Paul_Graham_(programmer)', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Jessica_Livingston', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Sheryl_Sandberg', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Marissa_Mayer', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Susan_Wojcicki', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Ginni_Rometty', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Safra_Catz', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Whitney_Wolfe_Herd', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Jack_Dorsey', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Evan_Spiegel', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Larry_Page', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Sergey_Brin', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Michael_Dell', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Meg_Whitman', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Indra_Nooyi', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Bob_Iger', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Howard_Schultz', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Ken_Griffin', domain: 'finance', subDomain: 'leaders' },
  { title: 'David_Einhorn', domain: 'finance', subDomain: 'leaders' },
  { title: 'Leon_Black', domain: 'finance', subDomain: 'leaders' },
  { title: 'Stephen_Schwarzman', domain: 'finance', subDomain: 'leaders' },
  { title: 'Henry_Kravis', domain: 'finance', subDomain: 'leaders' },
  { title: 'Chamath_Palihapitiya', domain: 'finance', subDomain: 'leaders' },
  { title: 'Naval_Ravikant', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Dhirubhai_Ambani', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Ratan_Tata', domain: 'strategy', subDomain: 'leaders' },
  { title: 'Zhang_Yiming', domain: 'strategy', subDomain: 'leaders' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL ECONOMICS & FINANCE — Behavioral, Monetary, Banking
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Behavioral_economics', domain: 'finance', subDomain: 'economics' },
  { title: 'Prospect_theory', domain: 'finance', subDomain: 'economics' },
  { title: 'Game_theory', domain: 'finance', subDomain: 'economics' },
  { title: 'Moral_hazard', domain: 'finance', subDomain: 'economics' },
  { title: 'Adverse_selection', domain: 'finance', subDomain: 'economics' },
  { title: 'Information_asymmetry', domain: 'finance', subDomain: 'economics' },
  { title: 'Gini_coefficient', domain: 'finance', subDomain: 'economics' },
  { title: 'Phillips_curve', domain: 'finance', subDomain: 'economics' },
  { title: 'Central_bank', domain: 'finance', subDomain: 'economics' },
  { title: 'European_Central_Bank', domain: 'finance', subDomain: 'economics' },
  { title: 'Bank_of_England', domain: 'finance', subDomain: 'economics' },
  { title: 'Reserve_Bank_of_India', domain: 'finance', subDomain: 'economics' },
  { title: 'World_Bank', domain: 'finance', subDomain: 'economics' },
  { title: 'International_Monetary_Fund', domain: 'finance', subDomain: 'economics' },
  { title: 'Bank_for_International_Settlements', domain: 'finance', subDomain: 'economics' },
  { title: 'Venture_capital_in_India', domain: 'finance', subDomain: 'vc' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE CYBERSECURITY — Attack Types, Defense, Governance
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'Denial-of-service_attack', domain: 'engineering', subDomain: 'security' },
  { title: 'SQL_injection', domain: 'engineering', subDomain: 'security' },
  { title: 'Cross-site_scripting', domain: 'engineering', subDomain: 'security' },
  { title: 'Man-in-the-middle_attack', domain: 'engineering', subDomain: 'security' },
  { title: 'Social_engineering_(security)', domain: 'engineering', subDomain: 'security' },
  { title: 'Intrusion_detection_system', domain: 'engineering', subDomain: 'security' },
  { title: 'Public-key_cryptography', domain: 'engineering', subDomain: 'security' },
  { title: 'Transport_Layer_Security', domain: 'engineering', subDomain: 'security' },
  { title: 'Encryption', domain: 'engineering', subDomain: 'security' },
  { title: 'Zero_trust_security_model', domain: 'engineering', subDomain: 'security' },
  { title: 'Security_information_and_event_management', domain: 'engineering', subDomain: 'security' },
  { title: 'Penetration_test', domain: 'engineering', subDomain: 'security' },
  { title: 'Bug_bounty_program', domain: 'engineering', subDomain: 'security' },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE VC FIRMS & PE FIRMS
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'The_Carlyle_Group', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'KKR_%26_Co.', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Apollo_Global_Management', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'The_Blackstone_Group', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Warburg_Pincus', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'TPG_Inc.', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Thoma_Bravo', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Vista_Equity_Partners', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Coatue_Management', domain: 'finance', subDomain: 'vc-firms' },
  { title: 'Ribbit_Capital', domain: 'finance', subDomain: 'vc-firms' },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMMING LANGUAGES & RUNTIMES
  // ═══════════════════════════════════════════════════════════════════════════
  { title: 'TypeScript', domain: 'engineering', subDomain: 'languages' },
  { title: 'Rust_(programming_language)', domain: 'engineering', subDomain: 'languages' },
  { title: 'Go_(programming_language)', domain: 'engineering', subDomain: 'languages' },
  { title: 'Python_(programming_language)', domain: 'engineering', subDomain: 'languages' },
  { title: 'JavaScript', domain: 'engineering', subDomain: 'languages' },
  { title: 'Kotlin_(programming_language)', domain: 'engineering', subDomain: 'languages' },
  { title: 'Swift_(programming_language)', domain: 'engineering', subDomain: 'languages' },
  { title: 'Node.js', domain: 'engineering', subDomain: 'languages' },
  { title: 'Deno_(software)', domain: 'engineering', subDomain: 'languages' },
  { title: 'WebAssembly', domain: 'engineering', subDomain: 'languages' },
  { title: 'React_(JavaScript_library)', domain: 'engineering', subDomain: 'languages' },
  { title: 'Next.js', domain: 'engineering', subDomain: 'languages' },
];

// ============================================================================
// SAFE FETCH HELPER
// ============================================================================

async function safeFetch(
  url: string,
  options: RequestInit = {},
  retries = 1,
  timeoutMs = 15000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return response;
    } catch (err: any) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// WIKIPEDIA CONTENT FETCHER
// ============================================================================

/**
 * Fetch article summary from Wikipedia REST API
 * Returns plain text extract (1-3 paragraphs) + description
 */
async function fetchArticleSummary(title: string): Promise<{
  extract: string;
  description: string;
  pageId: number;
}> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await safeFetch(url, {
    headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' },
  }, 1, 10000);
  const data = await response.json();

  return {
    extract: data.extract || '',
    description: data.description || '',
    pageId: data.pageid || 0,
  };
}

/**
 * Fetch full article content sections from Wikipedia Parse API
 * Returns parsed sections with plain text content
 */
async function fetchArticleSections(title: string): Promise<{
  sections: WikiSection[];
  categories: string[];
  links: string[];
  infoboxData: Record<string, string>;
}> {
  // Use the parse API to get wikitext — we'll extract from plain text
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=sections|categories|links|wikitext&format=json&redirects=1`;
  const response = await safeFetch(url, {
    headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' },
  }, 1, 15000);
  const data = await response.json();

  if (data.error) {
    return { sections: [], categories: [], links: [], infoboxData: {} };
  }

  const parse = data.parse || {};

  // Extract section titles
  const sections: WikiSection[] = (parse.sections || []).map((s: any) => ({
    title: s.line || '',
    level: parseInt(s.level) || 2,
    content: '', // Will be populated from wikitext
  }));

  // Extract categories
  const categories: string[] = (parse.categories || [])
    .map((c: any) => c['*'] || '')
    .filter((c: string) => c && !c.startsWith('All ') && !c.startsWith('Articles'));

  // Extract internal links (related concepts)
  const links: string[] = (parse.links || [])
    .filter((l: any) => l.ns === 0) // Main namespace only
    .map((l: any) => l['*'] || '')
    .filter(Boolean)
    .slice(0, 50); // Cap at 50 most relevant

  // Parse infobox from wikitext
  const wikitext = parse.wikitext?.['*'] || '';
  const infoboxData = parseInfobox(wikitext);

  // Extract section content from wikitext
  if (wikitext) {
    populateSectionContent(sections, wikitext);
  }

  return { sections, categories, links, infoboxData };
}

/**
 * Parse infobox data from wikitext (key financial/factual data)
 */
function parseInfobox(wikitext: string): Record<string, string> {
  const infobox: Record<string, string> = {};

  // Match Infobox template content
  const infoboxMatch = wikitext.match(/\{\{Infobox[^}]*?\n([\s\S]*?)\n\}\}/i);
  if (!infoboxMatch) return infobox;

  const lines = infoboxMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(/\|\s*(\w[\w\s]*?)\s*=\s*(.+)/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      // Clean wiki markup from value
      let value = match[2]
        .replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, '$2') // [[link|text]] → text
        .replace(/\{\{[^}]*\}\}/g, '')                     // Remove templates
        .replace(/<[^>]+>/g, '')                            // Remove HTML
        .replace(/'''?/g, '')                               // Remove bold/italic
        .trim();

      if (value && key) {
        infobox[key] = value;
      }
    }
  }

  return infobox;
}

/**
 * Populate section content from wikitext
 */
function populateSectionContent(sections: WikiSection[], wikitext: string): void {
  // Clean wikitext to plain text
  const cleanText = wikitext
    .replace(/\{\{[^}]*\}\}/g, '')           // Remove templates
    .replace(/\[\[File:[^\]]*\]\]/gi, '')    // Remove file references
    .replace(/\[\[Category:[^\]]*\]\]/gi, '') // Remove categories
    .replace(/<ref[^>]*>.*?<\/ref>/gs, '')   // Remove references
    .replace(/<ref[^/]*\/>/g, '')            // Remove self-closing refs
    .replace(/<[^>]+>/g, '')                 // Remove HTML tags
    .replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, '$2') // [[link|text]] → text
    .replace(/'''([^']+)'''/g, '$1')         // Bold → plain
    .replace(/''([^']+)''/g, '$1')           // Italic → plain
    .replace(/\{\|[\s\S]*?\|\}/g, '');       // Remove tables

  // Split by section headers and assign content
  const sectionParts = cleanText.split(/^(={2,})\s*(.+?)\s*\1\s*$/m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // Find corresponding content in split parts
    const sectionIdx = sectionParts.findIndex(
      (part, idx) => idx > 0 && part.trim() === section.title
    );
    if (sectionIdx >= 0 && sectionIdx + 1 < sectionParts.length) {
      section.content = sectionParts[sectionIdx + 1]
        ?.trim()
        .substring(0, 2000) || ''; // Cap at 2000 chars per section
    }
  }
}

// ============================================================================
// MAIN FETCHER
// ============================================================================

/**
 * Fetch actual Wikipedia article content for all articles in the catalog
 *
 * @param catalog - Article list to fetch (defaults to full WIKIPEDIA_KNOWLEDGE_CATALOG)
 * @param batchSize - Number of articles to fetch concurrently
 * @param delayMs - Delay between batches (ms)
 */
export async function fetchWikipediaContent(
  catalog: typeof WIKIPEDIA_KNOWLEDGE_CATALOG = WIKIPEDIA_KNOWLEDGE_CATALOG,
  batchSize: number = 3,
  delayMs: number = 500,
): Promise<WikiArticleContent[]> {
  const results: WikiArticleContent[] = [];
  const fetchedAt = new Date();
  let successCount = 0;
  let failCount = 0;

  console.log(`  Wikipedia Content: Fetching ${catalog.length} articles...`);

  for (let i = 0; i < catalog.length; i += batchSize) {
    const batch = catalog.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (article) => {
        try {
          // Fetch summary + full sections in parallel
          const [summary, fullContent] = await Promise.all([
            fetchArticleSummary(article.title),
            fetchArticleSections(article.title),
          ]);

          const result: WikiArticleContent = {
            title: article.title.replace(/_/g, ' ').replace(/%27/g, "'").replace(/%E2%80%93/g, '-'),
            extract: summary.extract,
            description: summary.description,
            categories: fullContent.categories,
            links: fullContent.links,
            sections: fullContent.sections.filter(s => s.content.length > 0),
            infobox: fullContent.infoboxData,
            fetchedAt,
            domain: article.domain,
            subDomain: article.subDomain,
          };

          successCount++;
          return result;
        } catch (err: any) {
          failCount++;
          console.warn(`    Wikipedia "${article.title}" failed: ${err.message}`);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    // Progress logging every 15 articles
    if ((i + batchSize) % 15 === 0 || i + batchSize >= catalog.length) {
      console.log(`    Progress: ${Math.min(i + batchSize, catalog.length)}/${catalog.length} articles (${successCount} ok, ${failCount} failed)`);
    }

    if (i + batchSize < catalog.length) {
      await sleep(delayMs);
    }
  }

  console.log(`  Wikipedia Content: ${results.length} articles extracted successfully`);
  return results;
}

// ============================================================================
// KNOWLEDGE SIGNAL EXTRACTOR
// ============================================================================

/**
 * Convert Wikipedia article content into structured knowledge signals
 */
export function extractKnowledgeSignals(
  articles: WikiArticleContent[]
): WikiKnowledgeSignal[] {
  const signals: WikiKnowledgeSignal[] = [];

  for (const article of articles) {
    // 1. Core concept signal (from extract)
    if (article.extract) {
      signals.push({
        article: article.title,
        domain: article.domain,
        subDomain: article.subDomain,
        signalType: 'concept_definition',
        concept: article.title,
        description: article.extract.substring(0, 500),
        relatedConcepts: article.links.slice(0, 10),
        confidence: 0.90,
        metadata: {
          source: 'wikipedia',
          description: article.description,
          categoryCount: article.categories.length,
          sectionCount: article.sections.length,
        },
      });
    }

    // 2. Infobox factual signals (financial data, metrics, dates)
    for (const [key, value] of Object.entries(article.infobox)) {
      if (isFinancialOrMetricField(key)) {
        signals.push({
          article: article.title,
          domain: article.domain,
          subDomain: article.subDomain,
          signalType: `infobox_${key}`,
          concept: `${article.title} — ${key}`,
          description: `${key}: ${value}`,
          relatedConcepts: [],
          confidence: 0.85,
          metadata: {
            source: 'wikipedia_infobox',
            field: key,
            value,
          },
        });
      }
    }

    // 3. Section-level knowledge signals
    for (const section of article.sections) {
      if (section.content.length > 100 && isRelevantSection(section.title)) {
        signals.push({
          article: article.title,
          domain: article.domain,
          subDomain: article.subDomain,
          signalType: 'section_knowledge',
          concept: `${article.title} — ${section.title}`,
          description: section.content.substring(0, 500),
          relatedConcepts: article.links.slice(0, 5),
          confidence: 0.80,
          metadata: {
            source: 'wikipedia_section',
            sectionTitle: section.title,
            sectionLevel: section.level,
            contentLength: section.content.length,
          },
        });
      }
    }

    // 4. Category classification signals
    if (article.categories.length > 0) {
      signals.push({
        article: article.title,
        domain: article.domain,
        subDomain: article.subDomain,
        signalType: 'category_classification',
        concept: article.title,
        description: `Categories: ${article.categories.slice(0, 10).join(', ')}`,
        relatedConcepts: article.categories.slice(0, 10),
        confidence: 0.75,
        metadata: {
          source: 'wikipedia_categories',
          categories: article.categories,
        },
      });
    }
  }

  return signals;
}

/**
 * Check if an infobox field contains financial or metric data
 */
function isFinancialOrMetricField(key: string): boolean {
  const financialKeys = [
    'revenue', 'net_income', 'operating_income', 'assets', 'equity',
    'employees', 'num_employees', 'market_cap', 'total_assets',
    'profit', 'loss', 'ebitda', 'aum', 'total_equity', 'valuation',
    'funding', 'raised', 'budget', 'endowment', 'num_locations',
    'products', 'services', 'founder', 'founded', 'headquarters',
    'area_served', 'key_people', 'industry', 'type', 'traded_as',
    'isin', 'market_cap', 'total_revenue', 'number_of_employees',
  ];
  return financialKeys.some(fk => key.includes(fk));
}

/**
 * Filter out non-relevant sections (references, external links, etc.)
 */
function isRelevantSection(title: string): boolean {
  const irrelevantSections = [
    'references', 'external links', 'see also', 'further reading',
    'notes', 'bibliography', 'sources', 'citations', 'footnotes',
    'gallery', 'image gallery',
  ];
  return !irrelevantSections.includes(title.toLowerCase());
}
