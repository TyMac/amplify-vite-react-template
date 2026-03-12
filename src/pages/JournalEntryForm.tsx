import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import FlavorWheelPicker from "../components/FlavorWheelPicker";
import ScoreWheel from "../components/ScoreWheel";

const client = generateClient<Schema>();

type BrewJournalInput = Parameters<typeof client.models.BrewJournal.create>[0];

const BREW_METHODS = [
  "V60",
  "Chemex",
  "AeroPress",
  "French Press",
  "Espresso",
  "Moka Pot",
  "Cold Brew",
  "Other",
];

const PROCESSING_OPTIONS: { value: BrewJournalInput["processing"]; label: string }[] = [
  { value: "WASHED", label: "Washed" },
  { value: "NATURAL", label: "Natural" },
  { value: "HONEY", label: "Honey" },
  { value: "ANAEROBIC", label: "Anaerobic" },
  { value: "OTHER", label: "Other" },
];

const ROAST_LEVEL_OPTIONS: { value: BrewJournalInput["roastLevel"]; label: string }[] = [
  { value: "LIGHT", label: "Light" },
  { value: "MEDIUM_LIGHT", label: "Medium-Light" },
  { value: "MEDIUM", label: "Medium" },
  { value: "MEDIUM_DARK", label: "Medium-Dark" },
  { value: "DARK", label: "Dark" },
];

function toISODateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function computeDaysFromRoast(roastDate: string | null, brewDate: string | null): number | null {
  if (!roastDate || !brewDate) return null;
  const roast = new Date(roastDate);
  const brew = new Date(brewDate);
  const diff = Math.floor((brew.getTime() - roast.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

export default function JournalEntryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthenticator();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Coffee details
  const [coffeeName, setCoffeeName] = useState("");
  const [roaster, setRoaster] = useState("");
  const [origin, setOrigin] = useState("");
  const [variety, setVariety] = useState("");
  const [processing, setProcessing] = useState<BrewJournalInput["processing"]>(null);
  const [roastLevel, setRoastLevel] = useState<BrewJournalInput["roastLevel"]>(null);
  const [roastDate, setRoastDate] = useState<string | null>(null);

  // Brew details
  const [brewDate, setBrewDate] = useState<string>(toISODateString(new Date()));
  const [brewMethod, setBrewMethod] = useState("");
  const [waterTemp, setWaterTemp] = useState<number | null>(null);
  const [ratio, setRatio] = useState("");
  const [dose, setDose] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [brewTime, setBrewTime] = useState("");
  const [daysFromRoastManual, setDaysFromRoastManual] = useState<number | null>(null);

  // Aroma
  const [aroma, setAroma] = useState(3);
  const [aromaNote, setAromaNote] = useState("");

  // Tasting scores (1-5)
  const [sweetness, setSweetness] = useState(3);
  const [acidity, setAcidity] = useState(3);
  const [body, setBody] = useState(3);
  const [florality, setFlorality] = useState(3);
  const [finish, setFinish] = useState(3);
  const [bitterness, setBitterness] = useState(3);

  // Flavor tags
  const [flavorNotes, setFlavorNotes] = useState<string[]>([]);

  // Notes
  const [tastingNotes, setTastingNotes] = useState("");
  const [finishNote, setFinishNote] = useState("");

  // Chat session link
  const [chatSessions, setChatSessions] = useState<Schema["ChatSession"]["type"][]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Rating
  const [rating, setRating] = useState(5);

  const daysFromRoast = useMemo(() => {
    const computed = computeDaysFromRoast(roastDate, brewDate);
    return computed ?? daysFromRoastManual;
  }, [roastDate, brewDate, daysFromRoastManual]);

  useEffect(() => {
    if (isEdit && id) {
      loadEntry(id);
    }
    loadChatSessions();
  }, [id, user]);

  async function loadEntry(entryId: string) {
    try {
      const { data } = await client.models.BrewJournal.get({ id: entryId });
      if (data) {
        setCoffeeName(data.coffeeName || "");
        setRoaster(data.roaster || "");
        setOrigin(data.origin || "");
        setVariety(data.variety || "");
        setProcessing(data.processing || null);
        setRoastLevel(data.roastLevel || null);
        setRoastDate(data.roastDate || null);
        setBrewDate(data.brewDate ? toISODateString(new Date(data.brewDate)) : toISODateString(new Date()));
        setBrewMethod(data.brewMethod || "");
        setWaterTemp(data.waterTemp ?? null);
        setRatio(data.ratio || "");
        setDose(data.dose || "");
        setYieldAmount(data.yield || "");
        setBrewTime(data.brewTime || "");
        setDaysFromRoastManual(data.daysFromRoast ?? null);
        setAroma(data.aroma ?? 3);
        setAromaNote(data.aromaNote || "");
        setSweetness(data.sweetness ?? 3);
        setAcidity(data.acidity ?? 3);
        setBody(data.body ?? 3);
        setFlorality(data.florality ?? 3);
        setFinish(data.finish ?? 3);
        setBitterness(data.bitterness ?? 3);
        setFlavorNotes((data.flavorNotes ?? []).filter((n): n is string => n !== null));
        setTastingNotes(data.tastingNotes || "");
        setFinishNote(data.finishNote || "");
        setSelectedChatId(data.chatSessionId || null);
        setRating(data.rating ?? 5);
      }
    } catch (err) {
      console.error("Failed to load entry:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadChatSessions() {
    if (!user?.userId) return;
    try {
      const { data } = await client.models.ChatSession.list({
        filter: { userId: { eq: user.userId } },
      });
      const sorted = [...(data ?? [])]
        .sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 5);
      setChatSessions(sorted);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coffeeName.trim()) return;

    setSaving(true);
    try {
      const entryData: BrewJournalInput = {
        userId: user?.userId || null,
        chatSessionId: selectedChatId,
        coffeeName: coffeeName.trim(),
        roaster: roaster.trim() || null,
        origin: origin.trim() || null,
        variety: variety.trim() || null,
        processing,
        roastLevel,
        roastDate: roastDate || null,
        brewDate: brewDate ? new Date(brewDate).toISOString() : null,
        brewMethod: brewMethod || null,
        waterTemp,
        ratio: ratio.trim() || null,
        dose: dose.trim() || null,
        yield: yieldAmount.trim() || null,
        brewTime: brewTime.trim() || null,
        daysFromRoast,
        aroma,
        aromaNote: aromaNote.trim() || null,
        sweetness,
        acidity,
        body,
        florality,
        finish,
        bitterness,
        flavorNotes,
        tastingNotes: tastingNotes.trim() || null,
        finishNote: finishNote.trim() || null,
        rating,
      };

      let resultId: string;
      if (isEdit && id) {
        await client.models.BrewJournal.update({ id, ...entryData });
        resultId = id;
      } else {
        const { data } = await client.models.BrewJournal.create(entryData);
        resultId = data!.id;
      }

      navigate(`/journal/${resultId}`);
    } catch (err) {
      console.error("Failed to save entry:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Link to="/journal" className="btn btn-ghost btn-sm gap-2">
          <span>←</span> Back
        </Link>
        <h1 className="text-xl font-light tracking-wide text-base-content">
          {isEdit ? "Edit Entry" : "New Entry"}
        </h1>
        <div className="w-20" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Section: The Coffee */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              The Coffee
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label py-1">
                  <span className="label-text text-sm">Coffee Name *</span>
                </label>
                <input
                  type="text"
                  value={coffeeName}
                  onChange={(e) => setCoffeeName(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="e.g. Ethiopia Yirgacheffe"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Roaster</span>
                  </label>
                  <input
                    type="text"
                    value={roaster}
                    onChange={(e) => setRoaster(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="e.g. Counter Culture"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Origin</span>
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="e.g. Ethiopia"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Variety</span>
                  </label>
                  <input
                    type="text"
                    value={variety}
                    onChange={(e) => setVariety(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="e.g. Gesha"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Processing</span>
                  </label>
                  <select
                    value={processing || ""}
                    onChange={(e) => setProcessing((e.target.value || null) as BrewJournalInput["processing"])}
                    className="select select-bordered w-full"
                  >
                    <option value="">Select...</option>
                    {PROCESSING_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value || ""}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Roast Level</span>
                  </label>
                  <select
                    value={roastLevel || ""}
                    onChange={(e) => setRoastLevel((e.target.value || null) as BrewJournalInput["roastLevel"])}
                    className="select select-bordered w-full"
                  >
                    <option value="">Select...</option>
                    {ROAST_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value || ""}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Roast Date</span>
                  </label>
                  <input
                    type="date"
                    value={roastDate || ""}
                    onChange={(e) => setRoastDate(e.target.value || null)}
                    className="input input-bordered w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: The Brew */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              The Brew
            </h2>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Brew Date *</span>
                  </label>
                  <input
                    type="date"
                    value={brewDate}
                    onChange={(e) => setBrewDate(e.target.value)}
                    className="input input-bordered w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Method</span>
                  </label>
                  <select
                    value={brewMethod}
                    onChange={(e) => setBrewMethod(e.target.value)}
                    className="select select-bordered w-full"
                  >
                    <option value="">Select...</option>
                    {BREW_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Temp (°C)</span>
                  </label>
                  <input
                    type="number"
                    value={waterTemp ?? ""}
                    onChange={(e) => setWaterTemp(e.target.value ? Number(e.target.value) : null)}
                    className="input input-bordered w-full"
                    placeholder="93"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Ratio</span>
                  </label>
                  <input
                    type="text"
                    value={ratio}
                    onChange={(e) => setRatio(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="1:16"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Time</span>
                  </label>
                  <input
                    type="text"
                    value={brewTime}
                    onChange={(e) => setBrewTime(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="3:30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Dose</span>
                  </label>
                  <input
                    type="text"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="20g"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Yield</span>
                  </label>
                  <input
                    type="text"
                    value={yieldAmount}
                    onChange={(e) => setYieldAmount(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="320g"
                  />
                </div>
                <div>
                  <label className="label py-1">
                    <span className="label-text text-sm">Days from Roast</span>
                  </label>
                  <input
                    type="number"
                    value={daysFromRoast ?? ""}
                    onChange={(e) => setDaysFromRoastManual(e.target.value ? Number(e.target.value) : null)}
                    className="input input-bordered w-full"
                    placeholder="Auto"
                    disabled={Boolean(roastDate && brewDate)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Aroma */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Aroma
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">Score</span>
                  <span className="text-sm font-medium">{aroma}/5</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={aroma}
                  onChange={(e) => setAroma(Number(e.target.value))}
                  className="range range-primary range-xs"
                />
              </div>
              <div>
                <label className="label py-1">
                  <span className="label-text text-sm">Aroma Notes</span>
                </label>
                <textarea
                  value={aromaNote}
                  onChange={(e) => setAromaNote(e.target.value)}
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  placeholder="Describe the dry and wet aroma..."
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Tasting Scores */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Tasting Scores
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Sweetness", value: sweetness, setter: setSweetness },
                { label: "Acidity", value: acidity, setter: setAcidity },
                { label: "Body", value: body, setter: setBody },
                { label: "Florality", value: florality, setter: setFlorality },
                { label: "Finish", value: finish, setter: setFinish },
                { label: "Bitterness", value: bitterness, setter: setBitterness },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{label}</span>
                    <span className="text-sm font-medium">{value}/5</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    className="range range-primary range-xs"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <ScoreWheel
                scores={{ sweetness, acidity, body, florality, finish, bitterness }}
              />
            </div>
          </div>
        </section>

        {/* Section: Flavor Tags */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Flavor Tags
            </h2>
            <FlavorWheelPicker value={flavorNotes} onChange={setFlavorNotes} />
          </div>
        </section>

        {/* Section: Notes */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Notes
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label py-1">
                  <span className="label-text text-sm">Tasting Notes</span>
                </label>
                <textarea
                  value={tastingNotes}
                  onChange={(e) => setTastingNotes(e.target.value)}
                  className="textarea textarea-bordered w-full"
                  rows={4}
                  placeholder="Describe the overall experience..."
                />
              </div>
              <div>
                <label className="label py-1">
                  <span className="label-text text-sm">Finish Notes</span>
                </label>
                <textarea
                  value={finishNote}
                  onChange={(e) => setFinishNote(e.target.value)}
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  placeholder="How does the finish linger?"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Coffee Talk Link */}
        {chatSessions.length > 0 && (
          <section className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body p-4">
              <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
                Link to Coffee Talk
              </h2>
              <div className="flex flex-col gap-2">
                {chatSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() =>
                      setSelectedChatId(selectedChatId === session.id ? null : session.id)
                    }
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      selectedChatId === session.id
                        ? "border-primary bg-primary/5"
                        : "border-base-200 hover:border-base-300"
                    }`}
                  >
                    <span className="text-sm truncate">{session.name}</span>
                    {selectedChatId === session.id && (
                      <span className="text-primary">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Section: Rating */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Overall Rating
            </h2>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-2xl transition-colors ${
                    star <= rating ? "text-amber-500" : "text-base-content/20"
                  }`}
                >
                  ★
                </button>
              ))}
              <span className="ml-2 text-sm text-base-content/60">{rating}/10</span>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <button
          type="submit"
          disabled={saving || !coffeeName.trim()}
          className="btn btn-primary w-full"
        >
          {saving ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : isEdit ? (
            "Save Changes"
          ) : (
            "Log Brew"
          )}
        </button>
      </form>
    </div>
  );
}
