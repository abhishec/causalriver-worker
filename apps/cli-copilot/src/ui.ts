/**
 * UI Helpers — ANSI colors, banner, spinner, formatting
 * ═══════════════════════════════════════════════════════
 * Terminal display utilities for the NexusBrain CLI Copilot.
 */

// ═══════════════════════════════════════════════════════════════
// ANSI COLORS
// ═══════════════════════════════════════════════════════════════

export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// ═══════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════

export function log(msg: string) {
  console.log(msg);
}

export function logStep(msg: string) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`);
}

export function logWarn(msg: string) {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
}

export function logError(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`);
}

export function logInfo(msg: string) {
  console.log(`  ${C.dim}${msg}${C.reset}`);
}

export function logDim(msg: string) {
  console.log(`${C.dim}${msg}${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════
// BANNER
// ═══════════════════════════════════════════════════════════════

export function printBanner(orgName?: string) {
  const name = orgName || 'NexusBrain Copilot';
  log('');
  log(`${C.bold}${C.cyan}  ╔══════════════════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}  ║${C.reset}  ${C.bold}🧠 NexusBrain CLI Copilot${C.reset}                                ${C.bold}${C.cyan}║${C.reset}`);
  log(`${C.bold}${C.cyan}  ║${C.reset}  ${C.dim}24-region brain • Claude-powered • Multi-turn chat${C.reset}      ${C.bold}${C.cyan}║${C.reset}`);
  log(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════════════════════╝${C.reset}`);
  log('');
  log(`  ${C.dim}Org:${C.reset} ${C.bold}${name}${C.reset}`);
  log('');
}

// ═══════════════════════════════════════════════════════════════
// BRAIN STATS
// ═══════════════════════════════════════════════════════════════

export function printBrainStats(stats: {
  causalEdges: number;
  rules: number;
  patterns: number;
  cascadeRules: number;
}) {
  log(`  ${C.cyan}Brain Knowledge Loaded:${C.reset}`);
  log(`    ${C.green}▸${C.reset} ${stats.causalEdges} causal edges`);
  log(`    ${C.green}▸${C.reset} ${stats.rules} business rules`);
  log(`    ${C.green}▸${C.reset} ${stats.patterns} patterns`);
  log(`    ${C.green}▸${C.reset} ${stats.cascadeRules} cascade rules`);
  log('');
}

// ═══════════════════════════════════════════════════════════════
// BRAIN METADATA DISPLAY
// ═══════════════════════════════════════════════════════════════

export function printBrainMeta(meta: {
  intent: string;
  domains: string[];
  confidence: number;
  regionsUsed: string[];
  uncertainAreas: string[];
}) {
  log('');
  log(`  ${C.cyan}${C.bold}Brain Context Metadata${C.reset}`);
  log(`  ${'─'.repeat(40)}`);
  log(`  ${C.dim}Intent:${C.reset}      ${C.bold}${meta.intent}${C.reset}`);
  log(`  ${C.dim}Domains:${C.reset}     ${meta.domains.join(', ') || 'none'}`);
  log(`  ${C.dim}Confidence:${C.reset}  ${formatConfidence(meta.confidence)}`);
  log(`  ${C.dim}Regions:${C.reset}     ${meta.regionsUsed.join(', ') || 'none'}`);
  if (meta.uncertainAreas.length > 0) {
    log(`  ${C.dim}Uncertain:${C.reset}   ${C.yellow}${meta.uncertainAreas.join(', ')}${C.reset}`);
  }
  log('');
}

function formatConfidence(confidence: number): string {
  const pct = (confidence * 100).toFixed(0);
  if (confidence >= 0.8) return `${C.green}${pct}%${C.reset}`;
  if (confidence >= 0.5) return `${C.yellow}${pct}%${C.reset}`;
  return `${C.red}${pct}%${C.reset}`;
}

// ═══════════════════════════════════════════════════════════════
// SPINNER
// ═══════════════════════════════════════════════════════════════

export function createSpinner(label: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      interval = setInterval(() => {
        process.stdout.write(`\r  ${C.cyan}${frames[i % frames.length]}${C.reset} ${label}`);
        i++;
      }, 80);
    },
    stop(success = true) {
      if (interval) clearInterval(interval);
      const icon = success ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      process.stdout.write(`\r  ${icon} ${label}\n`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════

export function printHelp() {
  log('');
  log(`  ${C.bold}Commands:${C.reset}`);
  log(`    ${C.cyan}/brain${C.reset}    Show last brain context metadata (intent, domains, confidence)`);
  log(`    ${C.cyan}/clear${C.reset}    Clear conversation history`);
  log(`    ${C.cyan}/reload${C.reset}   Re-fetch brain knowledge from database`);
  log(`    ${C.cyan}/help${C.reset}     Show this help message`);
  log(`    ${C.cyan}/quit${C.reset}     Exit the copilot`);
  log('');
}

// ═══════════════════════════════════════════════════════════════
// PROMPT
// ═══════════════════════════════════════════════════════════════

export function getPrompt(): string {
  return `${C.bold}${C.blue}you ›${C.reset} `;
}

export function printAssistantPrefix() {
  process.stdout.write(`\n${C.bold}${C.magenta}brain ›${C.reset} `);
}

export function printDivider() {
  log(`${C.dim}${'─'.repeat(60)}${C.reset}`);
}
