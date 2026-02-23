import { GoogleAuth } from 'google-auth-library';

// Declare process global for TypeScript
declare const process: { env: Record<string, string | undefined> };

// GCP Configuration from environment
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'deductive-jet-464913-p8';
const GCP_PROJECT_NUMBER = process.env.GCP_PROJECT_NUMBER || '720226322251';
const WORKLOAD_POOL_ID = process.env.WORKLOAD_POOL_ID || 'aws-barista';
const WORKLOAD_PROVIDER_ID = process.env.WORKLOAD_PROVIDER_ID || 'aws-lambda';
const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL || 'barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-south1';
const RAG_LOCATION = process.env.RAG_LOCATION || 'us-south1';
const RAG_CORPUS = process.env.RAG_CORPUS || 'projects/deductive-jet-464913-p8/locations/us-south1/ragCorpora/4611686018427387904';

// Construct the workload identity provider path
const WORKLOAD_IDENTITY_PROVIDER = `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WORKLOAD_POOL_ID}/providers/${WORKLOAD_PROVIDER_ID}`;

interface ChatInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
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
 * Call Vertex AI Gemini API
 */
async function callVertexAI(endpoint: string, payload: any): Promise<any> {
  const client = await getGCPClient();
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${VERTEX_LOCATION}/${endpoint}`;

  const response = await client.request({
    url,
    method: 'POST',
    data: payload,
  } as any);

  return response.data;
}

/**
 * Query the RAG corpus for relevant equipment profiles, recipes, and troubleshooting data.
 * Returns retrieved text chunks to enrich the Gemini prompt.
 * If retrieval fails or returns nothing, returns empty string (graceful degradation).
 *
 * NOTE: This replaces the old tools.retrieval.vertexRagStore approach which caused
 * Gemini to treat RAG as a grounding constraint (refusing to answer when no docs matched).
 * Manual retrieval + prompt injection lets Gemini use its full knowledge supplemented by RAG.
 */
async function queryRAG(userMessage: string): Promise<string> {
  try {
    const client = await getGCPClient();
    const url = `https://${RAG_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT_ID}/locations/${RAG_LOCATION}:retrieveContexts`;

    const response = await client.request({
      url,
      method: 'POST',
      data: {
        vertex_rag_store: {
          rag_resources: [{ rag_corpus: RAG_CORPUS }],
          similarity_top_k: 5,
          vector_distance_threshold: 0.3,
        },
        query: {
          text: userMessage,
        },
      },
    } as any);

    const contexts = (response.data as any)?.contexts?.contexts;
    if (!contexts || contexts.length === 0) {
      console.log('RAG: No relevant contexts found');
      return '';
    }

    console.log(`RAG: Retrieved ${contexts.length} context(s)`);

    const chunks = contexts.map((ctx: any, i: number) => {
      const source = ctx.source_display_name || ctx.source_uri || `Source ${i + 1}`;
      const score = ctx.score ? ` (relevance: ${ctx.score.toFixed(3)})` : '';
      return `### ${source}${score}\n${ctx.text}`;
    });

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
  console.log('Full event:', JSON.stringify(event, null, 2));
  
  // AppSync sends fieldName in event.info.fieldName
  const fieldName = event.info?.fieldName || event.fieldName;
  const args = event.arguments || event;
  
  console.log('Field name:', fieldName);
  console.log('Arguments:', JSON.stringify(args, null, 2));

  try {
    switch (fieldName) {
      case 'geminiChat':
        return await geminiChat(args);
      case 'geminiVision':
        return await geminiVision(args);
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
 * Chat with Gemini Flash
 */
async function geminiChat(args: { messages: string[]; systemPrompt?: string }) {
  const { messages: messagesJson, systemPrompt } = args;

  // Parse messages from JSON strings
  const messages: Array<{ role: string; content: string }> = messagesJson.map(m => JSON.parse(m));

  // Get the latest user message for RAG retrieval
  const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Query RAG corpus for relevant equipment profiles, recipes, etc.
  const ragContext = await queryRAG(latestUserMessage);

  // Build enriched system prompt: base prompt + RAG context
  let enrichedPrompt = systemPrompt || '';
  if (ragContext) {
    enrichedPrompt += `\n\n--- CURATED REFERENCE DATA ---
The following profiles and guides were retrieved from our curated knowledge base.
Use your full barista expertise to answer naturally, but when this reference data
contains specific guidance (grind settings, flow rates, synergies, warnings),
PREFER this data over your general training. Weave the information into your
response conversationally — do not just quote it back verbatim.

${ragContext}
--- END REFERENCE DATA ---`;
    console.log(`RAG context injected (${ragContext.length} chars)`);
  }

  // Convert messages to Gemini format
  const contents = messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Use only the requested model
  const model = 'gemini-2.0-flash-lite-001';

  // Prepare request payload
  const payload: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      topP: 0.95,
    },
  };

  // Add system instruction if provided (now enriched with RAG context)
  if (enrichedPrompt) {
    payload.systemInstruction = {
      parts: [{ text: enrichedPrompt }]
    };
  }

  try {
    console.log(`Using model: ${model}`);
    const result = await callVertexAI(`publishers/google/models/${model}:generateContent`, payload);

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
    
    return JSON.stringify({
      response: responseText,
      tokensUsed: result.usageMetadata?.totalTokenCount || 0,
      modelUsed: model
    });
  } catch (error: any) {
    console.error(`Model ${model} failed:`, error.message);
    throw error;
  }
}

/**
 * Analyze image with Gemini Vision
 */
async function geminiVision(args: { imageBase64: string; prompt?: string }) {
  const { imageBase64, prompt = 'What kind of coffee beans or equipment is in this image? Provide details about origin, roast level, grinder type, or any other relevant information.' } = args;

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

  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not analyze image';
  
  return JSON.stringify({
    analysis: responseText,
    tokensUsed: result.usageMetadata?.totalTokenCount || 0,
  });
}
