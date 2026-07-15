import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import type { TraceInfraConfig } from "../lib/config.js";
import { FoundationStack } from "../lib/foundation-stack.js";

const config: TraceInfraConfig = {
  environmentName: "prod",
  region: "us-east-1",
  domainName: "trace.example.com",
  createHostedZone: true,
  githubRepository: "example/trace",
  githubDeployBranch: "main",
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

    const repositories = template.findResources("AWS::ECR::Repository");
    expect(Object.keys(repositories)).toHaveLength(4);
  });
});
