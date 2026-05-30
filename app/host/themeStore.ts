import { useEffect, useMemo, useState } from "react";
import { useHostTheme } from "@haloforge/plugin-sdk";

type ThemeState = {
  currentTheme: { id: string; name: string; theme_type: "dark" | "light" };
};

export function useThemeStore<T>(selector: (state: ThemeState) => T): T {
  const { theme } = useHostTheme();
  const domThemeType = useDomThemeType();
  const state = useMemo<ThemeState>(() => ({
    currentTheme: {
      id: theme.id,
      name: theme.name,
      theme_type: domThemeType ?? theme.type,
    },
  }), [domThemeType, theme.id, theme.name, theme.type]);

  return selector(state);
}

function readDomThemeType(): "dark" | "light" | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute("data-theme");
  return value === "dark" || value === "light" ? value : null;
}

function useDomThemeType() {
  const [themeType, setThemeType] = useState<"dark" | "light" | null>(() => readDomThemeType());

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setThemeType(readDomThemeType());
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return themeType;
}
