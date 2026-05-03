import { invoke } from "@tauri-apps/api/core";

type AIChatState = Record<string, unknown>;

const state: AIChatState = {
  sessions: [],
  activeSessionId: null,
  messages: [],
  modelConfigs: [],
  selectedModelId: null,
  isStreaming: false,
  streamingContent: "",
  streamingReasoning: "",
  fetchSessions: async () => {},
  fetchModelConfigs: async () => {},
  createSession: async () => null,
  setActiveSession: async () => {},
  sendMessage: async (content: string) => invoke("aichat_send_message", { request: { content } }),
  stopGeneration: async () => invoke("aichat_stop_generation"),
};

export function useAIChatStore<T>(selector: (state: AIChatState) => T): T {
  return selector(state);
}
