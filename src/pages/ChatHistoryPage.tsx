import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>({ authMode: "userPool" });

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function ChatHistoryPage() {
  const [sessions, setSessions] = useState<Array<Schema["ChatSession"]["type"]>>([]);
  const [selectedSession, setSelectedSession] = useState<Schema["ChatSession"]["type"] | null>(null);

  useEffect(() => {
    const subscription = client.models.ChatSession.observeQuery().subscribe({
      next: (data) => {
        // Sort by updatedAt descending
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

  const getMessages = (session: Schema["ChatSession"]["type"]): ChatMessage[] => {
    try {
      if (typeof session.messages === 'string') {
        return JSON.parse(session.messages);
      }
      return session.messages as unknown as ChatMessage[];
    } catch (e) {
      console.error("Failed to parse messages", e);
      return [];
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Chat History</h1>
      
      {selectedSession ? (
        <div>
          <button onClick={() => setSelectedSession(null)} style={{ marginBottom: "20px" }}>
            &larr; Back to list
          </button>
          <div style={{ border: "1px solid #ccc", borderRadius: "8px", padding: "20px" }}>
            <h2>{selectedSession.name}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {getMessages(selectedSession).map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  style={{
                    alignSelf: msg.role === 'user' ? "flex-end" : "flex-start",
                    backgroundColor: msg.role === 'user' ? "#007bff" : "#f0f0f0",
                    color: msg.role === 'user' ? "white" : "black",
                    padding: "10px 15px",
                    borderRadius: "15px",
                    maxWidth: "70%",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  <strong>{msg.role === 'user' ? "You" : "AI Barista"}</strong>
                  <div style={{ marginTop: "5px" }}>{msg.content}</div>
                  <div style={{ fontSize: "0.8em", opacity: 0.7, marginTop: "5px", textAlign: "right" }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {sessions.length === 0 ? (
            <p>No chat history found.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session)}
                style={{
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: "#fff",
                  transition: "background-color 0.2s"
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f9f9f9")}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
              >
                <div style={{ fontWeight: "bold", marginBottom: "5px" }}>{session.name}</div>
                <div style={{ fontSize: "0.9em", color: "#666" }}>
                  Last updated: {formatDate(session.updatedAt)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ChatHistoryPage;
