import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  chatStorage,
  type ChatMessage,
  type ChatSession,
} from "../services/chatStorage";

function ChatHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  async function deleteSession(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await chatStorage.deleteSession(id);
    if (selectedSession?.id === id) setSelectedSession(null);
    await loadSessions();
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
      setSelectedSession({ ...selectedSession, name: renameText.trim() });
    }
    setRenamingId(null);
  }

  const filteredSessions = searchQuery.trim()
    ? sessions.filter((s) => {
        const q = searchQuery.toLowerCase();
        if (s.name.toLowerCase().includes(q)) return true;
        return s.messages.some((m) => m.content.toLowerCase().includes(q));
      })
    : sessions;

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

            <div className="flex flex-col gap-3">
              {messages.map((msg: ChatMessage, idx: number) => (
                <div
                  key={msg.id || idx}
                  className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}
                >
                  <div className="chat-header text-xs opacity-50 mb-1">
                    {msg.role === "user" ? "You" : "AI Barista"}
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

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Search chats by name or message..."
          className="input input-bordered w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="btn btn-ghost"
            onClick={() => setSearchQuery("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="card bg-base-100">
          <div className="card-body items-center text-center py-12">
            <p className="text-base-content/50 font-light">
              {searchQuery.trim()
                ? `No chats matching "${searchQuery}".`
                : "No chat history yet. Start a conversation!"}
            </p>
            {!searchQuery.trim() && (
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
          {filteredSessions.map((session) => {
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
