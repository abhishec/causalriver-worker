#!/usr/bin/env tsx
/**
 * Register Security Agent to Agent Registry
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This registers the Security Hardening Agent to the global agent registry
 * and runs it immediately.
 */

import { globalRegistry } from './agent-framework/agent-registry';
import { SecurityHardeningAgent } from './agents/security-hardening-agent';
import type { BrainNativeAgentConfig } from './agent-framework/brain-native-agent-template';
import type { ManusCapabilitiesConfig } from './agent-framework/brain-native-agent-v5-manus';
import dotenv from 'dotenv';

// Load environment
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER AGENT
// ═══════════════════════════════════════════════════════════════════════════

console.log('Registering Security Hardening Agent...\n');

globalRegistry.register({
  name: 'security-hardening-agent',
  description: 'Autonomous security vulnerability detection and automated patching',
  version: '1.0.0',

  factory: (config) => {
    return new SecurityHardeningAgent({
      ...config,
      enableMotorCommands: true,
      enableCalibration: true,
      enableAgentRegistry: true,
      motorCommandAutoExecuteThreshold: 0.9,
    } as BrainNativeAgentConfig & ManusCapabilitiesConfig);
  },

  schedule: '0 2 * * *', // Daily at 2 AM

  resourceRequirements: {
    cpu: '2048',    // 2 vCPU
    memory: '4096', // 4 GB
  },

  tags: ['security', 'compliance', 'infrastructure', 'daily'],
});

console.log('✓ Security Agent registered successfully!\n');

// ═══════════════════════════════════════════════════════════════════════════
// PRINT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

globalRegistry.printSummary();

// ═══════════════════════════════════════════════════════════════════════════
// RUN AGENT (if --run flag provided)
// ═══════════════════════════════════════════════════════════════════════════

const shouldRun = process.argv.includes('--run');
const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

if (shouldRun) {
  console.log('Starting Security Hardening Agent...\n');

  const config: BrainNativeAgentConfig & ManusCapabilitiesConfig = {
    organizationId: process.env.DEFAULT_ORG_ID || '00000000-0000-4000-a000-000000000001',
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    dryRun: isDryRun,
    verbose: isVerbose,
    brainRegionConfig: {
      enableAll: true,
      verbose: isVerbose,
    },
    enableMotorCommands: !isDryRun,
    enableCalibration: true,
    enableAgentRegistry: true,
    motorCommandAutoExecuteThreshold: 0.9,
  };

  const agent = globalRegistry.createAgent('security-hardening-agent', config);

  agent.run()
    .then(result => {
      console.log('\n' + '═'.repeat(80));
      console.log('AGENT RUN COMPLETE');
      console.log('═'.repeat(80));
      console.log(`Agent: ${agent.constructor.name}`);
      console.log(`Duration: ${result.completedAt.getTime() - result.startedAt.getTime()}ms`);
      console.log(`Signals: ${result.signalsGenerated}`);
      console.log(`Packs: ${result.packsProcessed}`);
      console.log(`Errors: ${result.errorsEncountered.length}`);

      if ('motorCommands' in result && result.motorCommands) {
        console.log(`\nMotor Commands:`);
        console.log(`  Generated: ${result.motorCommands.commandsGenerated}`);
        console.log(`  Executed: ${result.motorCommands.commandsExecuted}`);
        console.log(`  Failed: ${result.motorCommands.commandsFailed}`);
        console.log(`  Pending: ${result.motorCommands.commandsPendingApproval}`);
      }

      process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('\n❌ FATAL ERROR:', err);
      if (isVerbose && err instanceof Error) {
        console.error('Stack:', err.stack);
      }
      process.exit(1);
    });
} else {
  console.log('Agent registered. Use --run flag to execute immediately.\n');
  console.log('Examples:');
  console.log('  tsx scripts/register-security-agent.ts --run');
  console.log('  tsx scripts/register-security-agent.ts --run --dry-run');
  console.log('  tsx scripts/register-security-agent.ts --run --verbose\n');
}
