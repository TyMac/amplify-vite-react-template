import { chatWithGemini } from "./gemini";
import type { Schema } from "../../amplify/data/resource";

export type JournalEntry = Schema["BrewJournal"]["type"];
export type CoffeeBatch = Schema["CoffeeBatch"]["type"];
export type ChatSession = Schema["ChatSession"]["type"];
export type UserPreference = Schema["UserPreference"]["type"];

export interface RecipeGenerationContext {
  journal: JournalEntry;
  batch: CoffeeBatch | null;
  chats: ChatSession[];
  preference: UserPreference | null;
  timezone?: string;
}

export interface RecipeOptionDraft {
  name: string;
  gear: string;
  grind_setting: string;
  dose: string;
  water: string;
  water_temp: string;
  ratio: string;
  total_brew_time: string;
  filter: string;
  technique_steps: string[];
  dial_in_notes: string[];
  why_this_works: string;
}

export interface GeneratedRecipeDraft {
  recipe_name: string;
  brew_method: string;
  dripper: string;
  grinder: string;
  target_coffee: string;
  flavor_goal: string;
  origin: string;
  processing: string;
  variety: string;
  overview: string;
  options: RecipeOptionDraft[];
  water_guidance: string[];
  what_to_expect: string[];
  best_pairings: string[];
  assumptions: string[];
}

const RECIPE_SYSTEM_PROMPT = `You generate coffee recipe documents from a user's journal, chat transcripts, and equipment.

Return JSON only. Do not wrap in markdown fences. Do not add commentary.

Your job:
- Create a practical, specific brew recipe that matches the user's actual equipment and the notes in the journal/chat.
- Prefer clarity, repeatability, and realistic grind ranges over novelty.
- Account for grinder, dripper, kettle, and scale if available.
- If important details are missing, make a reasonable assumption and list it in assumptions.
- Keep the recipe grounded in the evidence from the journal and chat context.
- When appropriate, include two options: a primary recipe and a secondary adjustment or alternate filter/flow profile.

Match this structure:
{
  "recipe_name": string,
  "brew_method": string,
  "dripper": string,
  "grinder": string,
  "target_coffee": string,
  "flavor_goal": string,
  "origin": string,
  "processing": string,
  "variety": string,
  "overview": string,
  "options": [
    {
      "name": string,
      "gear": string,
      "grind_setting": string,
      "dose": string,
      "water": string,
      "water_temp": string,
      "ratio": string,
      "total_brew_time": string,
      "filter": string,
      "technique_steps": [string],
      "dial_in_notes": [string],
      "why_this_works": string
    }
  ],
  "water_guidance": [string],
  "what_to_expect": [string],
  "best_pairings": [string],
  "assumptions": [string]
}

Use concise arrays. Ensure all required keys are present. Use string values for measurements so the markdown renderer can preserve nuance.`;

export function buildRecipeContextMessage(context: RecipeGenerationContext): string {
  const journal = context.journal;
  const batch = context.batch;
  const preference = context.preference;

  const linkedChatSummaries = context.chats.length > 0
    ? context.chats.map((chat) => {
        const messages = parseMessages(chat.messages);
        const tail = messages.slice(-10).map((msg) => {
          const role = msg.role === "assistant" ? "assistant" : "user";
          return `- ${role}: ${truncate(msg.content, 500)}`;
        });
        return [
          `Chat: ${chat.name}`,
          chat.tags && chat.tags.length > 0 ? `Tags: ${(chat.tags as string[]).filter(Boolean).join(", ")}` : null,
          tail.length > 0 ? tail.join("\n") : "- (no transcript available)",
        ].filter(Boolean).join("\n");
      })
    : ["(No linked chats)"].join("\n");

  const equipmentLines = [
    preference?.grinder && preference.grinder !== "None" ? `Grinder: ${preference.grinder}` : null,
    preference?.dripper && preference.dripper !== "None" ? `Dripper: ${preference.dripper}` : null,
    preference?.kettle && preference.kettle !== "None" ? `Kettle: ${preference.kettle}` : null,
    preference?.scale && preference.scale !== "None" ? `Scale: ${preference.scale}` : null,
  ].filter(Boolean);

  const brewContext = {
    journal: {
      coffeeName: journal.coffeeName,
      roaster: journal.roaster,
      roastDate: journal.roastDate,
      origin: journal.origin,
      variety: journal.variety,
      altitude: journal.altitude,
      processing: journal.processing,
      roastLevel: journal.roastLevel,
      brewMethod: journal.brewMethod,
      grindSize: journal.grindSize,
      waterTemp: journal.waterTemp,
      ratio: journal.ratio,
      dose: journal.dose,
      yield: journal.yield,
      daysFromRoast: journal.daysFromRoast,
      tds: journal.tds,
      extractionYield: journal.extractionYield,
      initialImpressions: journal.initialImpressions,
      tastingNotes: journal.tastingNotes,
      flavorNotes: journal.flavorNotes,
      aromaNote: journal.aromaNote,
      extractionNote: journal.extractionNote,
      finishNote: journal.finishNote,
      scores: {
        sweetness: journal.sweetness,
        acidity: journal.acidity,
        florality: journal.florality,
        body: journal.body,
        clarity: journal.clarity,
        finish: journal.finish,
      },
    },
    batch: batch
      ? {
          coffeeName: batch.coffeeName,
          roaster: batch.roaster,
          roastDate: batch.roastDate,
          origin: batch.origin,
          variety: batch.variety,
          altitude: batch.altitude,
          processing: batch.processing,
          processingNote: batch.processingNote,
          roastLevel: batch.roastLevel,
          roastLevelNote: batch.roastLevelNote,
          notes: batch.notes,
        }
      : null,
    equipment: equipmentLines.length > 0 ? equipmentLines : ["No saved equipment preferences"] ,
    chatSummaries: linkedChatSummaries,
  };

  return `Journal + Equipment Context (JSON-ish for reference):\n${JSON.stringify(brewContext, null, 2)}\n\nImportant instructions:\n- The recipe should be tuned to the user\'s actual equipment and the journal evidence.\n- If the journal suggests clarity, lean toward a cleaner, more precise recipe; if it suggests body, increase immersion or contact time.\n- If the coffee is a light roast, push extraction a bit higher with temperature/agitation; if darker, keep it gentler.\n- Mention any assumptions clearly in the assumptions array.\n- Keep the recipe practical enough to brew tomorrow morning.`;
}

export async function generateRecipeDraft(context: RecipeGenerationContext): Promise<GeneratedRecipeDraft> {
  const result = await chatWithGemini([
    {
      role: "user",
      content: buildRecipeContextMessage(context),
    },
  ], RECIPE_SYSTEM_PROMPT);

  return parseRecipeDraft(result);
}

export function renderRecipeMarkdown(
  draft: GeneratedRecipeDraft,
  metadata: {
    journalId: string;
    chatSessionIds: string[];
    batchId?: string | null;
    generatedAt: string;
  }
): string {
  const frontmatter = [
    "---",
    `recipe_name: ${yamlQuote(draft.recipe_name)}`,
    `brew_method: ${yamlQuote(draft.brew_method)}`,
    `dripper: ${yamlQuote(draft.dripper)}`,
    `grinder: ${yamlQuote(draft.grinder)}`,
    `target_coffee: ${yamlQuote(draft.target_coffee)}`,
    `flavor_goal: ${yamlQuote(draft.flavor_goal)}`,
    `origin: ${yamlQuote(draft.origin)}`,
    `processing: ${yamlQuote(draft.processing)}`,
    `variety: ${yamlQuote(draft.variety)}`,
    `journal_entry_id: ${yamlQuote(metadata.journalId)}`,
    metadata.batchId ? `source_batch_id: ${yamlQuote(metadata.batchId)}` : null,
    `generated_at: ${yamlQuote(metadata.generatedAt)}`,
    "source_chat_ids:",
    ...(metadata.chatSessionIds.length > 0
      ? metadata.chatSessionIds.map((id) => `  - ${yamlQuote(id)}`)
      : ["  - \"\""] ),
    "---",
  ].filter((line): line is string => line !== null);

  const sections = [
    `# Recipe: ${draft.recipe_name}`,
    "",
    "## Overview",
    draft.overview,
    "",
    "## The Coffee",
    `**Coffee:** ${draft.target_coffee}`,
    `**Origin:** ${draft.origin}`,
    `**Processing:** ${draft.processing}`,
    `**Variety:** ${draft.variety}`,
    `**Brew Method:** ${draft.brew_method}`,
    `**Dripper:** ${draft.dripper}`,
    `**Grinder:** ${draft.grinder}`,
    "",
    ...draft.options.flatMap((option) => [
      `## ${option.name}`,
      "",
      "| Parameter | Value |",
      "| --- | --- |",
      `| Grinder | ${option.gear || option.grind_setting || draft.grinder} |`,
      `| Grind Setting | ${option.grind_setting} |`,
      `| Dose | ${option.dose} |`,
      `| Water | ${option.water} |`,
      `| Water Temp | ${option.water_temp} |`,
      `| Ratio | ${option.ratio} |`,
      `| Total Brew Time | ${option.total_brew_time} |`,
      `| Filter | ${option.filter} |`,
      "",
      "### Technique",
      ...option.technique_steps.map((step, idx) => `${idx + 1}. ${step}`),
      "",
      "### Dial-in Notes",
      ...option.dial_in_notes.map((note) => `- ${note}`),
      "",
      "### Why This Works",
      option.why_this_works,
      "",
    ]),
    "## Water Guidance",
    ...draft.water_guidance.map((line) => `- ${line}`),
    "",
    "## What to Expect in the Cup",
    ...draft.what_to_expect.map((line) => `- ${line}`),
    "",
    "## Best Coffee Pairings",
    ...draft.best_pairings.map((line) => `- ${line}`),
    "",
    ...(draft.assumptions.length > 0
      ? ["## Assumptions", ...draft.assumptions.map((line) => `- ${line}`), ""]
      : []),
  ];

  return [...frontmatter, "", ...sections].join("\n").trimEnd() + "\n";
}

function parseMessages(raw: unknown): { role: "user" | "assistant"; content: string }[] {
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (Array.isArray(raw)) {
      return raw
        .map((msg) => {
          if (!msg || typeof msg !== "object") return null;
          const role = (msg as { role?: unknown }).role;
          const content = (msg as { content?: unknown }).content;
          if ((role === "user" || role === "assistant") && typeof content === "string") {
            return { role, content };
          }
          return null;
        })
        .filter((msg): msg is { role: "user" | "assistant"; content: string } => msg !== null);
    }
    return [];
  } catch {
    return [];
  }
}

function parseRecipeDraft(raw: string): GeneratedRecipeDraft {
  const parsed = JSON.parse(extractJson(raw));
  const options = Array.isArray(parsed.options) ? parsed.options : [];

  return {
    recipe_name: stringValue(parsed.recipe_name, "Untitled Recipe"),
    brew_method: stringValue(parsed.brew_method, "V60"),
    dripper: stringValue(parsed.dripper, "Hario V60 02"),
    grinder: stringValue(parsed.grinder, "Unknown grinder"),
    target_coffee: stringValue(parsed.target_coffee, "Coffee"),
    flavor_goal: stringValue(parsed.flavor_goal, "Clarity"),
    origin: stringValue(parsed.origin, "Unknown"),
    processing: stringValue(parsed.processing, "Unknown"),
    variety: stringValue(parsed.variety, "Unknown"),
    overview: stringValue(parsed.overview, ""),
    options: options.map((option: Record<string, unknown>) => ({
      name: stringValue(option.name, "Option"),
      gear: stringValue(option.gear, ""),
      grind_setting: stringValue(option.grind_setting, ""),
      dose: stringValue(option.dose, ""),
      water: stringValue(option.water, ""),
      water_temp: stringValue(option.water_temp, ""),
      ratio: stringValue(option.ratio, ""),
      total_brew_time: stringValue(option.total_brew_time, ""),
      filter: stringValue(option.filter, ""),
      technique_steps: stringArray(option.technique_steps),
      dial_in_notes: stringArray(option.dial_in_notes),
      why_this_works: stringValue(option.why_this_works, ""),
    })),
    water_guidance: stringArray(parsed.water_guidance),
    what_to_expect: stringArray(parsed.what_to_expect),
    best_pairings: stringArray(parsed.best_pairings),
    assumptions: stringArray(parsed.assumptions),
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

function yamlQuote(value: string): string {
  return JSON.stringify(value ?? "");
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
