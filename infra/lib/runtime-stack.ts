import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { TraceInfraConfig } from "./config.js";
import type { FoundationStack } from "./foundation-stack.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface RuntimeStackProps extends StackProps {
  config: TraceInfraConfig;
  foundation: FoundationStack;
}

export class RuntimeStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly repository: ecr.Repository;
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly runtimeSecurityGroup: ec2.SecurityGroup;
  readonly launcherAuthSecret: secretsmanager.Secret;
  readonly launcherUrl: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);
    const { config, foundation } = props;
    applyStandardTags(this, config);
    const retained = config.retainDataOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const dataKey = kms.Key.fromKeyArn(this, "ImportedDataKey", foundation.dataKey.keyArn);
    const logsKey = kms.Key.fromKeyArn(this, "ImportedLogsKey", foundation.logsKey.keyArn);
    const secretsKey = kms.Key.fromKeyArn(this, "ImportedSecretsKey", foundation.secretsKey.keyArn);

    this.repository = foundation.runtimeRepository;
    this.cluster = new ecs.Cluster(this, "RuntimeCluster", {
      clusterName: resourceName(config, "session-runtime"),
      vpc: foundation.vpc,
      enableFargateCapacityProviders: true,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });
    this.runtimeSecurityGroup = new ec2.SecurityGroup(this, "RuntimeSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "session-runtime"),
      description: "No inbound access; session tasks establish outbound bridge connections",
      allowAllOutbound: true,
    });

    const runtimeLogGroup = new logs.LogGroup(this, "RuntimeLogGroup", {
      logGroupName: `/trace/${config.environmentName}/session-runtime`,
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: logsKey,
      removalPolicy: retained,
    });
    this.taskDefinition = new ecs.FargateTaskDefinition(this, "RuntimeTask", {
      family: resourceName(config, "session-runtime"),
      cpu: config.runtimeCpu,
      memoryLimitMiB: config.runtimeMemoryMiB,
      ephemeralStorageGiB: config.runtimeEphemeralStorageGiB,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    this.taskDefinition.addContainer("runtime", {
      containerName: "runtime",
      image: ecs.ContainerImage.fromEcrRepository(this.repository, config.runtimeImageTag),
      essential: true,
      readonlyRootFilesystem: false,
      logging: ecs.LogDrivers.awsLogs({ logGroup: runtimeLogGroup, streamPrefix: "runtime" }),
      stopTimeout: Duration.seconds(30),
    });

    const runtimeTable = new dynamodb.Table(this, "RuntimeTable", {
      tableName: resourceName(config, "runtime-launches"),
      partitionKey: { name: "runtimeId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: dataKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: "expiresAt",
      removalPolicy: retained,
    });
    this.launcherAuthSecret = new secretsmanager.Secret(this, "LauncherAuthSecret", {
      secretName: `trace/${config.environmentName}/runtime-launcher-token`,
      encryptionKey: secretsKey,
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
        includeSpace: false,
      },
    });
    const launcherLogGroup = new logs.LogGroup(this, "LauncherLogGroup", {
      logGroupName: `/trace/${config.environmentName}/runtime-launcher`,
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: logsKey,
      removalPolicy: retained,
    });
    const launcher = new lambdaNodejs.NodejsFunction(this, "LauncherFunction", {
      functionName: resourceName(config, "runtime-launcher"),
      entry: new URL("../lambda/runtime-launcher/index.ts", import.meta.url).pathname,
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      logGroup: launcherLogGroup,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        externalModules: [],
      },
      environment: {
        CLUSTER_ARN: this.cluster.clusterArn,
        TASK_DEFINITION_ARN: this.taskDefinition.taskDefinitionArn,
        TASK_EXECUTION_ROLE_ARN: this.taskDefinition.executionRole!.roleArn,
        TASK_ROLE_ARN: this.taskDefinition.taskRole.roleArn,
        RUNTIME_CONTAINER_NAME: "runtime",
        SUBNET_IDS: foundation.vpc
          .selectSubnets({ subnetGroupName: "session-runtime" })
          .subnetIds.join(","),
        SECURITY_GROUP_IDS: this.runtimeSecurityGroup.securityGroupId,
        RUNTIME_TABLE_NAME: runtimeTable.tableName,
        AUTH_SECRET_ARN: this.launcherAuthSecret.secretArn,
      },
    });
    runtimeTable.grantReadWriteData(launcher);
    this.launcherAuthSecret.grantRead(launcher);
    launcher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [this.taskDefinition.taskDefinitionArn],
        conditions: { ArnEquals: { "ecs:cluster": this.cluster.clusterArn } },
      }),
    );
    launcher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:DescribeTasks", "ecs:StopTask", "ecs:TagResource"],
        resources: ["*"],
        conditions: { ArnEquals: { "ecs:cluster": this.cluster.clusterArn } },
      }),
    );
    launcher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [
          this.taskDefinition.executionRole!.roleArn,
          this.taskDefinition.taskRole.roleArn,
        ],
        conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
      }),
    );

    const launcherDomain = new apigwv2.DomainName(this, "LauncherDomain", {
      domainName: `launcher.${config.domainName}`,
      certificate: foundation.certificate,
    });
    const api = new apigwv2.HttpApi(this, "LauncherApi", {
      apiName: resourceName(config, "runtime-launcher"),
      description: "Authenticated start, stop, and status API for isolated Trace Fargate sessions",
      createDefaultStage: true,
      disableExecuteApiEndpoint: true,
      defaultDomainMapping: { domainName: launcherDomain },
    });
    const integration = new apigwv2Integrations.HttpLambdaIntegration(
      "LauncherIntegration",
      launcher,
      { payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0 },
    );
    for (const path of ["/start", "/stop", "/status"]) {
      api.addRoutes({
        path,
        methods: [apigwv2.HttpMethod.POST],
        integration,
      });
    }
    const stage = api.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (stage) {
      stage.defaultRouteSettings = {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 20,
        detailedMetricsEnabled: true,
      };
      stage.accessLogSettings = {
        destinationArn: launcherLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: "$context.requestId",
          routeKey: "$context.routeKey",
          status: "$context.status",
          responseLatency: "$context.responseLatency",
          integrationError: "$context.integrationErrorMessage",
        }),
      };
    }
    new route53.ARecord(this, "LauncherAlias", {
      zone: foundation.hostedZone,
      recordName: `launcher.${config.domainName}`,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          launcherDomain.regionalDomainName,
          launcherDomain.regionalHostedZoneId,
        ),
      ),
    });
    this.launcherUrl = `https://launcher.${config.domainName}`;

    const lifecycleDlq = new sqs.Queue(this, "RuntimeLifecycleDlq", {
      queueName: resourceName(config, "runtime-lifecycle-dlq"),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      retentionPeriod: Duration.days(14),
    });
    const lifecycleQueue = new sqs.Queue(this, "RuntimeLifecycleQueue", {
      queueName: resourceName(config, "runtime-lifecycle"),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(2),
      deadLetterQueue: { queue: lifecycleDlq, maxReceiveCount: 5 },
    });
    new events.Rule(this, "RuntimeStateChanges", {
      ruleName: resourceName(config, "runtime-state"),
      description: "Durable feed of Trace runtime ECS state changes for reconciliation",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: { clusterArn: [this.cluster.clusterArn] },
      },
      targets: [new eventTargets.SqsQueue(lifecycleQueue)],
    });

    new CfnOutput(this, "RuntimeRepositoryUri", { value: this.repository.repositoryUri });
    new CfnOutput(this, "RuntimeClusterArn", { value: this.cluster.clusterArn });
    new CfnOutput(this, "LauncherStartUrl", { value: `${this.launcherUrl}/start` });
    new CfnOutput(this, "LauncherStopUrl", { value: `${this.launcherUrl}/stop` });
    new CfnOutput(this, "LauncherStatusUrl", { value: `${this.launcherUrl}/status` });
    new CfnOutput(this, "LauncherAuthSecretArn", { value: this.launcherAuthSecret.secretArn });
  }
}
