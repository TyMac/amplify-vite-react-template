import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import JournalEntryDetail from "./JournalEntryDetail";
import JournalEntryForm from "./JournalEntryForm";
import { useTimezone } from "../contexts/TimezoneContext";
import { batchColor } from "../services/coffeeBatch";
import JournalPhotoGallery from "../components/JournalPhotoGallery";
import JournalRecipeGallery from "../components/JournalRecipeGallery";
import JournalCalendar from "../components/JournalCalendar";

const client = generateClient<Schema>();

const STORAGE_KEY = "journal_last_entry";

function formatDateKey(dateStr: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }).formatToParts(new Date(dateStr));
  const y = parts.find(p => p.type === "year")?.value ?? "";
  const m = parts.find(p => p.type === "month")?.value ?? "";
  const d = parts.find(p => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

export default function JournalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthenticator();
  const { timezone } = useTimezone();

  const [entries, setEntries] = useState<Schema["BrewJournal"]["type"][]>([]);
  const [batches, setBatches] = useState<Schema["CoffeeBatch"]["type"][]>([]);
  const [chatSessions, setChatSessions] = useState<Schema["ChatSession"]["type"][]>([]);
  const [loading, setLoading] = useState(true);

  // 3-pane state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  // When creating new from a batch, pre-fill the batch
  const [newBrewBatchId, setNewBrewBatchId] = useState<string | null>(null);
  // Left pane — open by default on wide screens (≥1024px), collapsed on narrower
  const [leftPaneOpen, setLeftPaneOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("journal_left_pane_open");
      if (saved !== null) return saved === "true";
    } catch {}
    return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
  });
  // Photo gallery section — open by default
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(true);
  // Recipe section — open by default
  const [recipeGalleryOpen, setRecipeGalleryOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("journal_recipe_gallery_open");
      if (saved !== null) return saved === "true";
    } catch {}
    return true;
  });
  // Calendar section — open by default
  const [calendarOpen, setCalendarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("journal_calendar_open");
      if (saved !== null) return saved === "true";
    } catch {}
    return true;
  });
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  // Timeline panel — open by default on wide screens (≥1280px), collapsed on narrower
  const [timelineOpen, setTimelineOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("journal_timeline_open");
      if (saved !== null) return saved === "true";
    } catch {}
    return typeof window !== "undefined" ? window.innerWidth >= 1280 : true;
  });
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(() => new Set());

  const preLinkChatId = searchParams.get("chatId");

  // Derive selectedDate from the selected entry (always in sync)
  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId]
  );
  const selectedDateKey = useMemo(() => {
    if (!selectedEntry?.brewDate) return null;
    return formatDateKey(selectedEntry.brewDate, timezone);
  }, [selectedEntry, timezone]);

  const entryMarkersByDate = useMemo(() => {
    return entries.reduce<Record<string, { color: string; coffeeName: string }[]>>((markersByDate, entry) => {
      if (!entry.brewDate) return markersByDate;
      const dateKey = formatDateKey(entry.brewDate, timezone);
      const color = entry.coffeeBatchId ? batchColor(entry.coffeeBatchId) : "#6b7280";
      markersByDate[dateKey] = [...(markersByDate[dateKey] ?? []), { color, coffeeName: entry.coffeeName }];
      return markersByDate;
    }, {});
  }, [entries, timezone]);

  const entryColorsByDate = useMemo(() => {
    return Object.fromEntries(
      Object.entries(entryMarkersByDate).map(([dateKey, markers]) => [
        dateKey,
        markers.map((marker) => marker.color),
      ])
    );
  }, [entryMarkersByDate]);

  const roastDatesByDate = useMemo(() => {
    return entries.reduce<Record<string, { color: string; coffeeName: string }[]>>((markersByDate, entry) => {
      const batch = entry.coffeeBatchId
        ? batches.find((candidate) => candidate.id === entry.coffeeBatchId)
        : null;
      const roastDate = batch?.roastDate ?? entry.roastDate;
      if (!roastDate) return markersByDate;

      const dateKey = formatDateKey(`${roastDate}T00:00:00`, timezone);
      const color = entry.coffeeBatchId ? batchColor(entry.coffeeBatchId) : "#6b7280";
      const coffeeName = batch?.coffeeName ?? entry.coffeeName;
      const marker = { color, coffeeName };

      const existingMarkers = markersByDate[dateKey] ?? [];
      const alreadyExists = existingMarkers.some(
        (existingMarker) => existingMarker.coffeeName === marker.coffeeName && existingMarker.color === marker.color
      );
      markersByDate[dateKey] = alreadyExists ? existingMarkers : [...existingMarkers, marker];
      return markersByDate;
    }, {});
  }, [batches, entries, timezone]);

  useEffect(() => {
    loadAll();
  }, [user]);

  // Persist last opened entry
  useEffect(() => {
    try {
      if (selectedEntryId) localStorage.setItem(STORAGE_KEY, selectedEntryId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [selectedEntryId]);

  // Persist left pane open/closed preference
  useEffect(() => {
    try { localStorage.setItem("journal_left_pane_open", String(leftPaneOpen)); } catch {}
  }, [leftPaneOpen]);

  // Persist timeline open/closed preference
  useEffect(() => {
    try { localStorage.setItem("journal_timeline_open", String(timelineOpen)); } catch {}
  }, [timelineOpen]);

  // Persist recipe section open/closed preference
  useEffect(() => {
    try { localStorage.setItem("journal_recipe_gallery_open", String(recipeGalleryOpen)); } catch {}
  }, [recipeGalleryOpen]);

  // Persist calendar section open/closed preference
  useEffect(() => {
    try { localStorage.setItem("journal_calendar_open", String(calendarOpen)); } catch {}
  }, [calendarOpen]);

  // Handle pre-linked chat from URL
  useEffect(() => {
    if (preLinkChatId) {
      setIsCreatingNew(true);
      setSelectedEntryId(null);
      setNewBrewBatchId(null);
    }
  }, [preLinkChatId]);

  async function loadAll() {
    if (!user?.userId) return;
    setLoading(true);
    try {
      const [{ data: entriesData }, { data: batchesData }, { data: chatsData }] = await Promise.all([
        client.models.BrewJournal.list({ filter: { userId: { eq: user.userId } } }),
        client.models.CoffeeBatch.list({ filter: { userId: { eq: user.userId } } }),
        client.models.ChatSession.list({ filter: { userId: { eq: user.userId } } }),
      ]);

      const sortedEntries = [...(entriesData ?? [])].sort((a, b) =>
        (b.brewDate ?? "").localeCompare(a.brewDate ?? "")
      );
      setEntries(sortedEntries);
      setBatches(batchesData ?? []);
      setChatSessions(
        [...(chatsData ?? [])].sort((a, b) =>
          (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
        )
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Left pane: batch context ──────────────────────────────────────────
  // If selected entry belongs to a batch, show other brews for that batch.
  // Otherwise fall back to related chats by tag.

  const selectedBatch = useMemo(() => {
    if (!selectedEntry?.coffeeBatchId) return null;
    return batches.find((b) => b.id === selectedEntry.coffeeBatchId) ?? null;
  }, [selectedEntry, batches]);

  const batchEntries = useMemo(() => {
    if (!selectedBatch) return [];
    return entries
      .filter((e) => e.coffeeBatchId === selectedBatch.id)
      .sort((a, b) => (b.brewDate ?? "").localeCompare(a.brewDate ?? ""));
  }, [selectedBatch, entries]);

  // Related chats by tag (fallback when no batch)
  const allJournalTags = useMemo(() => {
    const tags = new Set<string>();
    entries.forEach((e) => (e.flavorNotes ?? []).forEach((t) => t && tags.add(t.toLowerCase())));
    return tags;
  }, [entries]);

  const allPinnedChatIds = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach((e) => (e.chatSessionIds ?? []).forEach((id) => id && ids.add(id)));
    return ids;
  }, [entries]);

  const relatedChats = useMemo(() => {
    return chatSessions.filter((chat) =>
      (chat.tags ?? []).some((t) => t && allJournalTags.has(t.toLowerCase()))
    );
  }, [chatSessions, allJournalTags]);

  // ── Actions ───────────────────────────────────────────────────────────
  function handleEntryClick(entryId: string) {
    setSelectedEntryId(entryId);
    setIsCreatingNew(false);
    setNewBrewBatchId(null);
  }

  function handleNewEntry(batchId?: string) {
    setSelectedEntryId(null);
    setIsCreatingNew(true);
    setNewBrewBatchId(batchId ?? null);
  }

  function handleDateClick(dateKey: string) {
    const dayEntries = entries.filter(
      (e) => e.brewDate && formatDateKey(e.brewDate, timezone) === dateKey
    );
    if (dayEntries.length > 0) {
      handleEntryClick(dayEntries[0].id);
    } else {
      handleNewEntry();
    }
  }

  const handleSave = useCallback(
    async (entryId: string) => {
      await loadAll();
      setSelectedEntryId(entryId);
      setIsCreatingNew(false);
      setNewBrewBatchId(null);
      if (preLinkChatId) navigate("/journal", { replace: true });
    },
    [preLinkChatId]
  );

  async function pinChatToEntry(chatId: string) {
    if (!selectedEntryId) return;
    const entry = entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;
    const current = (entry.chatSessionIds ?? []).filter((id): id is string => id !== null);
    if (current.includes(chatId)) return;
    await client.models.BrewJournal.update({ id: selectedEntryId, chatSessionIds: [...current, chatId] });
    await loadAll();
  }

  function isChatPinnedToSelected(chatId: string) {
    return (selectedEntry?.chatSessionIds ?? []).includes(chatId);
  }

  function toggleEntryExpanded(entryId: string) {
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)]">

      {/* ── Left Pane: Batch context or related chats ── */}
      <div className={`hidden lg:flex flex-col border-r border-base-200 bg-base-100 transition-all duration-200 relative ${leftPaneOpen ? "w-64" : "w-10"}`}>
        
        {/* Collapsed rail — just toggle button */}
        {!leftPaneOpen && (
          <div className="flex flex-col items-center pt-3 gap-2">
            <button
              onClick={() => setLeftPaneOpen(true)}
              className="btn btn-ghost btn-xs btn-square"
              title="Expand left panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-xs text-base-content/30 [writing-mode:vertical-lr] rotate-180 tracking-wider uppercase mt-2">Context</span>
          </div>
        )}

        {/* Expanded panel */}
        {leftPaneOpen && (
          <>
            {selectedBatch ? (
              <>
                {/* Batch header */}
                <div className="p-3 border-b border-base-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: selectedBatch.color ?? batchColor(selectedBatch.id) }}
                      />
                      <p className="text-xs font-semibold text-base-content/70 uppercase tracking-wider truncate">
                        {selectedBatch.coffeeName}
                      </p>
                    </div>
                    {selectedBatch.roaster && (
                      <p className="text-xs text-base-content/40 mb-2">{selectedBatch.roaster}</p>
                    )}
                    <button
                      onClick={() => handleNewEntry(selectedBatch.id)}
                      className="btn btn-primary btn-xs w-full"
                    >
                      + Add Journal Entry
                    </button>
                  </div>
                  <button
                    onClick={() => setLeftPaneOpen(false)}
                    className="btn btn-ghost btn-xs btn-square flex-shrink-0"
                    title="Collapse panel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>

                {/* Brew list for batch */}
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4">
                  <div>
                    <p className="text-xs text-base-content/40 px-1 mb-1">
                      {batchEntries.length} brew{batchEntries.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-col gap-1">
                      {batchEntries.map((e, idx) => {
                        const isActive = e.id === selectedEntryId;
                        const color = selectedBatch.color ?? batchColor(selectedBatch.id);
                        return (
                          <button
                            key={e.id}
                            onClick={() => handleEntryClick(e.id)}
                            className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors border ${
                              isActive
                                ? "border-current"
                                : "border-transparent hover:bg-base-200"
                            }`}
                            style={isActive ? { borderColor: color, backgroundColor: color + "18" } : {}}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-base-content/40">
                                Brew #{batchEntries.length - idx}
                              </span>
                              {e.rating != null && (
                                <span className="text-xs text-base-content/40">{e.rating}/10</span>
                              )}
                            </div>
                            <p className="text-sm font-medium" style={{ color }}>
                              {e.brewDate
                                ? new Date(e.brewDate).toLocaleDateString("en-US", {
                                    month: "short", day: "numeric", timeZone: timezone,
                                  })
                                : "—"}
                            </p>
                            {e.brewMethod && (
                              <p className="text-xs text-base-content/40">{e.brewMethod}</p>
                            )}
                            {e.daysFromRoast != null && (
                              <p className="text-xs text-base-content/30">{e.daysFromRoast}d from roast</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Photo Gallery Section */}
                  <div className="border-t border-base-200">
                    <button
                      onClick={() => setPhotoGalleryOpen(!photoGalleryOpen)}
                      className="w-full p-3 flex items-center justify-between hover:bg-base-200 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Photos</h3>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 transition-transform ${photoGalleryOpen ? "" : "-rotate-90"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                    {photoGalleryOpen && (
                      <JournalPhotoGallery
                        chatSessions={chatSessions}
                        pinnedChatIds={selectedEntry?.chatSessionIds ?? []}
                      />
                    )}
                  </div>

                  {/* Recipes Section */}
                  <div className="border-t border-base-200">
                    <button
                      onClick={() => setRecipeGalleryOpen(!recipeGalleryOpen)}
                      className="w-full p-3 flex items-center justify-between hover:bg-base-200 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Recipes</h3>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 transition-transform ${recipeGalleryOpen ? "" : "-rotate-90"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                    {recipeGalleryOpen && (
                      <JournalRecipeGallery
                        journalEntry={selectedEntry}
                        batch={selectedBatch}
                        chatSessions={chatSessions}
                        userId={user?.userId}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Fallback: related chats */}
                <div className="p-3 border-b border-base-200 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                    Related Chats
                  </h2>
                  <button
                    onClick={() => setLeftPaneOpen(false)}
                    className="btn btn-ghost btn-xs btn-square flex-shrink-0"
                    title="Collapse panel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4">
                  <div>
                    {relatedChats.length === 0 ? (
                      <p className="text-xs text-base-content/40 p-2">
                        Chats with matching flavor tags will appear here
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {relatedChats.map((chat) => {
                          const isPinned = allPinnedChatIds.has(chat.id);
                          const isPinnedToSelected = isChatPinnedToSelected(chat.id);
                          const chatTags = (chat.tags ?? []).filter((t): t is string => !!t && allJournalTags.has(t.toLowerCase()));
                          return (
                            <div
                              key={chat.id}
                              className={`card card-compact border ${isPinned ? "border-success/50 bg-success/5" : "border-base-200"}`}
                            >
                              <div className="card-body p-2">
                                <Link
                                  to={`/chat/${chat.id}`}
                                  className="text-sm font-medium truncate block hover:text-primary"
                                >
                                  {chat.name}
                                </Link>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {chatTags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="badge badge-xs badge-outline">{tag}</span>
                                  ))}
                                </div>
                                <div className="mt-1.5">
                                  {isPinnedToSelected ? (
                                    <span className="text-xs text-success">Pinned ✓</span>
                                  ) : selectedEntryId ? (
                                    <button onClick={() => pinChatToEntry(chat.id)} className="btn btn-xs btn-ghost">Pin</button>
                                  ) : isPinned ? (
                                    <span className="text-xs text-success/70">Pinned ✓</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Photo Gallery Section */}
                  <div className="border-t border-base-200">
                    <button
                      onClick={() => setPhotoGalleryOpen(!photoGalleryOpen)}
                      className="w-full p-3 flex items-center justify-between hover:bg-base-200 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Photos</h3>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 transition-transform ${photoGalleryOpen ? "" : "-rotate-90"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                    {photoGalleryOpen && (
                      <JournalPhotoGallery
                        chatSessions={chatSessions}
                        pinnedChatIds={selectedEntry?.chatSessionIds ?? []}
                      />
                    )}
                  </div>

                  {/* Recipes Section */}
                  <div className="border-t border-base-200">
                    <button
                      onClick={() => setRecipeGalleryOpen(!recipeGalleryOpen)}
                      className="w-full p-3 flex items-center justify-between hover:bg-base-200 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Recipes</h3>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 transition-transform ${recipeGalleryOpen ? "" : "-rotate-90"}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </button>
                    {recipeGalleryOpen && (
                      <JournalRecipeGallery
                        journalEntry={selectedEntry}
                        batch={selectedBatch}
                        chatSessions={chatSessions}
                        userId={user?.userId}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Middle Pane: Entry detail or form ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-base-50">
        <div className="flex-1 overflow-y-auto">
          {isCreatingNew ? (
            <JournalEntryForm
              embedded
              preLinkedChatId={preLinkChatId ?? undefined}
              prefillBatchId={newBrewBatchId ?? undefined}
              onSave={handleSave}
              onCancel={() => {
                setIsCreatingNew(false);
                setNewBrewBatchId(null);
                if (entries.length > 0 && !selectedEntryId) {
                  setSelectedEntryId(entries[0].id);
                }
              }}
            />
          ) : selectedEntry ? (
            <JournalEntryDetail
              embedded
              entryId={selectedEntry.id}
              onEdit={() => navigate(`/journal/${selectedEntry.id}/edit`)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <p className="text-base-content/50 mb-4">
                Select an entry from the timeline or create a new one
              </p>
              <button onClick={() => handleNewEntry()} className="btn btn-primary btn-sm">
                + New Entry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Pane: Journal entries + calendar ── */}
      <div className={`hidden lg:flex flex-col border-l border-base-200 bg-base-100 transition-all duration-200 ${timelineOpen ? "w-96" : "w-12"}`}>

        {/* Collapsed rail — just toggle button */}
        {!timelineOpen && (
          <div className="flex flex-col items-center pt-3 gap-2">
            <button
              onClick={() => setTimelineOpen(true)}
              className="btn btn-ghost btn-xs btn-square"
              title="Expand journal column"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-[11px] text-base-content/35 [writing-mode:vertical-lr] rotate-180 tracking-wider uppercase mt-2 text-center">Journal</span>
          </div>
        )}

        {/* Expanded panel */}
        {timelineOpen && (
          <>
            <div className="p-3 border-b border-base-200 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                  Journal Catalogue
                </h2>
                <p className="text-[11px] text-base-content/40">
                  Newest to oldest
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleNewEntry()} className="btn btn-primary btn-xs">
                  + Start New Journal
                </button>
                <button
                  onClick={() => setTimelineOpen(false)}
                  className="btn btn-ghost btn-xs btn-square"
                  title="Collapse journal column"
                  aria-label="Collapse journal column"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {entries.length === 0 ? (
                <div className="p-4 text-center text-sm text-base-content/50">
                  No journal entries yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const color = entry.coffeeBatchId
                      ? batchColor(entry.coffeeBatchId)
                      : "#6b7280";
                    const isActiveEntry = selectedEntryId === entry.id;
                    const isExpanded = expandedEntryIds.has(entry.id);
                    const linkedChats = (entry.chatSessionIds ?? [])
                      .filter((id): id is string => !!id)
                      .map((chatId) => chatSessions.find((chat) => chat.id === chatId))
                      .filter((chat): chat is Schema["ChatSession"]["type"] => !!chat);

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border transition-colors ${
                          isActiveEntry ? "bg-primary/5" : "bg-base-100 hover:bg-base-200/40"
                        }`}
                        style={{ borderColor: isActiveEntry ? color : undefined }}
                      >
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => handleEntryClick(entry.id)}
                            className="flex-1 min-w-0 text-left px-3 py-2.5"
                          >
                            <div className="flex items-start gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: color }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold truncate" style={{ color }}>
                                    {entry.coffeeName}
                                  </p>
                                  {entry.rating != null && (
                                    <span className="text-xs text-base-content/45 flex-shrink-0">{entry.rating}/10</span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-base-content/45 min-w-0">
                                  {entry.brewDate && (
                                    <span className="flex-shrink-0">
                                      {new Date(entry.brewDate).toLocaleDateString("en-US", {
                                        month: "short", day: "numeric", year: "numeric", timeZone: timezone,
                                      })}
                                    </span>
                                  )}
                                  {entry.brewMethod && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{entry.brewMethod}</span>
                                    </>
                                  )}
                                </div>
                                {entry.roaster && (
                                  <p className="mt-0.5 text-xs text-base-content/40 truncate">{entry.roaster}</p>
                                )}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleEntryExpanded(entry.id);
                            }}
                            className="btn btn-ghost btn-xs btn-square self-center mr-2 flex-shrink-0"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} chats for ${entry.coffeeName}`}
                            title={`${isExpanded ? "Hide" : "Show"} associated chats`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-base-200 px-3 py-2 bg-base-200/25 rounded-b-xl">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/45 mb-1.5">
                              Associated Chats
                            </p>
                            {linkedChats.length === 0 ? (
                              <p className="text-xs text-base-content/40">
                                No chats associated with this journal entry yet.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {linkedChats.map((chat) => (
                                  <Link
                                    key={chat.id}
                                    to={`/chat/${chat.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-secondary hover:bg-secondary/10"
                                  >
                                    <span className="flex-shrink-0">💬</span>
                                    <span className="truncate">{chat.name}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-base-200 bg-base-50">
              <div className="w-full p-3 flex items-center justify-between hover:bg-base-200 transition-colors">
                <button
                  type="button"
                  onClick={() => setCalendarModalOpen(true)}
                  className="text-xs font-semibold text-base-content/70 hover:text-coffee uppercase tracking-wider underline-offset-2 hover:underline"
                >
                  Calendar
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(!calendarOpen)}
                  className="btn btn-ghost btn-xs btn-square"
                  aria-expanded={calendarOpen}
                  aria-label={`${calendarOpen ? "Hide" : "Show"} calendar`}
                  title={`${calendarOpen ? "Hide" : "Show"} calendar`}
                >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-4 h-4 transition-transform ${calendarOpen ? "" : "-rotate-90"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              </div>
              {calendarOpen && (
                <div className="px-3 pb-3">
                  <JournalCalendar
                    brewDates={entries.map((entry) => entry.brewDate).filter((date): date is string => !!date)}
                    entryColorsByDate={entryColorsByDate}
                    entryMarkersByDate={entryMarkersByDate}
                    roastDatesByDate={roastDatesByDate}
                    selectedDate={selectedDateKey}
                    onSelectDate={(dateKey) => {
                      if (dateKey) handleDateClick(dateKey);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {calendarModalOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:w-[94vw]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-200">
              <div>
                <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">Calendar</h2>
                <p className="text-xs text-base-content/45">Click a brew date to jump to that journal entry.</p>
              </div>
              <button
                type="button"
                onClick={() => setCalendarModalOpen(false)}
                className="btn btn-ghost btn-sm btn-square"
                aria-label="Close calendar"
                title="Close calendar"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3 sm:p-5">
              <JournalCalendar
                size="large"
                brewDates={entries.map((entry) => entry.brewDate).filter((date): date is string => !!date)}
                entryColorsByDate={entryColorsByDate}
                entryMarkersByDate={entryMarkersByDate}
                roastDatesByDate={roastDatesByDate}
                selectedDate={selectedDateKey}
                onSelectDate={(dateKey) => {
                  if (dateKey) {
                    handleDateClick(dateKey);
                    setCalendarModalOpen(false);
                  }
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            onClick={() => setCalendarModalOpen(false)}
            aria-label="Close calendar"
          >
            close
          </button>
        </div>
      )}

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-20 right-4 z-10">
        <button onClick={() => handleNewEntry()} className="btn btn-primary btn-circle shadow-lg">
          <span className="text-xl">+</span>
        </button>
      </div>
    </div>
  );
}
