import { defineFunction } from "@aws-amplify/backend";

export const geminiApi = defineFunction({
  name: "gemini-api",
  entry: "./handler.ts",
  resourceGroupName: "data",
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
    EXTRACTION_MODEL_PROVIDER: "gemini",
    GEMMA4_MAAS_MODEL: "google/gemma-4-26b-a4b-it-maas",
    // Leave OPENAI_COMPAT_CHAT_URL blank to use Vertex AI's OpenAI-compatible endpoint.
    // Set it to a full /chat/completions URL to route to Ollama, Cloudflare, or on-prem.
    OPENAI_COMPAT_CHAT_URL: "",
    OPENAI_COMPAT_MODEL: "google/gemma-4-26b-a4b-it-maas",
    OPENAI_COMPAT_PROVIDER_LABEL: "gemma4",
    RAG_ENABLED: "true",
    GEMMA4_CHAT_TIMEOUT_MS: "8000",
    GEMMA4_VISION_TIMEOUT_MS: "20000",
    // RAG_CORPUS_ID: 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904',
  },
});
