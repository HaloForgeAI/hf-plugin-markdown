import { useMemo } from "react";
import { useHostAI } from "@haloforge/plugin-sdk";

type AIChatState = {
  sessions: unknown[];
  activeSessionId: string | null;
  messages: unknown[];
  modelConfigs: unknown[];
  selectedModelId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  fetchSessions: () => Promise<void>;
  fetchModelConfigs: () => Promise<void>;
  createSession: <TSession = unknown>(session: TSession) => Promise<TSession>;
  getStreamState: <TStreamState = unknown>(sessionId: string) => Promise<TStreamState | null>;
  setActiveSession: () => Promise<void>;
  setSelectedModelId: (id: string | null) => void;
  sendMessage: (request: string | Record<string, unknown>) => Promise<unknown>;
  stopGeneration: () => Promise<boolean>;
};

export function useAIChatStore<T>(selector: (state: AIChatState) => T): T {
  const hostAI = useHostAI<unknown, unknown>();

  const state = useMemo<AIChatState>(() => ({
    sessions: [],
    activeSessionId: null,
    messages: [],
    modelConfigs: hostAI.models,
    selectedModelId: hostAI.selectedModelId,
    isStreaming: false,
    streamingContent: "",
    streamingReasoning: "",
    fetchSessions: async () => {},
    fetchModelConfigs: hostAI.refresh,
    createSession: hostAI.createSession,
    getStreamState: hostAI.getStreamState,
    setActiveSession: async () => {},
    setSelectedModelId: hostAI.selectModel,
    sendMessage: hostAI.sendMessage,
    stopGeneration: hostAI.stopGeneration,
  }), [
    hostAI.createSession,
    hostAI.getStreamState,
    hostAI.models,
    hostAI.refresh,
    hostAI.selectModel,
    hostAI.selectedModelId,
    hostAI.sendMessage,
    hostAI.stopGeneration,
  ]);

  return selector(state);
}
