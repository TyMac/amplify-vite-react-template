import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../../amplify/data/resource";
import JournalEntryDetail from "./JournalEntryDetail";
import JournalEntryForm from "./JournalEntryForm";

const client = generateClient<Schema>();

function formatDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Generate last N days
function generateDaysList(days: number): string[] {
  const result: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(formatDateKey(d.toISOString()));
  }
  return result;
}

export default function JournalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthenticator();

  const [entries, setEntries] = useState<Schema["BrewJournal"]["type"][]>([]);
  const [chatSessions, setChatSessions] = useState<Schema["ChatSession"]["type"][]>([]);
  const [loading, setLoading] = useState(true);

  // State management for 3-pane layout
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Pre-linked chat from query param
  const preLinkChatId = searchParams.get("chatId");

  useEffect(() => {
    loadEntries();
    loadChatSessions();
  }, [user]);

  // Handle pre-linked chat from URL
  useEffect(() => {
    if (preLinkChatId) {
      setIsCreatingNew(true);
      setSelectedEntryId(null);
    }
  }, [preLinkChatId]);

  async function loadEntries() {
    if (!user?.userId) return;
    setLoading(true);
    try {
      const { data } = await client.models.BrewJournal.list({
        filter: { userId: { eq: user.userId } },
      });
      const sorted = [...(data ?? [])].sort((a, b) => {
        const dateA = a.brewDate ? new Date(a.brewDate).getTime() : 0;
        const dateB = b.brewDate ? new Date(b.brewDate).getTime() : 0;
        return dateB - dateA;
      });
      setEntries(sorted);
    } catch (err) {
      console.error("Failed to load journal entries:", err);
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
      const sorted = [...(data ?? [])].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
      setChatSessions(sorted);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }

  // Get all flavor tags from all journal entries
  const allJournalTags = useMemo(() => {
    const tags = new Set<string>();
    entries.forEach((e) => {
      (e.flavorNotes ?? []).forEach((tag) => {
        if (tag) tags.add(tag.toLowerCase());
      });
    });
    return tags;
  }, [entries]);

  // Get all pinned chat IDs across all journal entries
  const allPinnedChatIds = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach((e) => {
      (e.chatSessionIds ?? []).forEach((id) => {
        if (id) ids.add(id);
      });
    });
    return ids;
  }, [entries]);

  // Filter chats that have overlapping tags with any journal entry
  const relatedChats = useMemo(() => {
    return chatSessions.filter((chat) => {
      const chatTags = (chat.tags ?? []).map((t) => t?.toLowerCase()).filter(Boolean);
      return chatTags.some((tag) => tag && allJournalTags.has(tag));
    });
  }, [chatSessions, allJournalTags]);

  // Get the currently selected entry
  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    return entries.find((e) => e.id === selectedEntryId) ?? null;
  }, [entries, selectedEntryId]);

  // Build timeline data - group entries and chats by date
  const timelineDays = useMemo(() => {
    const days = generateDaysList(90);

    // Map entries by date
    const entriesByDate = new Map<string, Schema["BrewJournal"]["type"][]>();
    entries.forEach((e) => {
      if (!e.brewDate) return;
      const dateKey = formatDateKey(e.brewDate);
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, []);
      }
      entriesByDate.get(dateKey)!.push(e);
    });

    // Map pinned chats by journal entry date
    const pinnedChatsByDate = new Map<string, { chat: Schema["ChatSession"]["type"]; entryId: string }[]>();
    entries.forEach((e) => {
      if (!e.brewDate || !e.chatSessionIds) return;
      const dateKey = formatDateKey(e.brewDate);
      e.chatSessionIds.forEach((chatId) => {
        if (!chatId) return;
        const chat = chatSessions.find((c) => c.id === chatId);
        if (chat) {
          if (!pinnedChatsByDate.has(dateKey)) {
            pinnedChatsByDate.set(dateKey, []);
          }
          pinnedChatsByDate.get(dateKey)!.push({ chat, entryId: e.id });
        }
      });
    });

    return days.map((dateKey) => ({
      dateKey,
      entries: entriesByDate.get(dateKey) ?? [],
      pinnedChats: pinnedChatsByDate.get(dateKey) ?? [],
    }));
  }, [entries, chatSessions]);

  // Pin a chat to the currently selected entry
  async function pinChatToEntry(chatId: string) {
    if (!selectedEntryId) return;
    const entry = entries.find((e) => e.id === selectedEntryId);
    if (!entry) return;

    const currentIds = (entry.chatSessionIds ?? []).filter((id): id is string => id !== null);
    if (currentIds.includes(chatId)) return;

    try {
      await client.models.BrewJournal.update({
        id: selectedEntryId,
        chatSessionIds: [...currentIds, chatId],
      });
      await loadEntries();
    } catch (err) {
      console.error("Failed to pin chat:", err);
    }
  }

  // Check if a chat is pinned to the selected entry
  function isChatPinnedToSelected(chatId: string): boolean {
    if (!selectedEntry) return false;
    return (selectedEntry.chatSessionIds ?? []).includes(chatId);
  }

  // Get matching tags between a chat and journal entries
  function getMatchingTags(chat: Schema["ChatSession"]["type"]): string[] {
    const chatTags = (chat.tags ?? []).map((t) => t?.toLowerCase()).filter(Boolean) as string[];
    return chatTags.filter((tag) => allJournalTags.has(tag));
  }

  function handleEntryClick(entryId: string) {
    setSelectedEntryId(entryId);
    setIsCreatingNew(false);
  }

  function handleDateClick(dateKey: string) {
    setSelectedDate(dateKey);
    // Find entry for this date
    const entriesForDate = entries.filter(
      (e) => e.brewDate && formatDateKey(e.brewDate) === dateKey
    );
    if (entriesForDate.length > 0) {
      setSelectedEntryId(entriesForDate[0].id);
      setIsCreatingNew(false);
    } else {
      // No entry for this date - show new entry form
      setSelectedEntryId(null);
      setIsCreatingNew(true);
    }
  }

  function handleNewEntry() {
    setSelectedEntryId(null);
    setIsCreatingNew(true);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4rem)]">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Pane - Related Chats */}
      <div className="hidden lg:flex flex-col w-64 border-r border-base-200 bg-base-100">
        <div className="p-3 border-b border-base-200">
          <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">
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
                const matchingTags = getMatchingTags(chat);

                return (
                  <div
                    key={chat.id}
                    className={`card card-compact border ${
                      isPinned ? "border-success/50 bg-success/5" : "border-base-200"
                    }`}
                  >
                    <div className="card-body p-2">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/chat/${chat.id}`}
                            className="text-sm font-medium truncate block hover:text-primary"
                          >
                            {chat.name}
                          </Link>
                          <p className="text-xs text-base-content/40">
                            {chat.updatedAt
                              ? new Date(chat.updatedAt).toLocaleDateString()
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {matchingTags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="badge badge-xs badge-outline"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5">
                        {isPinnedToSelected ? (
                          <span className="text-xs text-success flex items-center gap-1">
                            <span>Pinned</span>
                            <span>✓</span>
                          </span>
                        ) : selectedEntryId ? (
                          <button
                            onClick={() => pinChatToEntry(chat.id)}
                            className="btn btn-xs btn-ghost"
                          >
                            Pin
                          </button>
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
      </div>

      {/* Middle Pane - Entry Detail/Form */}
      <div className="flex-1 flex flex-col min-w-0 bg-base-50">
        <div className="flex-1 overflow-y-auto">
          {isCreatingNew ? (
            <JournalEntryForm
              embedded
              preLinkedChatId={preLinkChatId ?? undefined}
              selectedDate={selectedDate ?? undefined}
              onSave={(entryId) => {
                loadEntries();
                setSelectedEntryId(entryId);
                setIsCreatingNew(false);
                // Clear the chatId param
                if (preLinkChatId) {
                  navigate("/journal", { replace: true });
                }
              }}
              onCancel={() => {
                setIsCreatingNew(false);
                if (entries.length > 0) {
                  setSelectedEntryId(entries[0].id);
                }
              }}
            />
          ) : selectedEntry ? (
            <JournalEntryDetail
              embedded
              entryId={selectedEntry.id}
              onEdit={() => {
                navigate(`/journal/${selectedEntry.id}/edit`);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <p className="text-base-content/50 mb-4">Select an entry from the timeline or create a new one</p>
              <button onClick={handleNewEntry} className="btn btn-primary btn-sm">
                + New Entry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane - Timeline */}
      <div className="hidden lg:flex flex-col w-96 border-l border-base-200 bg-base-100">
        <div className="p-3 border-b border-base-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">
            Timeline
          </h2>
          <button onClick={handleNewEntry} className="btn btn-primary btn-xs gap-1">
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {timelineDays.map(({ dateKey, entries: dayEntries, pinnedChats }) => {
            const hasContent = dayEntries.length > 0 || pinnedChats.length > 0;
            const isSelected = selectedDate === dateKey;

            if (!hasContent) {
              return (
                <div
                  key={dateKey}
                  onClick={() => handleDateClick(dateKey)}
                  className={`px-3 py-1.5 border-b border-base-100 cursor-pointer hover:bg-base-200/50 ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <p className="text-xs text-base-content/30">{formatShortDate(dateKey)}</p>
                </div>
              );
            }

            return (
              <div
                key={dateKey}
                className={`px-3 py-2 border-b border-base-200 ${
                  isSelected ? "bg-primary/10" : ""
                }`}
              >
                <p
                  className="text-xs font-medium text-base-content/60 mb-1.5 cursor-pointer hover:text-primary"
                  onClick={() => handleDateClick(dateKey)}
                >
                  {formatShortDate(dateKey)}
                </p>
                <div className="flex flex-col gap-1">
                  {dayEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => handleEntryClick(entry.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border border-primary text-primary bg-transparent hover:bg-primary/10 transition-colors w-full text-left ${
                        selectedEntryId === entry.id ? "bg-primary/15 ring-1 ring-primary" : ""
                      }`}
                    >
                      <span>☕</span>
                      <span className="truncate">{entry.coffeeName}</span>
                    </button>
                  ))}
                  {pinnedChats.map(({ chat }) => (
                    <Link
                      key={chat.id}
                      to={`/chat/${chat.id}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border border-secondary text-secondary bg-transparent hover:bg-secondary/10 transition-colors w-full"
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
      </div>

      {/* Mobile: Simplified view - just show middle pane content with a floating action button */}
      <div className="lg:hidden fixed bottom-20 right-4 z-10">
        <button onClick={handleNewEntry} className="btn btn-primary btn-circle shadow-lg">
          <span className="text-xl">+</span>
        </button>
      </div>
    </div>
  );
}
