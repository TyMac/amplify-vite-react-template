import { useEffect, useMemo, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { generateClient } from "aws-amplify/data";
import { getUrl, uploadData } from "aws-amplify/storage";
import type { Schema } from "../../amplify/data/resource";
import RecipeMarkdown from "./RecipeMarkdown";
import { generateRecipeDraft, renderRecipeMarkdown } from "../services/recipeGeneration";

const client = generateClient<Schema>({ authMode: "userPool" });

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
  const [lastCreatedRecipeId, setLastCreatedRecipeId] = useState<string | null>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalRecipe, setModalRecipe] = useState<GeneratedRecipe | null>(null);
  const [modalMarkdown, setModalMarkdown] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

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
      setLastCreatedRecipeId(null);
      return;
    }
    void loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalEntry?.id, effectiveUserId]);

  // Load markdown when modal opens
  useEffect(() => {
    if (!modalRecipe) {
      setModalMarkdown(null);
      return;
    }
    let cancelled = false;
    setModalLoading(true);
    fetchRecipeMarkdown(modalRecipe.s3Key)
      .then((md) => { if (!cancelled) setModalMarkdown(md); })
      .catch(() => { if (!cancelled) setModalMarkdown(null); })
      .finally(() => { if (!cancelled) setModalLoading(false); });
    return () => { cancelled = true; };
  }, [modalRecipe]);

  // Close modal on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalRecipe(null);
    }
    if (modalRecipe) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalRecipe]);

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
      // Auto-open modal for newly generated recipe
      if (preferredRecipeId) {
        const newRecipe = sorted.find((r) => r.id === preferredRecipeId);
        if (newRecipe) setModalRecipe(newRecipe);
      }
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
          if (!identityId) throw new Error("Missing storage identity");
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
        isFavorite: false,
        generatedAt,
      };
      if (batch?.id) recipeRecord.sourceBatchId = batch.id;

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
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
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

  async function handleToggleFavorite(recipe: GeneratedRecipe) {
    const nextIsFavorite = !recipe.isFavorite;
    setFavoriteUpdatingId(recipe.id);
    setError(null);
    try {
      const { data: updatedRecipe } = await client.models.GeneratedRecipe.update({
        id: recipe.id,
        isFavorite: nextIsFavorite,
      });
      const mergedRecipe = { ...recipe, ...(updatedRecipe ?? {}), isFavorite: nextIsFavorite } as GeneratedRecipe;
      setRecipes((current) => current.map((item) => (item.id === recipe.id ? mergedRecipe : item)));
      setModalRecipe((current) => (current?.id === recipe.id ? mergedRecipe : current));
    } catch (err) {
      console.error("Failed to update recipe favorite", err);
      setError("Unable to update favorite status.");
    } finally {
      setFavoriteUpdatingId(null);
    }
  }

  async function handleDeleteRecipe(recipe: GeneratedRecipe) {
    if (!window.confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    setDeletingId(recipe.id);
    setError(null);
    try {
      await client.models.GeneratedRecipe.delete({ id: recipe.id });
      if (modalRecipe?.id === recipe.id) setModalRecipe(null);
      await loadRecipes();
    } catch (err) {
      console.error("Failed to delete recipe", err);
      setError("Unable to delete the recipe.");
    } finally {
      setDeletingId(null);
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

  return (
    <>
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

        {lastCreatedRecipeId && recipes.some((r) => r.id === lastCreatedRecipeId) && (
          <div className="px-3 pt-3">
            <div className="alert alert-success py-2 px-3 text-xs">
              <div className="min-w-0">
                <p className="font-medium">Saved: {recipes.find((r) => r.id === lastCreatedRecipeId)?.title}</p>
                <p className="text-success-content/70">Opening preview now.</p>
              </div>
              <button type="button" className="btn btn-success btn-xs" onClick={() => setLastCreatedRecipeId(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="p-3 space-y-2">
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
            <div className="flex flex-col gap-2">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => setModalRecipe(recipe)}
                  className="w-full min-w-0 text-left rounded-lg border border-base-200 bg-base-100 p-3 transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{recipe.title}</p>
                      <p className="text-xs text-base-content/40 mt-0.5 line-clamp-2">
                        {recipe.summary || recipe.recipeName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {recipe.isFavorite && <span className="badge badge-xs badge-warning">Favorite</span>}
                      <span className="badge badge-xs badge-outline">View</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-base-content/30">
                      {formatRecipeTimestamp(recipe.generatedAt ?? recipe.createdAt)}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDownloadRecipe(recipe); }}
                        disabled={downloadingId === recipe.id || deletingId === recipe.id}
                        className="btn btn-ghost btn-xs"
                      >
                        {downloadingId === recipe.id ? <span className="loading loading-spinner loading-xs" /> : "Download"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDeleteRecipe(recipe); }}
                        disabled={deletingId === recipe.id || downloadingId === recipe.id}
                        className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                        title="Delete recipe"
                      >
                        {deletingId === recipe.id ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recipe Modal */}
      {modalRecipe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setModalRecipe(null)}
        >
          <div
            className="bg-base-100 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3 p-4 border-b border-base-200">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold truncate">{modalRecipe.title}</h2>
                <p className="text-xs text-base-content/40 mt-0.5">
                  {formatRecipeTimestamp(modalRecipe.generatedAt ?? modalRecipe.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => void handleDownloadRecipe(modalRecipe)}
                  disabled={downloadingId === modalRecipe.id || favoriteUpdatingId === modalRecipe.id}
                  className="btn btn-primary btn-sm"
                >
                  {downloadingId === modalRecipe.id ? <span className="loading loading-spinner loading-xs" /> : "Download"}
                </button>
                <button
                  onClick={() => void handleToggleFavorite(modalRecipe)}
                  disabled={favoriteUpdatingId === modalRecipe.id || downloadingId === modalRecipe.id}
                  className={modalRecipe.isFavorite ? "btn btn-warning btn-sm" : "btn btn-outline btn-sm"}
                >
                  {favoriteUpdatingId === modalRecipe.id ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : modalRecipe.isFavorite ? (
                    "Remove Favorite"
                  ) : (
                    "Add to Favorites"
                  )}
                </button>
                <button
                  onClick={() => setModalRecipe(null)}
                  className="btn btn-ghost btn-sm btn-square"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto p-4">
              {modalLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="loading loading-spinner loading-md text-primary" />
                </div>
              ) : modalMarkdown ? (
                <div className="recipe-markdown max-w-none">
                  <RecipeMarkdown markdown={modalMarkdown} />
                </div>
              ) : (
                <div className="flex items-center justify-center py-16 text-sm text-base-content/40">
                  Unable to load recipe content.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
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
  if (!response.ok) throw new Error(`Preview failed (${response.status})`);
  return response.text();
}

function buildRecipeFileName(title: string, generatedAt: string, userId: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recipe";
  const timestamp = generatedAt.replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const userPart = userId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "user";
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
