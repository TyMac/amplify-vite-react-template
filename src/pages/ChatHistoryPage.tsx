import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  chatStorage,
  type ChatMessage,
  type ChatSession,
} from "../services/chatStorage";
import { TagChip, TagEditor } from "../components/tags";

function ChatHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  async function loadSessions() {
    setLoading(true);
    try {
      const list = await chatStorage.getSessions();
      setSessions(list);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch(query: string, tags: string[]) {
    const hasQuery = query.trim() !== "";
    const hasTags = tags.length > 0;

    if (!hasQuery && !hasTags) {
      setIsSearchActive(false);
      await loadSessions();
      return;
    }

    setIsSearching(true);
    try {
      const allSessions = await chatStorage.getSessions();
      const queryLower = query.trim().toLowerCase();

      const results = allSessions.filter((session) => {
        // Tag filter: session must have ALL active tags
        if (hasTags) {
          const sessionTags = session.tags ?? [];
          const hasAllTags = tags.every((tag) => sessionTags.includes(tag));
          if (!hasAllTags) return false;
        }

        // Query filter: match name or any message content
        if (hasQuery) {
          const nameMatch = session.name.toLowerCase().includes(queryLower);
          const messageMatch = session.messages.some((msg) =>
            msg.content.toLowerCase().includes(queryLower)
          );
          if (!nameMatch && !messageMatch) return false;
        }

        return true;
      });

      setSessions(results);
      setIsSearchActive(true);
    } catch (err) {
      console.error("Failed to search chats:", err);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    await runSearch(searchQuery, activeTags);
  }

  async function toggleTagFilter(tag: string) {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    setActiveTags(next);
    await runSearch(searchQuery, next);
  }

  async function clearSearch() {
    setSearchQuery("");
    setActiveTags([]);
    setIsSearchActive(false);
    await loadSessions();
  }

  async function deleteSession(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await chatStorage.deleteSession(id);
    if (selectedSession?.id === id) setSelectedSession(null);
    if (isSearchActive) {
      await runSearch(searchQuery, activeTags);
    } else {
      await loadSessions();
    }
  }

  async function handleTagsChange(sessionId: string, tags: string[]) {
    await chatStorage.updateTags(sessionId, tags);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, tags } : s))
    );
    if (selectedSession?.id === sessionId) {
      setSelectedSession((prev) => prev ? { ...prev, tags } : prev);
    }
  }

  function startRename(s: ChatSession) {
    setRenamingId(s.id);
    setRenameText(s.name);
  }

  async function submitRename() {
    if (!renamingId || !renameText.trim()) {
      setRenamingId(null);
      return;
    }
    await chatStorage.renameSession(renamingId, renameText.trim());
    setSessions((prev) =>
      prev.map((s) => (s.id === renamingId ? { ...s, name: renameText.trim() } : s))
    );
    if (selectedSession?.id === renamingId) {
      setSelectedSession((prev) => prev ? { ...prev, name: renameText.trim() } : prev);
    }
    setRenamingId(null);
  }

  // Collect all tags across loaded sessions for the filter bar
  const allTagsInUse = Array.from(
    new Set(sessions.flatMap((s) => s.tags))
  ).sort();

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  };

  // Chat detail view
  if (selectedSession) {
    const messages = selectedSession.messages;
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => setSelectedSession(null)}
          className="btn btn-ghost btn-sm gap-2 mb-6"
        >
          <span>←</span> Back to chats
        </button>

        <div className="card bg-base-100 shadow-lg">
          <div className="card-body p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="card-title text-lg font-semibold text-base-content cursor-pointer hover:text-primary transition-colors"
                onClick={() => startRename(selectedSession)}
                title="Click to rename"
              >
                {selectedSession.name}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => startRename(selectedSession)}
                  className="btn btn-ghost btn-sm"
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  onClick={() => navigate(`/chat/${selectedSession.id}`)}
                  className="btn btn-primary btn-sm gap-1"
                >
                  Continue →
                </button>
              </div>
            </div>

            {/* Tag editor */}
            <div className="mb-4 pb-4 border-b border-base-200">
              <p className="text-xs text-base-content/40 uppercase tracking-wider mb-2">Tags</p>
              <TagEditor
                tags={selectedSession.tags ?? []}
                onChange={(tags) => handleTagsChange(selectedSession.id, tags)}
              />
            </div>

            <div className="flex flex-col gap-3">
              {messages.map((msg: ChatMessage, idx: number) => (
                <div
                  key={msg.id || idx}
                  className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}
                >
                  <div className="chat-header text-xs opacity-50 mb-1">
                    {msg.role === "user" ? "You" : "Barizta.AI"}
                  </div>
                  <div
                    className={`chat-bubble whitespace-pre-wrap text-sm ${
                      msg.role === "user"
                        ? "chat-bubble-primary"
                        : "bg-base-200 text-base-content"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className="chat-footer text-xs opacity-40 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rename modal — must live inside the detail view return */}
        {renamingId && (
          <dialog className="modal modal-open">
            <div className="modal-box max-w-sm">
              <h3 className="font-bold text-lg mb-4">Rename Chat</h3>
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="input input-bordered w-full"
                placeholder="Chat name"
              />
              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => setRenamingId(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={submitRename}>
                  Save
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button onClick={() => setRenamingId(null)}>close</button>
            </form>
          </dialog>
        )}
      </div>
    );
  }

  // Session list view
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light tracking-wide text-base-content">
          Chat History
        </h1>
        <button
          onClick={() => navigate("/chat")}
          className="btn btn-primary btn-sm gap-1"
        >
          + New Chat
        </button>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder="Search chats by name or message..."
          className="input input-bordered w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearchActive ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={clearSearch}
            title="Clear search"
          >
            ✕
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSearching || (!searchQuery.trim() && !activeTags.length)}
          >
            {isSearching ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : (
              "Search"
            )}
          </button>
        )}
      </form>

      {/* Tag filter bar */}
      {allTagsInUse.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-base-content/40 mr-1">Filter:</span>
          {allTagsInUse.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              active={activeTags.includes(tag)}
              onClick={() => toggleTagFilter(tag)}
            />
          ))}
        </div>
      )}

      {isSearchActive && (
        <p className="text-xs text-base-content/40 mb-3">
          {searchQuery.trim() && activeTags.length > 0
            ? `Results for "${searchQuery}" tagged [${activeTags.join(", ")}]`
            : searchQuery.trim()
            ? `Results for "${searchQuery}"`
            : `Filtered by tag${activeTags.length > 1 ? "s" : ""}: [${activeTags.join(", ")}]`}
        </p>
      )}

      {loading || isSearching ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="card bg-base-100">
          <div className="card-body items-center text-center py-12">
            <p className="text-base-content/50 font-light">
              {isSearchActive
                ? "No chats matched your search."
                : "No chat history yet. Start a conversation!"}
            </p>
            {!isSearchActive && (
              <button
                onClick={() => navigate("/chat")}
                className="btn btn-primary btn-sm mt-4"
              >
                Start Chat
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const lastMessage = session.messages[session.messages.length - 1];
            return (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="card bg-base-100 shadow-sm hover:shadow-md border border-base-200 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99]"
              >
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {renamingId === session.id ? (
                        <input
                          ref={renameInputRef}
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={submitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="input input-sm input-bordered w-full"
                        />
                      ) : (
                        <h3 className="font-semibold text-base-content truncate">
                          {session.name}
                        </h3>
                      )}
                      {lastMessage && (
                        <p className="text-sm text-base-content/50 truncate mt-1">
                          {lastMessage.content}
                        </p>
                      )}
                      {/* Tags on card */}
                      {session.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {session.tags.map((tag) => (
                            <TagChip
                              key={tag}
                              tag={tag}
                              size="xs"
                              active={activeTags.includes(tag)}
                              onClick={() => toggleTagFilter(tag)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-xs text-base-content/40 whitespace-nowrap">
                        {formatDate(session.updatedAt)}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(session);
                          }}
                          className="btn btn-ghost btn-xs"
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="btn btn-ghost btn-xs text-error"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="badge badge-ghost badge-sm">
                      {session.messages.length} messages
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename modal */}
      {renamingId && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">Rename Chat</h3>
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="input input-bordered w-full"
              placeholder="Chat name"
            />
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setRenamingId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitRename}>
                Save
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setRenamingId(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}

export default ChatHistoryPage;
