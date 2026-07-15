import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import type { TraceInfraConfig } from "../lib/config.js";
import { ControlPlaneStack } from "../lib/control-plane-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { FoundationStack } from "../lib/foundation-stack.js";

const config: TraceInfraConfig = {
  environmentName: "prod",
  region: "us-east-1",
  domainName: "trace.example.com",
  createHostedZone: true,
  githubRepository: "example/trace",
  githubDeployEnvironment: "production",
  networkMode: "managed",
  controlDatabaseMode: "managed",
  availabilityZones: 3,
  natGateways: 1,
  enablePaidVpcEndpoints: false,
  controlImageTag: "test",
  runtimeImageTag: "test",
  webDesiredCount: 2,
  apiDesiredCount: 1,
  apiCpu: 1024,
  apiMemoryMiB: 2048,
  runtimeCpu: 2048,
  runtimeMemoryMiB: 4096,
  runtimeEphemeralStorageGiB: 40,
  auroraMinAcu: 0.5,
  auroraMaxAcu: 4,
  enableControlDatabaseReader: false,
  enableAppData: true,
  enableAppDataReader: false,
  monthlyBudgetUsd: 500,
  retainDataOnDelete: true,
  enableAwsConfig: true,
  enableSecurityHub: true,
  enableGuardDuty: true,
};

describe("FoundationStack", () => {
  it("creates the production network, keys, registries, DNS, and GitHub trust", () => {
    const app = new App();
    const stack = new FoundationStack(app, "FoundationTest", {
      config,
      env: { account: "123456789012", region: config.region },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.resourceCountIs("AWS::EC2::NatGateway", 1);
    template.resourceCountIs("AWS::KMS::Key", 5);
    template.resourceCountIs("AWS::ECR::Repository", 4);
    template.resourceCountIs("AWS::Route53::HostedZone", 1);
    template.resourceCountIs("AWS::CertificateManager::Certificate", 1);
    template.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 1);
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:sub":
                  "repo:example/trace:environment:production",
              },
            },
          }),
        ]),
      },
    });

    const repositories = template.findResources("AWS::ECR::Repository");
    expect(Object.keys(repositories)).toHaveLength(4);
  });

  it("imports an existing VPC and RDS database without creating a control database", () => {
    const app = new App();
    const existingConfig: TraceInfraConfig = {
      ...config,
      networkMode: "existing",
      existingVpcId: "vpc-existing",
      existingAvailabilityZones: ["us-east-1a", "us-east-1b"],
      existingPublicSubnetIds: ["subnet-public-a", "subnet-public-b"],
      existingPublicRouteTableIds: ["rtb-public-a", "rtb-public-b"],
      existingControlPlaneSubnetIds: ["subnet-control-a", "subnet-control-b"],
      existingControlPlaneRouteTableIds: ["rtb-control-a", "rtb-control-b"],
      existingRuntimeSubnetIds: ["subnet-runtime-a", "subnet-runtime-b"],
      existingRuntimeRouteTableIds: ["rtb-runtime-a", "rtb-runtime-b"],
      existingDataSubnetIds: ["subnet-data-a", "subnet-data-b"],
      existingDataRouteTableIds: ["rtb-data-a", "rtb-data-b"],
      controlDatabaseMode: "existing",
      existingControlDatabaseHost: "trace.example.us-east-1.rds.amazonaws.com",
      existingControlDatabasePort: 5432,
      existingControlDatabaseName: "trace",
      existingControlDatabaseIdentifier: "trace-production",
      existingControlDatabaseSecretArn:
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:trace/database-AbCdEf",
      existingControlDatabaseSecurityGroupId: "sg-existing",
      enableAppData: false,
    };
    const env = { account: "123456789012", region: existingConfig.region };
    const foundation = new FoundationStack(app, "ExistingFoundationTest", {
      config: existingConfig,
      env,
    });
    const data = new DataStack(app, "ExistingDataTest", {
      config: existingConfig,
      foundation,
      env,
    });
    const control = new ControlPlaneStack(app, "ExistingControlTest", {
      config: existingConfig,
      foundation,
      data,
      env,
    });
    const foundationTemplate = Template.fromStack(foundation);
    const dataTemplate = Template.fromStack(data);
    const controlTemplate = Template.fromStack(control);

    foundationTemplate.resourceCountIs("AWS::EC2::VPC", 0);
    dataTemplate.resourceCountIs("AWS::RDS::DBCluster", 0);
    dataTemplate.resourceCountIs("AWS::RDS::DBProxy", 0);
    controlTemplate.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Environment: Match.arrayWith([
            {
              Name: "DATABASE_HOST",
              Value: "trace.example.us-east-1.rds.amazonaws.com",
            },
            { Name: "DATABASE_PORT", Value: "5432" },
            { Name: "DATABASE_NAME", Value: "trace" },
          ]),
        }),
      ]),
    });
    controlTemplate.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      GroupId: "sg-existing",
      FromPort: 5432,
      ToPort: 5432,
    });
  });
});
