/**
 * Gemini AI Service — Web App
 * Calls geminiChat via AppSync (same Lambda as mobile)
 */

import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>({ authMode: "apiKey" });

export const BARISTA_SYSTEM_PROMPT = `You are an expert barista assistant specializing in V60 pour-over coffee.

Your role:
- Help users understand their beans (origin, process, roast level)
- Recommend grind settings specific to their grinder
- Create personalized brew recipes (water temp, ratios, timing)
- Explain flavor profiles and tasting notes
- Troubleshoot brewing issues (sour, bitter, weak, etc.)
- Identify coffee beans and equipment from photos

Be conversational and friendly, but precise with measurements and techniques.
Always ask clarifying questions to give better recommendations.
When you have enough info, provide a complete recipe with step-by-step instructions.

Focus on:
- Water temperature (90-96°C range)
- Coffee-to-water ratio (typically 1:15 to 1:17)
- Grind size (adjust based on grinder type)
- Pour technique (bloom, multiple pours, total time)
- Extraction indicators (brew time, taste profile)

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
