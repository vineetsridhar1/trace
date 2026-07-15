import { Aws, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as backup from "aws-cdk-lib/aws-backup";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ce from "aws-cdk-lib/aws-ce";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as configService from "aws-cdk-lib/aws-config";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as securityhub from "aws-cdk-lib/aws-securityhub";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import type { AppDeploymentStack } from "./app-deployment-stack.js";
import type { TraceInfraConfig } from "./config.js";
import type { ControlPlaneStack } from "./control-plane-stack.js";
import type { DataStack } from "./data-stack.js";
import type { FoundationStack } from "./foundation-stack.js";
import type { RuntimeStack } from "./runtime-stack.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface ObservabilityStackProps extends StackProps {
  config: TraceInfraConfig;
  foundation: FoundationStack;
  data: DataStack;
  controlPlane: ControlPlaneStack;
  runtime: RuntimeStack;
  appDeployment: AppDeploymentStack;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config, foundation, data, controlPlane, runtime, appDeployment } = props;
    applyStandardTags(this, config);
    const retained = config.retainDataOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const dataKey = kms.Key.fromKeyArn(this, "ImportedDataKey", foundation.dataKey.keyArn);
    const logsKey = kms.Key.fromKeyArn(this, "ImportedLogsKey", foundation.logsKey.keyArn);
    const auditLogsBucket = new s3.Bucket(this, "AuditLogsBucket", {
      bucketName: `${resourceName(config, "audit-logs")}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: logsKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(365) }],
      removalPolicy: retained,
      autoDeleteObjects: !config.retainDataOnDelete,
    });

    const alerts = new sns.Topic(this, "AlertsTopic", {
      topicName: resourceName(config, "alerts"),
      displayName: "Trace production infrastructure alerts",
      masterKey: dataKey,
    });
    if (config.alertEmail) {
      alerts.addSubscription(new subscriptions.EmailSubscription(config.alertEmail));
    }

    const cloudTrailLogGroup = new logs.LogGroup(this, "CloudTrailLogGroup", {
      logGroupName: `/trace/${config.environmentName}/cloudtrail`,
      encryptionKey: logsKey,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: retained,
    });
    const trail = new cloudtrail.Trail(this, "AuditTrail", {
      trailName: resourceName(config, "audit"),
      bucket: auditLogsBucket,
      encryptionKey: logsKey,
      enableFileValidation: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: cloudTrailLogGroup,
    });
    trail.addS3EventSelector(
      [{ bucket: data.artifactBucket }, { bucket: data.buildSourcesBucket }],
      {
        includeManagementEvents: true,
        readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
      },
    );

    if (config.enableAwsConfig) {
      const configRole = new iam.Role(this, "ConfigRole", {
        roleName: resourceName(config, "aws-config"),
        assumedBy: new iam.ServicePrincipal("config.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWS_ConfigRole"),
        ],
      });
      auditLogsBucket.grantReadWrite(configRole);
      const delivery = new configService.CfnDeliveryChannel(this, "ConfigDeliveryChannel", {
        name: resourceName(config, "config"),
        s3BucketName: auditLogsBucket.bucketName,
        s3KeyPrefix: "aws-config",
      });
      const recorder = new configService.CfnConfigurationRecorder(this, "ConfigRecorder", {
        name: resourceName(config, "config"),
        roleArn: configRole.roleArn,
        recordingGroup: {
          allSupported: true,
          includeGlobalResourceTypes: true,
        },
      });
      recorder.addDependency(delivery);
      for (const [id, identifier] of Object.entries({
        EncryptedVolumes: "ENCRYPTED_VOLUMES",
        S3PublicReadProhibited: "S3_BUCKET_PUBLIC_READ_PROHIBITED",
        S3PublicWriteProhibited: "S3_BUCKET_PUBLIC_WRITE_PROHIBITED",
        RdsStorageEncrypted: "RDS_STORAGE_ENCRYPTED",
        RootMfaEnabled: "ROOT_ACCOUNT_MFA_ENABLED",
      })) {
        const rule = new configService.CfnConfigRule(this, id, {
          configRuleName: resourceName(config, identifier.toLowerCase().replaceAll("_", "-")),
          source: { owner: "AWS", sourceIdentifier: identifier },
        });
        rule.addDependency(recorder);
      }
    }

    if (config.enableSecurityHub) {
      new securityhub.CfnHub(this, "SecurityHub", {
        enableDefaultStandards: true,
        tags: { Application: "trace", Environment: config.environmentName },
      });
    }
    if (config.enableGuardDuty) {
      new guardduty.CfnDetector(this, "GuardDuty", {
        enable: true,
        findingPublishingFrequency: "FIFTEEN_MINUTES",
        dataSources: {
          s3Logs: { enable: true },
        },
        tags: [{ key: "Application", value: "trace" }],
      });
    }

    const backupVault = new backup.BackupVault(this, "BackupVault", {
      backupVaultName: resourceName(config, "backups"),
      encryptionKey: dataKey,
      removalPolicy: retained,
      lockConfiguration: config.retainDataOnDelete
        ? {
            minRetention: Duration.days(7),
            maxRetention: Duration.days(365),
          }
        : undefined,
    });
    const backupPlan = new backup.BackupPlan(this, "BackupPlan", {
      backupPlanName: resourceName(config, "daily"),
      backupVault,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: "Daily",
          scheduleExpression: undefined,
          startWindow: Duration.hours(1),
          completionWindow: Duration.hours(6),
          deleteAfter: Duration.days(35),
        }),
      ],
    });
    const backupResources = [
      backup.BackupResource.fromConstruct(data.gitFileSystem),
      ...(data.controlDatabase ? [backup.BackupResource.fromConstruct(data.controlDatabase)] : []),
      ...(data.appDataDatabase ? [backup.BackupResource.fromConstruct(data.appDataDatabase)] : []),
    ];
    backupPlan.addSelection("StatefulResources", {
      backupSelectionName: resourceName(config, "stateful"),
      resources: backupResources,
    });

    const alarmAction = new cloudwatchActions.SnsAction(alerts);
    const databaseCpuMetric = data.controlDatabase
      ? data.controlDatabase.metricCPUUtilization({ period: Duration.minutes(5) })
      : new cloudwatch.Metric({
          namespace: "AWS/RDS",
          metricName: "CPUUtilization",
          dimensionsMap: { DBInstanceIdentifier: data.controlDatabaseIdentifier },
          statistic: "Average",
          period: Duration.minutes(5),
        });
    const databaseConnectionsMetric = data.controlDatabase
      ? data.controlDatabase.metricDatabaseConnections()
      : new cloudwatch.Metric({
          namespace: "AWS/RDS",
          metricName: "DatabaseConnections",
          dimensionsMap: { DBInstanceIdentifier: data.controlDatabaseIdentifier },
          statistic: "Average",
        });
    const alarms = [
      controlPlane.loadBalancer.metrics
        .httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
          period: Duration.minutes(5),
          statistic: "sum",
        })
        .createAlarm(this, "ApiTarget5xxAlarm", {
          alarmName: resourceName(config, "api-5xx"),
          threshold: 10,
          evaluationPeriods: 2,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }),
      controlPlane.apiService
        .metricCpuUtilization({ period: Duration.minutes(5) })
        .createAlarm(this, "ApiCpuAlarm", {
          alarmName: resourceName(config, "api-cpu"),
          threshold: 80,
          evaluationPeriods: 3,
        }),
      databaseCpuMetric.createAlarm(this, "DatabaseCpuAlarm", {
        alarmName: resourceName(config, "database-cpu"),
        threshold: 80,
        evaluationPeriods: 3,
      }),
    ];
    for (const alarm of alarms) alarm.addAlarmAction(alarmAction);

    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: resourceName(config, "operations"),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        width: 24,
        height: 2,
        markdown: `# Trace ${config.environmentName} operations\nControl plane, isolated runtimes, and generated apps.`,
      }),
      new cloudwatch.GraphWidget({
        title: "Control-plane CPU",
        width: 12,
        left: [
          controlPlane.apiService.metricCpuUtilization(),
          controlPlane.webService.metricCpuUtilization(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Database",
        width: 12,
        left: [databaseCpuMetric, databaseConnectionsMetric],
      }),
      new cloudwatch.GraphWidget({
        title: "ECS running tasks",
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/ECS",
            metricName: "RunningTaskCount",
            dimensionsMap: { ClusterName: runtime.cluster.clusterName },
            statistic: "Average",
          }),
          new cloudwatch.Metric({
            namespace: "AWS/ECS",
            metricName: "RunningTaskCount",
            dimensionsMap: { ClusterName: appDeployment.cluster.clusterName },
            statistic: "Average",
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "ALB requests and latency",
        width: 12,
        left: [controlPlane.loadBalancer.metrics.requestCount()],
        right: [controlPlane.loadBalancer.metrics.targetResponseTime()],
      }),
    );

    const budgetNotifications: budgets.CfnBudget.NotificationWithSubscribersProperty[] | undefined =
      config.alertEmail
        ? [80, 100].map((threshold) => ({
            notification: {
              comparisonOperator: "GREATER_THAN",
              notificationType: threshold === 100 ? "FORECASTED" : "ACTUAL",
              threshold,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: config.alertEmail! }],
          }))
        : undefined;
    const budgetProps: budgets.CfnBudgetProps = {
      budget: {
        budgetName: resourceName(config, "monthly"),
        budgetLimit: { amount: config.monthlyBudgetUsd, unit: "USD" },
        budgetType: "COST",
        timeUnit: "MONTHLY",
        costFilters: { TagKeyValue: [`user:Application$trace`] },
      },
      notificationsWithSubscribers: budgetNotifications,
    };
    new budgets.CfnBudget(this, "MonthlyBudget", budgetProps);
    if (config.alertEmail) {
      const monitor = new ce.CfnAnomalyMonitor(this, "CostAnomalyMonitor", {
        monitorName: resourceName(config, "aws-services"),
        monitorType: "DIMENSIONAL",
        monitorDimension: "SERVICE",
      });
      new ce.CfnAnomalySubscription(this, "CostAnomalySubscription", {
        subscriptionName: resourceName(config, "cost-anomalies"),
        frequency: "DAILY",
        monitorArnList: [monitor.attrMonitorArn],
        thresholdExpression: JSON.stringify({
          Dimensions: {
            Key: "ANOMALY_TOTAL_IMPACT_ABSOLUTE",
            MatchOptions: ["GREATER_THAN_OR_EQUAL"],
            Values: ["25"],
          },
        }),
        subscribers: [{ type: "EMAIL", address: config.alertEmail }],
      });
    }
  }
}
