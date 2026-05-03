type ThemeState = {
  currentTheme: { id: string; name: string; theme_type: "dark" | "light" };
};

const state: ThemeState = {
  currentTheme: { id: "host", name: "Host", theme_type: "dark" },
};

export function useThemeStore<T>(selector: (state: ThemeState) => T): T {
  return selector(state);
}
