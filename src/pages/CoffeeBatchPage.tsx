import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import { batchColor } from "../services/coffeeBatch";
import { useTimezone, formatInTimezone } from "../contexts/TimezoneContext";
import ScoreWheel from "../components/ScoreWheel";

const client = generateClient<Schema>();

type Batch = Schema["CoffeeBatch"]["type"];
type Entry = Schema["BrewJournal"]["type"];

const PROCESSING_LABELS: Record<string, string> = {
  WASHED: "Washed", NATURAL: "Natural", HONEY: "Honey",
  ANAEROBIC: "Anaerobic", OTHER: "Other",
};
const ROAST_LABELS: Record<string, string> = {
  LIGHT: "Light", MEDIUM_LIGHT: "Medium Light", MEDIUM: "Medium",
  MEDIUM_DARK: "Medium Dark", DARK: "Dark",
};

// ─────────────────────────────────────────────
// Batch List View
// ─────────────────────────────────────────────
function BatchList({ batches, entries }: { batches: Batch[]; entries: Entry[] }) {
  const { timezone } = useTimezone();

  const brewCountByBatch = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      if (e.coffeeBatchId) counts[e.coffeeBatchId] = (counts[e.coffeeBatchId] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const lastBrewByBatch = useMemo(() => {
    const last: Record<string, string> = {};
    for (const e of entries) {
      if (!e.coffeeBatchId || !e.brewDate) continue;
      if (!last[e.coffeeBatchId] || e.brewDate > last[e.coffeeBatchId]) {
        last[e.coffeeBatchId] = e.brewDate;
      }
    }
    return last;
  }, [entries]);

  const avgRatingByBatch = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    for (const e of entries) {
      if (!e.coffeeBatchId || e.rating == null) continue;
      if (!sums[e.coffeeBatchId]) sums[e.coffeeBatchId] = { total: 0, count: 0 };
      sums[e.coffeeBatchId].total += e.rating;
      sums[e.coffeeBatchId].count += 1;
    }
    const avgs: Record<string, number> = {};
    for (const [id, { total, count }] of Object.entries(sums)) {
      avgs[id] = Math.round((total / count) * 10) / 10;
    }
    return avgs;
  }, [entries]);

  // Sort: most recently brewed first
  const sorted = [...batches].sort((a, b) => {
    const la = lastBrewByBatch[a.id] ?? "";
    const lb = lastBrewByBatch[b.id] ?? "";
    return lb.localeCompare(la);
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-base-content/40 gap-3">
        <span className="text-4xl">☕</span>
        <p className="text-sm">No coffee batches yet.</p>
        <Link to="/journal/new" className="btn btn-primary btn-sm">Log your first brew</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {sorted.map((batch) => {
        const color = batch.color || batchColor(batch.id);
        const count = brewCountByBatch[batch.id] ?? 0;
        const lastBrew = lastBrewByBatch[batch.id];
        const avgRating = avgRatingByBatch[batch.id];

        return (
          <Link
            key={batch.id}
            to={`/batches/${batch.id}`}
            className="card bg-base-100 border border-base-200 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="card-body p-4">
              <div className="flex items-start gap-3">
                {/* Color swatch */}
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{batch.coffeeName}</p>
                      {batch.roaster && (
                        <p className="text-xs text-base-content/50 truncate">{batch.roaster}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-base-content/70">{count} brew{count !== 1 ? "s" : ""}</p>
                      {avgRating != null && (
                        <p className="text-xs text-base-content/40">{avgRating}/10 avg</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {batch.origin && (
                      <span className="badge badge-sm badge-ghost">{batch.origin}</span>
                    )}
                    {batch.processing && (
                      <span className="badge badge-sm badge-ghost">{PROCESSING_LABELS[batch.processing] ?? batch.processing}</span>
                    )}
                    {batch.roastLevel && (
                      <span className="badge badge-sm badge-ghost">{ROAST_LABELS[batch.roastLevel] ?? batch.roastLevel}</span>
                    )}
                    {batch.roastDate && (
                      <span className="badge badge-sm badge-ghost">Roasted {formatInTimezone(batch.roastDate + "T00:00:00", timezone, { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                  </div>

                  {lastBrew && (
                    <p className="text-xs text-base-content/40 mt-1.5">
                      Last brewed {formatInTimezone(lastBrew, timezone, { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Batch Detail View
// ─────────────────────────────────────────────
function BatchDetail({ batchId }: { batchId: string }) {
  const { timezone } = useTimezone();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: b }, { data: e }] = await Promise.all([
          client.models.CoffeeBatch.get({ id: batchId }),
          client.models.BrewJournal.list({ filter: { coffeeBatchId: { eq: batchId } } }),
        ]);
        setBatch(b);
        const sorted = [...(e ?? [])].sort((a, b) =>
          (b.brewDate ?? "").localeCompare(a.brewDate ?? "")
        );
        setEntries(sorted);
        if (sorted.length > 0) setSelectedEntryId(sorted[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId]);

  if (loading) return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-md text-primary" /></div>;
  if (!batch) return <div className="p-8 text-center text-base-content/40">Batch not found.</div>;

  const color = batch.color || batchColor(batch.id);
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Batch header */}
      <div className="p-4 border-b border-base-200 bg-base-100">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/batches")} className="btn btn-ghost btn-xs">←</button>
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-base truncate">{batch.coffeeName}</h1>
            {batch.roaster && <p className="text-xs text-base-content/50">{batch.roaster}</p>}
          </div>
          <Link
            to={`/journal/new?batchId=${batch.id}`}
            className="btn btn-primary btn-sm flex-shrink-0"
          >
            + Brew
          </Link>
        </div>

        {/* Batch metadata chips */}
        <div className="flex flex-wrap gap-1.5">
          {batch.origin && <span className="badge badge-sm badge-ghost">{batch.origin}</span>}
          {batch.variety && <span className="badge badge-sm badge-ghost">{batch.variety}</span>}
          {batch.processing && <span className="badge badge-sm badge-ghost">{PROCESSING_LABELS[batch.processing] ?? batch.processing}</span>}
          {batch.roastLevel && <span className="badge badge-sm badge-ghost">{ROAST_LABELS[batch.roastLevel] ?? batch.roastLevel}</span>}
          {batch.roastDate && (
            <span className="badge badge-sm badge-ghost">
              Roasted {formatInTimezone(batch.roastDate + "T00:00:00", timezone, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {(batch.processingNote || batch.roastLevelNote || batch.notes) && (
          <div className="mt-3 space-y-1">
            {batch.processingNote && <p className="text-xs text-base-content/60">{batch.processingNote}</p>}
            {batch.roastLevelNote && <p className="text-xs text-base-content/60">{batch.roastLevelNote}</p>}
            {batch.notes && <p className="text-xs text-base-content/60">{batch.notes}</p>}
          </div>
        )}
      </div>

      {/* Two-pane: brew list + selected brew detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Brew list */}
        <div className="w-56 flex-shrink-0 border-r border-base-200 overflow-y-auto bg-base-100">
          {entries.length === 0 ? (
            <p className="p-4 text-xs text-base-content/40">No brews logged yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5 p-2">
              {entries.map((entry, idx) => {
                const isSelected = entry.id === selectedEntryId;
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntryId(entry.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                      isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-base-200 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-base-content/50">Brew #{entries.length - idx}</span>
                      {entry.rating != null && (
                        <span className="text-xs text-base-content/40">{entry.rating}/10</span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-0.5">
                      {entry.brewDate ? formatInTimezone(entry.brewDate, timezone, { month: "short", day: "numeric" }) : "—"}
                    </p>
                    {entry.brewMethod && (
                      <p className="text-xs text-base-content/40 mt-0.5">{entry.brewMethod}</p>
                    )}
                    {entry.daysFromRoast != null && (
                      <p className="text-xs text-base-content/30">{entry.daysFromRoast}d from roast</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected brew detail */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedEntry ? (
            <p className="text-sm text-base-content/40">Select a brew to view details.</p>
          ) : (
            <BrewCard entry={selectedEntry} batchId={batchId} timezone={timezone} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Individual Brew Card (inside batch detail)
// ─────────────────────────────────────────────
function BrewCard({ entry, batchId, timezone }: { entry: Entry; batchId: string; timezone: string }) {
  const hasScores = [
    entry.sweetness, entry.acidity, entry.florality, entry.spicy, entry.salty,
    entry.berryFruit, entry.citrusFruit, entry.stoneFruit, entry.chocolate,
    entry.caramel, entry.smoky, entry.bitterness, entry.savory, entry.body,
    entry.clarity, entry.finish,
  ].some((v) => v != null && v > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold">
            {entry.brewDate ? formatInTimezone(entry.brewDate, timezone, { weekday: "long", month: "long", day: "numeric" }) : "—"}
          </p>
          {entry.daysFromRoast != null && (
            <p className="text-xs text-base-content/50">{entry.daysFromRoast} days from roast</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/journal/${entry.id}/edit?batchId=${batchId}`} className="btn btn-ghost btn-xs">Edit</Link>
          <Link to={`/journal/${entry.id}`} className="btn btn-ghost btn-xs">Full view →</Link>
        </div>
      </div>

      {/* Brew recipe */}
      {(entry.brewMethod || entry.ratio || entry.waterTemp || entry.brewTime || entry.dose || entry.yield) && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-3">
            <p className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-2">Recipe</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {entry.brewMethod && <span><span className="text-base-content/50">Method:</span> {entry.brewMethod}</span>}
              {entry.ratio && <span><span className="text-base-content/50">Ratio:</span> {entry.ratio}</span>}
              {entry.waterTemp && <span><span className="text-base-content/50">Temp:</span> {entry.waterTemp}°C</span>}
              {entry.brewTime && <span><span className="text-base-content/50">Time:</span> {entry.brewTime}</span>}
              {entry.dose && <span><span className="text-base-content/50">Dose:</span> {entry.dose}</span>}
              {entry.yield && <span><span className="text-base-content/50">Yield:</span> {entry.yield}</span>}
              {entry.grindSize && <span><span className="text-base-content/50">Grind:</span> {entry.grindSize}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Extraction */}
      {(entry.tds != null || entry.extractionYield != null || entry.extractionNote) && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-3">
            <p className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-2">Extraction</p>
            <div className="flex gap-4 text-sm mb-1">
              {entry.tds != null && <span><span className="text-base-content/50">TDS:</span> {entry.tds}%</span>}
              {entry.extractionYield != null && <span><span className="text-base-content/50">Yield:</span> {entry.extractionYield}%</span>}
            </div>
            {entry.extractionNote && <p className="text-xs text-base-content/60">{entry.extractionNote}</p>}
          </div>
        </div>
      )}

      {/* Tasting notes */}
      {entry.tastingNotes && (
        <div>
          <p className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-1">Notes</p>
          <p className="text-sm text-base-content/80 whitespace-pre-wrap">{entry.tastingNotes}</p>
        </div>
      )}

      {/* Rating */}
      {entry.rating != null && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-base-content/50 uppercase tracking-widest">Rating</p>
          <span className="badge badge-primary">{entry.rating}/10</span>
        </div>
      )}

      {/* Score wheel */}
      {hasScores && (
        <div>
          <p className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-2">Flavor Profile</p>
          <ScoreWheel scores={{
            sweetness: entry.sweetness ?? 0,
            acidity: entry.acidity ?? 0,
            florality: entry.florality ?? 0,
            spicy: entry.spicy ?? 0,
            salty: entry.salty ?? 0,
            berryFruit: entry.berryFruit ?? 0,
            citrusFruit: entry.citrusFruit ?? 0,
            stoneFruit: entry.stoneFruit ?? 0,
            chocolate: entry.chocolate ?? 0,
            caramel: entry.caramel ?? 0,
            smoky: entry.smoky ?? 0,
            bitterness: entry.bitterness ?? 0,
            savory: entry.savory ?? 0,
            body: entry.body ?? 0,
            clarity: entry.clarity ?? 0,
            finish: entry.finish ?? 0,
          }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page root — list or detail based on route
// ─────────────────────────────────────────────
export default function CoffeeBatchPage() {
  const { batchId } = useParams<{ batchId?: string }>();
  const { user } = useAuthenticator();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(!batchId);

  useEffect(() => {
    if (batchId) return; // detail view loads its own data
    if (!user?.userId) return;
    (async () => {
      const [{ data: b }, { data: e }] = await Promise.all([
        client.models.CoffeeBatch.list({ filter: { userId: { eq: user.userId } } }),
        client.models.BrewJournal.list({ filter: { userId: { eq: user.userId } } }),
      ]);
      setBatches(b ?? []);
      setEntries(e ?? []);
      setLoading(false);
    })();
  }, [user?.userId, batchId]);

  if (batchId) return <BatchDetail batchId={batchId} />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <h1 className="text-xl font-light tracking-wide">Coffee Batches</h1>
        <Link to="/journal/new" className="btn btn-primary btn-sm">+ New Brew</Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : (
        <BatchList batches={batches} entries={entries} />
      )}
    </div>
  );
}
