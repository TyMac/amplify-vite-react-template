import { GoogleAuth } from 'google-auth-library';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// Declare process global for TypeScript
declare const process: { env: Record<string, string | undefined> };

// GCP Configuration from environment
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'deductive-jet-464913-p8';
const GCP_PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER || '720226322251';
const WORKLOAD_POOL_ID = process.env.WORKLOAD_POOL_ID || 'aws-barista';
const WORKLOAD_PROVIDER_ID = process.env.WORKLOAD_PROVIDER_ID || 'aws-lambda';
const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL || 'barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-south1';
const VERTEX_OPENAI_LOCATION = process.env.VERTEX_OPENAI_LOCATION || 'global';
const RAG_LOCATION = process.env.RAG_LOCATION || 'us-south1';
const RAG_CORPUS = process.env.RAG_CORPUS || 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904';
const CHAT_MODEL_PROVIDER = process.env.CHAT_MODEL_PROVIDER || 'gemini';
const VISION_MODEL_PROVIDER = process.env.VISION_MODEL_PROVIDER || 'gemini';
const EXTRACTION_MODEL_PROVIDER = process.env.EXTRACTION_MODEL_PROVIDER || 'gemini';
const GEMMA4_MAAS_MODEL = process.env.GEMMA4_MAAS_MODEL || 'google/gemma-4-26b-a4b-it-maas';
const OPENAI_COMPAT_CHAT_URL = process.env.OPENAI_COMPAT_CHAT_URL || '';
const OPENAI_COMPAT_API_KEY = process.env.OPENAI_COMPAT_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENAI_COMPAT_CHAT_MODEL = process.env.OPENAI_COMPAT_CHAT_MODEL || process.env.OPENAI_COMPAT_MODEL || GEMMA4_MAAS_MODEL;
const OPENAI_COMPAT_CHAT_FALLBACK_MODELS = (process.env.OPENAI_COMPAT_CHAT_FALLBACK_MODELS || 'barista:latest,llama3.2:latest')
  .split(',')
  .map((model) => model.trim())
  .filter((model, index, models) => model && models.indexOf(model) === index);
const OPENAI_COMPAT_VISION_MODEL = process.env.OPENAI_COMPAT_VISION_MODEL || process.env.OPENAI_COMPAT_MODEL || OPENAI_COMPAT_CHAT_MODEL;
const OPENAI_COMPAT_PROVIDER_LABEL = process.env.OPENAI_COMPAT_PROVIDER_LABEL || 'openai-compatible';
const RAG_ENABLED = process.env.RAG_ENABLED !== 'false';
const RAG_SIMILARITY_TOP_K = Math.max(1, Math.min(Number(process.env.RAG_SIMILARITY_TOP_K || 4), 10));
const RAG_CONTEXT_MAX_CHARS = Math.max(1000, Number(process.env.RAG_CONTEXT_MAX_CHARS || 8000));
const GEMMA4_CHAT_TIMEOUT_MS = Number(process.env.GEMMA4_CHAT_TIMEOUT_MS || 8000);
const GEMMA4_VISION_TIMEOUT_MS = Number(process.env.GEMMA4_VISION_TIMEOUT_MS || 20000);
const GEMINI_CHAT_FALLBACK_MODELS = (process.env.GEMINI_CHAT_FALLBACK_MODELS || 'gemini-2.0-flash-lite-001,gemini-2.0-flash-001')
  .split(',')
  .map((model) => model.trim())
  .filter((model, index, models) => model && models.indexOf(model) === index);
const GEMINI_CHAT_FALLBACK_LOCATIONS = (process.env.GEMINI_CHAT_FALLBACK_LOCATIONS || `${VERTEX_LOCATION},us-central1`)
  .split(',')
  .map((location) => location.trim())
  .filter((location, index, locations) => location && locations.indexOf(location) === index);
const AI_USAGE_LIMIT_TABLE_NAME = process.env.AI_USAGE_LIMIT_TABLE_NAME;
const ANONYMOUS_DAILY_CHAT_LIMIT = Number(process.env.ANONYMOUS_DAILY_CHAT_LIMIT || 3);

const dynamoDb = new DynamoDBClient({});

const EQUIPMENT_COMPARISON_RULES = `EQUIPMENT COMPARISON RULES:
- When comparing equipment flow rates, never produce a ranked list unless every item's relative position is explicitly supported by retrieved context or the canonical rules below.
- Before answering, verify that any prose summary, numbered ranking, and final conclusion all agree with each other.
- For Cafec/Hario V60-compatible filter flow-rate comparisons, use this canonical order unless newer retrieved context explicitly contradicts it:
  Fastest to slowest: Cafec T-90 → Hario V60 02 standard paper → Cafec T-92.
- Cafec T-90 is faster-flowing than standard Hario V60 02 paper. Hario V60 02 is faster-flowing than Cafec T-92. Cafec T-92 is designed to slow drawdown/increase dwell time.
- If retrieved context, older corrections, or model memory conflict with this order, follow the canonical order above and do not mention the contradicted older data.`;

// Construct the workload identity provider path
const WORKLOAD_IDENTITY_PROVIDER = `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WORKLOAD_POOL_ID}/providers/${WORKLOAD_PROVIDER_ID}`;

interface ChatInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  deviceId?: string;
}

interface VisionInput {
  imageBase64: string;
  prompt?: string;
}

/**
 * Get authenticated GCP client using Workload Identity Federation
 */
async function getGCPClient() {
  const auth = new GoogleAuth({
    // Use Workload Identity Federation
    projectId: GCP_PROJECT_ID,
    // AWS credentials will be automatically discovered from Lambda execution role
    credentials: {
      type: 'external_account',
      audience: WORKLOAD_IDENTITY_PROVIDER,
      subject_token_type: 'urn:ietf:params:aws:token-type:aws4_request',
      token_url: 'https://sts.googleapis.com/v1/token',
      credential_source: {
        environment_id: 'aws1',
        regional_cred_verification_url: 'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15',
        region_url: 'http://169.254.169.254/latest/meta-data/placement/availability-zone',
        url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials',
        imdsv2_session_token_url: 'http://169.254.169.254/latest/api/token'
      },
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    } as any,
  });

  return auth.getClient();
}

/**
 * Call Vertex AI model endpoints.
 */
async function callVertexAI(endpoint: string, payload: any, location?: string): Promise<any> {
  const client = await getGCPClient();
  const loc = location || VERTEX_LOCATION;
  const url = `https://${loc}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${loc}/${endpoint}`;

  const response = await client.request({
    url,
    method: 'POST',
    data: payload,
  } as any);

  return response.data;
}

function isOpenAICompatibleProvider(provider: string): boolean {
  return ['gemma4', 'openai-compatible', 'ollama', 'custom-openai'].includes(provider);
}

function resolveOpenAICompatibleProviderLabel(requestedProvider: string): string {
  if (!OPENAI_COMPAT_CHAT_URL && requestedProvider === 'gemma4') return 'gemma4';
  return OPENAI_COMPAT_PROVIDER_LABEL || requestedProvider;
}

function openAICompatibleUrl(): string {
  return OPENAI_COMPAT_CHAT_URL.trim();
}

function redactLargeOrSensitiveLogValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(redactLargeOrSensitiveLogValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'imageBase64' && typeof entry === 'string') {
      return [key, `[REDACTED imageBase64 length=${entry.length}]`];
    }
    return [key, redactLargeOrSensitiveLogValue(entry)];
  }));
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 *
 * By default this preserves the existing Gemma 4 MaaS route through Vertex AI.
 * Set OPENAI_COMPAT_CHAT_URL to a full /chat/completions URL to route the same
 * payload shape to an external OpenAI-compatible endpoint such as Ollama,
 * Cloudflare, or an on-prem gateway. OPENAI_COMPAT_API_KEY is optional.
 */
async function callOpenAICompatible(payload: any, options?: { forceVertex?: boolean; timeoutMs?: number; timeoutLabel?: string }): Promise<any> {
  const customUrl = options?.forceVertex ? '' : openAICompatibleUrl();
  if (!customUrl) {
    const client = await getGCPClient();
    const url = `https://aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${VERTEX_OPENAI_LOCATION}/endpoints/openapi/chat/completions`;

    const response = await client.request({
      url,
      method: 'POST',
      data: payload,
    } as any);

    return response.data;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // The Mac Studio's small authenticated proxy is intentionally simple; closing
    // each request avoids HTTP/1.1 keep-alive edge cases through Cloudflared.
    connection: 'close',
  };
  if (OPENAI_COMPAT_API_KEY) {
    headers.authorization = `Bearer ${OPENAI_COMPAT_API_KEY}`;
  }

  const timeoutMs = Number(options?.timeoutMs || 0);
  const controller = timeoutMs > 0 ? new AbortController() : undefined;
  const timeout = controller
    ? setTimeout(() => controller.abort(new Error(`${options?.timeoutLabel || 'openai_compatible'}_timeout_${timeoutMs}ms`)), timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetch(customUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
  } catch (error: any) {
    if (controller?.signal.aborted) {
      throw controller.signal.reason || new Error(`${options?.timeoutLabel || 'openai_compatible'}_timeout_${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const responseText = await response.text();
  let data: any = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }
  }

  if (!response.ok) {
    const error: any = new Error(`OpenAI-compatible endpoint returned HTTP ${response.status}`);
    error.response = { status: response.status, data };
    throw error;
  }

  return data;
}

class AnonymousDailyLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Anonymous daily AI chat limit reached (${limit}/day)`);
    this.name = 'AnonymousDailyLimitError';
  }
}

function isAuthenticatedAppSyncRequest(event: any): boolean {
  const identity = event?.identity;
  return Boolean(
    identity?.sub ||
    identity?.username ||
    identity?.claims?.sub ||
    identity?.resolverContext?.sub
  );
}

function getUtcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getTtlEpochSeconds(now = new Date()): number {
  // Keep daily counter rows for a few days so DynamoDB TTL can clean them up asynchronously.
  return Math.floor(now.getTime() / 1000) + 7 * 24 * 60 * 60;
}

function sanitizeDeviceId(deviceId: string): string {
  return deviceId.trim().slice(0, 160);
}

async function enforceAnonymousDailyChatLimit(args: { deviceId?: string }, event: any) {
  if (isAuthenticatedAppSyncRequest(event)) {
    return;
  }

  if (!AI_USAGE_LIMIT_TABLE_NAME) {
    console.warn('AI usage limit table not configured; allowing anonymous chat request');
    return;
  }

  const sanitizedDeviceId = sanitizeDeviceId(args.deviceId || '');
  const deviceId = sanitizedDeviceId || 'unknown-device';
  const today = getUtcDateKey();
  const identityKey = `anon:${deviceId}`;
  const identityDate = `${identityKey}#${today}`;
  const nowIso = new Date().toISOString();
  const expiresAt = getTtlEpochSeconds();

  try {
    const result = await dynamoDb.send(new UpdateItemCommand({
      TableName: AI_USAGE_LIMIT_TABLE_NAME,
      Key: {
        identityDate: { S: identityDate },
      },
      UpdateExpression: 'SET identityKey = :identityKey, #date = :date, lastRequestAt = :now, expiresAt = :expiresAt ADD #count :inc',
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
      ExpressionAttributeNames: {
        '#count': 'count',
        '#date': 'date',
      },
      ExpressionAttributeValues: {
        ':identityKey': { S: identityKey },
        ':date': { S: today },
        ':now': { S: nowIso },
        ':expiresAt': { N: String(expiresAt) },
        ':inc': { N: '1' },
        ':limit': { N: String(ANONYMOUS_DAILY_CHAT_LIMIT) },
      },
      ReturnValues: 'UPDATED_NEW',
    }));

    console.info('Anonymous AI chat usage counted', {
      identityDate,
      count: result.Attributes?.count?.N,
      limit: ANONYMOUS_DAILY_CHAT_LIMIT,
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      console.warn('Anonymous AI chat daily limit reached', {
        identityDate,
        limit: ANONYMOUS_DAILY_CHAT_LIMIT,
      });
      throw new AnonymousDailyLimitError(ANONYMOUS_DAILY_CHAT_LIMIT);
    }
    throw error;
  }
}

function extractOpenAIText(result: any): string {
  const content = result?.choices?.[0]?.message?.content ?? result?.choices?.[0]?.text;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

/**
 * Query the RAG corpus for relevant equipment profiles, recipes, and troubleshooting data.
 * Returns retrieved text chunks to enrich the model prompt.
 * If retrieval fails or returns nothing, returns empty string (graceful degradation).
 *
 * NOTE: This replaces the old tools.retrieval.vertexRagStore approach which caused
 * the model to treat RAG as a grounding constraint (refusing to answer when no docs matched).
 * Manual retrieval + prompt injection lets the model use its full knowledge supplemented by RAG.
 */
async function queryRAG(userMessage: string): Promise<string> {
  if (!RAG_ENABLED) {
    console.log('RAG disabled by RAG_ENABLED=false');
    return '';
  }

  const normalizedMessage = userMessage.trim();
  if (normalizedMessage.length < 12) {
    console.log('RAG skipped: latest user message too short for useful retrieval');
    return '';
  }

  try {
    const client = await getGCPClient();
    const url = `https://${RAG_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT_ID}/locations/${RAG_LOCATION}:retrieveContexts`;

    console.log('RAG query text:', userMessage);

    const response = await client.request({
      url,
      method: 'POST',
      data: {
        vertexRagStore: {
          ragResources: [{ ragCorpus: RAG_CORPUS }],
        },
        query: {
          text: normalizedMessage,
          similarityTopK: RAG_SIMILARITY_TOP_K,
        },
      },
    } as any);

    const contexts = (response.data as any)?.contexts?.contexts;
    if (!contexts || contexts.length === 0) {
      console.log('RAG: No relevant contexts found');
      return '';
    }

    console.log(`RAG: Retrieved ${contexts.length} context(s)`);

    const chunks: string[] = [];
    let totalChars = 0;
    for (let i = 0; i < contexts.length; i += 1) {
      const ctx = contexts[i];
      const source = ctx.source_display_name || ctx.source_uri || `Source ${i + 1}`;
      const score = ctx.score ? ` (relevance: ${ctx.score.toFixed(3)})` : '';
      const header = `### ${source}${score}\n`;
      const remaining = RAG_CONTEXT_MAX_CHARS - totalChars - header.length;
      if (remaining <= 0) break;
      const text = String(ctx.text || '');
      const body = text.length > remaining ? `${text.slice(0, remaining)}\n[Context truncated]` : text;
      const chunk = `${header}${body}`;
      chunks.push(chunk);
      totalChars += chunk.length + 2;
    }

    console.log(`RAG: Injecting ${chunks.length} context(s), capped at ${RAG_CONTEXT_MAX_CHARS} chars`);
    return chunks.join('\n\n');
  } catch (error: any) {
    console.error('RAG retrieval failed (non-fatal):', error.message);
    return '';
  }
}

/**
 * AppSync Lambda handler
 * Routes to appropriate function based on field name
 */
export async function handler(event: any) {
  // AppSync sends fieldName in event.info.fieldName
  const fieldName = event.info?.fieldName || event.fieldName;
  const args = event.arguments || event;
  
  console.log('AppSync request received:', JSON.stringify(redactLargeOrSensitiveLogValue({
    fieldName,
    argumentKeys: Object.keys(args || {}),
    requestId: event.request?.headers?.['x-amzn-requestid'] || event.requestContext?.requestId,
    identityType: event.identity?.claims ? 'cognito' : event.identity ? 'appsync' : 'unknown',
  }), null, 2));

  try {
    switch (fieldName) {
      case 'gemmaChat':
        return await gemmaChat(args, event);
      case 'geminiVision':
        return await geminiVision(args);
      case 'extractJournalFields':
        return await extractJournalFields(args);
      default:
        console.error('Unknown field:', fieldName);
        console.error('Event keys:', Object.keys(event));
        throw new Error(`Unknown field: ${fieldName}. Available keys: ${Object.keys(event).join(', ')}`);
    }
  } catch (error: any) {
    console.error(`Error in ${fieldName}:`, error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Chat with the configured Barista text model.
 */
async function gemmaChat(args: { messages: string[]; systemPrompt?: string; deviceId?: string; maxOutputTokens?: number }, event: any) {
  await enforceAnonymousDailyChatLimit(args, event);

  const { messages: messagesJson, systemPrompt } = args;
  const requestedProvider = CHAT_MODEL_PROVIDER;
  const startedAt = Date.now();
  const maxOutputTokens = Math.min(Math.max(Number(args.maxOutputTokens || 1536), 256), 4096);

  // Parse messages from JSON strings
  const messages: Array<{ role: string; content: string }> = messagesJson.map(m => JSON.parse(m));

  // Get the latest user message for RAG retrieval
  const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Query RAG corpus for relevant equipment profiles, recipes, etc.
  const ragContext = await queryRAG(latestUserMessage);

  // Build enriched system prompt: RAG context FIRST, then base prompt
  // Placing corrections before the general instructions gives them higher priority
  let enrichedPrompt = '';
  if (ragContext) {
    enrichedPrompt += `MANDATORY REFERENCE DATA — YOU MUST USE THIS:
The following equipment profiles are VERIFIED FACTS from our curated database.
When this data specifies flow rates, grind adjustments, temperatures, or warnings,
you MUST use these values. Do NOT contradict this data with your general knowledge.
For example, if this data says a filter is "very slow," do NOT say it is "fast" or
"slightly faster." The reference data is ALWAYS correct.

${ragContext}

END OF REFERENCE DATA.
Use the above data in your response. Now follow the general instructions below.

`;
    console.log(`RAG context injected (${ragContext.length} chars)`);
    console.log('RAG content preview:', ragContext.substring(0, 500));
  }
  enrichedPrompt += `${EQUIPMENT_COMPARISON_RULES}\n\n`;
  enrichedPrompt += systemPrompt || '';

  const callGeminiChat = async () => {
    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const payload: any = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens,
        topP: 0.95,
      },
    };

    if (enrichedPrompt) {
      payload.systemInstruction = {
        parts: [{ text: enrichedPrompt }]
      };
    }

    const errors: string[] = [];
    for (const model of GEMINI_CHAT_FALLBACK_MODELS) {
      for (const location of GEMINI_CHAT_FALLBACK_LOCATIONS) {
        try {
          console.log(`Using fallback chat model: ${model} in ${location}`);
          const result = await callVertexAI(`publishers/google/models/${model}:generateContent`, payload, location);
          return {
            response: result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated',
            tokensUsed: result.usageMetadata?.totalTokenCount || 0,
            modelUsed: model,
            providerUsed: 'gemini',
            providerLocation: location,
          };
        } catch (error: any) {
          const reason = `${model}@${location}:${error?.response?.status || error?.code || error?.message || 'unknown'}`;
          errors.push(reason);
          console.warn('Gemini fallback chat attempt failed', {
            modelUsed: model,
            location,
            errorMessage: error?.message,
            errorStatus: error?.response?.status,
            errorData: error?.response?.data,
          });
        }
      }
    }

    throw new Error(`Gemini fallback chat failed in all configured models/locations: ${errors.join('; ')}`);
  };

  const callOpenAICompatibleChat = async (model = OPENAI_COMPAT_CHAT_MODEL) => {
    console.log(`Using OpenAI-compatible chat model: ${model}`);
    const result = await callOpenAICompatible({
      model,
      stream: false,
      max_tokens: maxOutputTokens,
      messages: [
        ...(enrichedPrompt ? [{ role: 'system', content: enrichedPrompt }] : []),
        ...messages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
      ],
      temperature: 0.7,
      top_p: 0.95,
      chat_template_kwargs: {
        enable_thinking: false,
      },
      // Ollama's OpenAI-compatible API for Gemma 4 honors this and returns
      // final answer content instead of spending the whole budget in reasoning.
      reasoning: {
        effort: 'none',
      },
    }, {
      timeoutMs: GEMMA4_CHAT_TIMEOUT_MS,
      timeoutLabel: `${requestedProvider}_chat`,
    });
    return {
      response: extractOpenAIText(result) || 'No response generated',
      tokensUsed: result.usage?.total_tokens || 0,
      modelUsed: model,
      providerUsed: resolveOpenAICompatibleProviderLabel(requestedProvider),
    };
  };

  const callOpenAICompatibleFallbackModels = async (fallbackReason: string) => {
    for (const fallbackModel of OPENAI_COMPAT_CHAT_FALLBACK_MODELS) {
      if (fallbackModel === OPENAI_COMPAT_CHAT_MODEL) continue;
      try {
        const fallbackStart = Date.now();
        const fallbackResult = await withTimeout(
          callOpenAICompatibleChat(fallbackModel),
          GEMMA4_CHAT_TIMEOUT_MS,
          `${requestedProvider}_fallback_${fallbackModel}_chat`
        );
        const fallbackLatencyMs = Date.now() - fallbackStart;
        if (fallbackResult.response && fallbackResult.response !== 'No response generated') {
          return {
            ...fallbackResult,
            requestedProvider,
            fallbackUsed: true,
            fallbackReason,
            latencyMs: Date.now() - startedAt,
            providerLatencyMs: fallbackLatencyMs,
          };
        }
        console.warn('OpenAI-compatible fallback model returned empty response', {
          requestedProvider,
          fallbackModel,
          fallbackLatencyMs,
        });
      } catch (error: any) {
        console.warn('OpenAI-compatible fallback model failed', {
          requestedProvider,
          fallbackModel,
          errorMessage: error?.message,
          errorStatus: error?.response?.status,
          errorData: error?.response?.data,
        });
      }
    }
    return null;
  };

  console.info('Chat model selection started', {
    requestedProvider,
    openAiModel: OPENAI_COMPAT_CHAT_MODEL,
    openAiEndpoint: openAICompatibleUrl() || `vertex:${VERTEX_OPENAI_LOCATION}`,
    messageCount: messages.length,
    latestUserMessageLength: latestUserMessage.length,
    ragContextLength: ragContext.length,
    maxOutputTokens,
  });

  if (isOpenAICompatibleProvider(requestedProvider)) {
    try {
      const gemmaStart = Date.now();
      const gemmaResult = await withTimeout(
        callOpenAICompatibleChat(),
        GEMMA4_CHAT_TIMEOUT_MS,
        `${requestedProvider}_chat`
      );
      const gemmaLatencyMs = Date.now() - gemmaStart;

      if (gemmaResult.response && gemmaResult.response !== 'No response generated') {
        const response = {
          ...gemmaResult,
          requestedProvider,
          fallbackUsed: false,
          fallbackReason: null,
          latencyMs: Date.now() - startedAt,
          providerLatencyMs: gemmaLatencyMs,
        };
        console.info('Chat model selected', {
          requestedProvider,
          providerUsed: response.providerUsed,
          modelUsed: response.modelUsed,
          fallbackUsed: response.fallbackUsed,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          providerLatencyMs: response.providerLatencyMs,
        });
        return JSON.stringify(response);
      }

      console.warn('OpenAI-compatible chat returned empty response; falling back to Gemini Flash Lite', {
        requestedProvider,
        openAiModel: OPENAI_COMPAT_CHAT_MODEL,
        gemmaLatencyMs,
      });
      const emptyFallbackReason = `${requestedProvider}_empty_response`;
      const openAiFallbackResponse = await callOpenAICompatibleFallbackModels(emptyFallbackReason);
      if (openAiFallbackResponse) {
        console.info('Chat model selected', {
          requestedProvider,
          providerUsed: openAiFallbackResponse.providerUsed,
          modelUsed: openAiFallbackResponse.modelUsed,
          fallbackUsed: openAiFallbackResponse.fallbackUsed,
          fallbackReason: openAiFallbackResponse.fallbackReason,
          tokensUsed: openAiFallbackResponse.tokensUsed,
          latencyMs: openAiFallbackResponse.latencyMs,
          providerLatencyMs: openAiFallbackResponse.providerLatencyMs,
        });
        return JSON.stringify(openAiFallbackResponse);
      }

      const geminiStart = Date.now();
      const geminiResult = await callGeminiChat();
      const response = {
        ...geminiResult,
        requestedProvider,
        fallbackUsed: true,
        fallbackReason: emptyFallbackReason,
        latencyMs: Date.now() - startedAt,
        providerLatencyMs: Date.now() - geminiStart,
      };
      console.info('Chat model selected', {
        requestedProvider,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
        fallbackUsed: response.fallbackUsed,
        fallbackReason: response.fallbackReason,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        providerLatencyMs: response.providerLatencyMs,
      });
      return JSON.stringify(response);
    } catch (error: any) {
      const fallbackReason = `${requestedProvider}_error:${error?.response?.status || error?.code || error?.message || 'unknown'}`;
      console.error('OpenAI-compatible chat failed; falling back to Gemini Flash Lite', {
        requestedProvider,
        openAiModel: OPENAI_COMPAT_CHAT_MODEL,
        fallbackReason,
        errorMessage: error?.message,
        errorStatus: error?.response?.status,
        errorData: error?.response?.data,
      });
      const openAiFallbackResponse = await callOpenAICompatibleFallbackModels(fallbackReason);
      if (openAiFallbackResponse) {
        console.info('Chat model selected', {
          requestedProvider,
          providerUsed: openAiFallbackResponse.providerUsed,
          modelUsed: openAiFallbackResponse.modelUsed,
          fallbackUsed: openAiFallbackResponse.fallbackUsed,
          fallbackReason: openAiFallbackResponse.fallbackReason,
          tokensUsed: openAiFallbackResponse.tokensUsed,
          latencyMs: openAiFallbackResponse.latencyMs,
          providerLatencyMs: openAiFallbackResponse.providerLatencyMs,
        });
        return JSON.stringify(openAiFallbackResponse);
      }

      const geminiStart = Date.now();
      const geminiResult = await callGeminiChat();
      const response = {
        ...geminiResult,
        requestedProvider,
        fallbackUsed: true,
        fallbackReason,
        latencyMs: Date.now() - startedAt,
        providerLatencyMs: Date.now() - geminiStart,
      };
      console.info('Chat model selected', {
        requestedProvider,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
        fallbackUsed: response.fallbackUsed,
        fallbackReason: response.fallbackReason,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        providerLatencyMs: response.providerLatencyMs,
      });
      return JSON.stringify(response);
    }
  }

  const geminiStart = Date.now();
  const geminiResult = await callGeminiChat();
  const response = {
    ...geminiResult,
    requestedProvider,
    fallbackUsed: false,
    fallbackReason: null,
    latencyMs: Date.now() - startedAt,
    providerLatencyMs: Date.now() - geminiStart,
  };
  console.info('Chat model selected', {
    requestedProvider,
    providerUsed: response.providerUsed,
    modelUsed: response.modelUsed,
    fallbackUsed: response.fallbackUsed,
    tokensUsed: response.tokensUsed,
    latencyMs: response.latencyMs,
    providerLatencyMs: response.providerLatencyMs,
  });
  return JSON.stringify(response);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Analyze image with Gemini Flash fallback.
 */
async function analyzeImageWithGeminiFlash(imageBase64: string, prompt: string) {
  const result = await callVertexAI('publishers/google/models/gemini-2.0-flash-001:generateContent', {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
    },
  });

  return {
    analysis: result.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not analyze image',
    tokensUsed: result.usageMetadata?.totalTokenCount || 0,
    modelUsed: 'gemini-2.0-flash-001',
    providerUsed: 'gemini',
  };
}

/**
 * Analyze image with Gemma 4 MaaS via Vertex AI's OpenAI-compatible endpoint.
 */
async function analyzeImageWithOpenAICompatible(imageBase64: string, prompt: string, requestedProvider: string) {
  const result = await callOpenAICompatible(
    {
      model: OPENAI_COMPAT_VISION_MODEL,
      stream: false,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    // `gemma4` means the managed Vertex AI Gemma MaaS endpoint. Do not let the
    // chat-specific Cloudflare/Ollama URL hijack vision when chat is routed to
    // the external OpenAI-compatible tunnel.
    { forceVertex: requestedProvider === 'gemma4' }
  );

  return {
    analysis: extractOpenAIText(result) || 'Could not analyze image',
    tokensUsed: result.usage?.total_tokens || 0,
    modelUsed: OPENAI_COMPAT_VISION_MODEL,
    providerUsed: requestedProvider === 'gemma4'
      ? 'gemma4'
      : resolveOpenAICompatibleProviderLabel(requestedProvider),
  };
}

function buildVisionRagQuery(prompt: string, initialAnalysis: string): string {
  const query = `Coffee label scan. Use visible OCR and image analysis to find matching known coffee label docs.\n\nInitial visible analysis/OCR:\n${initialAnalysis}\n\nPrompt context:\n${prompt}`;
  return query.length > 4000 ? query.slice(0, 4000) : query;
}

function buildRagEnhancedVisionPrompt(prompt: string, initialAnalysis: string, ragContext: string): string {
  return `${prompt}\n\nCOFFEE LABEL RAG MATCHING DATA — USE CAREFULLY:\nThe following retrieved coffee-label documents are candidate matches from Barista's curated RAG corpus. Use them to identify known coffees and normalize fields only when the visible label/OCR plausibly matches the document. Visible label text always wins over RAG. Do not copy RAG facts into the final answer if the image does not support the same coffee identity. If a match is strong, explicitly state the matched coffee name, source document/name if visible in the context, and confidence. If the match is weak or ambiguous, say so and keep uncertain fields separate.\n\n${ragContext}\n\nINITIAL VISIBLE IMAGE ANALYSIS/OCR:\n${initialAnalysis}\n\nNow produce the final scan analysis using both the image and the retrieved context. Preserve visible label spellings, normalize Gesha/Geisha only as instructed, avoid unsupported guesses, and still append the canonical tag JSON block exactly as requested above.`;
}

async function maybeEnhanceVisionWithRag(
  prompt: string,
  initialResult: { analysis: string; tokensUsed: number; modelUsed: string; providerUsed: string },
  analyzeAgain: (enhancedPrompt: string) => Promise<{ analysis: string; tokensUsed: number; modelUsed: string; providerUsed: string }>
) {
  const ragQuery = buildVisionRagQuery(prompt, initialResult.analysis);
  const ragContext = await queryRAG(ragQuery);

  if (!ragContext) {
    return {
      ...initialResult,
      ragContextUsed: false,
      ragContextLength: 0,
    };
  }

  console.info('Vision RAG context injected', {
    ragContextLength: ragContext.length,
    initialAnalysisLength: initialResult.analysis.length,
  });

  const enhancedPrompt = buildRagEnhancedVisionPrompt(prompt, initialResult.analysis, ragContext);
  const enhancedResult = await analyzeAgain(enhancedPrompt);

  if (!enhancedResult.analysis || enhancedResult.analysis === 'Could not analyze image') {
    console.warn('Vision RAG enhancement returned empty analysis; preserving initial image analysis', {
      ragContextLength: ragContext.length,
      initialAnalysisLength: initialResult.analysis.length,
      enhancedModelUsed: enhancedResult.modelUsed,
      enhancedProviderUsed: enhancedResult.providerUsed,
      enhancedTokensUsed: enhancedResult.tokensUsed,
    });

    return {
      ...initialResult,
      tokensUsed: initialResult.tokensUsed + enhancedResult.tokensUsed,
      ragContextUsed: false,
      ragContextLength: ragContext.length,
      ragFallbackReason: 'rag_enhancement_empty_response',
    };
  }

  return {
    ...enhancedResult,
    tokensUsed: initialResult.tokensUsed + enhancedResult.tokensUsed,
    ragContextUsed: true,
    ragContextLength: ragContext.length,
  };
}

/**
 * Analyze image with the configured vision provider. OpenAI-compatible vision is experimental, so
 * fall back to Gemini Flash if Gemma errors or returns an empty response.
 *
 * The AppSync field is still named `geminiVision` for backward compatibility, but the configured
 * provider may be Gemma. Do not rename the field until all clients/schema references migrate.
 */
async function geminiVision(args: { imageBase64: string; prompt?: string }) {
  const { imageBase64, prompt = 'What kind of coffee beans or equipment is in this image? Provide details about origin, roast level, grinder type, or any other relevant information.' } = args;
  const requestedProvider = VISION_MODEL_PROVIDER;
  const startedAt = Date.now();

  console.info('Vision model selection started', {
    requestedProvider,
    openAiModel: OPENAI_COMPAT_VISION_MODEL,
    openAiEndpoint: requestedProvider === 'gemma4'
      ? `vertex:${VERTEX_OPENAI_LOCATION}`
      : (openAICompatibleUrl() || `vertex:${VERTEX_OPENAI_LOCATION}`),
    promptLength: prompt.length,
    imageBase64Length: imageBase64.length,
  });

  if (isOpenAICompatibleProvider(requestedProvider)) {
    try {
      const gemmaStart = Date.now();
      const gemmaResult = await withTimeout(
        analyzeImageWithOpenAICompatible(imageBase64, prompt, requestedProvider),
        GEMMA4_VISION_TIMEOUT_MS,
        `${requestedProvider}_vision`
      );
      const gemmaLatencyMs = Date.now() - gemmaStart;

      if (gemmaResult.analysis && gemmaResult.analysis !== 'Could not analyze image') {
        const enhancedGemmaResult = await maybeEnhanceVisionWithRag(
          prompt,
          gemmaResult,
          (enhancedPrompt) => withTimeout(
            analyzeImageWithOpenAICompatible(imageBase64, enhancedPrompt, requestedProvider),
            GEMMA4_VISION_TIMEOUT_MS,
            `${requestedProvider}_vision_rag`
          )
        );
        const response = {
          ...enhancedGemmaResult,
          requestedProvider,
          fallbackUsed: false,
          fallbackReason: null,
          latencyMs: Date.now() - startedAt,
          providerLatencyMs: Date.now() - gemmaStart,
        };
        console.info('Vision model selected', {
          requestedProvider,
          providerUsed: response.providerUsed,
          modelUsed: response.modelUsed,
          fallbackUsed: response.fallbackUsed,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          providerLatencyMs: response.providerLatencyMs,
        });
        return JSON.stringify(response);
      }

      console.warn('OpenAI-compatible vision returned empty analysis; falling back to Gemini Flash', {
        requestedProvider,
        openAiModel: OPENAI_COMPAT_VISION_MODEL,
        gemmaLatencyMs,
      });
      const geminiStart = Date.now();
      const geminiInitialResult = await analyzeImageWithGeminiFlash(imageBase64, prompt);
      const geminiResult = await maybeEnhanceVisionWithRag(
        prompt,
        geminiInitialResult,
        (enhancedPrompt) => analyzeImageWithGeminiFlash(imageBase64, enhancedPrompt)
      );
      const response = {
        ...geminiResult,
        requestedProvider,
        fallbackUsed: true,
        fallbackReason: `${requestedProvider}_empty_response`,
        latencyMs: Date.now() - startedAt,
        providerLatencyMs: Date.now() - geminiStart,
      };
      console.info('Vision model selected', {
        requestedProvider,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
        fallbackUsed: response.fallbackUsed,
        fallbackReason: response.fallbackReason,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        providerLatencyMs: response.providerLatencyMs,
      });
      return JSON.stringify(response);
    } catch (error: any) {
      const fallbackReason = `${requestedProvider}_error:${error?.response?.status || error?.code || error?.message || 'unknown'}`;
      console.error('OpenAI-compatible vision failed; falling back to Gemini Flash', {
        requestedProvider,
        openAiModel: OPENAI_COMPAT_VISION_MODEL,
        fallbackReason,
        errorMessage: error?.message,
        errorStatus: error?.response?.status,
        errorData: error?.response?.data,
      });
      const geminiStart = Date.now();
      const geminiInitialResult = await analyzeImageWithGeminiFlash(imageBase64, prompt);
      const geminiResult = await maybeEnhanceVisionWithRag(
        prompt,
        geminiInitialResult,
        (enhancedPrompt) => analyzeImageWithGeminiFlash(imageBase64, enhancedPrompt)
      );
      const response = {
        ...geminiResult,
        requestedProvider,
        fallbackUsed: true,
        fallbackReason,
        latencyMs: Date.now() - startedAt,
        providerLatencyMs: Date.now() - geminiStart,
      };
      console.info('Vision model selected', {
        requestedProvider,
        providerUsed: response.providerUsed,
        modelUsed: response.modelUsed,
        fallbackUsed: response.fallbackUsed,
        fallbackReason: response.fallbackReason,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        providerLatencyMs: response.providerLatencyMs,
      });
      return JSON.stringify(response);
    }
  }

  const geminiStart = Date.now();
  const geminiInitialResult = await analyzeImageWithGeminiFlash(imageBase64, prompt);
  const geminiResult = await maybeEnhanceVisionWithRag(
    prompt,
    geminiInitialResult,
    (enhancedPrompt) => analyzeImageWithGeminiFlash(imageBase64, enhancedPrompt)
  );
  const response = {
    ...geminiResult,
    requestedProvider,
    fallbackUsed: false,
    fallbackReason: null,
    latencyMs: Date.now() - startedAt,
    providerLatencyMs: Date.now() - geminiStart,
  };
  console.info('Vision model selected', {
    requestedProvider,
    providerUsed: response.providerUsed,
    modelUsed: response.modelUsed,
    fallbackUsed: response.fallbackUsed,
    tokensUsed: response.tokensUsed,
    latencyMs: response.latencyMs,
    providerLatencyMs: response.providerLatencyMs,
  });
  return JSON.stringify(response);
}

/**
 * Extract journal fields from a chat conversation
 */
async function extractJournalFields(args: { messages: string[] }) {
  const { messages: messagesJson } = args;

  // Parse messages from JSON strings
  const messages: Array<{ role: string; content: string }> = messagesJson.map(m => JSON.parse(m));

  // Format conversation for the prompt
  const conversationText = messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  const extractionPrompt = `You are a coffee journal assistant. Given the following Coffee Talk conversation, extract any coffee-related information mentioned. Return ONLY a valid JSON object with these fields (use null for fields not mentioned):

{
  "coffeeName": string | null,        // name of the coffee/blend
  "roaster": string | null,           // roaster name
  "origin": string | null,           // country or region of origin
  "variety": string | null,           // bean variety (gesha, bourbon, typica, etc.)
  "altitude": number | null,          // farm altitude in meters above sea level (masl) if mentioned
  "processing": "WASHED" | "NATURAL" | "HONEY" | "ANAEROBIC" | "OTHER" | null,
  "roastLevel": "LIGHT" | "MEDIUM_LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK" | null,
  "roastDate": string | null,         // ISO date string if mentioned (YYYY-MM-DD)
  "brewMethod": string | null,        // V60, Chemex, AeroPress, French Press, Espresso, etc.
  "grindSize": string | null,         // coarse, medium-coarse, medium, fine, or specific microns
  "waterTemp": string | null,         // e.g. "93°C" or "200°F"
  "ratio": string | null,             // e.g. "1:16"
  "dose": string | null,              // e.g. "20g"
  "brewTime": string | null,          // e.g. "3:30"
  "flavorNotes": string[],            // array of flavor descriptors mentioned
  "tastingNotes": string | null,      // free text summary of tasting notes from the chat
  "spicy": number | null,             // spicy/peppery intensity 1-5
  "salty": number | null,             // saltiness/mineral quality 1-5
  "berryFruit": number | null,        // berry fruit intensity 1-5
  "citrusFruit": number | null,       // citrus fruit intensity 1-5
  "stoneFruit": number | null,        // stone fruit intensity 1-5
  "chocolate": number | null,         // chocolate notes 1-5
  "caramel": number | null,           // caramel notes 1-5
  "smoky": number | null,             // smoky intensity 1-5
  "savory": number | null,            // savory/umami quality 1-5
  "confidence": "high" | "medium" | "low"  // how confident you are in the extraction
}

Conversation:
${conversationText}

Important: If the conversation includes a system message with "Chat tags with semantic hints", treat those tags as strong signals for field extraction. A tag labeled "(roaster)" should populate the roaster field. A tag labeled "(origin country)" should populate origin. A tag labeled "(process)" maps to processing. A tag labeled "(roast level)" maps to roastLevel. A tag labeled "(varietal)" maps to variety. These tags were assigned by the user and are highly reliable.

Return ONLY the JSON object, no markdown, no explanation.`;

  const model = 'gemini-2.0-flash-lite-001';
  const requestedProvider = EXTRACTION_MODEL_PROVIDER;

  try {
    let responseText = '{}';
    let tokensUsed = 0;

    if (isOpenAICompatibleProvider(requestedProvider)) {
      const result = await callOpenAICompatible({
        model: OPENAI_COMPAT_CHAT_MODEL,
        stream: false,
        max_tokens: 1024,
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.2,
      });
      responseText = extractOpenAIText(result) || '{}';
      tokensUsed = result.usage?.total_tokens || 0;
    } else {
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: extractionPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2, // Lower temperature for more consistent JSON output
          maxOutputTokens: 1024,
        },
      };
      const result = await callVertexAI(`publishers/google/models/${model}:generateContent`, payload);
      responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      tokensUsed = result.usageMetadata?.totalTokenCount || 0;
    }

    // Try to parse the JSON response
    try {
      // Clean up potential markdown code blocks
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7);
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      const parsed = JSON.parse(cleanedResponse);
      return JSON.stringify({
        success: true,
        fields: parsed,
        tokensUsed,
      });
    } catch (parseError) {
      console.error('Failed to parse extraction response:', responseText);
      return JSON.stringify({
        success: false,
        fields: {
          coffeeName: null,
          roaster: null,
          origin: null,
          variety: null,
          altitude: null,
          processing: null,
          roastLevel: null,
          roastDate: null,
          brewMethod: null,
          grindSize: null,
          waterTemp: null,
          ratio: null,
          dose: null,
          brewTime: null,
          flavorNotes: [],
          tastingNotes: null,
          spicy: null,
          salty: null,
          berryFruit: null,
          citrusFruit: null,
          stoneFruit: null,
          chocolate: null,
          caramel: null,
          smoky: null,
          savory: null,
          confidence: 'low',
        },
        tokensUsed,
      });
    }
  } catch (error: any) {
    console.error('extractJournalFields failed:', error.message);
    throw error;
  }
}
