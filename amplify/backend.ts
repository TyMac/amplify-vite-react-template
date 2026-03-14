import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { Stack } from "aws-cdk-lib";
import { CfnUserPoolDomain } from "aws-cdk-lib/aws-cognito";
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

// Configure DynamoDB Table for point-in-time recovery
const chatSessionTable =
  backend.data.resources.cfnResources.amplifyDynamoDbTables["ChatSession"];
chatSessionTable.pointInTimeRecoveryEnabled = true;

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
