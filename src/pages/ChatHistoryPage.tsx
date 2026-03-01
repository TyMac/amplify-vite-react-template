import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>({ authMode: "userPool" });

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function ChatHistoryPage() {
  const [sessions, setSessions] = useState<
    Array<Schema["ChatSession"]["type"]>
  >([]);
  const [selectedSession, setSelectedSession] =
    useState<Schema["ChatSession"]["type"] | null>(null);

  useEffect(() => {
    const subscription = client.models.ChatSession.observeQuery().subscribe({
      next: (data) => {
        const sorted = [...data.items].sort((a, b) => {
          const dateA = new Date(a.updatedAt || 0).getTime();
          const dateB = new Date(b.updatedAt || 0).getTime();
          return dateB - dateA;
        });
        setSessions(sorted);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  };

  const getMessages = (
    session: Schema["ChatSession"]["type"]
  ): ChatMessage[] => {
    try {
      if (typeof session.messages === "string") {
        return JSON.parse(session.messages);
      }
      return session.messages as unknown as ChatMessage[];
    } catch {
      return [];
    }
  };

  // Chat detail view
  if (selectedSession) {
    const messages = getMessages(selectedSession);
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
            <h2 className="card-title text-lg font-semibold text-base-content mb-4">
              {selectedSession.name}
            </h2>

            <div className="flex flex-col gap-3">
              {messages.map((msg, idx) => (
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
      <h1 className="text-2xl font-light tracking-wide text-base-content mb-6">
        Chat History
      </h1>

      {sessions.length === 0 ? (
        <div className="card bg-base-100">
          <div className="card-body items-center text-center py-12">
            <span className="text-4xl mb-3">💬</span>
            <p className="text-base-content/50 font-light">
              No chat history yet. Start a conversation in the app!
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const messages = getMessages(session);
            const lastMessage = messages[messages.length - 1];
            return (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className="card bg-base-100 shadow-sm hover:shadow-md border border-base-200 cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99]"
              >
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base-content truncate">
                        {session.name}
                      </h3>
                      {lastMessage && (
                        <p className="text-sm text-base-content/50 truncate mt-1">
                          {lastMessage.content}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-base-content/40 whitespace-nowrap">
                      {formatDate(session.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="badge badge-ghost badge-sm">
                      {messages.length} messages
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ChatHistoryPage;
