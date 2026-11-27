import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { clearPendingPluginDeepLink, usePluginDeepLink, usePluginWindowTitle } from "@haloforge/plugin-sdk";
import clsx from "clsx";
import { useSidebarResize } from "./host/useSidebarResize";
import { RefreshCw } from "lucide-react";
import { MarkdownRenderer } from "./host/MarkdownRenderer";
import { useAppStore } from "./host/appStore";
import { useThemeStore } from "./host/themeStore";
import { getParentDirectory, pickFile, saveFile } from "./host/devkitDialogs";
import { MarkdownEditorSurface, type MarkdownEditorSurfaceHandle } from "./MarkdownEditorSurface";
import { MarkdownSourceSurface } from "./MarkdownSourceSurface";
import { useMarkdownT } from "./i18n";
import { MarkdownHeader } from "./markdown/MarkdownHeader";
import { ReaderSidebar } from "./markdown/ReaderSidebar";
import { FindBar } from "./markdown/FindBar";
import { ImageLightbox } from "./markdown/ImageLightbox";
import { useDocumentRefresh } from "./markdown/useDocumentRefresh";
import { applyFindHighlights, clearFindHighlights, computeMatchRanges, findApiSupported, scrollRangeIntoView } from "./markdown/findHighlight";
import type {
  MarkdownDocument,
  RecentMarkdownFile,
  SaveDocumentResult,
  WorkspaceMode,
} from "./markdown/types";
import {
  DEFAULT_MARKDOWN_FONT_SCALE,
  createUntitledDocument,
  deriveDocumentFromContent,
  formatMarkdownFontScale,
  isUntitledPath,
  getDroppedMarkdownPath,
  LAST_FILE_STORAGE_KEY,
  LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  loadMarkdownFontScale,
  loadCollapsedState,
  loadJsonStorage,
  loadWorkspaceMode,
  MARKDOWN_FILTERS,
  MARKDOWN_FONT_SCALE_STORAGE_KEY,
  MARKDOWN_WHEEL_ZOOM_STEP,
  markdownInvoke,
  normalizeMarkdownFontScale,
  rememberLastFile,
  saveJsonStorage,
  stepMarkdownFontScale,
  translateDocumentError,
  WORKSPACE_MODE_STORAGE_KEY,
} from "./markdown/utils";

export function MarkdownPanel() {
  const t = useMarkdownT();
  const activeModule = useAppStore((s) => s.activeModule);
  const pendingMarkdownOpenPath = useAppStore((s) => s.pendingMarkdownOpenPath);
  const clearPendingMarkdownOpenPath = useAppStore((s) => s.clearPendingMarkdownOpenPath);
  const currentThemeType = useThemeStore((s) => s.currentTheme.theme_type);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const editorSurfaceRef = useRef<MarkdownEditorSurfaceHandle | null>(null);
  const initialRestoreAttemptedRef = useRef(false);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const suppressActiveHeadingUntilRef = useRef(0);
  const zoomToastTimerRef = useRef<number | null>(null);

  const [recentFiles, setRecentFiles] = useState<RecentMarkdownFile[]>([]);
  const [document, setDocument] = useState<MarkdownDocument | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(loadWorkspaceMode());
  const [fontScale, setFontScale] = useState(loadMarkdownFontScale());
  const fontScaleRef = useRef(fontScale);
  const [zoomToastVisible, setZoomToastVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    { kind: "open"; path: string } | { kind: "createUntitled" } | null
  >(null);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(loadCollapsedState(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY));
  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number | null>(null);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState(0);
  const [findIndex, setFindIndex] = useState(0);
  const findRangesRef = useRef<Range[]>([]);
  const findIndexRef = useRef(0);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);

  const isUntitled = document ? isUntitledPath(document.path) : false;
  // Guard semantics: an untitled buffer is "dirty" only once it has content,
  // so switching away from an empty scratch doc never nags about losing work.
  const isDirty = Boolean(
    document && (
      isUntitled
        ? document.content.trim().length > 0
        : (savedContent !== null && document.content !== savedContent)
    ),
  );
  // Save semantics: an untitled buffer can always be saved (first save becomes
  // a Save As), even while empty.
  const canSave = Boolean(document) && (isUntitled || isDirty);
  const isActiveModule = activeModule === "markdown";
  const windowTitle = document?.name?.trim() || null;
  const fontScaleLabel = formatMarkdownFontScale(fontScale);

  const flashZoomToast = useCallback(() => {
    setZoomToastVisible(true);
    if (zoomToastTimerRef.current !== null) {
      window.clearTimeout(zoomToastTimerRef.current);
    }
    zoomToastTimerRef.current = window.setTimeout(() => {
      zoomToastTimerRef.current = null;
      setZoomToastVisible(false);
    }, 950);
  }, []);

  useEffect(() => {
    return () => {
      if (zoomToastTimerRef.current !== null) {
        window.clearTimeout(zoomToastTimerRef.current);
      }
    };
  }, []);

  const applyRefreshedDocument = useCallback((refreshedDocument: MarkdownDocument) => {
    setDocument(refreshedDocument);
    setSavedContent(refreshedDocument.content);
    setAssetRevision((previous) => previous + 1);
  }, []);

  const handleRefreshError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setDocumentError(translateDocumentError(message, t, t("markdown.reader.refreshFailed")));
  }, [t]);

  const {
    canRefresh,
    refreshing: refreshingDocument,
    refreshNow,
  } = useDocumentRefresh({
    document,
    active: isActiveModule,
    dirty: isDirty,
    busy: loadingDocument || savingDocument,
    onRefresh: applyRefreshedDocument,
    onError: handleRefreshError,
  });

  usePluginWindowTitle(windowTitle, { subtitle: "Markdown" });

  const { width: leftWidth, isResizing: leftResizing, handleMouseDown: handleLeftResize } = useSidebarResize({
    defaultWidth: 280, minWidth: 200, maxWidth: 480,
    storageKey: "hf-md-left-sidebar-width", direction: "right",
  });

  useEffect(() => {
    saveJsonStorage(WORKSPACE_MODE_STORAGE_KEY, workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    fontScaleRef.current = fontScale;
    saveJsonStorage(MARKDOWN_FONT_SCALE_STORAGE_KEY, fontScale);
  }, [fontScale]);

  useEffect(() => {
    saveJsonStorage(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY, isLeftSidebarCollapsed);
  }, [isLeftSidebarCollapsed]);

  const loadRecentFiles = useCallback(async (options?: { preserveOrder?: boolean }) => {
    const result = await markdownInvoke<{ files: RecentMarkdownFile[] }>("md_recent_files");
    if (options?.preserveOrder) {
      setRecentFiles((previous) => {
        const incomingById = new Map(result.files.map((file) => [file.id, file] as const));
        const previousIds = new Set(previous.map((file) => file.id));
        const kept = previous
          .map((file) => incomingById.get(file.id))
          .filter((file): file is RecentMarkdownFile => Boolean(file));
        const fresh = result.files.filter((file) => !previousIds.has(file.id));
        return [...fresh, ...kept];
      });
    } else {
      setRecentFiles(result.files);
    }
    return result.files;
  }, []);

  const performOpenDocument = useCallback(async (path: string) => {
    setLoadingDocument(true);
    setDocumentError(null);
    try {
      const result = await markdownInvoke<{ document: MarkdownDocument }>("md_open_file", { path });
      setDocument(result.document);
      setSavedContent(result.document.content);
      setAssetRevision((previous) => previous + 1);
      rememberLastFile(result.document.path);
      await loadRecentFiles({ preserveOrder: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    } finally {
      setLoadingDocument(false);
    }
  }, [loadRecentFiles, t]);

  const openDocument = useCallback(async (path: string) => {
    if (isDirty && document?.path !== path) {
      setPendingAction({ kind: "open", path });
      return;
    }
    await performOpenDocument(path);
  }, [document?.path, isDirty, performOpenDocument]);

  usePluginDeepLink(useCallback((link) => {
    if (link.route !== "/v1/open" && link.route !== "/open" && link.route !== "/v1/import" && link.route !== "/import") {
      return;
    }
    const path = link.params.path ?? link.params.file ?? link.params.filePath;
    if (!path) {
      return;
    }
    clearPendingPluginDeepLink();
    void openDocument(path);
  }, [openDocument]));

  const handleSaveAs = useCallback(async (): Promise<boolean> => {
    if (!document) {
      return false;
    }
    const untitled = isUntitledPath(document.path);
    const directory = untitled ? undefined : getParentDirectory(document.path);
    const targetPath = await saveFile({
      title: t("markdown.reader.saveAsTitle"),
      directory,
      defaultName: document.name || t("markdown.reader.saveAsDefaultName"),
      filters: MARKDOWN_FILTERS,
    });

    if (!targetPath) {
      return false;
    }

    setSavingDocument(true);
    setDocumentError(null);
    try {
      const result = await markdownInvoke<SaveDocumentResult>("md_save_as", {
        path: targetPath,
        content: document.content,
      });
      setDocument(result.document);
      setSavedContent(result.document.content);
      rememberLastFile(result.document.path);
      await loadRecentFiles({ preserveOrder: true });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t, t("markdown.reader.saveAsFailed")));
      return false;
    } finally {
      setSavingDocument(false);
    }
  }, [document, loadRecentFiles, t]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    if (!document) {
      return false;
    }
    // First save of an in-memory "Untitled" buffer becomes a Save As so the
    // user picks where it lands on disk.
    if (isUntitledPath(document.path)) {
      return await handleSaveAs();
    }
    if (!isDirty) {
      return true;
    }

    setSavingDocument(true);
    setDocumentError(null);
    try {
      const result = await markdownInvoke<SaveDocumentResult>("md_save_file", {
        path: document.path,
        content: document.content,
      });
      setDocument(result.document);
      setSavedContent(result.document.content);
      rememberLastFile(result.document.path);
      await loadRecentFiles({ preserveOrder: true });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t, t("markdown.reader.saveFailed")));
      return false;
    } finally {
      setSavingDocument(false);
    }
  }, [document, handleSaveAs, isDirty, loadRecentFiles, t]);

  useEffect(() => {
    if (initialRestoreAttemptedRef.current) {
      return;
    }
    initialRestoreAttemptedRef.current = true;

    void (async () => {
      const files = await loadRecentFiles();
      if (pendingMarkdownOpenPath) {
        return;
      }
      const lastOpenedPath = loadJsonStorage<string | null>(LAST_FILE_STORAGE_KEY, null);
      const candidate = files.find((item) => item.path === lastOpenedPath) ?? files[0];
      if (candidate) {
        await openDocument(candidate.path);
      }
    })();
  }, [loadRecentFiles, openDocument, pendingMarkdownOpenPath]);

  useEffect(() => {
    if (!pendingMarkdownOpenPath) {
      return;
    }

    clearPendingMarkdownOpenPath();
    void openDocument(pendingMarkdownOpenPath);
  }, [clearPendingMarkdownOpenPath, openDocument, pendingMarkdownOpenPath]);

  useEffect(() => {
    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!document) {
        return;
      }
      if (event.shiftKey) {
        void handleSaveAs();
      } else {
        void saveDocument();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut, true);
    };
  }, [document, handleSaveAs, saveDocument]);

  useEffect(() => {
    const handleFontShortcut = (event: globalThis.KeyboardEvent) => {
      const root = mainContentRef.current;
      const isVisible = Boolean(root && root.offsetParent !== null);
      if ((!isActiveModule && !isVisible) || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale(DEFAULT_MARKDOWN_FONT_SCALE);
        flashZoomToast();
        return;
      }

      if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale((previous) => stepMarkdownFontScale(previous, 1));
        flashZoomToast();
        return;
      }

      if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale((previous) => stepMarkdownFontScale(previous, -1));
        flashZoomToast();
      }
    };

    window.addEventListener("keydown", handleFontShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleFontShortcut, true);
    };
  }, [flashZoomToast, isActiveModule]);

  // Ctrl / Cmd + mouse wheel (and trackpad pinch on both Chromium & macOS
  // WKWebView) zoom across Read / Split / Write.
  useEffect(() => {
    const root = mainContentRef.current;
    if (!root) return;

    let accumulatedDelta = 0;
    let lastWheelAt = 0;
    let gestureBaseScale = fontScaleRef.current;

    const handleWheelZoom = (event: WheelEvent) => {
      if (previewImageSrc || root.offsetParent === null) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.deltaY === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (now - lastWheelAt > 140 || (accumulatedDelta !== 0 && Math.sign(event.deltaY) !== Math.sign(accumulatedDelta))) {
        accumulatedDelta = 0;
      }
      lastWheelAt = now;
      accumulatedDelta += event.deltaY;

      // Discrete mouse wheels emit >=40px per notch (step immediately); smooth
      // trackpad pinch/scroll emits small 1-6px deltas (accumulate cleanly).
      if (Math.abs(accumulatedDelta) < 14) return;
      const direction: -1 | 1 = accumulatedDelta < 0 ? 1 : -1;
      accumulatedDelta = 0;

      setFontScale((previous) => stepMarkdownFontScale(previous, direction, MARKDOWN_WHEEL_ZOOM_STEP));
      flashZoomToast();
    };

    // macOS Safari / WKWebView native two-finger trackpad pinch gesture.
    const handleGestureStart = (event: Event) => {
      if (previewImageSrc || root.offsetParent === null) return;
      event.preventDefault();
      gestureBaseScale = fontScaleRef.current;
    };

    const handleGestureChange = (event: Event) => {
      if (previewImageSrc || root.offsetParent === null) return;
      const scale = (event as Event & { scale?: number }).scale;
      if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return;
      event.preventDefault();
      setFontScale(normalizeMarkdownFontScale(gestureBaseScale * scale));
      flashZoomToast();
    };

    root.addEventListener("wheel", handleWheelZoom, { passive: false, capture: true });
    root.addEventListener("gesturestart", handleGestureStart, { passive: false });
    root.addEventListener("gesturechange", handleGestureChange, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheelZoom, true);
      root.removeEventListener("gesturestart", handleGestureStart);
      root.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [flashZoomToast, previewImageSrc]);

  useEffect(() => {
    findIndexRef.current = findIndex;
  }, [findIndex]);

  const gotoMatch = useCallback((delta: number) => {
    const ranges = findRangesRef.current;
    if (ranges.length === 0) return;
    const next = (findIndexRef.current + delta + ranges.length) % ranges.length;
    setFindIndex(next);
    applyFindHighlights(ranges, next);
    scrollRangeIntoView(ranges[next]);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    findRangesRef.current = [];
    setFindCount(0);
    setFindIndex(0);
    clearFindHighlights();
  }, []);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!isActiveModule) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isActiveModule]);

  // Recompute find matches when the query, document, or mode changes.
  useEffect(() => {
    if (!findOpen) return;
    const root = contentAreaRef.current;
    const query = findQuery.trim();
    if (!root || !findApiSupported() || !query) {
      findRangesRef.current = [];
      setFindCount(0);
      clearFindHighlights();
      return;
    }
    const handle = window.setTimeout(() => {
      const ranges = computeMatchRanges(root, query);
      findRangesRef.current = ranges;
      setFindCount(ranges.length);
      const nextIndex = ranges.length === 0 ? 0 : Math.min(findIndexRef.current, ranges.length - 1);
      setFindIndex(nextIndex);
      applyFindHighlights(ranges, nextIndex);
      if (ranges.length > 0) {
        scrollRangeIntoView(ranges[nextIndex]);
      }
    }, 80);
    return () => window.clearTimeout(handle);
  }, [findOpen, findQuery, document?.content, document?.path, workspaceMode]);

  useEffect(() => {
    if (!findOpen) {
      clearFindHighlights();
    }
  }, [findOpen]);

  // Unified image click-to-preview across read / split / write modes.
  useEffect(() => {
    const root = mainContentRef.current;
    if (!root) return;
    const handleImageClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!(target instanceof HTMLImageElement)) return;
      const src = target.currentSrc || target.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      setPreviewImageSrc(src);
    };
    root.addEventListener("click", handleImageClick, true);
    return () => root.removeEventListener("click", handleImageClick, true);
  }, []);

  const handleEditorContentChange = useCallback((content: string) => {
    setDocument((previous) => {
      if (!previous) {
        return previous;
      }
      return deriveDocumentFromContent(previous, content);
    });
  }, []);

  const handleActiveHeadingChange = useCallback((index: number | null) => {
    if (Date.now() < suppressActiveHeadingUntilRef.current) return;
    setActiveHeadingIndex((previous) => previous === index ? previous : index);
  }, []);

  useEffect(() => {
    setActiveHeadingIndex(null);
  }, [document?.path]);

  const scrollPreviewHeading = useCallback((index: number, attempt = 0): boolean => {
    const previewRoot = previewRef.current;
    const heading = previewRoot?.querySelectorAll("h1, h2, h3, h4, h5, h6")[index];

    if (heading instanceof HTMLElement) {
      const scroller = getPreviewScroller(previewRoot);
      scroller.scrollTo({
        top: Math.max(0, getOffsetWithinScroller(heading, scroller) - 12),
        behavior: "auto",
      });
      heading.classList.add("hf-markdown-heading-target");
      window.setTimeout(() => heading.classList.remove("hf-markdown-heading-target"), 1400);
      setActiveHeadingIndex(index);
      return true;
    }

    if (attempt < 10) {
      window.setTimeout(() => scrollPreviewHeading(index, attempt + 1), 80);
    }
    return false;
  }, []);

  const handleJumpToHeading = useCallback((index: number) => {
    suppressActiveHeadingUntilRef.current = Date.now() + 700;
    setActiveHeadingIndex(index);
    if (workspaceMode === "read") {
      scrollPreviewHeading(index);
      return;
    }

    if (!editorSurfaceRef.current?.jumpToHeading(index)) {
      window.setTimeout(() => editorSurfaceRef.current?.jumpToHeading(index), 80);
    }
  }, [scrollPreviewHeading, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "read") return;
    const root = previewRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.(
        'a[href^="#"]',
      );
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      event.preventDefault();
      event.stopPropagation();

      const rawId = href.slice(1);
      let decodedId = rawId;
      try {
        decodedId = decodeURIComponent(rawId);
      } catch {
        decodedId = rawId;
      }

      const headings = Array.from(
        root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
      );

      const anchorText = (anchor.textContent ?? "").trim();

      const target =
        headings.find((heading) => heading.id === decodedId) ??
        headings.find((heading) => heading.id === rawId) ??
        (anchorText
          ? headings.find(
              (heading) => (heading.textContent ?? "").trim() === anchorText,
            )
          : undefined);

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("hf-markdown-heading-target");
        window.setTimeout(() => {
          target.classList.remove("hf-markdown-heading-target");
        }, 1400);
      }
    };

    root.addEventListener("click", handleClick);
    return () => {
      root.removeEventListener("click", handleClick);
    };
  }, [workspaceMode, document?.path]);

  useEffect(() => {
    if (workspaceMode !== "read" || !document) return;
    const root = previewRef.current;
    if (!root) return;
    const scroller = getPreviewScroller(root);

    const updateActiveHeading = () => {
      if (scrollSyncFrameRef.current !== null) return;
      scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
        scrollSyncFrameRef.current = null;
        if (Date.now() < suppressActiveHeadingUntilRef.current) return;
        const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
        if (headings.length === 0) {
          setActiveHeadingIndex(null);
          return;
        }

        const top = scroller.scrollTop + Math.max(24, scroller.clientHeight * 0.16);
        let nextIndex = 0;
        headings.forEach((heading, index) => {
          if (getOffsetWithinScroller(heading, scroller) <= top) {
            nextIndex = index;
          }
        });
        setActiveHeadingIndex((previous) => previous === nextIndex ? previous : nextIndex);
      });
    };

    updateActiveHeading();
    scroller.addEventListener("scroll", updateActiveHeading, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", updateActiveHeading);
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
    };
  }, [workspaceMode, document?.path, document?.content]);

  const handlePickFile = useCallback(async () => {
    const directory = document?.path ? getParentDirectory(document.path) : undefined;
    const pickedPath = await pickFile({
      title: t("markdown.reader.pickTitle"),
      directory,
      filters: MARKDOWN_FILTERS,
    });

    if (pickedPath) {
      await openDocument(pickedPath);
    }
  }, [document?.path, openDocument, t]);

  // "New" creates an in-memory Untitled buffer that never touches disk until
  // the user's first save (which becomes a Save As). No dialog, no file.
  const performCreateUntitled = useCallback(() => {
    const untitled = createUntitledDocument();
    setDocument(untitled);
    setSavedContent(null);
    setDocumentError(null);
  }, []);

  const handleCreateFile = useCallback(() => {
    if (isDirty) {
      setPendingAction({ kind: "createUntitled" });
      return;
    }
    performCreateUntitled();
  }, [isDirty, performCreateUntitled]);

  const runPendingAction = useCallback((action: NonNullable<typeof pendingAction>) => {
    if (action.kind === "open") {
      void performOpenDocument(action.path);
    } else {
      performCreateUntitled();
    }
  }, [performCreateUntitled, performOpenDocument]);

  const discardPendingAction = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) runPendingAction(action);
  }, [pendingAction, runPendingAction]);

  const savePendingAction = useCallback(async () => {
    const action = pendingAction;
    if (!action) return;
    const saved = await saveDocument();
    if (!saved) return;
    setPendingAction(null);
    runPendingAction(action);
  }, [pendingAction, runPendingAction, saveDocument]);

  const cancelPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const handleRemoveRecent = useCallback(async (path: string) => {
    try {
      await markdownInvoke("md_remove_recent_file", { path });
      if (loadJsonStorage<string | null>(LAST_FILE_STORAGE_KEY, null) === path) {
        rememberLastFile(null);
      }
      if (document?.path === path) {
        setDocument(null);
        setSavedContent(null);
      }
      await loadRecentFiles({ preserveOrder: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    }
  }, [document?.path, loadRecentFiles, t]);

  const handleClearRecent = useCallback(async () => {
    try {
      await markdownInvoke("md_clear_recent_files", {});
      rememberLastFile(null);
      setDocument(null);
      setSavedContent(null);
      setDocumentError(null);
      await loadRecentFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    }
  }, [loadRecentFiles, t]);

  const handlePruneMissing = useCallback(async () => {
    try {
      await markdownInvoke<{ removed: number }>("md_prune_missing_recent_files");
      await loadRecentFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    }
  }, [loadRecentFiles, t]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const path = getDroppedMarkdownPath(event);
    if (!path) {
      return;
    }
    void openDocument(path);
  }, [openDocument]);

  const editorFocusToken = document?.path
    ? `${document.path}:${workspaceMode}`
    : workspaceMode;

  return (
    <div
      className={clsx(
        "hf-markdown-panel relative flex h-full min-h-0 overflow-hidden",
        currentThemeType === "dark" ? "hf-markdown-panel--dark" : "hf-markdown-panel--light",
        dragActive && "bg-primary/[0.03]",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-primary/40 bg-background/85 text-sm font-medium text-primary shadow-lg backdrop-blur-sm">
          {t("markdown.reader.dropHint")}
        </div>
      )}

      <ReaderSidebar
        recentFiles={recentFiles}
        document={document}
        isCollapsed={isLeftSidebarCollapsed}
        width={leftWidth}
        onSetCollapsed={setIsLeftSidebarCollapsed}
        onPickFile={() => {
          void handlePickFile();
        }}
        onCreateFile={() => {
          void handleCreateFile();
        }}
        onOpenDocument={(path) => {
          void openDocument(path);
        }}
        onRemoveRecent={(path) => {
          void handleRemoveRecent(path);
        }}
        onClearRecent={() => {
          void handleClearRecent();
        }}
        onPruneMissing={() => {
          void handlePruneMissing();
        }}
        onJumpToHeading={handleJumpToHeading}
        activeHeadingIndex={activeHeadingIndex}
        t={t}
      />

      {/* Left resize handle */}
      {!isLeftSidebarCollapsed && (
        <div
          onMouseDown={handleLeftResize}
          className={clsx(
            "w-1 shrink-0 cursor-col-resize z-10 transition-colors",
            leftResizing ? "bg-primary/40" : "hover:bg-primary/25",
          )}
        />
      )}

      <main ref={mainContentRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background/35">
        <MarkdownHeader
          document={document}
          isDirty={canSave}
          savingDocument={savingDocument}
          refreshingDocument={refreshingDocument}
          canRefresh={canRefresh}
          workspaceMode={workspaceMode}
          fontScaleLabel={fontScaleLabel}
          onWorkspaceModeChange={setWorkspaceMode}
          onDecreaseFontScale={() => {
            setFontScale((previous) => stepMarkdownFontScale(previous, -1));
            flashZoomToast();
          }}
          onIncreaseFontScale={() => {
            setFontScale((previous) => stepMarkdownFontScale(previous, 1));
            flashZoomToast();
          }}
          onResetFontScale={() => {
            setFontScale(DEFAULT_MARKDOWN_FONT_SCALE);
            flashZoomToast();
          }}
          onRefresh={() => {
            setDocumentError(null);
            void refreshNow();
          }}
          onSave={() => {
            void saveDocument();
          }}
          onSaveAs={() => {
            void handleSaveAs();
          }}
          t={t}
        />

        {documentError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {documentError}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {findOpen && (
            <FindBar
              query={findQuery}
              matchCount={findCount}
              currentIndex={findIndex}
              onQueryChange={setFindQuery}
              onNext={() => gotoMatch(1)}
              onPrev={() => gotoMatch(-1)}
              onClose={closeFind}
              t={t}
            />
          )}

          {zoomToastVisible && (
            <div className="hf-md-zoom-toast" role="status" aria-live="polite">
              {fontScaleLabel}
            </div>
          )}

          <div
            ref={contentAreaRef}
            style={{ "--hf-md-font-scale": String(fontScale) } as React.CSSProperties}
            className={clsx(
              "h-full min-h-0 p-4",
              workspaceMode === "read" ? "overflow-auto" : "overflow-hidden",
            )}
          >
            {loadingDocument ? (
              <div className="flex h-full items-center justify-center text-sm text-foreground-secondary/60">
                <RefreshCw size={16} className="mr-2 animate-spin" />
                {t("markdown.reader.loading")}
              </div>
            ) : !document ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface/20 px-8 text-center text-sm text-foreground-secondary/60">
                {t("markdown.reader.emptyState")}
              </div>
            ) : workspaceMode === "read" ? (
              <div
                ref={previewRef}
                style={{ "--hf-md-font-scale": String(fontScale) } as React.CSSProperties}
                className="hf-preview-surface w-full min-h-full rounded-2xl border"
              >
                <MarkdownRenderer
                  content={document.content}
                  sourcePath={document.path}
                  themeType={currentThemeType}
                  assetRevision={assetRevision}
                />
              </div>
            ) : workspaceMode === "split" ? (
              <div className="h-full min-h-0">
                <MarkdownSourceSurface
                  ref={editorSurfaceRef}
                  value={document.content}
                  sourcePath={document.path}
                  headings={document.headings}
                  themeType={currentThemeType}
                  placeholder={t("markdown.reader.editPlaceholder")}
                  documentPath={document.path}
                  fontScale={fontScale}
                  assetRevision={assetRevision}
                  focusToken={editorFocusToken}
                  onChange={handleEditorContentChange}
                  onActiveHeadingChange={handleActiveHeadingChange}
                />
              </div>
            ) : (
              <div className="h-full min-h-0">
                <MarkdownEditorSurface
                  ref={editorSurfaceRef}
                  value={document.content}
                  sourcePath={document.path}
                  headings={document.headings}
                  themeType={currentThemeType}
                  placeholder={t("markdown.reader.editPlaceholder")}
                  documentPath={document.path}
                  fontScale={fontScale}
                  assetRevision={assetRevision}
                  focusToken={editorFocusToken}
                  onChange={handleEditorContentChange}
                  onActiveHeadingChange={handleActiveHeadingChange}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {previewImageSrc && (
        <ImageLightbox
          src={previewImageSrc}
          onClose={() => setPreviewImageSrc(null)}
          t={t}
        />
      )}

      {pendingAction && (
        <div className="hf-md-modal-backdrop" onClick={cancelPendingAction}>
          <div className="hf-md-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="hf-md-modal__title">{t("markdown.reader.unsavedTitle")}</h3>
            <p className="hf-md-modal__body">{t("markdown.reader.unsavedConfirm")}</p>
            <div className="hf-md-modal__actions">
              <button type="button" onClick={cancelPendingAction} className="hf-md-btn hf-md-btn--ghost">
                {t("markdown.reader.cancel")}
              </button>
              <button type="button" onClick={discardPendingAction} className="hf-md-btn hf-md-btn--ghost">
                {t("markdown.reader.dontSave")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void savePendingAction();
                }}
                className="hf-md-btn hf-md-btn--primary"
              >
                {t("markdown.reader.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getOffsetWithinScroller(element: HTMLElement, scroller: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return elementRect.top - scrollerRect.top + scroller.scrollTop;
}

function getPreviewScroller(root: HTMLElement) {
  return root.parentElement ?? root;
}
