import { useSyncExternalStore } from "react";

type HostAppSnapshot = {
  activeModule?: string;
  activeSettingsTab?: string | null;
  pendingMarkdownOpenPath?: string | null;
};

type HostBridge = {
  app?: {
    getSnapshot?: () => HostAppSnapshot;
    setActiveModule?: (module: string) => void;
    openSettingsTab?: (tab: string) => void;
    setPendingMarkdownOpenPath?: (path: string | null) => void;
    clearPendingMarkdownOpenPath?: () => void;
  };
};

type AppState = {
  activeModule: string;
  activeSettingsTab: string | null;
  setActiveModule: (module: string) => void;
  openSettingsTab: (tab: string) => void;
  pendingMarkdownOpenPath: string | null;
  setPendingMarkdownOpenPath: (path: string | null) => void;
  clearPendingMarkdownOpenPath: () => void;
};

const listeners = new Set<() => void>();
let syncTimer: number | null = null;

const state: AppState = {
  activeModule: "devkit",
  activeSettingsTab: null,
  setActiveModule: (module) => {
    getHostBridge().app?.setActiveModule?.(module);
    state.activeModule = module;
    emitChange();
  },
  openSettingsTab: (tab) => {
    const hostApp = getHostBridge().app;
    if (hostApp?.openSettingsTab) {
      hostApp.openSettingsTab(tab);
    } else {
      hostApp?.setActiveModule?.("settings");
    }
    state.activeModule = "settings";
    state.activeSettingsTab = tab;
    emitChange();
  },
  pendingMarkdownOpenPath: null,
  setPendingMarkdownOpenPath: (path) => {
    getHostBridge().app?.setPendingMarkdownOpenPath?.(path);
    state.pendingMarkdownOpenPath = path;
    emitChange();
  },
  clearPendingMarkdownOpenPath: () => {
    getHostBridge().app?.clearPendingMarkdownOpenPath?.();
    state.pendingMarkdownOpenPath = null;
    emitChange();
  },
};

function getHostBridge(): HostBridge {
  return (window as typeof window & { __HF_HOST?: HostBridge }).__HF_HOST ?? {};
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function syncFromHost() {
  const snapshot = getHostBridge().app?.getSnapshot?.();
  if (!snapshot) {
    return;
  }

  let changed = false;
  if (typeof snapshot.activeModule === "string" && snapshot.activeModule !== state.activeModule) {
    state.activeModule = snapshot.activeModule;
    changed = true;
  }
  if (typeof snapshot.activeSettingsTab === "string" || snapshot.activeSettingsTab === null) {
    if (snapshot.activeSettingsTab !== state.activeSettingsTab) {
      state.activeSettingsTab = snapshot.activeSettingsTab ?? null;
      changed = true;
    }
  }
  if (snapshot.pendingMarkdownOpenPath !== undefined && snapshot.pendingMarkdownOpenPath !== state.pendingMarkdownOpenPath) {
    state.pendingMarkdownOpenPath = snapshot.pendingMarkdownOpenPath ?? null;
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

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(state));
}
