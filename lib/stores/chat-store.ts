import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  toolName?: string;
  timestamp: number;
}

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;

  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  removeStatusMessages: () => void;
  setLoading: (on: boolean) => void;
  clearMessages: () => void;
}

let nextId = 0;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: `msg-${++nextId}`, timestamp: Date.now() },
      ],
    })),

  removeStatusMessages: () =>
    set((s) => ({
      messages: s.messages.filter((m) => m.role !== "status"),
    })),

  setLoading: (on) => set({ isLoading: on }),

  clearMessages: () => set({ messages: [] }),
}));
