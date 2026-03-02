import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  chatStorage,
  type ChatMessage,
  type ChatSession,
} from "../services/chatStorage";
import { chatWithGemini } from "../services/gemini";

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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load session
  useEffect(() => {
    loadSession();
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

  async function loadSession() {
    if (sessionId) {
      const s = await chatStorage.getSession(sessionId);
      if (s) {
        setSession(s);
        setMessages(s.messages);
        return;
      }
    }
    // No session ID or not found — create new
    const newSession = await chatStorage.createSession();
    if (newSession) {
      setSession(newSession);
      setMessages(newSession.messages);
      navigate(`/chat/${newSession.id}`, { replace: true });
    }
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
              onClick={() => switchSession(s.id)}
            >
              <span className="flex-1 truncate text-sm">{s.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs text-error"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-base-200 bg-base-100">
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
          <h2 className="font-medium truncate flex-1">{session?.name || "Chat"}</h2>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`
                    max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                    ${
                      msg.role === "user"
                        ? "bg-primary text-primary-content rounded-br-sm"
                        : "bg-base-200 text-base-content rounded-bl-sm"
                    }
                  `}
                >
                  {msg.role === "assistant" ? (
                    <FormattedMessage content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

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
    </div>
  );
}
