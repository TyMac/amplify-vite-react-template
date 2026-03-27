import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { getUrl } from "aws-amplify/storage";
import type { Schema } from "../../amplify/data/resource";
import ScoreWheel from "../components/ScoreWheel";
import { TagChip } from "../components/tags";
import { useTimezone } from "../contexts/TimezoneContext";

const client = generateClient<Schema>();

function formatDate(dateStr: string | null | undefined, timezone: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", timeZone: timezone
    });
  } catch {
    return new Date(dateStr).toLocaleDateString();
  }
}

interface JournalEntryDetailProps {
  embedded?: boolean;
  entryId?: string;
  onEdit?: () => void;
}

export default function JournalEntryDetail({ embedded, entryId: propEntryId, onEdit }: JournalEntryDetailProps) {
  const { id: paramId } = useParams();
  const id = propEntryId ?? paramId;
  const { timezone } = useTimezone();

  const [entry, setEntry] = useState<Schema["BrewJournal"]["type"] | null>(null);
  const [linkedChats, setLinkedChats] = useState<Schema["ChatSession"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [chatImages, setChatImages] = useState<{ key: string; url: string; chatName: string }[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
      await resolveImages(chats);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }

  async function resolveImages(chats: Schema["ChatSession"]["type"][]) {
    const images: { key: string; url: string; chatName: string }[] = [];
    for (const chat of chats) {
      let msgs: { id: string; imageKey?: string }[] = [];
      try {
        const raw = chat.messages;
        msgs = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof msgs);
      } catch {
        continue;
      }
      for (const msg of msgs) {
        if (!msg.imageKey) continue;
        try {
          const { url } = await getUrl({
            path: msg.imageKey,
            options: { expiresIn: 3600, validateObjectExistence: false },
          });
          images.push({ key: msg.imageKey, url: url.toString(), chatName: chat.name });
        } catch (err) {
          console.warn("Failed to resolve image", msg.imageKey, err);
        }
      }
    }
    setChatImages(images);
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
              {formatDate(entry.brewDate, timezone)}
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
          {(entry.tds != null || entry.extractionYield != null || entry.extractionNote) && (
            <div className="mt-3 pt-3 border-t border-base-200 space-y-1.5">
              <p className="text-xs font-semibold tracking-widest text-base-content/50 uppercase">Extraction</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {entry.tds != null && (
                  <div>
                    <span className="text-base-content/50">TDS:</span>{" "}
                    <span className="font-medium">{entry.tds}%</span>
                  </div>
                )}
                {entry.extractionYield != null && (
                  <div>
                    <span className="text-base-content/50">Yield:</span>{" "}
                    <span className="font-medium">{entry.extractionYield}%</span>
                  </div>
                )}
              </div>
              {entry.extractionNote && (
                <p className="text-sm text-base-content/80">{entry.extractionNote}</p>
              )}
            </div>
          )}
          {(entry.variety || entry.processing || entry.roastLevel) && (
            <div className="mt-3 pt-3 border-t border-base-200 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {entry.variety && <TagChip tag={entry.variety} />}
                {entry.altitude != null && <TagChip tag={`${entry.altitude} masl`} />}
                {entry.processing && <TagChip tag={entry.processing.replace(/_/g, " ")} />}
                {entry.roastLevel && <TagChip tag={entry.roastLevel.replace(/_/g, " ")} />}
              </div>
              {entry.processingNote && (
                <div>
                  <p className="text-xs text-base-content/50 uppercase tracking-wider mb-0.5">Processing Notes</p>
                  <p className="text-sm text-base-content/80">{entry.processingNote}</p>
                </div>
              )}
              {entry.roastLevelNote && (
                <div>
                  <p className="text-xs text-base-content/50 uppercase tracking-wider mb-0.5">Roast Profile Notes</p>
                  <p className="text-sm text-base-content/80">{entry.roastLevelNote}</p>
                </div>
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

      {/* Initial Impressions */}
      {entry.initialImpressions && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Initial Impressions
            </h2>
            <p className="text-sm whitespace-pre-wrap">{entry.initialImpressions}</p>
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

      {/* Chat Photos */}
      {chatImages.length > 0 && (
        <div className="card bg-base-100 shadow-sm border border-base-200 mb-6">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Photos
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {chatImages.map((img) => (
                <button
                  key={img.key}
                  onClick={() => setLightboxUrl(img.url)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-base-200 hover:border-primary/50 transition-colors group"
                  title={img.chatName}
                >
                  <img
                    src={img.url}
                    alt={`From ${img.chatName}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-base-content/40 mt-2">
              {chatImages.length} photo{chatImages.length !== 1 ? "s" : ""} from linked Coffee Talks
            </p>
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Full size"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-2 right-2 btn btn-circle btn-sm bg-black/60 border-0 text-white hover:bg-black/80"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
