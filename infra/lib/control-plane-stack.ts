import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import type { TraceInfraConfig } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { FoundationStack } from "./foundation-stack.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface ControlPlaneStackProps extends StackProps {
  config: TraceInfraConfig;
  foundation: FoundationStack;
  data: DataStack;
}

export class ControlPlaneStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly repository: ecr.Repository;
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly webService: ecs.FargateService;
  readonly apiService: ecs.FargateService;
  readonly migrationTaskDefinition: ecs.FargateTaskDefinition;
  readonly apiSecurityGroup: ec2.SecurityGroup;
  readonly webSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: ControlPlaneStackProps) {
    super(scope, id, props);
    const { config, foundation, data } = props;
    applyStandardTags(this, config);
    const retained = config.retainDataOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const logsKey = kms.Key.fromKeyArn(this, "ImportedLogsKey", foundation.logsKey.keyArn);

    this.repository = foundation.controlPlaneRepository;

    this.cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: resourceName(config, "control-plane"),
      vpc: foundation.vpc,
      enableFargateCapacityProviders: true,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "public-alb"),
      description: "Public HTTPS ingress for Trace",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Public HTTPS");
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(443), "Public HTTPS IPv6");
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP redirect");
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80), "HTTP redirect IPv6");

    this.apiSecurityGroup = new ec2.SecurityGroup(this, "ApiSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "api"),
      allowAllOutbound: true,
    });
    this.apiSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(4000), "ALB to API");
    for (const [ruleId, targetSecurityGroup, port] of [
      ["ApiToControlDatabase", data.controlDatabaseSecurityGroup, data.controlDatabasePort],
      ["ApiToRedis", data.redisSecurityGroup, 6379],
      ["ApiToGitEfs", data.gitSecurityGroup, 2049],
    ] as const) {
      new ec2.CfnSecurityGroupIngress(this, ruleId, {
        groupId: targetSecurityGroup.securityGroupId,
        sourceSecurityGroupId: this.apiSecurityGroup.securityGroupId,
        ipProtocol: "tcp",
        fromPort: port,
        toPort: port,
        description: "Trace API and migration tasks",
      });
    }
    this.webSecurityGroup = new ec2.SecurityGroup(this, "WebSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "web"),
      allowAllOutbound: true,
    });
    this.webSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(3000), "ALB to web");

    const image = ecs.ContainerImage.fromEcrRepository(this.repository, config.controlImageTag);
    const webLogGroup = new logs.LogGroup(this, "WebLogGroup", {
      logGroupName: `/trace/${config.environmentName}/web`,
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: logsKey,
      removalPolicy: retained,
    });
    const webTask = new ecs.FargateTaskDefinition(this, "WebTask", {
      family: resourceName(config, "web"),
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    const webContainer = webTask.addContainer("web", {
      containerName: "web",
      image,
      essential: true,
      environment: { ROLE: "web", NODE_ENV: "production" },
      logging: ecs.LogDrivers.awsLogs({ logGroup: webLogGroup, streamPrefix: "web" }),
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(20),
      },
    });
    webContainer.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });
    this.webService = new ecs.FargateService(this, "WebService", {
      serviceName: resourceName(config, "web"),
      cluster: this.cluster,
      taskDefinition: webTask,
      desiredCount: config.webDesiredCount,
      assignPublicIp: false,
      securityGroups: [this.webSecurityGroup],
      vpcSubnets: foundation.controlPlaneSubnets,
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    this.webService
      .autoScaleTaskCount({ minCapacity: config.webDesiredCount, maxCapacity: 10 })
      .scaleOnCpuUtilization("WebCpuScaling", {
        targetUtilizationPercent: 60,
        scaleInCooldown: Duration.minutes(5),
        scaleOutCooldown: Duration.minutes(1),
      });

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      logGroupName: `/trace/${config.environmentName}/api`,
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: logsKey,
      removalPolicy: retained,
    });
    const apiTask = this.createApiTaskDefinition(
      "ApiTask",
      config,
      foundation,
      data,
      image,
      apiLogGroup,
      "backend",
    );
    this.apiService = new ecs.FargateService(this, "ApiService", {
      serviceName: resourceName(config, "api"),
      cluster: this.cluster,
      taskDefinition: apiTask,
      desiredCount: config.apiDesiredCount,
      assignPublicIp: false,
      securityGroups: [this.apiSecurityGroup],
      vpcSubnets: foundation.controlPlaneSubnets,
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.minutes(3),
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      enableExecuteCommand: false,
    });

    const migrationLogGroup = new logs.LogGroup(this, "MigrationLogGroup", {
      logGroupName: `/trace/${config.environmentName}/migrations`,
      retention: logs.RetentionDays.THREE_MONTHS,
      encryptionKey: logsKey,
      removalPolicy: retained,
    });
    this.migrationTaskDefinition = this.createApiTaskDefinition(
      "MigrationTask",
      config,
      foundation,
      data,
      image,
      migrationLogGroup,
      "migrate",
    );

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      loadBalancerName: resourceName(config, "public"),
      vpc: foundation.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: foundation.publicSubnets,
      idleTimeout: Duration.minutes(60),
      deletionProtection: config.retainDataOnDelete,
      dropInvalidHeaderFields: true,
      http2Enabled: true,
    });
    const albLogsBucket = new s3.Bucket(this, "AlbLogsBucket", {
      bucketName: `${resourceName(config, "alb-logs")}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ expiration: Duration.days(90) }],
      removalPolicy: retained,
      autoDeleteObjects: !config.retainDataOnDelete,
    });
    this.loadBalancer.logAccessLogs(albLogsBucket, "alb");
    this.loadBalancer.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });
    const httpsListener = this.loadBalancer.addListener("HttpsListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [foundation.certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elbv2.ListenerAction.forward([
        new elbv2.ApplicationTargetGroup(this, "WebTargetGroup", {
          targetGroupName: resourceName(config, "web"),
          vpc: foundation.vpc,
          port: 3000,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targetType: elbv2.TargetType.IP,
          targets: [this.webService],
          healthCheck: { path: "/", healthyHttpCodes: "200-399" },
          deregistrationDelay: Duration.seconds(30),
        }),
      ]),
    });
    const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, "ApiTargetGroup", {
      targetGroupName: resourceName(config, "api"),
      vpc: foundation.vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      protocolVersion: elbv2.ApplicationProtocolVersion.HTTP1,
      targetType: elbv2.TargetType.IP,
      targets: [this.apiService],
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
      },
      deregistrationDelay: Duration.minutes(5),
    });
    // The app gateway is not built yet; without this rule generated-app hosts
    // would fall through to the web frontend default action.
    httpsListener.addAction("AppsHosts", {
      priority: 4,
      conditions: [elbv2.ListenerCondition.hostHeaders([`*.apps.${config.domainName}`])],
      action: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/plain",
        messageBody: "App gateway is not deployed",
      }),
    });
    httpsListener.addAction("PreviewHosts", {
      priority: 5,
      conditions: [elbv2.ListenerCondition.hostHeaders([`*.preview.${config.domainName}`])],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    httpsListener.addAction("ApiPaths", {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([
          "/graphql*",
          "/ws*",
          "/bridge*",
          "/terminal*",
          "/health*",
        ]),
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    httpsListener.addAction("ServicePaths", {
      priority: 11,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([
          "/auth/*",
          "/uploads/*",
          "/git/*",
          "/slack/*",
          "/webhooks/*",
        ]),
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    httpsListener.addAction("AssociationPaths", {
      priority: 12,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/.well-known/*", "/apple-app-site-association"]),
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: resourceName(config, "public"),
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: resourceName(config, "waf"),
        sampledRequestsEnabled: true,
      },
      rules: [
        this.managedRule("CommonRules", 10, "AWSManagedRulesCommonRuleSet", [
          {
            name: "SizeRestrictions_BODY",
            actionToUse: { count: {} },
          },
        ]),
        this.managedRule("KnownBadInputs", 20, "AWSManagedRulesKnownBadInputsRuleSet"),
        {
          name: "GlobalRateLimit",
          priority: 30,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: "IP",
              limit: 3000,
              // Session runtimes egress through shared NAT IPs; rate-limiting
              // their bridge and Git traffic by IP would block every session
              // at once under normal aggregate load.
              scopeDownStatement: {
                notStatement: {
                  statement: {
                    orStatement: {
                      statements: [
                        this.pathPrefixStatement("/bridge"),
                        this.pathPrefixStatement("/git/"),
                      ],
                    },
                  },
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: resourceName(config, "waf-rate-limit"),
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
    const wafLogGroup = new logs.LogGroup(this, "WafLogGroup", {
      logGroupName: `aws-waf-logs-${resourceName(config, "public")}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: retained,
    });
    new wafv2.CfnLoggingConfiguration(this, "WafLogging", {
      resourceArn: webAcl.attrArn,
      logDestinationConfigs: [wafLogGroup.logGroupArn],
      redactedFields: [
        { singleHeader: { Name: "authorization" } },
        { singleHeader: { Name: "cookie" } },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WebAclAssociation", {
      resourceArn: this.loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    const albTarget = route53.RecordTarget.fromAlias(
      new route53Targets.LoadBalancerTarget(this.loadBalancer),
    );
    new route53.ARecord(this, "RootAlias", {
      zone: foundation.hostedZone,
      recordName: config.domainName,
      target: albTarget,
    });
    new route53.ARecord(this, "PreviewAlias", {
      zone: foundation.hostedZone,
      recordName: `*.preview.${config.domainName}`,
      target: albTarget,
    });
    new route53.ARecord(this, "AppsAlias", {
      zone: foundation.hostedZone,
      recordName: `*.apps.${config.domainName}`,
      target: albTarget,
    });

    new CfnOutput(this, "PublicUrl", { value: `https://${config.domainName}` });
    new CfnOutput(this, "ControlPlaneRepositoryUri", { value: this.repository.repositoryUri });
    new CfnOutput(this, "ClusterName", { value: this.cluster.clusterName });
    new CfnOutput(this, "MigrationTaskDefinitionArn", {
      value: this.migrationTaskDefinition.taskDefinitionArn,
    });
    new CfnOutput(this, "ControlSubnetIds", {
      value: foundation.controlPlaneSubnetIds.join(","),
    });
    new CfnOutput(this, "MigrationSecurityGroupIds", {
      value: this.apiSecurityGroup.securityGroupId,
    });
  }

  private createApiTaskDefinition(
    id: string,
    config: TraceInfraConfig,
    foundation: FoundationStack,
    data: DataStack,
    image: ecs.ContainerImage,
    logGroup: logs.ILogGroup,
    role: "backend" | "migrate",
  ): ecs.FargateTaskDefinition {
    const taskRole = new iam.Role(this, `${id}TaskRole`, {
      roleName: resourceName(config, role === "backend" ? "api-task" : "migration-task"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    if (role === "backend") {
      taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ["sts:AssumeRole"],
          resources: [
            Stack.of(this).formatArn({
              service: "iam",
              resource: "role",
              resourceName: resourceName(config, "app-deployer"),
            }),
          ],
        }),
      );
    }
    const task = new ecs.FargateTaskDefinition(this, id, {
      family: resourceName(config, role === "backend" ? "api" : "migration"),
      cpu: config.apiCpu,
      memoryLimitMiB: config.apiMemoryMiB,
      taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    task.addVolume({
      name: "managed-git",
      efsVolumeConfiguration: {
        fileSystemId: data.gitFileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        authorizationConfig: {
          accessPointId: data.gitAccessPoint.accessPointId,
          iam: "ENABLED",
        },
      },
    });
    const container = task.addContainer(role, {
      containerName: role,
      image,
      essential: true,
      environment: {
        ROLE: role,
        NODE_ENV: "production",
        PORT: "4000",
        DATABASE_HOST: data.controlDatabaseEndpoint,
        DATABASE_PORT: String(data.controlDatabasePort),
        DATABASE_NAME: data.controlDatabaseName,
        REDIS_URL: `rediss://${data.redisEndpointAddress}:${data.redisPort}`,
        TRACE_WEB_URL: `https://${config.domainName}`,
        TRACE_SERVER_PUBLIC_URL: `https://${config.domainName}`,
        TRACE_CLOUD_BRIDGE_URL: `wss://${config.domainName}/bridge`,
        TRACE_AUTH_COOKIE_SAME_SITE: "lax",
        CORS_ALLOWED_ORIGINS: `https://${config.domainName}`,
        STORAGE_MODE: "s3",
        S3_BUCKET: data.artifactBucket.bucketName,
        AWS_REGION: Stack.of(this).region,
        GIT_STORAGE_MODE: "local",
        GIT_STORAGE_ROOT: "/mnt/trace-git",
        TRACE_ENDPOINT_PREVIEW_BASE_HOST: `preview.${config.domainName}`,
        TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME: "https",
        TRACE_CLOUD_SESSION_GROUP_IDLE_CLEANUP_AFTER_MS: "600000",
        TRACE_CLOUD_SESSION_GROUP_IDLE_CLEANUP_INTERVAL_MS: "60000",
        SLACK_REDIRECT_URI: `https://${config.domainName}/slack/oauth/callback`,
      },
      secrets: {
        DATABASE_USER: ecs.Secret.fromSecretsManager(data.controlDatabaseSecret, "username"),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(data.controlDatabaseSecret, "password"),
        JWT_SECRET: ecs.Secret.fromSecretsManager(data.jwtSecret),
        TOKEN_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(data.tokenEncryptionSecret),
        GITHUB_CLIENT_ID: ecs.Secret.fromSecretsManager(data.integrationSecret, "GITHUB_CLIENT_ID"),
        GITHUB_CLIENT_SECRET: ecs.Secret.fromSecretsManager(
          data.integrationSecret,
          "GITHUB_CLIENT_SECRET",
        ),
        SLACK_CLIENT_ID: ecs.Secret.fromSecretsManager(data.integrationSecret, "SLACK_CLIENT_ID"),
        SLACK_CLIENT_SECRET: ecs.Secret.fromSecretsManager(
          data.integrationSecret,
          "SLACK_CLIENT_SECRET",
        ),
        SLACK_SIGNING_SECRET: ecs.Secret.fromSecretsManager(
          data.integrationSecret,
          "SLACK_SIGNING_SECRET",
        ),
        APPLE_TEAM_ID: ecs.Secret.fromSecretsManager(data.integrationSecret, "APPLE_TEAM_ID"),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: role }),
      healthCheck:
        role === "backend"
          ? {
              command: [
                "CMD-SHELL",
                "node -e \"fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
              ],
              interval: Duration.seconds(30),
              timeout: Duration.seconds(5),
              retries: 3,
              startPeriod: Duration.minutes(2),
            }
          : undefined,
    });
    if (role === "backend") container.addPortMappings({ containerPort: 4000 });
    container.addMountPoints({
      containerPath: "/mnt/trace-git",
      sourceVolume: "managed-git",
      readOnly: false,
    });

    data.artifactBucket.grantReadWrite(task.taskRole);
    data.controlDatabaseSecret.grantRead(task.executionRole!);
    data.controlDatabaseSecretKmsKey?.grantDecrypt(task.executionRole!);
    data.gitFileSystem.grantReadWrite(task.taskRole);
    task.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"],
        resources: [data.gitFileSystem.fileSystemArn],
        conditions: {
          StringEquals: {
            "elasticfilesystem:AccessPointArn": data.gitAccessPoint.accessPointArn,
          },
        },
      }),
    );
    const artifactKey = kms.Key.fromKeyArn(this, `${id}ArtifactKey`, foundation.artifactKey.keyArn);
    artifactKey.grantEncryptDecrypt(task.taskRole);
    return task;
  }

  private pathPrefixStatement(prefix: string): wafv2.CfnWebACL.StatementProperty {
    return {
      byteMatchStatement: {
        fieldToMatch: { uriPath: {} },
        positionalConstraint: "STARTS_WITH",
        searchString: prefix,
        textTransformations: [{ priority: 0, type: "NONE" }],
      },
    };
  }

  private managedRule(
    name: string,
    priority: number,
    managedRuleName: string,
    ruleActionOverrides?: wafv2.CfnWebACL.RuleActionOverrideProperty[],
  ): wafv2.CfnWebACL.RuleProperty {
    return {
      name,
      priority,
      overrideAction: { none: {} },
      statement: {
        managedRuleGroupStatement: {
          name: managedRuleName,
          vendorName: "AWS",
          ruleActionOverrides,
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: name,
        sampledRequestsEnabled: true,
      },
    };
  }
}
