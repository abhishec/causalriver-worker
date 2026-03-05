/**
 * Widget Schema Registry — server-safe (NO "use client")
 *
 * Single source of truth for widget metadata used to:
 *   1. Auto-generate the LLM system prompt (getWidgetSystemPrompt)
 *   2. Document widget data contracts for developers
 *
 * To add a new widget type:
 *   1. Create the renderer component in this directory (WidgetProps interface)
 *   2. Add an entry to WIDGET_SCHEMAS below (~3 lines)
 *   3. Call registerWidget("kind", MyWidget) in WidgetRenderer.tsx
 *
 * Claude will automatically know about the new widget on the next request.
 * No changes to types.ts or CopilotChat.tsx required.
 */

export interface WidgetSchema {
  /** One-line description for the LLM prompt */
  description: string;
  /** Minimal one-line JSON example included in the LLM prompt */
  example: string;
}

export const WIDGET_SCHEMAS: Record<string, WidgetSchema> = {
  metric_card: {
    description: "single KPI value with optional sub-label and color",
    example: '{"kind":"metric_card","title":"Revenue","data":{"value":"$124k","sub":"+12% MoM","color":"green"}}',
  },
  metric_grid: {
    description: "2–4 KPI cards side by side",
    example: '{"kind":"metric_grid","data":{"cols":3,"metrics":[{"label":"Revenue","value":"$124k","color":"green"},{"label":"Churn","value":"2.1%","color":"red"}]}}',
  },
  bar_chart: {
    description: "categorical bar comparison",
    example: '{"kind":"bar_chart","title":"Revenue by Month","data":{"xKey":"month","series":[{"key":"revenue","label":"Revenue","color":"#7c6cf0"}],"rows":[{"month":"Jan","revenue":100000}]}}',
  },
  line_chart: {
    description: "time series trend line",
    example: '{"kind":"line_chart","title":"Velocity Trend","data":{"xKey":"week","series":[{"key":"pts","label":"Story Points"}],"rows":[{"week":"W1","pts":42}]}}',
  },
  sparkline: {
    description: "compact inline trend (no axes, just the shape)",
    example: '{"kind":"sparkline","title":"7-day trend","data":{"values":[10,14,9,17,21,18,24],"trend":"up"}}',
  },
  data_table: {
    description: "sortable/searchable table with explicit columns and rows",
    example: '{"kind":"data_table","title":"Engineers","data":{"searchable":true,"columns":["Name","Score","Status"],"rows":[{"Name":"Alice","Score":"92","Status":"Active"}]}}',
  },
  progress_ring: {
    description: "circular ring showing a 0–100 health or completion score",
    example: '{"kind":"progress_ring","title":"Delivery Health","data":{"score":78}}',
  },
  comparison_table: {
    description: "side-by-side feature comparison between competitors or options",
    example: '{"kind":"comparison_table","title":"Comparison","data":{"competitors":["Ours","Competitor A"],"features":[{"name":"Speed","values":[true,false]},{"name":"Price","values":["$99","$199"]}]}}',
  },
  product_feature_grid: {
    description: "product feature matrix showing availability per tier/plan",
    example: '{"kind":"product_feature_grid","title":"Features by Plan","data":{"tiers":["Free","Pro","Enterprise"],"features":[{"name":"SSO","available":[false,true,true]},{"name":"API calls","available":["100/mo","10k/mo","Unlimited"]}]}}',
  },
  user_story_card: {
    description: "agile user story in As a / I want / So that format with acceptance criteria",
    example: '{"kind":"user_story_card","title":"Story","data":{"asA":"logged-in user","iWant":"export my data as CSV","soThat":"I can analyze it offline","acceptanceCriteria":["CSV includes all columns","Download triggers immediately"],"priority":"high","storyPoints":3}}',
  },
  kb_summary: {
    description: "knowledge base summary with top facts, entities, and source document count",
    example: '{"kind":"kb_summary","title":"KB Overview","data":{"docCount":42,"topFacts":[{"fact":"Q1 revenue grew 18% YoY","source":"q1-report.pdf"}],"entities":[{"name":"BrainOS","type":"product"}],"domains":["finance","product"]}}',
  },
  agent_job: {
    description: "real-time progress tracker for a queued general or APEX agent job — streams live status, current step, and result on completion",
    example: '{"kind":"agent_job","title":"Running agent","data":{"jobId":"abc-123","agentType":"general","task":"Analyze Q1 revenue trends and flag anomalies","status":"pending"}}',
  },
};

/**
 * Returns the widget system prompt block appended to effectiveSystemPrompt
 * in chat/route.ts. Auto-generated from WIDGET_SCHEMAS — stays in sync
 * whenever a new widget schema is added.
 */
export function getWidgetSystemPrompt(): string {
  const typeLines = Object.entries(WIDGET_SCHEMAS)
    .map(([kind, s]) => `- **${kind}** — ${s.description}:\n  \`${s.example}\``)
    .join("\n");

  return `

## WIDGET SYSTEM
You can render rich interactive UI widgets by wrapping a JSON spec in a \`\`\`widget code fence.
Use widgets to visualize data — prefer them over plain prose when presenting metrics, trends, comparisons, or tabular data.

**You can invent any widget kind name** — the renderer auto-detects the data shape and picks the best visualization. Common known types (optimised renderers available):
${typeLines}

**Auto-rendered data shapes** (use any kind name you want):
- Has \`rows\` + \`columns\` arrays → table
- Has \`metrics\` array → metric grid
- Has \`values\` number array → sparkline
- Has \`series\` + \`rows\` → chart
- Has \`score\` number → ring
- Has \`items\` or \`steps\` array → bullet/step list
- Anything else → key-value card

Guidelines:
- Widgets can appear anywhere in your response — embed them between paragraphs
- Invent descriptive kind names: \`timeline\`, \`heatmap\`, \`risk_matrix\`, \`roadmap\`, \`okr_tracker\` — the system will render them intelligently
- Always include real data values — never use placeholder data
- If you don't have enough data to populate a widget, use plain text instead`;
}
