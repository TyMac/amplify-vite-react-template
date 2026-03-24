import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getUrl, remove } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import {
  chatStorage,
  type ChatMessage,
  type ChatSession,
} from "../services/chatStorage";
import { chatWithGemini } from "../services/gemini";
import { TagChip, TagEditor } from "../components/tags";

const client = generateClient<Schema>();

/** Render basic markdown: **bold**, bullet lines, headings */
function FormattedMessage({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line, i) => {
        // Heading
        const h = line.match(/^##\s+(.+)$/);
        if (h) {
          return (
            <p key={i} className="font-semibold text-primary mt-2 mb-1">
              {renderInline(h[1])}
            </p>
          );
        }
        // Bullet
        const b = line.match(/^[\s]*[•\-\*]\s+(.+)$/);
        if (b) {
          return (
            <p key={i} className="pl-4 before:content-['•'] before:mr-2 before:text-primary">
              {renderInline(b[1])}
            </p>
          );
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-2" />;
        // Normal
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.map((p, i) =>
    p.bold ? (
      <strong key={i} className="font-semibold">
        {p.text}
      </strong>
    ) : (
      <span key={i}>{p.text}</span>
    )
  );
}

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Cache of resolved S3 presigned URLs: messageId → url
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Journal linking state
  const [linkedJournalEntry, setLinkedJournalEntry] = useState<Schema["BrewJournal"]["type"] | null>(null);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [journalEntries, setJournalEntries] = useState<Schema["BrewJournal"]["type"][]>([]);
  const [journalSearchQuery, setJournalSearchQuery] = useState("");
  const [pinningToEntry, setPinningToEntry] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Load session
  // Load session list on mount
  useEffect(() => {
    loadSessionList();
  }, []);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  // Check if this chat is linked to any journal entry
  useEffect(() => {
    if (sessionId) {
      checkJournalLink(sessionId);
    }
  }, [sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Resolve S3 presigned URLs for messages with imageKey
  useEffect(() => {
    const unresolved = messages.filter((m) => m.imageKey && !imageUrls[m.id]);
    if (unresolved.length === 0) return;
    (async () => {
      const resolved: Record<string, string> = {};
      for (const msg of unresolved) {
        try {
          const { url } = await getUrl({
            path: msg.imageKey!,
            options: { expiresIn: 3600, validateObjectExistence: false },
          });
          resolved[msg.id] = url.toString();
        } catch (err) {
          console.warn("Failed to resolve image URL for", msg.id, err);
        }
      }
      if (Object.keys(resolved).length > 0) {
        setImageUrls((prev) => ({ ...prev, ...resolved }));
      }
    })();
  }, [messages]);

  const LAST_SESSION_KEY = "barista_last_session_id";

  function rememberSession(id: string) {
    localStorage.setItem(LAST_SESSION_KEY, id);
  }

  async function checkJournalLink(chatId: string) {
    try {
      const { data } = await client.models.BrewJournal.list();
      const linkedEntry = (data ?? []).find((entry) =>
        (entry.chatSessionIds ?? []).includes(chatId)
      );
      setLinkedJournalEntry(linkedEntry ?? null);
    } catch (err) {
      console.error("Failed to check journal link:", err);
    }
  }

  async function loadJournalEntries() {
    try {
      const { data } = await client.models.BrewJournal.list();
      const sorted = [...(data ?? [])].sort((a, b) => {
        const dateA = a.brewDate ? new Date(a.brewDate).getTime() : 0;
        const dateB = b.brewDate ? new Date(b.brewDate).getTime() : 0;
        return dateB - dateA;
      });
      setJournalEntries(sorted);
    } catch (err) {
      console.error("Failed to load journal entries:", err);
    }
  }

  async function pinToExistingEntry(entryId: string) {
    if (!sessionId) return;
    setPinningToEntry(true);
    try {
      const entry = journalEntries.find((e) => e.id === entryId);
      if (!entry) return;

      const currentIds = (entry.chatSessionIds ?? []).filter((id): id is string => id !== null);
      if (currentIds.includes(sessionId)) {
        setLinkedJournalEntry(entry);
        setShowJournalModal(false);
        return;
      }

      await client.models.BrewJournal.update({
        id: entryId,
        chatSessionIds: [...currentIds, sessionId],
      });

      // Refresh the linked state
      await checkJournalLink(sessionId);
      setShowJournalModal(false);
    } catch (err) {
      console.error("Failed to pin to entry:", err);
    } finally {
      setPinningToEntry(false);
    }
  }

  function handleJournalButtonClick() {
    if (linkedJournalEntry) {
      navigate(`/journal`);
    } else {
      loadJournalEntries();
      setShowJournalModal(true);
    }
  }

  function handleNewJournalEntry() {
    if (sessionId) {
      navigate(`/journal/new?chatId=${sessionId}`);
    }
  }

  const filteredJournalEntries = journalSearchQuery.trim()
    ? journalEntries.filter((e) =>
        e.coffeeName.toLowerCase().includes(journalSearchQuery.toLowerCase()) ||
        (e.roaster?.toLowerCase().includes(journalSearchQuery.toLowerCase()) ?? false)
      )
    : journalEntries.slice(0, 10);

  async function loadSession() {
    if (sessionId) {
      const s = await chatStorage.getSession(sessionId);
      if (s) {
        rememberSession(s.id);
        setSession(s);
        setMessages(s.messages);
        setTags(s.tags ?? []);
        return;
      }
    }

    // No session ID (bare /chat) — try to resume last known session
    const lastId = localStorage.getItem(LAST_SESSION_KEY);
    if (lastId) {
      const s = await chatStorage.getSession(lastId);
      if (s) {
        setSession(s);
        setMessages(s.messages);
        setTags(s.tags ?? []);
        navigate(`/chat/${s.id}`, { replace: true });
        return;
      }
    }

    // No localStorage hit — fall back to most recently updated session in DynamoDB
    const sessions = await chatStorage.getSessions();
    if (sessions.length > 0) {
      const latest = sessions[0];
      rememberSession(latest.id);
      setSession(latest);
      setMessages(latest.messages);
      setTags(latest.tags ?? []);
      navigate(`/chat/${latest.id}`, { replace: true });
      return;
    }

    // No sessions exist yet — create the first one
    const newSession = await chatStorage.createSession();
    if (newSession) {
      rememberSession(newSession.id);
      setSession(newSession);
      setMessages(newSession.messages);
      setTags(newSession.tags ?? []);
      navigate(`/chat/${newSession.id}`, { replace: true });
    }
  }

  async function handleTagsChange(newTags: string[]) {
    if (!session) return;
    setTags(newTags);
    await chatStorage.updateTags(session.id, newTags);
    setSessionList((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, tags: newTags } : s))
    );
  }

  async function loadSessionList() {
    const list = await chatStorage.getSessions();
    setSessionList(list);
  }

  async function createNewChat() {
    const newSession = await chatStorage.createSession();
    if (newSession) {
      setSession(newSession);
      setMessages(newSession.messages);
      setShowSidebar(false);
      navigate(`/chat/${newSession.id}`);
      await loadSessionList();
    }
  }

  async function switchSession(id: string) {
    const s = await chatStorage.getSession(id);
    if (s) {
      rememberSession(s.id);
      setSession(s);
      setMessages(s.messages);
      setShowSidebar(false);
      navigate(`/chat/${s.id}`);
    }
  }

  async function deleteChat(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await chatStorage.deleteSession(id);
    if (session?.id === id) {
      await createNewChat();
    }
    await loadSessionList();
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
    // Update local state
    if (session?.id === renamingId) {
      setSession({ ...session, name: renameText.trim() });
    }
    setSessionList((prev) =>
      prev.map((s) => (s.id === renamingId ? { ...s, name: renameText.trim() } : s))
    );
    setRenamingId(null);
  }

  async function sendMessage() {
    if (!input.trim() || loading || !session) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Save user message
    await chatStorage.addMessage(session.id, userMsg);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await chatWithGemini(allMessages);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await chatStorage.addMessage(session.id, assistantMsg);
    } catch (err) {
      console.error("Gemini error:", err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I'm having trouble connecting right now. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      await chatStorage.addMessage(session.id, errorMsg);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function copyMessage(msg: ChatMessage) {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function deleteImage(msg: ChatMessage) {
    if (!session) return;
    if (!confirm("Delete this image? This cannot be undone.")) return;
    try {
      // Remove from S3
      if (msg.imageKey) {
        await remove({ path: msg.imageKey });
      }
      // Remove imageKey from the message in the session; clear placeholder content
      const updatedMessages = messages.map((m) => {
        if (m.id !== msg.id) return m;
        const updated = { ...m, imageKey: undefined };
        if (updated.content === "📷 Image") updated.content = "[Image deleted]";
        return updated;
      });
      setMessages(updatedMessages);
      // Persist to DynamoDB
      await client.models.ChatSession.update({
        id: session.id,
        messages: JSON.stringify(updatedMessages),
      });
      // Clear the resolved URL from cache
      setImageUrls((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    } catch (err) {
      console.error("Failed to delete image", err);
      alert("Failed to delete image. Please try again.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar overlay (mobile) */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-72 bg-base-100 border-r border-base-200
          flex flex-col
          transition-transform lg:translate-x-0
          ${showSidebar ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="p-3 border-b border-base-200">
          <button onClick={createNewChat} className="btn btn-primary btn-sm w-full gap-2">
            <span className="text-lg">+</span> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sessionList.map((s) => (
            <div
              key={s.id}
              className={`
                group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1
                ${s.id === session?.id ? "bg-primary/10 text-primary" : "hover:bg-base-200"}
              `}
              onClick={() => renamingId !== s.id && switchSession(s.id)}
            >
              {renamingId === s.id ? (
                <input
                  ref={renameInputRef}
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="input input-xs input-bordered flex-1 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate text-sm">{s.name}</span>
              )}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                {renamingId !== s.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(s);
                    }}
                    className="btn btn-ghost btn-xs"
                    title="Rename"
                  >
                    ✎
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(s.id);
                  }}
                  className="btn btn-ghost btn-xs text-error"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="px-4 py-2 border-b border-base-200 bg-base-100">
          {/* Row 1: sidebar toggle + title + journal button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadSessionList();
                setShowSidebar(true);
              }}
              className="btn btn-ghost btn-sm btn-circle lg:hidden"
            >
              ☰
            </button>
            <button
              onClick={() => {
                loadSessionList();
                setShowSidebar((v) => !v);
              }}
              className="btn btn-ghost btn-sm btn-circle hidden lg:flex"
            >
              ☰
            </button>
            <h2
              className="font-medium truncate flex-1 cursor-pointer hover:text-primary transition-colors"
              onClick={() => session && startRename(session)}
              title="Click to rename"
            >
              {session?.name || "Chat"}
            </h2>
            {/* Journal button */}
            <button
              onClick={handleJournalButtonClick}
              className={`btn btn-sm gap-1 ${
                linkedJournalEntry ? "btn-success" : "btn-ghost"
              }`}
            >
              <span>📔</span>
              <span className="hidden sm:inline">
                {linkedJournalEntry ? "Journaled" : "Journal"}
              </span>
            </button>
          </div>

          {/* Row 2: tags + add button */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                onRemove={() => handleTagsChange(tags.filter((t) => t !== tag))}
              />
            ))}
            <button
              onClick={() => setShowTagEditor((v) => !v)}
              className="btn btn-ghost btn-xs gap-1 text-base-content/40 hover:text-base-content"
              title={showTagEditor ? "Close tag editor" : "Add tags"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 0 0 3 5.5v2.879a2.5 2.5 0 0 0 .732 1.767l6.5 6.5a2.5 2.5 0 0 0 3.536 0l2.878-2.878a2.5 2.5 0 0 0 0-3.536l-6.5-6.5A2.5 2.5 0 0 0 8.38 3H5.5ZM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              {tags.length === 0 ? "Add tags" : showTagEditor ? "Done" : "Edit"}
            </button>
          </div>

          {/* Tag editor panel */}
          {showTagEditor && (
            <div className="mt-2 pb-1">
              <TagEditor tags={tags} onChange={handleTagsChange} />
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {messages.map((msg) => {
              const timeLabel = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const isUser = msg.role === "user";
              return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}
              >
                <div className="relative group max-w-[85%]">
                  <div
                    className={`
                      rounded-2xl px-4 py-3 text-sm leading-relaxed
                      ${
                        isUser
                          ? "bg-primary text-primary-content rounded-br-sm"
                          : "bg-base-200 text-base-content rounded-bl-sm"
                      }
                    `}
                  >
                    {msg.imageKey && (
                      imageUrls[msg.id] ? (
                        <div className="relative group/img mb-2 inline-block">
                          <img
                            src={imageUrls[msg.id]}
                            alt="Chat attachment"
                            className="rounded-lg max-w-full"
                            style={{ maxHeight: 240, objectFit: "cover" }}
                          />
                          {isUser && (
                            <button
                              onClick={() => deleteImage(msg)}
                              className="absolute top-1.5 right-1.5 btn btn-xs btn-circle bg-black/60 border-0 text-white opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-red-600"
                              title="Delete image"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg mb-2 bg-base-300 flex items-center justify-center text-xs text-base-content/40"
                          style={{ width: 220, height: 165 }}>
                          Loading image...
                        </div>
                      )
                    )}
                    {msg.role === "assistant" ? (
                      <FormattedMessage content={msg.content} />
                    ) : (
                      !msg.imageKey || msg.content !== "📷 Image"
                        ? <p className="whitespace-pre-wrap">{msg.content}</p>
                        : null
                    )}
                  </div>
                  <button
                    onClick={() => copyMessage(msg)}
                    className={`
                      absolute top-1 right-1
                      opacity-0 group-hover:opacity-100
                      transition-opacity
                      btn btn-ghost btn-xs btn-circle
                      ${msg.role === "user" ? "text-primary-content/60 hover:text-primary-content" : "text-base-content/40 hover:text-base-content"}
                    `}
                    title="Copy"
                  >
                    {copiedId === msg.id ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                        <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
                      </svg>
                    )}
                  </button>
                </div>
                <span className="text-xs text-base-content/40 px-1">
                  {timeLabel}
                </span>
              </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-base-200 rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="loading loading-dots loading-sm text-primary"></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-base-200 bg-base-100 p-3">
          <div className="max-w-2xl mx-auto flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your coffee..."
              rows={1}
              className="textarea textarea-bordered flex-1 resize-none text-sm min-h-[2.5rem] max-h-[7.5rem] leading-snug"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="btn btn-primary btn-circle btn-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-base-content/30 mt-2">
            Shift+Enter for new line · Powered by Gemini
          </p>
        </div>
      </div>

      {/* Rename modal (for header click rename) */}
      {renamingId === session?.id && !showSidebar && (
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

      {/* Journal linking modal */}
      {showJournalModal && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Link to Journal</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Connect this chat to a journal entry
            </p>

            <div className="flex flex-col gap-3">
              {/* New entry option */}
              <button
                onClick={handleNewJournalEntry}
                className="btn btn-primary w-full gap-2"
              >
                <span>+</span>
                New Journal Entry
              </button>

              <div className="divider text-xs text-base-content/40">OR</div>

              {/* Pin to existing */}
              <div>
                <p className="text-sm font-medium mb-2">Pin to Existing Entry</p>
                <input
                  type="text"
                  value={journalSearchQuery}
                  onChange={(e) => setJournalSearchQuery(e.target.value)}
                  className="input input-bordered input-sm w-full mb-2"
                  placeholder="Search entries..."
                />
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {filteredJournalEntries.length === 0 ? (
                    <p className="text-xs text-base-content/40 text-center py-4">
                      No journal entries found
                    </p>
                  ) : (
                    filteredJournalEntries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => pinToExistingEntry(entry.id)}
                        disabled={pinningToEntry}
                        className="flex items-center justify-between p-2 rounded-lg border border-base-200 hover:border-primary/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.coffeeName}</p>
                          <p className="text-xs text-base-content/50">
                            {entry.brewDate ? new Date(entry.brewDate).toLocaleDateString() : "No date"}
                            {entry.roaster && ` · ${entry.roaster}`}
                          </p>
                        </div>
                        {pinningToEntry ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <span className="text-xs text-base-content/40">Pin</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowJournalModal(false)}>
                Cancel
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowJournalModal(false)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
