import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import FlavorWheelPicker from "../components/FlavorWheelPicker";
import ScoreWheel from "../components/ScoreWheel";
import { extractJournalFieldsFromChat } from "../services/gemini";
import { TAG_SUGGESTIONS } from "../components/tags";

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

function AIBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="badge badge-sm badge-ghost ml-2 text-xs opacity-60">AI</span>
  );
}

function computeDaysFromRoast(roastDate: string | null, brewDate: string | null): number | null {
  if (!roastDate || !brewDate) return null;
  const roast = new Date(roastDate);
  const brew = new Date(brewDate);
  const diff = Math.floor((brew.getTime() - roast.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

interface JournalEntryFormProps {
  embedded?: boolean;
  preLinkedChatId?: string;
  selectedDate?: string;
  onSave?: (entryId: string) => void;
  onCancel?: () => void;
}

export default function JournalEntryForm({
  embedded,
  preLinkedChatId,
  selectedDate,
  onSave,
  onCancel,
}: JournalEntryFormProps) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const chatIdFromUrl = searchParams.get("chatId");
  const navigate = useNavigate();
  const { user } = useAuthenticator();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
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
  const [brewDate, setBrewDate] = useState<string>(
    selectedDate ?? toISODateString(new Date())
  );
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

  // Tasting scores (1-5) - 16 axes
  const [sweetness, setSweetness] = useState(3);
  const [acidity, setAcidity] = useState(3);
  const [florality, setFlorality] = useState(3);
  const [spicy, setSpicy] = useState(3);
  const [salty, setSalty] = useState(3);
  const [berryFruit, setBerryFruit] = useState(3);
  const [citrusFruit, setCitrusFruit] = useState(3);
  const [stoneFruit, setStoneFruit] = useState(3);
  const [chocolate, setChocolate] = useState(3);
  const [caramel, setCaramel] = useState(3);
  const [smoky, setSmoky] = useState(3);
  const [bitterness, setBitterness] = useState(3);
  const [savory, setSavory] = useState(3);
  const [body, setBody] = useState(3);
  const [clarity, setClarity] = useState(3);
  const [finish, setFinish] = useState(3);

  // Flavor tags
  const [flavorNotes, setFlavorNotes] = useState<string[]>([]);

  // Notes
  const [tastingNotes, setTastingNotes] = useState("");
  const [finishNote, setFinishNote] = useState("");

  // Chat session links (multiple)
  const [chatSessions, setChatSessions] = useState<Schema["ChatSession"]["type"][]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>(
    preLinkedChatId ? [preLinkedChatId] : []
  );
  const [chatSearchQuery, setChatSearchQuery] = useState("");

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

  // Update selectedDate when prop changes
  useEffect(() => {
    if (selectedDate) {
      setBrewDate(selectedDate);
    }
  }, [selectedDate]);

  // Update preLinkedChatId when prop changes
  useEffect(() => {
    if (preLinkedChatId && !selectedChatIds.includes(preLinkedChatId)) {
      setSelectedChatIds((prev) => [...prev, preLinkedChatId]);
    }
  }, [preLinkedChatId]);

  // Auto-fill from chat when chatId is present in URL
  useEffect(() => {
    const chatIdToUse = chatIdFromUrl || preLinkedChatId;
    if (!chatIdToUse || isEdit) return;

    // Also add to selected chat IDs if from URL
    if (chatIdFromUrl && !selectedChatIds.includes(chatIdFromUrl)) {
      setSelectedChatIds((prev) => [...prev, chatIdFromUrl]);
    }

    autoFillFromChat(chatIdToUse);
  }, [chatIdFromUrl, preLinkedChatId, isEdit]);

  async function autoFillFromChat(chatId: string) {
    setAutoFilling(true);
    try {
      // Fetch the chat session
      const { data: chatSession } = await client.models.ChatSession.get({ id: chatId });
      if (!chatSession || !chatSession.messages) {
        return;
      }

      // messages is stored as a JSON string — parse it
      let messages: Array<{ role: string; content: string }> = [];
      try {
        const raw = chatSession.messages;
        messages = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
      } catch {
        return;
      }
      if (!messages || messages.length === 0) {
        return;
      }

      // Grab tags from the chat session
      const tags: string[] = (chatSession.tags as string[] | null) ?? [];

      // Call Gemini to extract fields (pass tags as additional context)
      const { success, fields } = await extractJournalFieldsFromChat(messages, tags);
      if (!success) {
        return;
      }

      // --- Client-side tag mapping (deterministic, instant) ---
      // Map known tags directly to fields using the TAG_SUGGESTIONS taxonomy
      const roasterTags = TAG_SUGGESTIONS["Roasters"] ?? [];
      const countryTags = TAG_SUGGESTIONS["Countries"] ?? [];
      const regionTags = TAG_SUGGESTIONS["Regions"] ?? [];
      const varietalTags = TAG_SUGGESTIONS["Varietals"] ?? [];
      const processTags = TAG_SUGGESTIONS["Process"] ?? [];
      const roastTags = TAG_SUGGESTIONS["Roast"] ?? [];

      const processMap: Record<string, BrewJournalInput["processing"]> = {
        "Washed": "WASHED", "Natural": "NATURAL", "Honey": "HONEY",
        "White Honey": "HONEY", "Fermented Honey": "HONEY",
        "Anaerobic": "ANAEROBIC", "Natural Anaerobic": "ANAEROBIC",
        "Extended Fermentation": "ANAEROBIC", "Carbonic Maceration": "ANAEROBIC",
      };
      const roastMap: Record<string, BrewJournalInput["roastLevel"]> = {
        "Light": "LIGHT", "Medium": "MEDIUM", "Dark": "DARK",
      };

      for (const tag of tags) {
        if (roasterTags.includes(tag) && !fields.roaster) fields.roaster = tag;
        if (countryTags.includes(tag) && !fields.origin) fields.origin = tag;
        if (regionTags.includes(tag) && !fields.origin) fields.origin = tag;
        if (varietalTags.includes(tag) && !fields.variety) fields.variety = tag;
        if (processTags.includes(tag) && !fields.processing) fields.processing = processMap[tag] ?? null;
        if (roastTags.includes(tag) && !fields.roastLevel) fields.roastLevel = roastMap[tag] ?? null;
      }

      // Apply extracted fields only to empty fields
      const filledFields = new Set<string>();

      if (fields.coffeeName && !coffeeName) {
        setCoffeeName(fields.coffeeName);
        filledFields.add("coffeeName");
      }
      if (fields.roaster && !roaster) {
        setRoaster(fields.roaster);
        filledFields.add("roaster");
      }
      if (fields.origin && !origin) {
        setOrigin(fields.origin);
        filledFields.add("origin");
      }
      if (fields.variety && !variety) {
        setVariety(fields.variety);
        filledFields.add("variety");
      }
      if (fields.processing && !processing) {
        setProcessing(fields.processing);
        filledFields.add("processing");
      }
      if (fields.roastLevel && !roastLevel) {
        setRoastLevel(fields.roastLevel);
        filledFields.add("roastLevel");
      }
      if (fields.roastDate && !roastDate) {
        setRoastDate(fields.roastDate);
        filledFields.add("roastDate");
      }
      if (fields.brewMethod && !brewMethod) {
        setBrewMethod(fields.brewMethod);
        filledFields.add("brewMethod");
      }
      if (fields.ratio && !ratio) {
        setRatio(fields.ratio);
        filledFields.add("ratio");
      }
      if (fields.dose && !dose) {
        setDose(fields.dose);
        filledFields.add("dose");
      }
      if (fields.brewTime && !brewTime) {
        setBrewTime(fields.brewTime);
        filledFields.add("brewTime");
      }
      if (fields.waterTemp && waterTemp === null) {
        // Parse temperature - handle "93°C" or "200°F" formats
        const tempMatch = fields.waterTemp.match(/(\d+)/);
        if (tempMatch) {
          let temp = parseInt(tempMatch[1], 10);
          // Convert Fahrenheit to Celsius if needed
          if (fields.waterTemp.toLowerCase().includes("f")) {
            temp = Math.round((temp - 32) * 5 / 9);
          }
          setWaterTemp(temp);
          filledFields.add("waterTemp");
        }
      }
      if (fields.flavorNotes && fields.flavorNotes.length > 0 && flavorNotes.length === 0) {
        setFlavorNotes(fields.flavorNotes);
        filledFields.add("flavorNotes");
      }
      if (fields.tastingNotes && !tastingNotes) {
        setTastingNotes(fields.tastingNotes);
        filledFields.add("tastingNotes");
      }

      setAutoFilledFields(filledFields);
    } catch (err) {
      console.error("Failed to auto-fill from chat:", err);
      // Silently fail - don't show error to user
    } finally {
      setAutoFilling(false);
    }
  }

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
        setFlorality(data.florality ?? 3);
        setSpicy(data.spicy ?? 3);
        setSalty(data.salty ?? 3);
        setBerryFruit(data.berryFruit ?? 3);
        setCitrusFruit(data.citrusFruit ?? 3);
        setStoneFruit(data.stoneFruit ?? 3);
        setChocolate(data.chocolate ?? 3);
        setCaramel(data.caramel ?? 3);
        setSmoky(data.smoky ?? 3);
        setBitterness(data.bitterness ?? 3);
        setSavory(data.savory ?? 3);
        setBody(data.body ?? 3);
        setClarity(data.clarity ?? 3);
        setFinish(data.finish ?? 3);
        setFlavorNotes((data.flavorNotes ?? []).filter((n): n is string => n !== null));
        setTastingNotes(data.tastingNotes || "");
        setFinishNote(data.finishNote || "");
        setSelectedChatIds((data.chatSessionIds ?? []).filter((id): id is string => id !== null));
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
        });
      setChatSessions(sorted);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }

  // Get linked chat sessions details
  const linkedChatDetails = useMemo(() => {
    return selectedChatIds
      .map((id) => chatSessions.find((s) => s.id === id))
      .filter((s): s is Schema["ChatSession"]["type"] => s !== undefined);
  }, [selectedChatIds, chatSessions]);

  // Filter available chats for selection (not already linked)
  const availableChats = useMemo(() => {
    const filtered = chatSessions.filter((s) => !selectedChatIds.includes(s.id));
    if (!chatSearchQuery.trim()) {
      return filtered.slice(0, 5);
    }
    const query = chatSearchQuery.toLowerCase();
    return filtered.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 5);
  }, [chatSessions, selectedChatIds, chatSearchQuery]);

  function addChatLink(chatId: string) {
    if (!selectedChatIds.includes(chatId)) {
      setSelectedChatIds((prev) => [...prev, chatId]);
    }
    setChatSearchQuery("");
  }

  function removeChatLink(chatId: string) {
    setSelectedChatIds((prev) => prev.filter((id) => id !== chatId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coffeeName.trim()) return;

    setSaving(true);
    try {
      const entryData: BrewJournalInput = {
        userId: user?.userId || null,
        chatSessionIds: selectedChatIds,
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
        florality,
        spicy,
        salty,
        berryFruit,
        citrusFruit,
        stoneFruit,
        chocolate,
        caramel,
        smoky,
        bitterness,
        savory,
        body,
        clarity,
        finish,
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

      if (onSave) {
        onSave(resultId);
      } else {
        navigate(`/journal/${resultId}`);
      }
    } catch (err) {
      console.error("Failed to save entry:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      navigate("/journal");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  const containerClass = embedded
    ? "p-6"
    : "max-w-2xl mx-auto px-4 py-6";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between mb-6">
        {!embedded ? (
          <Link to="/journal" className="btn btn-ghost btn-sm gap-2">
            <span>←</span> Back
          </Link>
        ) : (
          <button onClick={handleCancel} className="btn btn-ghost btn-sm gap-2">
            <span>←</span> Cancel
          </button>
        )}
        <h1 className="text-xl font-light tracking-wide text-base-content">
          {isEdit ? "Edit Entry" : "New Entry"}
        </h1>
        <div className="w-20" />
      </div>

      {autoFilling && (
        <div className="alert alert-info mb-4 py-2">
          <span className="loading loading-spinner loading-sm"></span>
          <span className="text-sm">Auto-filling from chat...</span>
        </div>
      )}

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
                  <span className="label-text text-sm">Coffee Name *<AIBadge show={autoFilledFields.has("coffeeName")} /></span>
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
                    <span className="label-text text-sm">Roaster<AIBadge show={autoFilledFields.has("roaster")} /></span>
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
                    <span className="label-text text-sm">Origin<AIBadge show={autoFilledFields.has("origin")} /></span>
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
                    <span className="label-text text-sm">Variety<AIBadge show={autoFilledFields.has("variety")} /></span>
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
                    <span className="label-text text-sm">Processing<AIBadge show={autoFilledFields.has("processing")} /></span>
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
                    <span className="label-text text-sm">Roast Level<AIBadge show={autoFilledFields.has("roastLevel")} /></span>
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
                    <span className="label-text text-sm">Roast Date<AIBadge show={autoFilledFields.has("roastDate")} /></span>
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
                    <span className="label-text text-sm">Method<AIBadge show={autoFilledFields.has("brewMethod")} /></span>
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
                    <span className="label-text text-sm">Temp (°C)<AIBadge show={autoFilledFields.has("waterTemp")} /></span>
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
                    <span className="label-text text-sm">Ratio<AIBadge show={autoFilledFields.has("ratio")} /></span>
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
                    <span className="label-text text-sm">Time<AIBadge show={autoFilledFields.has("brewTime")} /></span>
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
                    <span className="label-text text-sm">Dose<AIBadge show={autoFilledFields.has("dose")} /></span>
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
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: all 16 sliders */}
              <div className="flex flex-col gap-3 lg:w-64 shrink-0">
                {[
                  { label: "Sweet", value: sweetness, setter: setSweetness },
                  { label: "Acidic", value: acidity, setter: setAcidity },
                  { label: "Floral", value: florality, setter: setFlorality },
                  { label: "Spicy", value: spicy, setter: setSpicy },
                  { label: "Salty", value: salty, setter: setSalty },
                  { label: "Berry Fruit", value: berryFruit, setter: setBerryFruit },
                  { label: "Citrus Fruit", value: citrusFruit, setter: setCitrusFruit },
                  { label: "Stone Fruit", value: stoneFruit, setter: setStoneFruit },
                  { label: "Chocolate", value: chocolate, setter: setChocolate },
                  { label: "Caramel", value: caramel, setter: setCaramel },
                  { label: "Smoky", value: smoky, setter: setSmoky },
                  { label: "Bitter", value: bitterness, setter: setBitterness },
                  { label: "Savory", value: savory, setter: setSavory },
                  { label: "Body", value: body, setter: setBody },
                  { label: "Clean", value: clarity, setter: setClarity },
                  { label: "Linger/Finish", value: finish, setter: setFinish },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs">{label}</span>
                      <span className="text-xs font-medium tabular-nums">{value}/5</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={value}
                      onChange={(e) => setter(Number(e.target.value))}
                      className="range range-primary range-xs w-full"
                    />
                  </div>
                ))}
              </div>
              {/* Right: live radar chart */}
              <div className="flex-1 min-h-[420px]">
                <ScoreWheel
                  scores={{
                    sweetness, acidity, florality, spicy, salty,
                    berryFruit, citrusFruit, stoneFruit, chocolate, caramel,
                    smoky, bitterness, savory, body, clarity, finish,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Flavor Tags */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Flavor Tags<AIBadge show={autoFilledFields.has("flavorNotes")} />
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
                  <span className="label-text text-sm">Tasting Notes<AIBadge show={autoFilledFields.has("tastingNotes")} /></span>
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

        {/* Section: Coffee Talk Links */}
        <section className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h2 className="text-xs font-semibold tracking-widest text-base-content/50 uppercase mb-3">
              Link to Coffee Talks
            </h2>

            {/* Linked chats as chips */}
            {linkedChatDetails.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {linkedChatDetails.map((chat) => (
                  <div
                    key={chat.id}
                    className="badge badge-lg gap-2 pr-1"
                  >
                    <span className="truncate max-w-[150px]">💬 {chat.name}</span>
                    <button
                      type="button"
                      onClick={() => removeChatLink(chat.id)}
                      className="btn btn-ghost btn-xs btn-circle"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search and add chats */}
            <div>
              <input
                type="text"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                className="input input-bordered input-sm w-full mb-2"
                placeholder="Search chats to link..."
              />
              {availableChats.length > 0 && (
                <div className="flex flex-col gap-1">
                  {availableChats.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => addChatLink(session.id)}
                      className="flex items-center justify-between p-2 rounded-lg border border-base-200 hover:border-primary/50 transition-colors text-left"
                    >
                      <span className="text-sm truncate">{session.name}</span>
                      <span className="text-xs text-base-content/40">+</span>
                    </button>
                  ))}
                </div>
              )}
              {availableChats.length === 0 && chatSearchQuery && (
                <p className="text-xs text-base-content/40">No matching chats found</p>
              )}
            </div>
          </div>
        </section>

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
