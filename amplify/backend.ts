import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as oss from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";
import * as osis from "aws-cdk-lib/aws-osis";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { CfnUserPoolDomain } from "aws-cdk-lib/aws-cognito";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as YAML from "yaml";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { geminiApi } from "./function/gemini-api/resource";
import { storage } from "./storage/resource";

const backend = defineBackend({
  auth,
  data,
  geminiApi,
  storage,
});

// Configure DynamoDB Table for Zero-ETL OpenSearch Integration
const chatSessionTable =
  backend.data.resources.cfnResources.amplifyDynamoDbTables["ChatSession"];
chatSessionTable.pointInTimeRecoveryEnabled = true;
chatSessionTable.streamSpecification = {
  streamViewType: dynamodb.StreamViewType.NEW_IMAGE,
};

// Get the data stack
const openSearchStack = Stack.of(backend.data);
const region = openSearchStack.region;
const collectionName = "chat-etl-col-v2";

// Create OpenSearch Serverless Collection
const openSearchServerlessCollection = new oss.CfnCollection(
  openSearchStack,
  "OpenSearchServerlessCollection",
  {
    name: collectionName,
    description: "DynamoDB to OpenSearch Pipeline ETL Integration for Chats.",
    type: "SEARCH",
    standbyReplicas: "DISABLED",
  },
);
openSearchServerlessCollection.applyRemovalPolicy(RemovalPolicy.DESTROY);

// Create OpenSearch Serverless Data Source
const openSearchDataSource = backend.data.addHttpDataSource(
  "OpenSearchServerlessDataSource",
  openSearchServerlessCollection.attrCollectionEndpoint,
  {
    authorizationConfig: {
      signingRegion: region,
      signingServiceName: "aoss",
    },
  },
);

openSearchDataSource.grantPrincipal.addToPrincipalPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["aoss:APIAccessAll"],
    resources: [
      openSearchServerlessCollection.attrArn,
      `${openSearchServerlessCollection.attrArn}/*`,
    ],
  }),
);

const httpDataSourceRole = openSearchDataSource.grantPrincipal as iam.Role;
const httpDataSourceRoleArn = httpDataSourceRole.roleArn;

// Setup IAM Roles for OSIS Pipeline
const tableName = backend.data.resources.tables["ChatSession"].tableName;
const tableArn = backend.data.resources.tables["ChatSession"].tableArn;
const s3BucketArn = backend.storage.resources.bucket.bucketArn;

const openSearchIntegrationPipelineRole = new iam.Role(
  openSearchStack,
  "OpenSearchIntegrationPipelineRole",
  {
    assumedBy: new iam.ServicePrincipal("osis-pipelines.amazonaws.com"),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonOpenSearchIngestionFullAccess",
      ),
    ],
  },
);

const dynamoDBExportJobPolicy = new iam.PolicyStatement({
  sid: "allowRunExportJob",
  effect: iam.Effect.ALLOW,
  actions: [
    "dynamodb:DescribeTable",
    "dynamodb:DescribeContinuousBackups",
    "dynamodb:ExportTableToPointInTime",
  ],
  resources: [tableArn],
});
openSearchIntegrationPipelineRole.addToPolicy(dynamoDBExportJobPolicy);

const dynamoDBExportCheckPolicy = new iam.PolicyStatement({
  sid: "allowCheckExportjob",
  effect: iam.Effect.ALLOW,
  actions: ["dynamodb:DescribeExport"],
  resources: [`${tableArn}/export/*`],
});
openSearchIntegrationPipelineRole.addToPolicy(dynamoDBExportCheckPolicy);

const dynamoDBStreamPolicy = new iam.PolicyStatement({
  sid: "allowReadFromStream",
  effect: iam.Effect.ALLOW,
  actions: [
    "dynamodb:DescribeStream",
    "dynamodb:GetRecords",
    "dynamodb:GetShardIterator",
  ],
  resources: [`${tableArn}/stream/*`],
});
openSearchIntegrationPipelineRole.addToPolicy(dynamoDBStreamPolicy);

const s3ExportPolicy = new iam.PolicyStatement({
  sid: "allowReadAndWriteToS3ForExport",
  effect: iam.Effect.ALLOW,
  actions: [
    "s3:GetObject",
    "s3:AbortMultipartUpload",
    "s3:PutObject",
    "s3:PutObjectAcl",
  ],
  resources: [`${s3BucketArn}`, `${s3BucketArn}/${tableName}/*`],
});
openSearchIntegrationPipelineRole.addToPolicy(s3ExportPolicy);

const openSearchCollectionPolicy = new iam.PolicyStatement({
  sid: "allowOpenSearchAccess",
  effect: iam.Effect.ALLOW,
  actions: [
    "aoss:BatchGetCollection",
    "aoss:APIAccessAll",
    "aoss:GetSecurityPolicy",
    "aoss:CreateCollection",
    "aoss:ListCollections",
    "aoss:UpdateCollection",
    "aoss:DeleteCollection",
  ],
  resources: [
    openSearchServerlessCollection.attrArn,
    `${openSearchServerlessCollection.attrArn}/*`,
    `arn:aws:aoss:${region}:${openSearchStack.account}:collection/*`,
  ],
});
openSearchIntegrationPipelineRole.addToPolicy(openSearchCollectionPolicy);

openSearchIntegrationPipelineRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ],
    resources: [
      `arn:aws:logs:${region}:${openSearchStack.account}:log-group:/aws/opensearchserverless/*`,
      `arn:aws:logs:${region}:${openSearchStack.account}:log-group:/aws/opensearchserverless/*:log-stream:*`,
    ],
  })
);

// Security Policies
const encryptionPolicy = new oss.CfnSecurityPolicy(
  openSearchStack,
  "EncryptionPolicy",
  {
    name: "ddb-etl-encryption-serverless",
    type: "encryption",
    description: `Encryption policy for ${collectionName} collection`,
    policy: JSON.stringify({
      Rules: [
        {
          ResourceType: "collection",
          Resource: [`collection/${collectionName}*`],
        },
      ],
      AWSOwnedKey: true,
    }),
  },
);
openSearchServerlessCollection.addDependency(encryptionPolicy);

const networkPolicy = new oss.CfnSecurityPolicy(
  openSearchStack,
  "NetworkPolicy",
  {
    name: "ddb-etl-network-serverless",
    type: "network",
    description: `Network policy for ${collectionName} collection`,
    policy: JSON.stringify([
      {
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${collectionName}`],
          },
        ],
        AllowFromPublic: true,
      },
    ]),
  },
);
openSearchServerlessCollection.addDependency(networkPolicy);

const dataAccessPolicy = new oss.CfnAccessPolicy(
  openSearchStack,
  "DataAccessPolicy",
  {
    name: `ddb-etl-access-policy`,
    type: "data",
    description: `Data access policy for ${collectionName} collection`,
    policy: JSON.stringify([
      {
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${collectionName}`],
            Permission: [
              "aoss:CreateCollectionItems",
              "aoss:DeleteCollectionItems",
              "aoss:UpdateCollectionItems",
              "aoss:DescribeCollectionItems",
            ],
          },
          {
            ResourceType: "index",
            Resource: [`index/${collectionName}/*`],
            Permission: [
              "aoss:ReadDocument",
              "aoss:WriteDocument",
              "aoss:CreateIndex",
              "aoss:DeleteIndex",
              "aoss:UpdateIndex",
              "aoss:DescribeIndex",
            ],
          },
        ],
        Principal: [
          openSearchIntegrationPipelineRole.roleArn,
          httpDataSourceRoleArn,
          // Grant permissions to account root which delegates to IAM policies
          `arn:aws:iam::${openSearchStack.account}:root`,
          // Add standard CDK execution roles used by Amplify Gen 2 deployments
          `arn:aws:iam::${openSearchStack.account}:role/cdk-hnb659fds-cfn-exec-role-${openSearchStack.account}-${region}`,
          `arn:aws:iam::${openSearchStack.account}:role/cdk-hnb659fds-deploy-role-${openSearchStack.account}-${region}`,
          // Add Admin role as seen in example repo, just in case
          `arn:aws:iam::${openSearchStack.account}:role/Admin`,
        ],
      },
    ]),
  },
);
// Ensure collection waits for data access policy before creation/updates
openSearchServerlessCollection.addDependency(dataAccessPolicy);

// OSIS Pipeline Configuration
interface OpenSearchConfig {
  tableArn: string;
  bucketName: string;
  region: string;
  tableName: string;
  pipelineRoleArn: string;
  openSearchEndpoint: string;
}

function createOpenSearchTemplate(config: OpenSearchConfig): string {
  const template = {
    version: "2",
    "dynamodb-pipeline": {
      source: {
        dynamodb: {
          acknowledgments: true,
          tables: [
            {
              table_arn: config.tableArn,
              stream: { start_position: "LATEST" },
              export: {
                s3_bucket: config.bucketName,
                s3_region: config.region,
                s3_prefix: `${config.tableName}/`,
              },
            },
          ],
          aws: { sts_role_arn: config.pipelineRoleArn, region: config.region },
        },
      },
      sink: [
        {
          opensearch: {
            hosts: [config.openSearchEndpoint],
            index: "chatsession",
            index_type: "custom",
            document_id: '${getMetadata("primary_key")}',
            action: '${getMetadata("opensearch_action")}',
            document_version: '${getMetadata("document_version")}',
            document_version_type: "external",
            flush_timeout: -1,
            aws: {
              sts_role_arn: config.pipelineRoleArn,
              region: config.region,
              serverless: true,
            },
          },
        },
      ],
    },
  };
  return YAML.stringify(template);
}

const openSearchTemplate = createOpenSearchTemplate({
  tableArn: tableArn,
  bucketName: backend.storage.resources.bucket.bucketName,
  region: region,
  tableName: tableName,
  pipelineRoleArn: openSearchIntegrationPipelineRole.roleArn,
  openSearchEndpoint: openSearchServerlessCollection.attrCollectionEndpoint,
});

const logGroup = new LogGroup(openSearchStack, "LogGroup", {
  logGroupName:
    "/aws/vendedlogs/OpenSearchServerlessService/pipelines/chatsession",
  removalPolicy: RemovalPolicy.DESTROY,
});

const cfnPipeline = new osis.CfnPipeline(
  openSearchStack,
  "OpenSearchIntegrationPipeline",
  {
    maxUnits: 4,
    minUnits: 1,
    pipelineConfigurationBody: openSearchTemplate,
    pipelineName: "chat-integration",
    logPublishingOptions: {
      isLoggingEnabled: true,
      cloudWatchLogDestination: {
        logGroup: logGroup.logGroupName,
      },
    },
  },
);
// Ensure pipeline waits for collection AND role policies to be ready
cfnPipeline.addDependency(openSearchServerlessCollection);

// Critical: The OSIS service validates collection connectivity at pipeline creation.
// The role's inline policies (DefaultPolicy) must exist BEFORE the pipeline is created.
const pipelineRoleCfn = openSearchIntegrationPipelineRole.node.findChild('DefaultPolicy').node.defaultChild as cdk.CfnResource;
cfnPipeline.addDependency(pipelineRoleCfn);
// Also ensure the data access policy is ready (AOSS resource-based policy)
cfnPipeline.addDependency(dataAccessPolicy);

// Grant Lambda permission to call STS (needed for Workload Identity Federation)
// The Lambda will use its execution role credentials to authenticate to GCP
backend.geminiApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["sts:AssumeRole", "sts:GetCallerIdentity"],
    resources: ["*"],
  }),
);

// Custom Cognito Domain (branch-specific via Amplify env vars)
// Set COGNITO_CUSTOM_DOMAIN and COGNITO_CERT_ARN per branch in Amplify console
const cognitoCustomDomain = process.env.COGNITO_CUSTOM_DOMAIN;
const cognitoCertArn = process.env.COGNITO_CERT_ARN;

if (cognitoCustomDomain && cognitoCertArn) {
  const authStack = Stack.of(backend.auth.resources.userPool);
  new CfnUserPoolDomain(authStack, 'CustomCognitoDomain', {
    domain: cognitoCustomDomain,
    userPoolId: backend.auth.resources.userPool.userPoolId,
    customDomainConfig: {
      certificateArn: cognitoCertArn,
    },
  });
}

// Grant Gemini Lambda access to the storage bucket
backend.storage.resources.bucket.grantReadWrite(
  backend.geminiApi.resources.lambda,
);

// Add bucket name to Lambda environment variables
// @ts-ignore
backend.geminiApi.resources.lambda.addEnvironment(
  "STORAGE_BUCKET_NAME",
  backend.storage.resources.bucket.bucketName,
);
