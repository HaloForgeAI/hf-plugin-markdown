type AppState = {
  activeModule: string;
  setActiveModule: (module: string) => void;
  pendingMarkdownOpenPath: string | null;
  setPendingMarkdownOpenPath: (path: string | null) => void;
  clearPendingMarkdownOpenPath: () => void;
};

const state: AppState = {
  activeModule: "devkit",
  setActiveModule: () => {},
  pendingMarkdownOpenPath: null,
  setPendingMarkdownOpenPath: (path) => { state.pendingMarkdownOpenPath = path; },
  clearPendingMarkdownOpenPath: () => { state.pendingMarkdownOpenPath = null; },
};

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return selector(state);
}
