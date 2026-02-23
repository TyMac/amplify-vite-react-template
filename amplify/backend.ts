import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { geminiApi } from './function/gemini-api/resource';
import { storage } from './storage/resource';

const backend = defineBackend({
  auth,
  data,
  geminiApi,
  storage,
});

// Grant Lambda permission to call STS (needed for Workload Identity Federation)
// The Lambda will use its execution role credentials to authenticate to GCP
backend.geminiApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['sts:AssumeRole', 'sts:GetCallerIdentity'],
    resources: ['*'],
  })
);

// Grant Gemini Lambda access to the storage bucket
backend.storage.resources.bucket.grantReadWrite(backend.geminiApi.resources.lambda);

// Add bucket name to Lambda environment variables
// @ts-ignore
backend.geminiApi.resources.lambda.addEnvironment('STORAGE_BUCKET_NAME', backend.storage.resources.bucket.bucketName);
