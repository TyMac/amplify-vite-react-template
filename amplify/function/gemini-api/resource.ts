import { defineFunction, secret } from "@aws-amplify/backend";

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
    CHAT_MODEL_PROVIDER: "openai-compatible",
    VISION_MODEL_PROVIDER: "gemma4",
    EXTRACTION_MODEL_PROVIDER: "gemini",
    GEMMA4_MAAS_MODEL: "google/gemma-4-26b-a4b-it-maas",
    // Route Barista chat through OpenRouter (Llama 3.2 3B free - faster than Gemma 4 26B).
    OPENAI_COMPAT_CHAT_URL: "https://openrouter.ai/api/v1/chat/completions",
    OPENAI_COMPAT_API_KEY: secret("OPENAI_COMPAT_API_KEY_HOSTED"),
    OPENAI_COMPAT_CHAT_MODEL: "meta-llama/llama-3.2-3b-instruct:free",
    OPENAI_COMPAT_MODEL: "meta-llama/llama-3.2-3b-instruct:free",
    OPENAI_COMPAT_PROVIDER_LABEL: "openrouter-llama3.2-3b",
    RAG_ENABLED: "true",
    RAG_SIMILARITY_TOP_K: "4",
    RAG_CONTEXT_MAX_CHARS: "8000",
    GEMMA4_CHAT_TIMEOUT_MS: "8000",
    GEMMA4_VISION_TIMEOUT_MS: "20000",
    // Stable Gemini fallback. Keep RAG in us-south1, but call Gemini fallback
    // through us-central1 first because older 2.0 Flash in us-south1 returned
    // 404, and the Vertex regional API style does not support `global` here.
    GEMINI_FALLBACK_MODEL: "gemini-2.5-flash-lite",
    GEMINI_CHAT_FALLBACK_MODELS: "gemini-2.5-flash-lite",
    GEMINI_FALLBACK_LOCATIONS: "us-central1,us-south1",
    GEMINI_CHAT_FALLBACK_LOCATIONS: "us-central1,us-south1",
    GEMINI_VISION_FALLBACK_MODEL: "gemini-2.5-flash-lite",
    GEMINI_VISION_FALLBACK_LOCATIONS: "us-central1,us-south1",
    // RAG_CORPUS_ID: 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904',
  },
});
