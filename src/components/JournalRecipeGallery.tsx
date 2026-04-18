import { useEffect, useMemo, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { generateClient } from "aws-amplify/data";
import { getUrl, uploadData } from "aws-amplify/storage";
import type { Schema } from "../../amplify/data/resource";
import { generateRecipeDraft, renderRecipeMarkdown } from "../services/recipeGeneration";

const client = generateClient<Schema>();

type JournalEntry = Schema["BrewJournal"]["type"];
type CoffeeBatch = Schema["CoffeeBatch"]["type"];
type ChatSession = Schema["ChatSession"]["type"];
type UserPreference = Schema["UserPreference"]["type"];
type GeneratedRecipe = Schema["GeneratedRecipe"]["type"];

interface JournalRecipeGalleryProps {
  journalEntry: JournalEntry | null;
  batch: CoffeeBatch | null;
  chatSessions: ChatSession[];
  userId?: string;
}

export default function JournalRecipeGallery({
  journalEntry,
  batch,
  chatSessions,
  userId,
}: JournalRecipeGalleryProps) {
  const { user } = useAuthenticator();
  const effectiveUserId = userId ?? user?.userId;

  const [recipes, setRecipes] = useState<GeneratedRecipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedRecipeMarkdown, setSelectedRecipeMarkdown] = useState<string | null>(null);
  const [lastCreatedRecipeId, setLastCreatedRecipeId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkedChats = useMemo(() => {
    if (!journalEntry?.chatSessionIds || journalEntry.chatSessionIds.length === 0) {
      return [];
    }
    const chatIds = new Set(
      journalEntry.chatSessionIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    );
    return chatSessions.filter((chat) => chatIds.has(chat.id));
  }, [journalEntry?.chatSessionIds, chatSessions]);

  useEffect(() => {
    if (!journalEntry?.id) {
      setRecipes([]);
      setSelectedRecipeId(null);
      setSelectedRecipeMarkdown(null);
      setLastCreatedRecipeId(null);
      return;
    }
    void loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalEntry?.id, effectiveUserId]);

  useEffect(() => {
    if (recipes.length === 0) {
      setSelectedRecipeId(null);
      setSelectedRecipeMarkdown(null);
      return;
    }

    if (!selectedRecipeId || !recipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(recipes[0].id);
    }
  }, [recipes, selectedRecipeId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!selectedRecipeId) {
        setSelectedRecipeMarkdown(null);
        return;
      }
      const recipe = recipes.find((item) => item.id === selectedRecipeId);
      if (!recipe) {
        setSelectedRecipeMarkdown(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const markdown = await fetchRecipeMarkdown(recipe.s3Key);
        if (!cancelled) {
          setSelectedRecipeMarkdown(markdown);
        }
      } catch (err) {
        console.error("Failed to load recipe preview", err);
        if (!cancelled) {
          setSelectedRecipeMarkdown(null);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [recipes, selectedRecipeId]);

  async function loadRecipes(preferredRecipeId?: string) {
    if (!journalEntry?.id) return;
    setLoadingRecipes(true);
    setError(null);
    try {
      const filter = effectiveUserId
        ? { journalEntryId: { eq: journalEntry.id }, userId: { eq: effectiveUserId } }
        : { journalEntryId: { eq: journalEntry.id } };

      const { data } = await client.models.GeneratedRecipe.list({ filter });
      const sorted = [...(data ?? [])].sort((a, b) => {
        const left = a.generatedAt ?? a.createdAt ?? "";
        const right = b.generatedAt ?? b.createdAt ?? "";
        return right.localeCompare(left);
      });
      setRecipes(sorted);
      setSelectedRecipeId((current) => {
        if (preferredRecipeId && sorted.some((recipe) => recipe.id === preferredRecipeId)) {
          return preferredRecipeId;
        }
        if (current && sorted.some((recipe) => recipe.id === current)) {
          return current;
        }
        return sorted[0]?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to load recipes", err);
      setError("Unable to load generated recipes.");
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function handleGenerateRecipe() {
    if (!journalEntry || !effectiveUserId) return;
    setGenerating(true);
    setError(null);
    setLastCreatedRecipeId(null);

    try {
      const preference = await loadUserPreference(effectiveUserId);
      const draft = await generateRecipeDraft({
        journal: journalEntry,
        batch,
        chats: linkedChats,
        preference,
      });

      const generatedAt = new Date().toISOString();
      const generatedDateKey = generatedAt.slice(0, 10);
      const recipeMarkdown = renderRecipeMarkdown(draft, {
        journalId: journalEntry.id,
        batchId: batch?.id ?? null,
        chatSessionIds: linkedChats.map((chat) => chat.id),
        generatedAt,
      });

      const recipeTitle = draft.recipe_name.trim() || `${journalEntry.coffeeName} Recipe`;
      const fileName = buildRecipeFileName(recipeTitle, generatedAt, effectiveUserId);

      const uploadTask = uploadData({
        path: ({ identityId }) => {
          if (!identityId) {
            throw new Error("Missing storage identity");
          }
          return `private/${identityId}/recipes/${effectiveUserId}/${generatedDateKey}/${fileName}`;
        },
        data: new Blob([recipeMarkdown], { type: "text/markdown;charset=utf-8" }),
        options: { contentType: "text/markdown;charset=utf-8" },
      });
      const uploadResult = await uploadTask.result;

      const recipeRecord: Record<string, unknown> = {
        userId: effectiveUserId,
        journalEntryId: journalEntry.id,
        chatSessionIds: linkedChats.map((chat) => chat.id),
        title: recipeTitle,
        recipeName: recipeTitle,
        fileName,
        s3Key: uploadResult.path,
        summary: draft.overview,
        generatedAt,
        updatedAt: generatedAt,
      };
      if (batch?.id) {
        recipeRecord.sourceBatchId = batch.id;
      }

      const { data: createdRecipe } = await client.models.GeneratedRecipe.create(recipeRecord as any);
      setLastCreatedRecipeId(createdRecipe?.id ?? null);
      await loadRecipes(createdRecipe?.id ?? undefined);
    } catch (err) {
      console.error("Failed to generate recipe", err);
      setError(err instanceof Error ? err.message : "Failed to generate recipe.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadRecipe(recipe: GeneratedRecipe) {
    setDownloadingId(recipe.id);
    setError(null);
    try {
      const { url } = await getUrl({
        path: recipe.s3Key,
        options: { expiresIn: 3600, validateObjectExistence: false },
      });
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = recipe.fileName || `${recipe.title}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Failed to download recipe", err);
      setError("Unable to download the recipe right now.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (!journalEntry) {
    return (
      <div className="p-3 border-t border-base-200">
        <p className="text-xs text-base-content/40 text-center py-4">
          Select a journal entry to generate recipes
        </p>
      </div>
    );
  }

  const linkedChatCount = linkedChats.length;
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null;

  return (
    <div className="border-t border-base-200">
      <div className="p-3 border-b border-base-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
            Recipes
          </h3>
          <p className="text-xs text-base-content/40 mt-1">
            {recipes.length} saved recipe{recipes.length === 1 ? "" : "s"}
            {linkedChatCount > 0 ? ` • ${linkedChatCount} linked chat${linkedChatCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <button
          onClick={handleGenerateRecipe}
          disabled={generating || loadingRecipes}
          className="btn btn-primary btn-xs whitespace-nowrap"
        >
          {generating ? <span className="loading loading-spinner loading-xs" /> : "Generate Recipe"}
        </button>
      </div>

      {lastCreatedRecipeId && recipes.some((recipe) => recipe.id === lastCreatedRecipeId) && (
        <div className="px-3 pt-3">
          <div className="alert alert-success py-2 px-3 text-xs">
            <div className="min-w-0">
              <p className="font-medium">Saved recipe: {recipes.find((recipe) => recipe.id === lastCreatedRecipeId)?.title}</p>
              <p className="text-success-content/70">
                The newest recipe is selected below and stored in S3 under the user/date recipe folder.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-success btn-xs"
              onClick={() => setSelectedRecipeId(lastCreatedRecipeId)}
            >
              Open
            </button>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {error && (
          <div className="alert alert-error py-2 px-3 text-xs">
            <span>{error}</span>
          </div>
        )}

        {loadingRecipes ? (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        ) : recipes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 bg-base-100/50 p-3 text-xs text-base-content/50 space-y-1">
            <p>No recipes generated yet.</p>
            <p>Generate one from this journal and its linked chats.</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[1fr_1.25fr]">
            <div className="flex flex-col gap-2">
              {recipes.map((recipe) => {
                const isSelected = recipe.id === selectedRecipeId;
                return (
                  <button
                    key={recipe.id}
                    onClick={() => setSelectedRecipeId(recipe.id)}
                    className={`text-left rounded-lg border bg-base-100 p-3 transition-all hover:border-primary/40 hover:shadow-sm ${isSelected ? "border-primary/50 ring-1 ring-primary/20" : "border-base-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{recipe.title}</p>
                        <p className="text-xs text-base-content/40 mt-0.5 truncate">
                          {recipe.summary || recipe.recipeName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="badge badge-xs badge-outline">Preview</span>
                        {downloadingId === recipe.id && <span className="loading loading-spinner loading-xs" />}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-base-content/30">
                        {formatRecipeTimestamp(recipe.generatedAt ?? recipe.createdAt)}
                      </p>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDownloadRecipe(recipe);
                        }}
                        disabled={downloadingId === recipe.id}
                        className="btn btn-ghost btn-xs"
                      >
                        Download
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-base-200 bg-base-100 p-3 min-h-72">
              {selectedRecipe ? (
                <RecipePreview
                  recipe={selectedRecipe}
                  markdown={selectedRecipeMarkdown}
                  loading={previewLoading}
                  onDownload={handleDownloadRecipe}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-base-content/40">
                  Select a recipe to preview it here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipePreview({
  recipe,
  markdown,
  loading,
  onDownload,
}: {
  recipe: GeneratedRecipe;
  markdown: string | null;
  loading: boolean;
  onDownload: (recipe: GeneratedRecipe) => Promise<void>;
}) {
  return (
    <div className="space-y-3 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate">{recipe.title}</h4>
          <p className="text-xs text-base-content/40 mt-1">
            {recipe.summary || recipe.recipeName}
          </p>
        </div>
        <button
          onClick={() => void onDownload(recipe)}
          disabled={!recipe.s3Key}
          className="btn btn-primary btn-xs flex-shrink-0"
        >
          Download
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <RecipeMeta label="Generated" value={formatRecipeTimestamp(recipe.generatedAt ?? recipe.createdAt)} />
        <RecipeMeta label="Journal" value={recipe.journalEntryId} mono />
        <RecipeMeta label="File" value={recipe.fileName} mono />
        <RecipeMeta label="Source" value={recipe.sourceBatchId ?? "Journal-linked"} />
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-base-200 bg-base-200/30 p-3 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        ) : markdown ? (
          <pre className="whitespace-pre-wrap text-xs leading-5 text-base-content/80 font-mono">{markdown}</pre>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-base-content/40">
            Preview unavailable.
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeMeta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-base-200 bg-base-100 p-2 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-base-content/40">{label}</p>
      <p className={`mt-1 truncate ${mono ? "font-mono text-[11px]" : "text-xs"}`}>{value || "—"}</p>
    </div>
  );
}

async function loadUserPreference(userId: string): Promise<UserPreference | null> {
  const { data } = await client.models.UserPreference.list({
    filter: { userId: { eq: userId } },
  });
  return data?.[0] ?? null;
}

async function fetchRecipeMarkdown(s3Key: string): Promise<string> {
  const { url } = await getUrl({
    path: s3Key,
    options: { expiresIn: 3600, validateObjectExistence: false },
  });
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Preview failed (${response.status})`);
  }
  return response.text();
}

function buildRecipeFileName(title: string, generatedAt: string, userId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "recipe";
  const timestamp = generatedAt.replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const userPart = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user";
  return `${userPart}-${timestamp}-${slug}.md`;
}

function formatRecipeTimestamp(dateValue: string | null | undefined): string {
  if (!dateValue) return "";
  try {
    return new Date(dateValue).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateValue;
  }
}
