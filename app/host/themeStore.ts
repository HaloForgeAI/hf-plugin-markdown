import { useMemo } from "react";
import { useHostTheme } from "@haloforge/plugin-sdk";

type ThemeState = {
  currentTheme: { id: string; name: string; theme_type: "dark" | "light" };
};

export function useThemeStore<T>(selector: (state: ThemeState) => T): T {
  const { theme } = useHostTheme();
  const state = useMemo<ThemeState>(() => ({
    currentTheme: {
      id: theme.id,
      name: theme.name,
      theme_type: theme.type,
    },
  }), [theme.id, theme.name, theme.type]);

  return selector(state);
}
