/**
 * NexusBrain App Runner Stack - Simplified Deployment
 * ═══════════════════════════════════════════════════════════════
 *
 * AWS App Runner advantages:
 * - Auto-builds Docker images from GitHub (no local Docker needed)
 * - Auto-scaling built-in
 * - Simpler than ECS (no ALB, no task definitions)
 * - Perfect for long-running services like brain-orchestrator
 */

import * as cdk from 'aws-cdk-lib';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface NexusBrainAppRunnerStackProps extends cdk.StackProps {
  environment: string;
  githubRepo: string;  // e.g., "owner/repo"
  githubBranch?: string;
  instanceCpu?: string;
  instanceMemory?: string;
  redisCacheNodeType?: string;
}

export class NexusBrainAppRunnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NexusBrainAppRunnerStackProps) {
    super(scope, id, props);

    const {
      environment,
      githubRepo,
      githubBranch = 'main',
      instanceCpu = '2 vCPU',
      instanceMemory = '4 GB',
      redisCacheNodeType = 'cache.t3.medium',
    } = props;

    // ═════════════════════════════════════════════════════════════
    // LOAD SECRETS FROM .env FILE
    // ═════════════════════════════════════════════════════════════

    const envPath = path.join(__dirname, '../../../.env');
    const envVars: Record<string, string> = {};

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (value) envVars[key] = value;
        }
      });
    }

    // ═════════════════════════════════════════════════════════════
    // VPC FOR REDIS
    // ═════════════════════════════════════════════════════════════

    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ═════════════════════════════════════════════════════════════
    // SECRETS MANAGER
    // ═════════════════════════════════════════════════════════════

    const appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: `${environment}/nexusbrain/credentials`,
      description: 'NexusBrain application secrets',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          SUPABASE_URL: envVars.SUPABASE_URL || '',
          SUPABASE_SERVICE_ROLE_KEY: envVars.SUPABASE_SERVICE_ROLE_KEY || '',
          ORGANIZATION_ID: envVars.ORGANIZATION_ID || 'org-nexusbrain-core',
          ANTHROPIC_API_KEY: envVars.ANTHROPIC_API_KEY || '',
          OPENAI_API_KEY: envVars.OPENAI_API_KEY || '',
          SLACK_BOT_TOKEN: envVars.SLACK_BOT_TOKEN || '',
          JIRA_HOST: envVars.JIRA_HOST || '',
          JIRA_EMAIL: envVars.JIRA_EMAIL || '',
          JIRA_API_TOKEN: envVars.JIRA_API_TOKEN || '',
          GITHUB_TOKEN: envVars.GITHUB_TOKEN || '',
          GITHUB_REPOS: envVars.GITHUB_REPOS || '',
          NODE_ENV: 'production',
        }),
        generateStringKey: 'generated_secret_key',
        excludePunctuation: false,
        includeSpace: false,
        passwordLength: 64,
      },
    });

    // ═════════════════════════════════════════════════════════════
    // REDIS ELASTICACHE
    // ═════════════════════════════════════════════════════════════

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis cluster',
      allowAllOutbound: true,
    });

    // Allow App Runner to access Redis (we'll add this after creating App Runner)
    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow VPC to Redis'
    );

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    const redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: redisCacheNodeType,
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      engineVersion: '7.0',
      autoMinorVersionUpgrade: true,
    });

    const redisEndpoint = `redis://${redisCluster.attrRedisEndpointAddress}:${redisCluster.attrRedisEndpointPort}`;

    // ═════════════════════════════════════════════════════════════
    // VPC CONNECTOR FOR APP RUNNER
    // ═════════════════════════════════════════════════════════════

    const vpcConnector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
      subnets: vpc.privateSubnets.map(subnet => subnet.subnetId),
      securityGroups: [redisSecurityGroup.securityGroupId],
    });

    // ═════════════════════════════════════════════════════════════
    // IAM ROLES FOR APP RUNNER
    // ═════════════════════════════════════════════════════════════

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });

    appSecrets.grantRead(instanceRole);

    const accessRole = new iam.Role(this, 'AccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
      ],
    });

    // ═════════════════════════════════════════════════════════════
    // APP RUNNER SERVICE
    // ═════════════════════════════════════════════════════════════

    const appRunnerService = new apprunner.CfnService(this, 'Service', {
      serviceName: `${environment}-nexusbrain`,
      sourceConfiguration: {
        authenticationConfiguration: {
          connectionArn: `arn:aws:apprunner:${this.region}:${this.account}:connection/nexusbrain-github`,
        },
        autoDeploymentsEnabled: true,
        codeRepository: {
          repositoryUrl: `https://github.com/${githubRepo}`,
          sourceCodeVersion: {
            type: 'BRANCH',
            value: githubBranch,
          },
          codeConfiguration: {
            configurationSource: 'API',
            codeConfigurationValues: {
              runtime: 'NODEJS_20',
              buildCommand: 'pnpm install && pnpm build',
              startCommand: 'pnpm exec tsx scripts/brain-orchestrator.ts',
              port: '3000',
              runtimeEnvironmentVariables: [
                { name: 'PORT', value: '3000' },
                { name: 'REDIS_URL', value: redisEndpoint },
                { name: 'NODE_ENV', value: 'production' },
              ],
              runtimeEnvironmentSecrets: [
                { name: 'SUPABASE_URL', value: `${appSecrets.secretArn}:SUPABASE_URL::` },
                { name: 'SUPABASE_SERVICE_ROLE_KEY', value: `${appSecrets.secretArn}:SUPABASE_SERVICE_ROLE_KEY::` },
                { name: 'ORGANIZATION_ID', value: `${appSecrets.secretArn}:ORGANIZATION_ID::` },
                { name: 'ANTHROPIC_API_KEY', value: `${appSecrets.secretArn}:ANTHROPIC_API_KEY::` },
                { name: 'OPENAI_API_KEY', value: `${appSecrets.secretArn}:OPENAI_API_KEY::` },
                { name: 'SLACK_BOT_TOKEN', value: `${appSecrets.secretArn}:SLACK_BOT_TOKEN::` },
                { name: 'JIRA_HOST', value: `${appSecrets.secretArn}:JIRA_HOST::` },
                { name: 'JIRA_EMAIL', value: `${appSecrets.secretArn}:JIRA_EMAIL::` },
                { name: 'JIRA_API_TOKEN', value: `${appSecrets.secretArn}:JIRA_API_TOKEN::` },
                { name: 'GITHUB_TOKEN', value: `${appSecrets.secretArn}:GITHUB_TOKEN::` },
                { name: 'GITHUB_REPOS', value: `${appSecrets.secretArn}:GITHUB_REPOS::` },
              ],
            },
          },
        },
      },
      instanceConfiguration: {
        cpu: instanceCpu,
        memory: instanceMemory,
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/api/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    // ═════════════════════════════════════════════════════════════
    // OUTPUTS
    // ═════════════════════════════════════════════════════════════

    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `https://${appRunnerService.attrServiceUrl}`,
      description: 'App Runner service URL',
      exportName: `${environment}-ServiceUrl`,
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redisEndpoint,
      description: 'Redis cluster endpoint',
      exportName: `${environment}-RedisEndpoint`,
    });

    new cdk.CfnOutput(this, 'HealthEndpoint', {
      value: `https://${appRunnerService.attrServiceUrl}/api/health`,
      description: 'Health check endpoint',
    });
  }
}
