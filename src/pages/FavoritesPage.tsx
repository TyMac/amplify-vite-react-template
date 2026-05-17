import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { generateClient } from "aws-amplify/data";
import { getUrl } from "aws-amplify/storage";
import type { Schema } from "../../amplify/data/resource";
import RecipeMarkdown from "../components/RecipeMarkdown";

const client = generateClient<Schema>({ authMode: "userPool" });

type GeneratedRecipe = Schema["GeneratedRecipe"]["type"];

export default function FavoritesPage() {
  const { user } = useAuthenticator();
  const userId = user?.userId;

  const [recipes, setRecipes] = useState<GeneratedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<GeneratedRecipe | null>(null);
  const [selectedMarkdown, setSelectedMarkdown] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    void loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!selectedRecipe) {
      setSelectedMarkdown(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    fetchRecipeMarkdown(selectedRecipe.s3Key)
      .then((markdown) => { if (!cancelled) setSelectedMarkdown(markdown); })
      .catch(() => { if (!cancelled) setSelectedMarkdown(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedRecipe]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedRecipe(null);
    }
    if (selectedRecipe) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedRecipe]);

  async function loadFavorites() {
    setLoading(true);
    setError(null);
    try {
      const filter = userId
        ? { userId: { eq: userId }, isFavorite: { eq: true } }
        : { isFavorite: { eq: true } };
      const { data } = await client.models.GeneratedRecipe.list({ filter });
      const sorted = [...(data ?? [])].sort((a, b) => {
        const left = a.generatedAt ?? a.createdAt ?? "";
        const right = b.generatedAt ?? b.createdAt ?? "";
        return right.localeCompare(left);
      });
      setRecipes(sorted);
    } catch (err) {
      console.error("Failed to load favorite recipes", err);
      setError("Unable to load favorite recipes.");
    } finally {
      setLoading(false);
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

  async function handleRemoveFavorite(recipe: GeneratedRecipe) {
    setUpdatingId(recipe.id);
    setError(null);
    try {
      await client.models.GeneratedRecipe.update({ id: recipe.id, isFavorite: false });
      setRecipes((current) => current.filter((item) => item.id !== recipe.id));
      if (selectedRecipe?.id === recipe.id) setSelectedRecipe(null);
    } catch (err) {
      console.error("Failed to remove favorite recipe", err);
      setError("Unable to remove recipe from favorites.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-[0.3em] uppercase text-base-content/40 mb-2">Recipes</p>
        <h1 className="text-3xl font-light tracking-wide text-coffee">Favorites</h1>
        <p className="text-sm text-base-content/60 mt-2">
          Your saved favorite brew recipes from the journal.
        </p>
      </div>

      {error && (
        <div className="alert alert-error mb-6">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">☆</div>
          <h2 className="text-lg font-semibold text-base-content mb-2">No favorite recipes yet</h2>
          <p className="text-sm text-base-content/60 max-w-md mx-auto">
            Open a recipe from the journal page and use Add to Favorites beside the Download button.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => setSelectedRecipe(recipe)}
              className="card bg-base-100 border border-base-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all text-left"
            >
              <div className="card-body p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="card-title text-base font-semibold text-base-content leading-snug">{recipe.title}</h2>
                  <span className="badge badge-warning badge-sm flex-shrink-0">Favorite</span>
                </div>
                <p className="text-sm text-base-content/60 line-clamp-3 min-h-[3.75rem]">
                  {recipe.summary || recipe.recipeName}
                </p>
                <p className="text-xs text-base-content/40 mt-2">
                  {formatRecipeTimestamp(recipe.generatedAt ?? recipe.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedRecipe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedRecipe(null)}
        >
          <div
            className="bg-base-100 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-base-200">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold truncate">{selectedRecipe.title}</h2>
                <p className="text-xs text-base-content/40 mt-0.5">
                  {formatRecipeTimestamp(selectedRecipe.generatedAt ?? selectedRecipe.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => void handleDownloadRecipe(selectedRecipe)}
                  disabled={downloadingId === selectedRecipe.id || updatingId === selectedRecipe.id}
                  className="btn btn-primary btn-sm"
                >
                  {downloadingId === selectedRecipe.id ? <span className="loading loading-spinner loading-xs" /> : "Download"}
                </button>
                <button
                  onClick={() => void handleRemoveFavorite(selectedRecipe)}
                  disabled={updatingId === selectedRecipe.id || downloadingId === selectedRecipe.id}
                  className="btn btn-warning btn-sm"
                >
                  {updatingId === selectedRecipe.id ? <span className="loading loading-spinner loading-xs" /> : "Remove Favorite"}
                </button>
                <button
                  onClick={() => setSelectedRecipe(null)}
                  className="btn btn-ghost btn-sm btn-square"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center py-16">
                  <span className="loading loading-spinner loading-md text-primary" />
                </div>
              ) : selectedMarkdown ? (
                <RecipeMarkdown markdown={selectedMarkdown} />
              ) : (
                <div className="flex items-center justify-center py-16 text-sm text-base-content/40">
                  Unable to load recipe content.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
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
