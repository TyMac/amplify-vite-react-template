import { generateClient } from "aws-amplify/api";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

// Deterministic color palette — warm, coffee-toned
const BATCH_COLORS = [
  "#b45309", // amber-700
  "#92400e", // amber-800
  "#78350f", // amber-900
  "#c2410c", // orange-700
  "#9a3412", // orange-800
  "#7c2d12", // orange-900
  "#b91c1c", // red-700
  "#7f1d1d", // red-900
  "#15803d", // green-700
  "#166534", // green-800
  "#0f766e", // teal-700
  "#0e7490", // cyan-700
  "#1d4ed8", // blue-700
  "#4338ca", // indigo-700
  "#6d28d9", // violet-700
  "#7e22ce", // purple-700
  "#be185d", // pink-700
  "#9f1239", // rose-800
];

/** Derive a stable color from a batch ID */
export function batchColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xfffffff;
  }
  return BATCH_COLORS[hash % BATCH_COLORS.length];
}

/** Find an existing batch for userId + coffeeName + roaster + roastDate, or null */
export async function findBatch(
  userId: string,
  coffeeName: string,
  roaster: string | null | undefined,
  roastDate: string | null | undefined
): Promise<Schema["CoffeeBatch"]["type"] | null> {
  try {
    const { data } = await client.models.CoffeeBatch.list({
      filter: { userId: { eq: userId } },
    });
    const name = coffeeName.trim().toLowerCase();
    const r = (roaster ?? "").trim().toLowerCase();
    const d = roastDate ?? "";
    return (
      data.find(
        (b) =>
          b.coffeeName.trim().toLowerCase() === name &&
          (b.roaster ?? "").trim().toLowerCase() === r &&
          (b.roastDate ?? "") === d
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Create a new batch from a journal entry's coffee fields */
export async function createBatch(
  userId: string,
  fields: {
    coffeeName: string;
    roaster?: string | null;
    roastDate?: string | null;
    origin?: string | null;
    variety?: string | null;
    altitude?: number | null;
    processing?: Schema["CoffeeBatch"]["type"]["processing"];
    processingNote?: string | null;
    roastLevel?: Schema["CoffeeBatch"]["type"]["roastLevel"];
    roastLevelNote?: string | null;
  }
): Promise<Schema["CoffeeBatch"]["type"] | null> {
  try {
    const { data } = await client.models.CoffeeBatch.create({
      userId,
      coffeeName: fields.coffeeName,
      roaster: fields.roaster ?? null,
      roastDate: fields.roastDate ?? null,
      origin: fields.origin ?? null,
      variety: fields.variety ?? null,
      altitude: fields.altitude ?? null,
      processing: fields.processing ?? null,
      processingNote: fields.processingNote ?? null,
      roastLevel: fields.roastLevel ?? null,
      roastLevelNote: fields.roastLevelNote ?? null,
      color: "", // set after we have the ID
    });
    if (!data) return null;
    // Update with deterministic color derived from ID
    const color = batchColor(data.id);
    await client.models.CoffeeBatch.update({ id: data.id, color });
    return { ...data, color };
  } catch (err) {
    console.error("Failed to create batch", err);
    return null;
  }
}

/** Ensure a batch exists for this entry; returns the batch id */
export async function upsertBatch(
  userId: string,
  fields: Parameters<typeof createBatch>[1]
): Promise<string | null> {
  if (!fields.roastDate) return null; // roastDate required to identify a batch
  const existing = await findBatch(userId, fields.coffeeName, fields.roaster, fields.roastDate);
  if (existing) return existing.id;
  const created = await createBatch(userId, fields);
  return created?.id ?? null;
}
