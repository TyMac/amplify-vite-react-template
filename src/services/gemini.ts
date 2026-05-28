/**
 * Gemini AI Service — Web App
 * Calls gemmaChat via AppSync (same Lambda as mobile)
 */

import { generateClient } from "aws-amplify/data";
import { getCurrentUser } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";

type AuthMode = "apiKey" | "userPool";

export interface AiTextResult {
  text: string;
  modelLabel?: string;
  modelUsed?: string;
  providerUsed?: string;
}

export function getModelDisplayLabel(metadata: { modelUsed?: unknown; providerUsed?: unknown }): string | undefined {
  const model = String(metadata.modelUsed ?? "").toLowerCase();
  const provider = String(metadata.providerUsed ?? "").toLowerCase();
  const combined = `${provider} ${model}`.trim();

  if (!combined) return undefined;
  if (combined.includes("gemma")) return "Gemma";
  if (combined.includes("gemini")) return "Gemini";

  return String(metadata.providerUsed || metadata.modelUsed || "AI");
}

const clients: Partial<Record<AuthMode, ReturnType<typeof generateClient<Schema>>>> = {};

function getClient(authMode: AuthMode = "apiKey") {
  if (!clients[authMode]) clients[authMode] = generateClient<Schema>({ authMode });
  return clients[authMode]!;
}

function getAnonymousDeviceId(): string {
  const key = "barista_anonymous_device_id";
  let deviceId = window.localStorage.getItem(key);
  if (!deviceId) {
    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    deviceId = `web-${randomId}`;
    window.localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

async function getAiRequestAuth(): Promise<{ authMode: AuthMode; deviceId?: string }> {
  try {
    await getCurrentUser();
    return { authMode: "userPool" };
  } catch {
    return { authMode: "apiKey", deviceId: getAnonymousDeviceId() };
  }
}

export const BARISTA_SYSTEM_PROMPT = `You are Barista, a specialty coffee assistant focused exclusively on pour-over coffee.

Your role is strictly limited to:
- Helping users understand coffee beans (origin, variety, process, roast level, tasting notes)
- Recommending grind settings for specific grinders
- Creating personalized pour-over brew recipes (V60, Chemex, AeroPress, Kalita Wave, etc.)
- Explaining flavor profiles and tasting notes
- Troubleshooting brewing issues (sour, bitter, weak, muddy, etc.)
- Discussing coffee equipment (grinders, kettles, scales, brewers, filters)
- Identifying coffee beans and equipment from photos
- Explaining water chemistry as it relates to brewing

Be conversational and friendly, but precise with measurements and techniques.
Always ask clarifying questions to give better recommendations.
When you have enough info, provide a complete recipe with step-by-step instructions.

Focus on:
- Water temperature (88-96°C depending on roast)
- Coffee-to-water ratio (typically 1:15 to 1:17)
- Grind size (adjust based on grinder type and bean)
- Pour technique (bloom, multiple pours, total time)
- Extraction indicators (brew time, taste profile)

Equipment comparison rules:
- When comparing equipment flow rates, never produce a ranked list unless every item's relative position is explicitly supported by retrieved context or the canonical rules below.
- Before answering, verify that any prose summary, numbered ranking, and final conclusion all agree with each other.
- For Cafec/Hario V60-compatible filter flow-rate comparisons, use this canonical order unless newer retrieved context explicitly contradicts it: fastest to slowest is Cafec T-90 → Hario V60 02 standard paper → Cafec T-92.
- Cafec T-90 is faster-flowing than standard Hario V60 02 paper. Hario V60 02 is faster-flowing than Cafec T-92. Cafec T-92 is designed to slow drawdown/increase dwell time.

Variety naming note:
- Gesha and Geisha are the same coffee variety and are pronounced the same way: “gay-shuh.”
- Gesha is the more linguistically accurate spelling from Ethiopia's Gesha Mountain region; Geisha is the historical Central American/Panamanian spelling that stuck in specialty coffee.
- Preserve the spelling shown on the user's bag or chosen tag when possible, but treat both as equivalent for brew advice, journal extraction, and recommendations.

Out of scope — politely decline any requests about:
- Programming, software, or technology (outside of coffee equipment)
- Legal, financial, or tax advice
- Medical, health, or dietary advice (beyond how coffee tastes)
- Politics, news, or current events
- Any topic unrelated to coffee and brewing

If asked about something outside your scope, respond with something like: "I'm a coffee assistant — that's a bit outside my grind. Is there anything I can help you with on the coffee side?"

Remember: The goal is delicious coffee. If something isn't working, adjust and iterate.`;

export const LIVE_BREW_COACH_SYSTEM_PROMPT = `You are Barista's live brew coach for an in-progress pour-over session.

The user is actively brewing coffee and may be speaking, typing, or sharing a camera image.

Your job:
- Keep responses short, practical, and action-oriented.
- Give one next step at a time when the brew is actively happening.
- Use the existing chat context as the current session history.
- Reference the user's saved equipment and preferences when available.
- When the user shares an image, assess the setup and tell them what to do next.
- Ask at most one clarifying question when you truly need it.
- Prefer measurements in grams, seconds, and pour counts.
- If the user is clearly done brewing, summarize the outcome and suggest a journal follow-up.

Tone:
- Calm, precise, and supportive.
- Speak like a coach standing next to the brewer.
- Avoid long theory dumps unless the user asks for them.

If the user says something that is not about the active brew, gently steer them back to the session.`;

export function buildLiveBrewCoachSystemPrompt(basePrompt?: string | null): string {
  if (!basePrompt?.trim()) {
    return LIVE_BREW_COACH_SYSTEM_PROMPT;
  }
  return `${LIVE_BREW_COACH_SYSTEM_PROMPT}\n\n${basePrompt.trim()}`;
}

export function buildLiveBrewVisionPrompt(context: {
  sessionName?: string;
  recentMessages: { role: "user" | "assistant"; content: string }[];
  equipmentPrompt?: string | null;
}): string {
  const recentTranscript = context.recentMessages
    .slice(-8)
    .map((msg) => `- ${msg.role}: ${msg.content}`)
    .join("\n");

  const equipmentSection = context.equipmentPrompt?.trim()
    ? `\nSaved equipment / preferences:\n${context.equipmentPrompt.trim()}\n`
    : "";

  return `${LIVE_BREW_COACH_SYSTEM_PROMPT}

${context.sessionName ? `Session name: ${context.sessionName}\n` : ""}
Recent transcript:
${recentTranscript || "- (no prior messages in this session)"}
${equipmentSection}

Analyze the attached image as a live pour-over coaching check.
Tell the user the most important observation first, then the next physical action to take.
Keep the answer brief enough to read aloud.`;
}

export async function analyzeImageWithGeminiResult(
  imageBase64: string,
  prompt?: string
): Promise<AiTextResult> {
  const result = await getClient("apiKey").queries.geminiVision({
    imageBase64,
    prompt: prompt || "Analyze this coffee setup and provide the most useful next brewing guidance.",
  });

  if (!result.data) {
    throw new Error("No response from Gemini Vision API");
  }

  const parsed = JSON.parse(result.data);
  console.info("Vision analysis model debug", {
    requestedProvider: parsed.requestedProvider,
    providerUsed: parsed.providerUsed,
    modelUsed: parsed.modelUsed,
    fallbackUsed: parsed.fallbackUsed,
    fallbackReason: parsed.fallbackReason,
    tokensUsed: parsed.tokensUsed,
    latencyMs: parsed.latencyMs,
    providerLatencyMs: parsed.providerLatencyMs,
  });
  return {
    text: parsed.analysis as string,
    modelLabel: getModelDisplayLabel(parsed),
    modelUsed: parsed.modelUsed,
    providerUsed: parsed.providerUsed,
  };
}

export async function analyzeImageWithGemini(
  imageBase64: string,
  prompt?: string
): Promise<string> {
  const result = await analyzeImageWithGeminiResult(imageBase64, prompt);
  return result.text;
}

export async function chatWithGeminiResult(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt?: string,
  options?: { maxOutputTokens?: number }
): Promise<AiTextResult> {
  try {
    const messagesJson = messages.map((msg) => JSON.stringify(msg));
    const { authMode, deviceId } = await getAiRequestAuth();

    const result = await getClient(authMode).queries.gemmaChat({
      messages: messagesJson,
      systemPrompt: systemPrompt || BARISTA_SYSTEM_PROMPT,
      deviceId,
      maxOutputTokens: options?.maxOutputTokens,
    });

    if (result.errors?.length) {
      throw new Error(result.errors.map((err: { message?: string }) => err.message).join("; "));
    }

    if (!result.data) {
      throw new Error("No response from Gemini API");
    }

    const parsed = JSON.parse(result.data);
    console.info("Chat model debug", {
      requestedProvider: parsed.requestedProvider,
      providerUsed: parsed.providerUsed,
      modelUsed: parsed.modelUsed,
      fallbackUsed: parsed.fallbackUsed,
      fallbackReason: parsed.fallbackReason,
      tokensUsed: parsed.tokensUsed,
      latencyMs: parsed.latencyMs,
      providerLatencyMs: parsed.providerLatencyMs,
    });
    return {
      text: parsed.response,
      modelLabel: getModelDisplayLabel(parsed),
      modelUsed: parsed.modelUsed,
      providerUsed: parsed.providerUsed,
    };
  } catch (error: any) {
    const errorMessage = error?.message || error?.errors?.[0]?.message || "";
    if (errorMessage.includes("Anonymous daily AI chat limit reached")) {
      throw new Error("You’ve used today’s 3 free AI chats. Create a free account to keep chatting.");
    }
    throw error;
  }
}

export async function chatWithGemini(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt?: string,
  options?: { maxOutputTokens?: number }
): Promise<string> {
  const result = await chatWithGeminiResult(messages, systemPrompt, options);
  return result.text;
}

export interface ExtractedJournalFields {
  coffeeName: string | null;
  roaster: string | null;
  origin: string | null;
  variety: string | null;
  altitude: number | null;
  processing: "WASHED" | "NATURAL" | "HONEY" | "ANAEROBIC" | "OTHER" | null;
  roastLevel: "LIGHT" | "MEDIUM_LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK" | null;
  roastDate: string | null;
  brewMethod: string | null;
  grindSize: string | null;
  waterTemp: string | null;
  ratio: string | null;
  dose: string | null;
  brewTime: string | null;
  flavorNotes: string[];
  tastingNotes: string | null;
  spicy: number | null;
  salty: number | null;
  berryFruit: number | null;
  citrusFruit: number | null;
  stoneFruit: number | null;
  chocolate: number | null;
  caramel: number | null;
  smoky: number | null;
  savory: number | null;
  confidence: "high" | "medium" | "low";
}

// Tag category taxonomy — maps each tag to its semantic role for AI context
const TAG_CATEGORIES: Record<string, string> = {
  // Roasters
  "Onyx": "roaster", "Black & White": "roaster", "Intelligentsia": "roaster",
  "Counter Culture": "roaster", "Stumptown": "roaster", "Blue Bottle": "roaster",
  "Four Barrel": "roaster", "Verve": "roaster", "Heart": "roaster",
  "George Howell": "roaster", "Vibrant": "roaster", "SEY": "roaster",
  "Luna": "roaster", "Passenger": "roaster", "Equator": "roaster",
  // Countries
  "Ethiopia": "origin country", "Colombia": "origin country", "Kenya": "origin country",
  "Guatemala": "origin country", "Honduras": "origin country", "Peru": "origin country",
  "Brazil": "origin country", "Costa Rica": "origin country", "Panama": "origin country",
  "Rwanda": "origin country", "Burundi": "origin country", "Yemen": "origin country",
  "Indonesia": "origin country", "Papua New Guinea": "origin country",
  // Process
  "Washed": "process", "Natural": "process", "Honey": "process",
  "White Honey": "process", "Fermented Honey": "process",
  "Anaerobic": "process", "Natural Anaerobic": "process",
  "Extended Fermentation": "process", "Carbonic Maceration": "process",
  // Roast level
  "Light": "roast level", "Medium": "roast level", "Dark": "roast level",
  // Varietals
  "Gesha": "varietal", "Geisha": "varietal", "Bourbon": "varietal", "Typica": "varietal",
  "Catuai": "varietal", "Caturra": "varietal", "Heirloom": "varietal",
  "SL28": "varietal", "SL34": "varietal", "Pacamara": "varietal",
};

export async function extractJournalFieldsFromChat(
  messages: { role: string; content: string }[],
  tags: string[] = []
): Promise<{ success: boolean; fields: ExtractedJournalFields }> {
  const messagesJson = messages.map((msg) => JSON.stringify(msg));
  // Append a synthetic context message with categorized tags so the AI understands each tag's role
  if (tags.length > 0) {
    const categorized = tags.map((tag) => {
      const category = TAG_CATEGORIES[tag];
      return category ? `${tag} (${category})` : tag;
    });
    messagesJson.push(JSON.stringify({
      role: "system",
      content: `[Chat tags with semantic hints — use these to inform field extraction:\n${categorized.map(t => `• ${t}`).join("\n")}\nIf a tag is labeled "roaster", use it for the roaster field. If "origin country", use for origin. If "process", map to processing. If "roast level", map to roastLevel. If "varietal", use for variety.]`,
    }));
  }

  const result = await getClient("apiKey").queries.extractJournalFields({
    messages: messagesJson,
  });

  if (!result.data) {
    return {
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
        confidence: "low",
      },
    };
  }

  const parsed = JSON.parse(result.data);
  return {
    success: parsed.success,
    fields: parsed.fields,
  };
}
