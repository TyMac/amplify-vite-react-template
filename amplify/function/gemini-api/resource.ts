import { defineFunction } from "@aws-amplify/backend";

export const geminiApi = defineFunction({
  name: "gemini-api",
  entry: "./handler.ts",
  runtime: 20,
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    GCP_PROJECT_ID: "deductive-jet-464913-p8",
    GCP_PROJECT_NUMBER: "720226322251",
    WORKLOAD_POOL_ID: "aws-barista",
    WORKLOAD_PROVIDER_ID: "aws-lambda",
    SERVICE_ACCOUNT_EMAIL:
      "barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com",
    VERTEX_LOCATION: "us-south1",
    VERTEX_OPENAI_LOCATION: "global",
    CHAT_MODEL_PROVIDER: "gemma4",
    VISION_MODEL_PROVIDER: "gemma4",
    GEMMA4_MAAS_MODEL: "google/gemma-4-26b-a4b-it-maas",
    GEMMA4_CHAT_TIMEOUT_MS: "20000",
    GEMMA4_VISION_TIMEOUT_MS: "20000",
    // RAG_CORPUS_ID: 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904',
  },
});
