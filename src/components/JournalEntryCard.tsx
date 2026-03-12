import type { Schema } from "../../amplify/data/resource";

interface JournalEntryCardProps {
  entry: Schema["BrewJournal"]["type"];
  onClick: () => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

function renderStars(rating: number | null | undefined): string {
  if (!rating) return "";
  const filled = Math.round(rating / 2);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export default function JournalEntryCard({ entry, onClick }: JournalEntryCardProps) {
  const topTags = (entry.flavorNotes ?? []).slice(0, 3);

  return (
    <div
      onClick={onClick}
      className="card bg-base-100 shadow-sm hover:shadow-md border border-base-200 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="card-body p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base-content truncate">{entry.coffeeName}</h3>
            {entry.roaster && (
              <p className="text-sm text-base-content/50 truncate">{entry.roaster}</p>
            )}
          </div>
          {entry.rating && (
            <div className="text-amber-500 text-sm whitespace-nowrap">
              {renderStars(entry.rating)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {entry.brewMethod && (
            <span className="badge badge-ghost badge-sm">{entry.brewMethod}</span>
          )}
          {entry.brewDate && (
            <span className="text-xs text-base-content/40">{formatDate(entry.brewDate)}</span>
          )}
          {entry.daysFromRoast !== null && entry.daysFromRoast !== undefined && (
            <span className="badge badge-outline badge-sm">{entry.daysFromRoast}d from roast</span>
          )}
        </div>

        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {topTags.map((tag) => (
              <span key={tag} className="badge badge-outline badge-sm">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
