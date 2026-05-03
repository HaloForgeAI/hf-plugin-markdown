import { useCallback, useEffect, useRef, useState } from "react";

interface UseSidebarResizeOptions {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey?: string;
  /** "right" = handle sits on the right edge (left sidebar); "left" = left edge (right sidebar) */
  direction?: "right" | "left";
}

function loadStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function useSidebarResize({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  direction = "right",
}: UseSidebarResizeOptions) {
  const [width, setWidth] = useState(() =>
    storageKey ? loadStoredWidth(storageKey, defaultWidth) : defaultWidth,
  );
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const latestWidthRef = useRef(width);

  useEffect(() => {
    latestWidthRef.current = width;
  }, [width]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = latestWidthRef.current;
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta =
        direction === "right"
          ? e.clientX - startXRef.current
          : startXRef.current - e.clientX;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidth(next);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(latestWidthRef.current));
        } catch {
          // ignore
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, direction, maxWidth, minWidth, storageKey]);

  return { width, isResizing, handleMouseDown };
}
