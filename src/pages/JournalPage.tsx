import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import JournalEntryDetail from "./JournalEntryDetail";
import JournalEntryForm from "./JournalEntryForm";
import { useTimezone } from "../contexts/TimezoneContext";
import { batchColor } from "../services/coffeeBatch";

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

function formatShortDate(dateStr: string, timezone: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: timezone,
  });
}

function generateDaysList(days: number, timezone: string): string[] {
  const result: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(formatDateKey(d.toISOString(), timezone));
  }
  return result;
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
  // Timeline panel — open by default on wide screens (≥1280px), collapsed on narrower
  const [timelineOpen, setTimelineOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("journal_timeline_open");
      if (saved !== null) return saved === "true";
    } catch {}
    return typeof window !== "undefined" ? window.innerWidth >= 1280 : true;
  });

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

  // Persist timeline open/closed preference
  useEffect(() => {
    try { localStorage.setItem("journal_timeline_open", String(timelineOpen)); } catch {}
  }, [timelineOpen]);

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

  // ── Timeline ──────────────────────────────────────────────────────────
  const timelineDays = useMemo(() => {
    const days = generateDaysList(90, timezone);
    const entriesByDate = new Map<string, Schema["BrewJournal"]["type"][]>();
    entries.forEach((e) => {
      if (!e.brewDate) return;
      const key = formatDateKey(e.brewDate, timezone);
      if (!entriesByDate.has(key)) entriesByDate.set(key, []);
      entriesByDate.get(key)!.push(e);
    });

    const pinnedChatsByDate = new Map<string, { chat: Schema["ChatSession"]["type"] }[]>();
    entries.forEach((e) => {
      if (!e.brewDate || !e.chatSessionIds) return;
      const key = formatDateKey(e.brewDate, timezone);
      e.chatSessionIds.forEach((chatId) => {
        if (!chatId) return;
        const chat = chatSessions.find((c) => c.id === chatId);
        if (chat) {
          if (!pinnedChatsByDate.has(key)) pinnedChatsByDate.set(key, []);
          pinnedChatsByDate.get(key)!.push({ chat });
        }
      });
    });

    return days.map((dateKey) => ({
      dateKey,
      entries: entriesByDate.get(dateKey) ?? [],
      pinnedChats: pinnedChatsByDate.get(dateKey) ?? [],
    }));
  }, [entries, chatSessions, timezone]);

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
      <div className="hidden lg:flex flex-col w-64 border-r border-base-200 bg-base-100">
        {selectedBatch ? (
          <>
            {/* Batch header */}
            <div className="p-3 border-b border-base-200">
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

            {/* Brew list for batch */}
            <div className="flex-1 overflow-y-auto p-2">
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
          </>
        ) : (
          <>
            {/* Fallback: related chats */}
            <div className="p-3 border-b border-base-200">
              <h2 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                Related Chats
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
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

      {/* ── Right Pane: Timeline ── */}
      <div className={`hidden lg:flex flex-col border-l border-base-200 bg-base-100 transition-all duration-200 ${timelineOpen ? "w-96" : "w-10"}`}>

        {/* Collapsed rail — just toggle button */}
        {!timelineOpen && (
          <div className="flex flex-col items-center pt-3 gap-2">
            <button
              onClick={() => setTimelineOpen(true)}
              className="btn btn-ghost btn-xs btn-square"
              title="Expand timeline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-xs text-base-content/30 [writing-mode:vertical-lr] rotate-180 tracking-wider uppercase mt-2">Timeline</span>
          </div>
        )}

        {/* Expanded panel */}
        {timelineOpen && (
          <>
        <div className="p-3 border-b border-base-200 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
            Timeline
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => handleNewEntry()} className="btn btn-primary btn-xs">
              + Start New Journal
            </button>
            <button
              onClick={() => setTimelineOpen(false)}
              className="btn btn-ghost btn-xs btn-square"
              title="Collapse timeline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {timelineDays.map(({ dateKey, entries: dayEntries, pinnedChats }) => {
            const hasContent = dayEntries.length > 0 || pinnedChats.length > 0;
            // Highlight this date row if the selected entry falls on it
            const isActiveDate = selectedDateKey === dateKey;

            if (!hasContent) {
              return (
                <div
                  key={dateKey}
                  onClick={() => handleDateClick(dateKey)}
                  className={`px-3 py-1.5 border-b border-base-100 cursor-pointer hover:bg-base-200/50 transition-colors ${
                    isActiveDate ? "bg-primary/5" : ""
                  }`}
                >
                  <p className={`text-xs ${isActiveDate ? "text-primary font-medium" : "text-base-content/30"}`}>
                    {formatShortDate(dateKey, timezone)}
                  </p>
                </div>
              );
            }

            return (
              <div
                key={dateKey}
                className={`px-3 py-2 border-b border-base-200 transition-colors ${
                  isActiveDate ? "bg-primary/8" : ""
                }`}
                style={isActiveDate ? { backgroundColor: "oklch(var(--p)/0.06)" } : {}}
              >
                <p
                  className={`text-xs font-medium mb-1.5 cursor-pointer hover:text-primary ${
                    isActiveDate ? "text-primary" : "text-base-content/60"
                  }`}
                  onClick={() => handleDateClick(dateKey)}
                >
                  {isActiveDate && <span className="mr-1">▸</span>}
                  {formatShortDate(dateKey, timezone)}
                </p>
                <div className="flex flex-col gap-1">
                  {dayEntries.map((entry) => {
                    const color = entry.coffeeBatchId
                      ? batchColor(entry.coffeeBatchId)
                      : "#6b7280";
                    const isActiveEntry = selectedEntryId === entry.id;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => handleEntryClick(entry.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all w-full text-left ${
                          isActiveEntry ? "" : "bg-transparent hover:bg-base-200"
                        }`}
                        style={{
                          borderColor: color,
                          color: color,
                          ...(isActiveEntry
                            ? { backgroundColor: color + "28", boxShadow: `0 0 0 1.5px ${color}` }
                            : {}),
                        }}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate">{entry.coffeeName}</span>
                        {entry.rating != null && (
                          <span className="ml-auto opacity-60 flex-shrink-0">{entry.rating}/10</span>
                        )}
                      </button>
                    );
                  })}
                  {pinnedChats.map(({ chat }) => (
                    <Link
                      key={chat.id}
                      to={`/chat/${chat.id}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border border-secondary/50 text-secondary bg-transparent hover:bg-secondary/10 transition-colors w-full"
                    >
                      <span>💬</span>
                      <span className="truncate">{chat.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
          </>
        )}
      </div>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-20 right-4 z-10">
        <button onClick={() => handleNewEntry()} className="btn btn-primary btn-circle shadow-lg">
          <span className="text-xl">+</span>
        </button>
      </div>
    </div>
  );
}
