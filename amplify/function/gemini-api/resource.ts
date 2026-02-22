import { defineFunction } from '@aws-amplify/backend';

export const geminiApi = defineFunction({
  name: 'gemini-api',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    GCP_PROJECT_ID: 'deductive-jet-464913-p8',
    GCP_PROJECT_NUMBER: '720226322251',
    WORKLOAD_POOL_ID: 'aws-barista',
    WORKLOAD_PROVIDER_ID: 'aws-lambda',
    SERVICE_ACCOUNT_EMAIL: 'barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com',
    VERTEX_LOCATION: 'us-south1',
    RAG_CORPUS_ID: 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904',
  },
});
