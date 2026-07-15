import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { TraceInfraConfig } from "./config.js";
import type { FoundationStack } from "./foundation-stack.js";
import { applyStandardTags, resourceName } from "./naming.js";

export interface DataStackProps extends StackProps {
  config: TraceInfraConfig;
  foundation: FoundationStack;
}

export class DataStack extends Stack {
  readonly controlDatabase: rds.DatabaseCluster;
  readonly controlDatabaseProxy: rds.DatabaseProxy;
  readonly appDataDatabase?: rds.DatabaseCluster;
  readonly appDataProxy?: rds.DatabaseProxy;
  readonly controlProxySecurityGroup: ec2.SecurityGroup;
  readonly redisSecurityGroup: ec2.SecurityGroup;
  readonly gitSecurityGroup: ec2.SecurityGroup;
  readonly appDataClientSecurityGroup: ec2.SecurityGroup;
  readonly gitFileSystem: efs.FileSystem;
  readonly gitAccessPoint: efs.AccessPoint;
  readonly artifactBucket: s3.Bucket;
  readonly buildSourcesBucket: s3.Bucket;
  readonly jwtSecret: secretsmanager.Secret;
  readonly tokenEncryptionSecret: secretsmanager.Secret;
  readonly integrationSecret: secretsmanager.Secret;
  readonly redisEndpointAddress: string;
  readonly redisPort: string;
  readonly artifactQueues: sqs.Queue[];

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, foundation } = props;
    applyStandardTags(this, config);
    const retained = config.retainDataOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const autoDeleteObjects = !config.retainDataOnDelete;
    const dataKey = kms.Key.fromKeyArn(this, "ImportedDataKey", foundation.dataKey.keyArn);
    const artifactKey = kms.Key.fromKeyArn(
      this,
      "ImportedArtifactKey",
      foundation.artifactKey.keyArn,
    );
    const gitKey = kms.Key.fromKeyArn(this, "ImportedGitKey", foundation.gitKey.keyArn);
    const secretsKey = kms.Key.fromKeyArn(this, "ImportedSecretsKey", foundation.secretsKey.keyArn);

    this.appDataClientSecurityGroup = new ec2.SecurityGroup(this, "AppDataClients", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "app-data-clients"),
      description: "Attached only to generated app tasks that access the app-data database",
      allowAllOutbound: true,
    });

    const controlDbSecurityGroup = new ec2.SecurityGroup(this, "ControlDatabaseSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "control-db"),
      allowAllOutbound: false,
    });
    this.controlProxySecurityGroup = new ec2.SecurityGroup(this, "ControlProxySecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "control-db-proxy"),
      allowAllOutbound: true,
    });
    controlDbSecurityGroup.addIngressRule(
      this.controlProxySecurityGroup,
      ec2.Port.tcp(5432),
      "RDS Proxy",
    );

    const controlReaders = config.enableControlDatabaseReader
      ? [
          rds.ClusterInstance.serverlessV2("reader", {
            scaleWithWriter: true,
            publiclyAccessible: false,
          }),
        ]
      : [];
    this.controlDatabase = new rds.DatabaseCluster(this, "ControlDatabase", {
      clusterIdentifier: resourceName(config, "control"),
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of("16.6", "16"),
      }),
      writer: rds.ClusterInstance.serverlessV2("writer", { publiclyAccessible: false }),
      readers: controlReaders,
      serverlessV2MinCapacity: config.auroraMinAcu,
      serverlessV2MaxCapacity: config.auroraMaxAcu,
      credentials: rds.Credentials.fromGeneratedSecret("traceadmin", {
        encryptionKey: secretsKey,
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
      }),
      defaultDatabaseName: "trace",
      vpc: foundation.vpc,
      vpcSubnets: { subnetGroupName: "data" },
      securityGroups: [controlDbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: dataKey,
      backup: { retention: Duration.days(35) },
      preferredMaintenanceWindow: "sun:07:00-sun:08:00",
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      deletionProtection: config.retainDataOnDelete,
      removalPolicy: retained,
      enableDataApi: false,
    });
    this.controlDatabaseProxy = this.controlDatabase.addProxy("ControlDatabaseProxy", {
      dbProxyName: resourceName(config, "control"),
      secrets: [this.controlDatabase.secret!],
      vpc: foundation.vpc,
      vpcSubnets: { subnetGroupName: "data" },
      securityGroups: [this.controlProxySecurityGroup],
      requireTLS: true,
      debugLogging: false,
      idleClientTimeout: Duration.minutes(30),
      maxConnectionsPercent: 80,
      maxIdleConnectionsPercent: 40,
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "redis"),
      allowAllOutbound: false,
    });
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: "Trace production Valkey subnets",
      subnetIds: foundation.vpc.selectSubnets({ subnetGroupName: "data" }).subnetIds,
      cacheSubnetGroupName: resourceName(config, "redis"),
    });
    const redis = new elasticache.CfnReplicationGroup(this, "Redis", {
      replicationGroupDescription: "Trace transient routing, locks, queues, and pub/sub",
      replicationGroupId: resourceName(config, "redis"),
      engine: "valkey",
      cacheNodeType: "cache.t4g.micro",
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
      snapshotRetentionLimit: 7,
      snapshotWindow: "06:00-07:00",
      preferredMaintenanceWindow: "sun:07:00-sun:08:00",
      autoMinorVersionUpgrade: true,
    });
    redis.addDependency(redisSubnetGroup);
    this.redisEndpointAddress = redis.attrPrimaryEndPointAddress;
    this.redisPort = redis.attrPrimaryEndPointPort;

    this.gitSecurityGroup = new ec2.SecurityGroup(this, "GitEfsSecurityGroup", {
      vpc: foundation.vpc,
      securityGroupName: resourceName(config, "git-efs"),
      allowAllOutbound: false,
    });
    this.gitFileSystem = new efs.FileSystem(this, "GitFileSystem", {
      fileSystemName: resourceName(config, "git"),
      vpc: foundation.vpc,
      vpcSubnets: { subnetGroupName: "data" },
      securityGroup: this.gitSecurityGroup,
      encrypted: true,
      kmsKey: gitKey,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.ELASTIC,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS,
      removalPolicy: retained,
    });
    this.gitAccessPoint = this.gitFileSystem.addAccessPoint("GitAccessPoint", {
      path: "/trace-git",
      createAcl: { ownerUid: "1001", ownerGid: "1001", permissions: "0750" },
      posixUser: { uid: "1001", gid: "1001" },
    });

    this.artifactBucket = this.createBucket(
      "ArtifactBucket",
      "artifacts",
      artifactKey,
      retained,
      autoDeleteObjects,
      true,
      config,
      [
        {
          allowedOrigins: [`https://${config.domainName}`],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3600,
        },
      ],
    );
    this.buildSourcesBucket = this.createBucket(
      "BuildSourcesBucket",
      "build-sources",
      artifactKey,
      retained,
      autoDeleteObjects,
      true,
      config,
    );

    this.jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: `trace/${config.environmentName}/jwt`,
      encryptionKey: secretsKey,
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
        includeSpace: false,
      },
    });
    this.tokenEncryptionSecret = new secretsmanager.Secret(this, "TokenEncryptionSecret", {
      secretName: `trace/${config.environmentName}/token-encryption-key`,
      encryptionKey: secretsKey,
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
        excludeCharacters: "GHIJKLMNOPQRSTUVWXYZghijklmnopqrstuvwxyz",
        includeSpace: false,
      },
    });
    this.integrationSecret = new secretsmanager.Secret(this, "IntegrationSecret", {
      secretName: `trace/${config.environmentName}/integrations`,
      encryptionKey: secretsKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          GITHUB_CLIENT_ID: "",
          GITHUB_CLIENT_SECRET: "",
          SLACK_CLIENT_ID: "",
          SLACK_CLIENT_SECRET: "",
          SLACK_SIGNING_SECRET: "",
          APPLE_TEAM_ID: "",
        }),
        generateStringKey: "bootstrap",
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    this.artifactQueues = ["preview", "extract", "convert", "malware-scan"].map((name) => {
      const deadLetterQueue = new sqs.Queue(this, `${name}ArtifactDlq`, {
        queueName: resourceName(config, `artifact-${name}-dlq`),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: dataKey,
        retentionPeriod: Duration.days(14),
      });
      return new sqs.Queue(this, `${name}ArtifactQueue`, {
        queueName: resourceName(config, `artifact-${name}`),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: dataKey,
        visibilityTimeout: Duration.minutes(15),
        retentionPeriod: Duration.days(14),
        deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
      });
    });

    if (config.enableAppData) {
      const appDbSecurityGroup = new ec2.SecurityGroup(this, "AppDatabaseSecurityGroup", {
        vpc: foundation.vpc,
        securityGroupName: resourceName(config, "app-db"),
        allowAllOutbound: false,
      });
      const appProxySecurityGroup = new ec2.SecurityGroup(this, "AppProxySecurityGroup", {
        vpc: foundation.vpc,
        securityGroupName: resourceName(config, "app-db-proxy"),
        allowAllOutbound: true,
      });
      appProxySecurityGroup.addIngressRule(
        this.appDataClientSecurityGroup,
        ec2.Port.tcp(5432),
        "Generated app tasks",
      );
      appDbSecurityGroup.addIngressRule(appProxySecurityGroup, ec2.Port.tcp(5432), "RDS Proxy");
      const appReaders = config.enableAppDataReader
        ? [
            rds.ClusterInstance.serverlessV2("reader", {
              scaleWithWriter: true,
              publiclyAccessible: false,
            }),
          ]
        : [];
      this.appDataDatabase = new rds.DatabaseCluster(this, "AppDataDatabase", {
        clusterIdentifier: resourceName(config, "app-data"),
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.of("16.6", "16"),
        }),
        writer: rds.ClusterInstance.serverlessV2("writer", { publiclyAccessible: false }),
        readers: appReaders,
        serverlessV2MinCapacity: config.auroraMinAcu,
        serverlessV2MaxCapacity: config.auroraMaxAcu,
        credentials: rds.Credentials.fromGeneratedSecret("appadmin", {
          encryptionKey: secretsKey,
          excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
        }),
        defaultDatabaseName: "trace_apps",
        vpc: foundation.vpc,
        vpcSubnets: { subnetGroupName: "data" },
        securityGroups: [appDbSecurityGroup],
        storageEncrypted: true,
        storageEncryptionKey: dataKey,
        backup: { retention: Duration.days(35) },
        cloudwatchLogsExports: ["postgresql"],
        cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
        deletionProtection: config.retainDataOnDelete,
        removalPolicy: retained,
      });
      this.appDataProxy = this.appDataDatabase.addProxy("AppDataProxy", {
        dbProxyName: resourceName(config, "app-data"),
        secrets: [this.appDataDatabase.secret!],
        vpc: foundation.vpc,
        vpcSubnets: { subnetGroupName: "data" },
        securityGroups: [appProxySecurityGroup],
        requireTLS: true,
        idleClientTimeout: Duration.minutes(30),
        maxConnectionsPercent: 80,
        maxIdleConnectionsPercent: 20,
      });
    }

    new CfnOutput(this, "ArtifactBucketName", { value: this.artifactBucket.bucketName });
    new CfnOutput(this, "ControlDatabaseProxyEndpoint", {
      value: this.controlDatabaseProxy.endpoint,
    });
    new CfnOutput(this, "RedisEndpoint", {
      value: `rediss://${this.redisEndpointAddress}:${this.redisPort}`,
    });
    new CfnOutput(this, "GitFileSystemId", { value: this.gitFileSystem.fileSystemId });
  }

  private createBucket(
    id: string,
    suffix: string,
    encryptionKey: kms.IKey | undefined,
    removalPolicy: RemovalPolicy,
    autoDeleteObjects: boolean,
    versioned: boolean,
    config: TraceInfraConfig,
    cors?: s3.CorsRule[],
  ): s3.Bucket {
    return new s3.Bucket(this, id, {
      bucketName: `${resourceName(config, suffix)}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      encryption: encryptionKey ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
      encryptionKey,
      bucketKeyEnabled: Boolean(encryptionKey),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned,
      cors,
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(7) },
        ...(versioned ? [{ noncurrentVersionExpiration: Duration.days(90) }] : []),
      ],
      removalPolicy,
      autoDeleteObjects,
    });
  }
}
