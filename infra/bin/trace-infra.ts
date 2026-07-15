#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AppDeploymentStack } from "../lib/app-deployment-stack.js";
import { loadConfig } from "../lib/config.js";
import { ControlPlaneStack } from "../lib/control-plane-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { FoundationStack } from "../lib/foundation-stack.js";
import { stackName } from "../lib/naming.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { RuntimeStack } from "../lib/runtime-stack.js";

const app = new App();
const config = loadConfig(app);
const env = {
  account: config.account ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};
const common = {
  env,
  config,
  terminationProtection: config.retainDataOnDelete,
};

const foundation = new FoundationStack(app, stackName(config, "Foundation"), common);
const data = new DataStack(app, stackName(config, "Data"), {
  ...common,
  foundation,
});
data.addDependency(foundation);

const runtime = new RuntimeStack(app, stackName(config, "Runtime"), {
  ...common,
  foundation,
});
runtime.addDependency(foundation);

const controlPlane = new ControlPlaneStack(app, stackName(config, "ControlPlane"), {
  ...common,
  foundation,
  data,
});
controlPlane.addDependency(data);

const appDeployment = new AppDeploymentStack(app, stackName(config, "AppDeployment"), {
  ...common,
  foundation,
  data,
});
appDeployment.addDependency(data);

const observability = new ObservabilityStack(app, stackName(config, "Observability"), {
  ...common,
  foundation,
  data,
  controlPlane,
  runtime,
  appDeployment,
});
observability.addDependency(appDeployment);
observability.addDependency(runtime);

app.synth();
