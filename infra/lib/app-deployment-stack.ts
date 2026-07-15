import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { TraceInfraConfig } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { FoundationStack } from "./foundation-stack.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface AppDeploymentStackProps extends StackProps {
  config: TraceInfraConfig;
  foundation: FoundationStack;
  data: DataStack;
}

export class AppDeploymentStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly generatedAppsRepository: ecr.Repository;
  readonly appGatewayRepository: ecr.Repository;
  readonly buildProject: codebuild.Project;
  readonly appTaskExecutionRole: iam.Role;
  readonly appTaskRole: iam.Role;
  readonly appRuntimeSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AppDeploymentStackProps) {
    super(scope, id, props);
    const { config, foundation, data } = props;
    applyStandardTags(this, config);
    const dataKey = kms.Key.fromKeyArn(this, "ImportedDataKey", foundation.dataKey.keyArn);
    const artifactKey = kms.Key.fromKeyArn(
      this,
      "ImportedArtifactKey",
      foundation.artifactKey.keyArn,
    );
    const logsKey = kms.Key.fromKeyArn(this, "ImportedLogsKey", foundation.logsKey.keyArn);

    this.cluster = new ecs.Cluster(this, "AppCluster", {
      clusterName: resourceName(config, "generated-apps"),
      vpc: foundation.vpc,
      enableFargateCapacityProviders: true,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });
    this.generatedAppsRepository = foundation.generatedAppsRepository;
    this.appGatewayRepository = foundation.appGatewayRepository;

    this.appRuntimeSecurityGroup = new ec2.SecurityGroup(this, "AppRuntimeSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "app-runtime"),
      description: "Generated apps have no inbound rules and open outbound tunnels to the gateway",
      allowAllOutbound: true,
    });
    this.appTaskExecutionRole = new iam.Role(this, "AppTaskExecutionRole", {
      roleName: resourceName(config, "app-task-execution"),
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
    });
    logsKey.grantEncryptDecrypt(this.appTaskExecutionRole);
    this.appTaskRole = new iam.Role(this, "AppTaskRole", {
      roleName: resourceName(config, "app-task"),
      description:
        "Default generated-app role intentionally has no direct AWS API permissions; use the scoped Trace storage broker",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    this.buildProject = new codebuild.Project(this, "GeneratedAppBuildProject", {
      projectName: resourceName(config, "generated-app-build"),
      description: "Builds immutable generated-app images from Trace-owned source bundles",
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      encryptionKey: artifactKey,
      timeout: Duration.minutes(30),
      queuedTimeout: Duration.hours(1),
      environmentVariables: {
        DESTINATION_REPOSITORY_URI: {
          value: this.generatedAppsRepository.repositoryUri,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        env: { shell: "bash" },
        phases: {
          install: {
            commands: [
              'test -n "$SOURCE_S3_URI"',
              'test -n "$IMAGE_TAG"',
              'aws s3 cp "$SOURCE_S3_URI" /tmp/source.tar.gz',
              "mkdir -p /tmp/source",
              "tar -xzf /tmp/source.tar.gz -C /tmp/source",
            ],
          },
          pre_build: {
            commands: [
              "REGISTRY_HOST=${DESTINATION_REPOSITORY_URI%%/*}",
              'aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY_HOST"',
            ],
          },
          build: {
            commands: [
              'docker build --pull --tag "$DESTINATION_REPOSITORY_URI:$IMAGE_TAG" /tmp/source',
            ],
          },
          post_build: {
            commands: [
              'docker push "$DESTINATION_REPOSITORY_URI:$IMAGE_TAG"',
              "docker inspect --format='{{index .RepoDigests 0}}' \"$DESTINATION_REPOSITORY_URI:$IMAGE_TAG\" > image-digest.txt",
            ],
          },
        },
        artifacts: { files: ["image-digest.txt"] },
      }),
    });
    data.buildSourcesBucket.grantRead(this.buildProject);
    this.generatedAppsRepository.grantPullPush(this.buildProject);

    const deploymentDlq = new sqs.Queue(this, "DeploymentDlq", {
      queueName: resourceName(config, "app-deployments-dlq"),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      retentionPeriod: Duration.days(14),
    });
    const deploymentQueue = new sqs.Queue(this, "DeploymentQueue", {
      queueName: resourceName(config, "app-deployments"),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      visibilityTimeout: Duration.minutes(35),
      retentionPeriod: Duration.days(14),
      deadLetterQueue: { queue: deploymentDlq, maxReceiveCount: 5 },
    });

    const deploymentRole = new iam.Role(this, "AppDeploymentRole", {
      roleName: resourceName(config, "app-deployer"),
      description: "Assumed by Trace deployment workers to reconcile generated app services",
      assumedBy: new iam.ArnPrincipal(
        Stack.of(this).formatArn({
          service: "iam",
          resource: "role",
          resourceName: resourceName(config, "api-task"),
        }),
      ),
      maxSessionDuration: Duration.hours(1),
    });
    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DeleteService",
          "ecs:DescribeServices",
          "ecs:ListServices",
          "ecs:TagResource",
        ],
        resources: ["*"],
        conditions: {
          StringEqualsIfExists: { "ecs:cluster": this.cluster.clusterArn },
        },
      }),
    );
    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [this.appTaskExecutionRole.roleArn, this.appTaskRole.roleArn],
        conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
      }),
    );
    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
        resources: [this.buildProject.projectArn],
      }),
    );
    deploymentQueue.grantConsumeMessages(deploymentRole);
    data.buildSourcesBucket.grantReadWrite(deploymentRole);

    new CfnOutput(this, "GeneratedAppsClusterArn", { value: this.cluster.clusterArn });
    new CfnOutput(this, "GeneratedAppsRepositoryUri", {
      value: this.generatedAppsRepository.repositoryUri,
    });
    new CfnOutput(this, "AppGatewayRepositoryUri", {
      value: this.appGatewayRepository.repositoryUri,
    });
    new CfnOutput(this, "GeneratedAppBuildProjectName", {
      value: this.buildProject.projectName,
    });
    new CfnOutput(this, "AppDeploymentRoleArn", { value: deploymentRole.roleArn });
    new CfnOutput(this, "AppRuntimeSecurityGroupIds", {
      value: [
        this.appRuntimeSecurityGroup.securityGroupId,
        data.appDataClientSecurityGroup.securityGroupId,
      ].join(","),
    });
  }
}
