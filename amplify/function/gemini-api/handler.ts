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

    console.log('RAG query text:', userMessage);

    const response = await client.request({
      url,
      method: 'POST',
      data: {
        vertexRagStore: {
          ragResources: [{ ragCorpus: RAG_CORPUS }],
        },
        query: {
          text: userMessage,
          similarityTopK: 10,
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
      maxOutputTokens: 4096,
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

  try {
    const result = await callVertexAI(`publishers/google/models/${model}:generateContent`, payload);
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

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
        tokensUsed: result.usageMetadata?.totalTokenCount || 0,
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
        tokensUsed: result.usageMetadata?.totalTokenCount || 0,
      });
    }
  } catch (error: any) {
    console.error('extractJournalFields failed:', error.message);
    throw error;
  }
}
