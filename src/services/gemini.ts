/**
 * Gemini AI Service — Web App
 * Calls geminiChat via AppSync (same Lambda as mobile)
 */

import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>({ authMode: "apiKey" });

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

Out of scope — politely decline any requests about:
- Programming, software, or technology (outside of coffee equipment)
- Legal, financial, or tax advice
- Medical, health, or dietary advice (beyond how coffee tastes)
- Politics, news, or current events
- Any topic unrelated to coffee and brewing

If asked about something outside your scope, respond with something like: "I'm a coffee assistant — that's a bit outside my grind. Is there anything I can help you with on the coffee side?"

Remember: The goal is delicious coffee. If something isn't working, adjust and iterate.`;

export async function chatWithGemini(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt?: string
): Promise<string> {
  const messagesJson = messages.map((msg) => JSON.stringify(msg));

  const result = await client.queries.geminiChat({
    messages: messagesJson,
    systemPrompt: systemPrompt || BARISTA_SYSTEM_PROMPT,
  });

  if (!result.data) {
    throw new Error("No response from Gemini API");
  }

  const parsed = JSON.parse(result.data);
  return parsed.response;
}

export interface ExtractedJournalFields {
  coffeeName: string | null;
  roaster: string | null;
  origin: string | null;
  variety: string | null;
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

export async function extractJournalFieldsFromChat(
  messages: { role: string; content: string }[],
  tags: string[] = []
): Promise<{ success: boolean; fields: ExtractedJournalFields }> {
  const messagesJson = messages.map((msg) => JSON.stringify(msg));
  // Append a synthetic context message with the chat tags so the Lambda can use them
  if (tags.length > 0) {
    messagesJson.push(JSON.stringify({
      role: "system",
      content: `[Chat tags for additional context: ${tags.join(", ")}]`,
    }));
  }

  const result = await client.queries.extractJournalFields({
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
