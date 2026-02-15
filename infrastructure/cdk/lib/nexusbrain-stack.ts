/**
 * NexusBrain CDK Stack - Complete Infrastructure
 * ═══════════════════════════════════════════════════════════════
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface NexusBrainStackProps extends cdk.StackProps {
  environment: string;
  minCapacity: number;
  maxCapacity: number;
  targetCpuUtilization?: number;
  redisCacheNodeType?: string;
  taskCpu?: number;
  taskMemory?: number;
}

export class NexusBrainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NexusBrainStackProps) {
    super(scope, id, props);

    const {
      environment,
      minCapacity,
      maxCapacity,
      targetCpuUtilization = 70,
      redisCacheNodeType = 'cache.t3.medium',
      taskCpu = 2048,
      taskMemory = 4096,
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
    // VPC
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
        generateStringKey: 'PLACEHOLDER',
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

    // Update secrets with Redis endpoint
    const redisEndpoint = `redis://${redisCluster.attrRedisEndpointAddress}:${redisCluster.attrRedisEndpointPort}`;

    // ═════════════════════════════════════════════════════════════
    // ECR REPOSITORY
    // ═════════════════════════════════════════════════════════════

    const ecrRepo = new ecr.Repository(this, 'ECRRepository', {
      repositoryName: 'nexusbrain',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep last 10 images',
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ═════════════════════════════════════════════════════════════
    // ECS CLUSTER
    // ═════════════════════════════════════════════════════════════

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${environment}-nexusbrain`,
      containerInsights: true,
    });

    // ═════════════════════════════════════════════════════════════
    // TASK DEFINITION
    // ═════════════════════════════════════════════════════════════

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    appSecrets.grantRead(executionRole);

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${environment}-nexusbrain`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: taskCpu,
      memoryLimitMiB: taskMemory,
      taskRole,
      executionRole,
    });

    const container = taskDefinition.addContainer('nexusbrain', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'nexusbrain',
        logGroup,
      }),
      environment: {
        PORT: '3000',
        REDIS_URL: redisEndpoint,
      },
      secrets: {
        SUPABASE_URL: ecs.Secret.fromSecretsManager(appSecrets, 'SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'SUPABASE_SERVICE_ROLE_KEY'),
        ORGANIZATION_ID: ecs.Secret.fromSecretsManager(appSecrets, 'ORGANIZATION_ID'),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ANTHROPIC_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        SLACK_BOT_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, 'SLACK_BOT_TOKEN'),
        JIRA_HOST: ecs.Secret.fromSecretsManager(appSecrets, 'JIRA_HOST'),
        JIRA_EMAIL: ecs.Secret.fromSecretsManager(appSecrets, 'JIRA_EMAIL'),
        JIRA_API_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, 'JIRA_API_TOKEN'),
        GITHUB_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_TOKEN'),
        GITHUB_REPOS: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_REPOS'),
        NODE_ENV: ecs.Secret.fromSecretsManager(appSecrets, 'NODE_ENV'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/api/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // Allow ECS to access Redis
    redisSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(cluster.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(6379),
      'Allow ECS to Redis'
    );

    // ═════════════════════════════════════════════════════════════
    // APPLICATION LOAD BALANCER
    // ═════════════════════════════════════════════════════════════

    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: `${environment}-nexusbrain`,
    });

    const listener = alb.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // ═════════════════════════════════════════════════════════════
    // ECS SERVICE
    // ═════════════════════════════════════════════════════════════

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      serviceName: `${environment}-nexusbrain`,
      desiredCount: minCapacity,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 4,
        },
      ],
    });

    // Add to load balancer
    listener.addTargets('ECS', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Auto-scaling
    const scaling = service.autoScaleTaskCount({
      minCapacity,
      maxCapacity,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: targetCpuUtilization,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // ═════════════════════════════════════════════════════════════
    // CI/CD PIPELINE (OPTIONAL - AUTO-BUILD FROM GITHUB)
    // ═════════════════════════════════════════════════════════════

    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
        environmentVariables: {
          ECR_REPOSITORY_URI: {
            value: ecrRepo.repositoryUri,
          },
          AWS_DEFAULT_REGION: {
            value: this.region,
          },
        },
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('infrastructure/buildspec.yml'),
    });

    ecrRepo.grantPullPush(buildProject);

    // ═════════════════════════════════════════════════════════════
    // OUTPUTS
    // ═════════════════════════════════════════════════════════════

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS name',
      exportName: `${environment}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redisEndpoint,
      description: 'Redis cluster endpoint',
      exportName: `${environment}-RedisEndpoint`,
    });

    new cdk.CfnOutput(this, 'ECRRepositoryURI', {
      value: ecrRepo.repositoryUri,
      description: 'ECR repository URI',
      exportName: `${environment}-ECRRepositoryURI`,
    });

    new cdk.CfnOutput(this, 'ECSClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name',
      exportName: `${environment}-ECSClusterName`,
    });

    new cdk.CfnOutput(this, 'HealthEndpoint', {
      value: `http://${alb.loadBalancerDnsName}/api/health`,
      description: 'Health check endpoint',
    });
  }
}
