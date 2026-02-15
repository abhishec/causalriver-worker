#!/usr/bin/env node
/**
 * NexusBrain AWS CDK App - One-Click Deployment
 * ═══════════════════════════════════════════════════════════════
 *
 * Fully automated AWS infrastructure deployment
 * No manual steps required - everything driven by code
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NexusBrainStack } from '../lib/nexusbrain-stack';

const app = new cdk.App();

// Production stack
new NexusBrainStack(app, 'NexusBrainProduction', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  stackName: 'nexusbrain-production',
  environment: 'production',

  // Auto-scaling configuration
  minCapacity: 2,
  maxCapacity: 10,
  targetCpuUtilization: 70,

  // Resource configuration
  redisCacheNodeType: 'cache.t3.medium',
  taskCpu: 2048,
  taskMemory: 4096,

  // Tags
  tags: {
    Project: 'NexusBrain',
    Environment: 'Production',
    ManagedBy: 'CDK',
  },
});

// Staging stack (optional)
new NexusBrainStack(app, 'NexusBrainStaging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  stackName: 'nexusbrain-staging',
  environment: 'staging',
  minCapacity: 1,
  maxCapacity: 4,
  redisCacheNodeType: 'cache.t3.micro',
  taskCpu: 1024,
  taskMemory: 2048,
  tags: {
    Project: 'NexusBrain',
    Environment: 'Staging',
    ManagedBy: 'CDK',
  },
});

app.synth();
