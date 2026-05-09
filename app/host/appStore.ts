import { useMemo } from "react";
import {
  type HostFileIntent,
  useHostFileIntent,
  useHostNavigation,
} from "@haloforge/plugin-sdk";

type AppState = {
  activeModule: string;
  activeSettingsTab: string | null;
  setActiveModule: (module: string) => void;
  openSettingsTab: (tab: string) => void;
  pendingMarkdownOpenPath: string | null;
  setPendingMarkdownOpenPath: (path: string | null) => void;
  clearPendingMarkdownOpenPath: () => void;
};

function toMarkdownIntent(path: string): HostFileIntent {
  return {
    kind: "open",
    path,
    source: "dev.haloforge.markdown",
  };
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const navigation = useHostNavigation();
  const fileIntent = useHostFileIntent();

  const state = useMemo<AppState>(() => ({
    activeModule: navigation.activeModule,
    activeSettingsTab: navigation.activeSettingsTab,
    setActiveModule: navigation.navigateToModule,
    openSettingsTab: navigation.openSettingsTab,
    pendingMarkdownOpenPath: fileIntent.intent?.path ?? null,
    setPendingMarkdownOpenPath: (path) => {
      fileIntent.setIntent(path ? toMarkdownIntent(path) : null);
    },
    clearPendingMarkdownOpenPath: fileIntent.consume,
  }), [
    fileIntent.consume,
    fileIntent.intent,
    fileIntent.setIntent,
    navigation.activeModule,
    navigation.activeSettingsTab,
    navigation.navigateToModule,
    navigation.openSettingsTab,
  ]);

  return selector(state);
}
