/**
 * Chat Storage Service — Web App
 * Manages ChatSession CRUD via AppSync/DynamoDB
 */

import { generateClient } from "aws-amplify/data";
import { getCurrentUser } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>({ authMode: "userPool" });

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

async function getUserId(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user.userId;
  } catch {
    return null;
  }
}

export const chatStorage = {
  async getSessions(): Promise<ChatSession[]> {
    const userId = await getUserId();
    if (!userId) return [];

    const { data } = await client.models.ChatSession.list({
      filter: { userId: { eq: userId } },
    });

    return (data || [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        messages: parseMessages(s.messages),
        tags: (s.tags as string[] | null | undefined) ?? [],
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  },

  async getSession(id: string): Promise<ChatSession | null> {
    const { data } = await client.models.ChatSession.get({ id });
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      messages: parseMessages(data.messages),
      tags: (data.tags as string[] | null | undefined) ?? [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  },

  async createSession(name?: string): Promise<ChatSession | null> {
    const userId = await getUserId();
    if (!userId) return null;

    const now = new Date().toISOString();
    const sessions = await this.getSessions();
    const sessionName = name || `Chat ${sessions.length + 1}`;

    const welcomeMessage: ChatMessage = {
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm your AI barista assistant. Tell me about your coffee setup, what beans you have, or how you like your coffee — and I'll help you brew the perfect cup. ☕",
      timestamp: now,
    };

    const { data } = await client.models.ChatSession.create({
      userId,
      name: sessionName,
      messages: JSON.stringify([welcomeMessage]),
      tags: [],
      createdAt: now,
      updatedAt: now,
    });

    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      messages: [welcomeMessage],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  },

  async addMessage(
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const updatedMessages = [...session.messages, message];

    await client.models.ChatSession.update({
      id: sessionId,
      messages: JSON.stringify(updatedMessages),
      updatedAt: new Date().toISOString(),
    });
  },

  async updateTags(id: string, tags: string[]): Promise<void> {
    await client.models.ChatSession.update({
      id,
      tags,
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteSession(id: string): Promise<void> {
    await client.models.ChatSession.delete({ id });
  },

  async renameSession(id: string, name: string): Promise<void> {
    await client.models.ChatSession.update({
      id,
      name,
      updatedAt: new Date().toISOString(),
    });
  },
};

function parseMessages(raw: unknown): ChatMessage[] {
  try {
    if (typeof raw === "string") return JSON.parse(raw);
    if (Array.isArray(raw)) return raw as ChatMessage[];
    return [];
  } catch {
    return [];
  }
}
