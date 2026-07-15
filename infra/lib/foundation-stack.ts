import {
  ArnFormat,
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import type { TraceInfraConfig } from "./config.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface FoundationStackProps extends StackProps {
  config: TraceInfraConfig;
}

export class FoundationStack extends Stack {
  readonly vpc: ec2.IVpc;
  readonly publicSubnets: ec2.SubnetSelection;
  readonly controlPlaneSubnets: ec2.SubnetSelection;
  readonly runtimeSubnets: ec2.SubnetSelection;
  readonly dataSubnets: ec2.SubnetSelection;
  readonly controlPlaneSubnetIds: string[];
  readonly runtimeSubnetIds: string[];
  readonly hostedZone: route53.IHostedZone;
  readonly certificate: acm.Certificate;
  readonly dataKey: kms.Key;
  readonly artifactKey: kms.Key;
  readonly gitKey: kms.Key;
  readonly logsKey: kms.Key;
  readonly secretsKey: kms.Key;
  readonly controlPlaneRepository: ecr.Repository;
  readonly runtimeRepository: ecr.Repository;
  readonly generatedAppsRepository: ecr.Repository;
  readonly appGatewayRepository: ecr.Repository;
  readonly githubDeployRole: iam.Role;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);
    const { config } = props;
    applyStandardTags(this, config);

    const retained = config.retainDataOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    this.dataKey = this.createKey("DataKey", "data", retained, config);
    this.artifactKey = this.createKey("ArtifactKey", "artifacts", retained, config);
    this.gitKey = this.createKey("GitKey", "git", retained, config);
    this.logsKey = this.createKey("LogsKey", "logs", retained, config);
    this.secretsKey = this.createKey("SecretsKey", "secrets", retained, config);
    this.logsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal(`logs.${config.region}.${Aws.URL_SUFFIX}`)],
        actions: [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ],
        resources: ["*"],
        conditions: {
          ArnLike: {
            "kms:EncryptionContext:aws:logs:arn": this.formatArn({
              service: "logs",
              resource: "log-group",
              resourceName: "/trace/*",
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            }),
          },
        },
      }),
    );
    this.logsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        actions: ["kms:GenerateDataKey*", "kms:DescribeKey"],
        resources: ["*"],
        conditions: {
          StringEquals: { "aws:SourceAccount": Aws.ACCOUNT_ID },
          ArnLike: {
            "aws:SourceArn": this.formatArn({
              service: "cloudtrail",
              resource: "trail",
              resourceName: "*",
            }),
          },
        },
      }),
    );
    this.dataKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [
          new iam.ServicePrincipal("events.amazonaws.com"),
          new iam.ServicePrincipal("cloudwatch.amazonaws.com"),
        ],
        actions: ["kms:Decrypt", "kms:GenerateDataKey*"],
        resources: ["*"],
        conditions: { StringEquals: { "aws:SourceAccount": Aws.ACCOUNT_ID } },
      }),
    );
    this.controlPlaneRepository = this.createRepository(
      "ControlPlaneRepository",
      "control-plane",
      config,
      retained,
      ecr.TagMutability.MUTABLE,
      40,
    );
    this.runtimeRepository = this.createRepository(
      "RuntimeRepository",
      "session-runtime",
      config,
      retained,
      ecr.TagMutability.MUTABLE,
      30,
    );
    this.generatedAppsRepository = this.createRepository(
      "GeneratedAppsRepository",
      "generated-apps",
      config,
      retained,
      ecr.TagMutability.IMMUTABLE,
      200,
    );
    this.appGatewayRepository = this.createRepository(
      "AppGatewayRepository",
      "app-gateway",
      config,
      retained,
      ecr.TagMutability.IMMUTABLE,
      30,
    );

    if (config.networkMode === "existing") {
      this.vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
        vpcId: config.existingVpcId!,
        availabilityZones: config.existingAvailabilityZones!,
      });
      this.publicSubnets = this.importSubnets(
        "Public",
        config.existingPublicSubnetIds!,
        config.existingPublicRouteTableIds!,
      );
      this.controlPlaneSubnets = this.importSubnets(
        "ControlPlane",
        config.existingControlPlaneSubnetIds!,
        config.existingControlPlaneRouteTableIds!,
      );
      this.runtimeSubnets = this.importSubnets(
        "Runtime",
        config.existingRuntimeSubnetIds!,
        config.existingRuntimeRouteTableIds!,
      );
      this.dataSubnets = this.importSubnets(
        "Data",
        config.existingDataSubnetIds!,
        config.existingDataRouteTableIds!,
      );
    } else {
      const vpc = new ec2.Vpc(this, "Vpc", {
        vpcName: resourceName(config, "vpc"),
        ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/16"),
        maxAzs: config.availabilityZones,
        natGateways: config.natGateways,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        restrictDefaultSecurityGroup: true,
        subnetConfiguration: [
          { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
          {
            name: "control-plane",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 21,
          },
          {
            name: "session-runtime",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 19,
          },
          { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
        ],
        gatewayEndpoints: {
          S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
        },
      });
      this.vpc = vpc;
      this.publicSubnets = { subnetGroupName: "public" };
      this.controlPlaneSubnets = { subnetGroupName: "control-plane" };
      this.runtimeSubnets = { subnetGroupName: "session-runtime" };
      this.dataSubnets = { subnetGroupName: "data" };

      const flowLogGroup = new logs.LogGroup(this, "VpcFlowLogGroup", {
        logGroupName: `/trace/${config.environmentName}/vpc-flow`,
        encryptionKey: this.logsKey,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: retained,
      });
      vpc.addFlowLog("VpcFlowLogs", {
        destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
        trafficType: ec2.FlowLogTrafficType.REJECT,
      });
    }
    this.controlPlaneSubnetIds = this.vpc.selectSubnets(this.controlPlaneSubnets).subnetIds;
    this.runtimeSubnetIds = this.vpc.selectSubnets(this.runtimeSubnets).subnetIds;

    if (config.enablePaidVpcEndpoints && this.vpc instanceof ec2.Vpc) {
      const services = {
        EcrApi: ec2.InterfaceVpcEndpointAwsService.ECR,
        EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        Logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        Kms: ec2.InterfaceVpcEndpointAwsService.KMS,
        Sqs: ec2.InterfaceVpcEndpointAwsService.SQS,
      };
      for (const [endpointId, service] of Object.entries(services)) {
        this.vpc.addInterfaceEndpoint(`${endpointId}Endpoint`, {
          service,
          privateDnsEnabled: true,
          subnets: this.controlPlaneSubnets,
        });
      }
    }

    this.hostedZone = config.createHostedZone
      ? new route53.PublicHostedZone(this, "HostedZone", {
          zoneName: config.domainName,
        })
      : route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
          hostedZoneId: config.hostedZoneId!,
          zoneName: config.domainName,
        });

    this.certificate = new acm.Certificate(this, "PublicCertificate", {
      domainName: config.domainName,
      subjectAlternativeNames: [
        `*.${config.domainName}`,
        `*.preview.${config.domainName}`,
        `*.apps.${config.domainName}`,
      ],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    const githubProvider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });
    this.githubDeployRole = new iam.Role(this, "GitHubDeployRole", {
      roleName: resourceName(config, "github-deploy"),
      description: "Restricted GitHub OIDC role used to deploy Trace production through CDK",
      maxSessionDuration: Duration.hours(2),
      assumedBy: new iam.OpenIdConnectPrincipal(githubProvider).withConditions({
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${config.githubRepository}:environment:${config.githubDeployEnvironment}`,
        },
      }),
    });
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [
          this.formatArn({
            service: "iam",
            resource: "role",
            resourceName: `cdk-*-${Aws.ACCOUNT_ID}-${config.region}`,
          }),
        ],
      }),
    );
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadDeploymentState",
        actions: [
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResources",
          "ssm:GetParameter",
        ],
        resources: ["*"],
      }),
    );
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AuthenticateEcr",
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "PushTraceImages",
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ],
        resources: [
          this.controlPlaneRepository.repositoryArn,
          this.runtimeRepository.repositoryArn,
        ],
      }),
    );
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "RunMigrationsAndRefreshServices",
        actions: ["ecs:DescribeTasks", "ecs:DescribeServices", "ecs:RunTask", "ecs:UpdateService"],
        resources: ["*"],
        conditions: {
          StringEqualsIfExists: {
            "ecs:cluster": this.formatArn({
              service: "ecs",
              resource: "cluster",
              resourceName: resourceName(config, "control-plane"),
            }),
          },
        },
      }),
    );
    this.githubDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "PassMigrationRoles",
        actions: ["iam:PassRole"],
        resources: [
          this.formatArn({
            service: "iam",
            resource: "role",
            resourceName: resourceName(config, "migration-task"),
          }),
          this.formatArn({
            service: "iam",
            resource: "role",
            resourceName: "Trace-*-MigrationTaskExecutionRole*",
          }),
        ],
        conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
      }),
    );

    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new CfnOutput(this, "HostedZoneId", { value: this.hostedZone.hostedZoneId });
    new CfnOutput(this, "NameServers", {
      value:
        this.hostedZone instanceof route53.PublicHostedZone
          ? Stack.of(this).toJsonString(this.hostedZone.hostedZoneNameServers ?? [])
          : "Imported hosted zone",
      description: "Delegate these name servers when CDK created the hosted zone",
    });
    new CfnOutput(this, "GitHubDeployRoleArn", { value: this.githubDeployRole.roleArn });
    new CfnOutput(this, "ControlPlaneRepositoryUri", {
      value: this.controlPlaneRepository.repositoryUri,
    });
    new CfnOutput(this, "RuntimeRepositoryUri", {
      value: this.runtimeRepository.repositoryUri,
    });
  }

  private createKey(
    id: string,
    suffix: string,
    removalPolicy: RemovalPolicy,
    config: TraceInfraConfig,
  ): kms.Key {
    const key = new kms.Key(this, id, {
      alias: `alias/${resourceName(config, suffix)}`,
      enableKeyRotation: true,
      removalPolicy,
      pendingWindow: Duration.days(30),
    });
    return key;
  }

  private importSubnets(
    idPrefix: string,
    subnetIds: string[],
    routeTableIds: string[],
  ): ec2.SubnetSelection {
    return {
      subnets: subnetIds.map((subnetId, index) =>
        ec2.Subnet.fromSubnetAttributes(this, `${idPrefix}Subnet${index + 1}`, {
          subnetId,
          routeTableId: routeTableIds[index],
        }),
      ),
    };
  }

  private createRepository(
    id: string,
    suffix: string,
    config: TraceInfraConfig,
    removalPolicy: RemovalPolicy,
    imageTagMutability: ecr.TagMutability,
    maxImageCount: number,
  ): ecr.Repository {
    return new ecr.Repository(this, id, {
      repositoryName: resourceName(config, suffix),
      imageScanOnPush: true,
      imageTagMutability,
      encryption: ecr.RepositoryEncryption.KMS,
      encryptionKey: this.artifactKey,
      lifecycleRules: [
        { description: "Retain recent release images", maxImageCount },
        {
          description: "Expire untagged image layers",
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: Duration.days(7),
        },
      ],
      removalPolicy,
      emptyOnDelete: !config.retainDataOnDelete,
    });
  }
}
