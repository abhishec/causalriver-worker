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
