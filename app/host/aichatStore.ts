import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

type HostAIChatSnapshot = {
  modelConfigs?: unknown[];
  selectedModelId?: string | null;
};

type HostBridge = {
  aichat?: {
    fetchModelConfigs?: () => Promise<void>;
    getSnapshot?: () => HostAIChatSnapshot;
    setSelectedModelId?: (id: string | null) => void;
  };
};

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
  createSession: () => Promise<null>;
  setActiveSession: () => Promise<void>;
  setSelectedModelId: (id: string | null) => void;
  sendMessage: (content: string) => Promise<unknown>;
  stopGeneration: () => Promise<unknown>;
};

const listeners = new Set<() => void>();
let syncTimer: number | null = null;

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
  fetchModelConfigs: async () => {
    await getHostBridge().aichat?.fetchModelConfigs?.();
    syncFromHost();
  },
  createSession: async () => null,
  setActiveSession: async () => {},
  setSelectedModelId: (id) => {
    getHostBridge().aichat?.setSelectedModelId?.(id);
    state.selectedModelId = id;
    emitChange();
  },
  sendMessage: async (content: string) => invoke("aichat_send_message", { request: { content } }),
  stopGeneration: async () => invoke("aichat_stop_generation"),
};

function getHostBridge(): HostBridge {
  return (window as typeof window & { __HF_HOST?: HostBridge }).__HF_HOST ?? {};
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function syncFromHost() {
  const snapshot = getHostBridge().aichat?.getSnapshot?.();
  if (!snapshot) {
    return;
  }

  let changed = false;
  if (Array.isArray(snapshot.modelConfigs) && snapshot.modelConfigs !== state.modelConfigs) {
    state.modelConfigs = snapshot.modelConfigs;
    changed = true;
  }
  if ((typeof snapshot.selectedModelId === "string" || snapshot.selectedModelId === null)
    && snapshot.selectedModelId !== state.selectedModelId) {
    state.selectedModelId = snapshot.selectedModelId ?? null;
    changed = true;
  }

  if (changed) {
    emitChange();
  }
}

function startSyncTimer() {
  if (syncTimer !== null) {
    return;
  }
  syncTimer = window.setInterval(syncFromHost, 300);
}

function stopSyncTimer() {
  if (syncTimer === null || listeners.size > 0) {
    return;
  }
  window.clearInterval(syncTimer);
  syncTimer = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  syncFromHost();
  startSyncTimer();
  return () => {
    listeners.delete(listener);
    stopSyncTimer();
  };
}

function getSnapshot() {
  syncFromHost();
  return state;
}

export function useAIChatStore<T>(selector: (state: AIChatState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(state));
}
