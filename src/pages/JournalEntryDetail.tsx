import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import ScoreWheel from "../components/ScoreWheel";
import { TagChip } from "../components/tags";

const client = generateClient<Schema>();

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString();
}

interface JournalEntryDetailProps {
  embedded?: boolean;
  entryId?: string;
  onEdit?: () => void;
}

export default function JournalEntryDetail({ embedded, entryId: propEntryId, onEdit }: JournalEntryDetailProps) {
  const { id: paramId } = useParams();
  const id = propEntryId ?? paramId;

  const [entry, setEntry] = useState<Schema["BrewJournal"]["type"] | null>(null);
  const [linkedChats, setLinkedChats] = useState<Schema["ChatSession"]["type"][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadEntry(id);
    }
  }, [id]);

  async function loadEntry(entryId: string) {
    try {
      const { data } = await client.models.BrewJournal.get({ id: entryId });
      setEntry(data);
      if (data?.chatSessionIds && data.chatSessionIds.length > 0) {
        loadLinkedChats(data.chatSessionIds.filter((id): id is string => id !== null));
      } else {
        setLinkedChats([]);
      }
    } catch (err) {
      console.error("Failed to load entry:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLinkedChats(chatIds: string[]) {
    try {
      const chats: Schema["ChatSession"]["type"][] = [];
      for (const chatId of chatIds) {
        const { data } = await client.models.ChatSession.get({ id: chatId });
        if (data) {
          chats.push(data);
        }
      }
      setLinkedChats(chats);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={embedded ? "p-6" : "max-w-2xl mx-auto px-4 py-6"}>
        <div className="card bg-base-100">
          <div className="card-body items-center text-center py-12">
            <p className="text-base-content/50">Entry not found.</p>
            <Link to="/journal" className="btn btn-primary btn-sm mt-4">
              Back to Journal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const scores = {
    sweetness: entry.sweetness ?? undefined,
    acidity: entry.acidity ?? undefined,
    florality: entry.florality ?? undefined,
    spicy: entry.spicy ?? undefined,
    salty: entry.salty ?? undefined,
    berryFruit: entry.berryFruit ?? undefined,
    citrusFruit: entry.citrusFruit ?? undefined,
    stoneFruit: entry.stoneFruit ?? undefined,
    chocolate: entry.chocolate ?? undefined,
    caramel: entry.caramel ?? undefined,
    smoky: entry.smoky ?? undefined,
    bitterness: entry.bitterness ?? undefined,
    savory: entry.savory ?? undefined,
    body: entry.body ?? undefined,
    clarity: entry.clarity ?? undefined,
    finish: entry.finish ?? undefined,
  };

  const renderStars = (rating: number) => {
    return (
      <span className="text-amber-500">
        {"★".repeat(rating)}
        <span className="text-base-content/20">{"★".repeat(10 - rating)}</span>
      </span>
    );
  };

  const containerClass = embedded
    ? "p-6"
    : "max-w-2xl mx-auto px-4 py-6";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {!embedded && (
          <Link to="/journal" className="btn btn-ghost btn-sm gap-2">
            <span>←</span> Back
          </Link>
        )}
        {embedded && <div />}
        {onEdit ? (
          <button onClick={onEdit} className="btn btn-ghost btn-sm">
            Edit
          </button>
        ) : (
          <Link to={`/journal/${id}/edit`} className="btn btn-ghost btn-sm">
            Edit
          </Link>
        )}
      </div>

      {/* Coffee Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-base-content">{entry.coffeeName}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-base-content/60">
          {entry.roaster && <span>{entry.roaster}</span>}
          {entry.roaster && entry.origin && <span>•</span>}
          {entry.origin && <span>{entry.origin}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {entry.brewDate && (
            <span className="text-sm text-base-content/50">
              {formatDate(entry.brewDate)}
            </span>
          )}
          {entry.daysFromRoast !== null && entry.daysFromRoast !== undefined && (
            <span className="badge badge-outline badge-sm">
              {entry.daysFromRoast}d from roast
            </span>
          )}
          {entry.rating && (
            <span className="ml-auto text-sm">{renderStars(entry.rating)}</span>
          )}
        </div>
      </div>

      {/* Brew Recipe Card */}
      <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
        <div className="card-body p-4">
          <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
            Brew Recipe
          </h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {entry.brewMethod && (
              <div>
                <span className="text-base-content/50">Method:</span>{" "}
                <span className="font-medium">{entry.brewMethod}</span>
              </div>
            )}
            {entry.ratio && (
              <div>
                <span className="text-base-content/50">Ratio:</span>{" "}
                <span className="font-medium">{entry.ratio}</span>
              </div>
            )}
            {entry.waterTemp && (
              <div>
                <span className="text-base-content/50">Temp:</span>{" "}
                <span className="font-medium">{entry.waterTemp}°C</span>
              </div>
            )}
            {entry.brewTime && (
              <div>
                <span className="text-base-content/50">Time:</span>{" "}
                <span className="font-medium">{entry.brewTime}</span>
              </div>
            )}
            {entry.dose && (
              <div>
                <span className="text-base-content/50">Dose:</span>{" "}
                <span className="font-medium">{entry.dose}</span>
              </div>
            )}
            {entry.yield && (
              <div>
                <span className="text-base-content/50">Yield:</span>{" "}
                <span className="font-medium">{entry.yield}</span>
              </div>
            )}
          </div>
          {(entry.variety || entry.processing || entry.roastLevel) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-base-200">
              {entry.variety && (
                <TagChip tag={entry.variety} />
              )}
              {entry.processing && (
                <TagChip tag={entry.processing.replace(/_/g, " ")} />
              )}
              {entry.roastLevel && (
                <TagChip tag={entry.roastLevel.replace(/_/g, " ")} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Score Wheel */}
      <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
        <div className="card-body p-4">
          <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
            Tasting Profile
          </h2>
          <div className="min-h-[420px]">
            <ScoreWheel scores={scores} />
          </div>
        </div>
      </div>

      {/* Flavor Tags */}
      {entry.flavorNotes && entry.flavorNotes.length > 0 && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Flavor Notes
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {entry.flavorNotes.map((tag) => tag && (
                <TagChip key={tag} tag={tag} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aroma */}
      {(entry.aroma || entry.aromaNote) && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Aroma
            </h2>
            {entry.aroma && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-base-content/60">Score:</span>
                <span className="font-medium">{entry.aroma}/5</span>
              </div>
            )}
            {entry.aromaNote && (
              <p className="text-sm whitespace-pre-wrap">{entry.aromaNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Tasting Notes */}
      {entry.tastingNotes && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Tasting Notes
            </h2>
            <p className="text-sm whitespace-pre-wrap">{entry.tastingNotes}</p>
          </div>
        </div>
      )}

      {/* Finish Note */}
      {entry.finishNote && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Finish
            </h2>
            <p className="text-sm whitespace-pre-wrap">{entry.finishNote}</p>
          </div>
        </div>
      )}

      {/* Linked Chats */}
      {linkedChats.length > 0 && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Linked Coffee Talks
            </h2>
            <div className="flex flex-col gap-2">
              {linkedChats.map((chat) => (
                <Link
                  key={chat.id}
                  to={`/chat/${chat.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-base-200 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">💬</span>
                    <span className="text-sm font-medium truncate">{chat.name}</span>
                  </div>
                  <span className="text-primary">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
