import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { geminiApi } from './function/gemini-api/resource';

const backend = defineBackend({
  auth,
  data,
  geminiApi,
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
