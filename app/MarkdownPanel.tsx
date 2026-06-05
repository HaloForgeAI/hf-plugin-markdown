import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { clearPendingPluginDeepLink, useHostEvent, usePluginDeepLink, usePluginWindowTitle } from "@haloforge/plugin-sdk";
import clsx from "clsx";
import { useSidebarResize } from "./host/useSidebarResize";
import { RefreshCw } from "lucide-react";
import { MarkdownRenderer } from "./host/MarkdownRenderer";
import { useAppStore } from "./host/appStore";
import { useAIChatStore } from "./host/aichatStore";
import { useThemeStore } from "./host/themeStore";
import { getParentDirectory, pickFile, saveFile } from "./host/devkitDialogs";
import type { ChatSession, ModelConfig, StreamChunk, StreamErrorEvent, StreamState } from "./host/types";
import { MarkdownEditorSurface, type MarkdownEditorSurfaceHandle } from "./MarkdownEditorSurface";
import { MarkdownSourceSurface } from "./MarkdownSourceSurface";
import { useMarkdownT } from "./i18n";
import { AssistantSidebar } from "./markdown/AssistantSidebar";
import { MarkdownHeader } from "./markdown/MarkdownHeader";
import { ReaderSidebar } from "./markdown/ReaderSidebar";
import type {
  AssistantIntent,
  AssistantMessage,
  MarkdownDocument,
  RecentMarkdownFile,
  SaveDocumentResult,
  WorkspaceMode,
} from "./markdown/types";
import {
  DEFAULT_MARKDOWN_FONT_SCALE,
  buildAssistantPrompt,
  buildDisplayPrompt,
  deriveDocumentFromContent,
  formatMarkdownFontScale,
  getDroppedMarkdownPath,
  getSelectionText,
  LAST_FILE_STORAGE_KEY,
  LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  loadMarkdownFontScale,
  loadCollapsedState,
  loadJsonStorage,
  loadPreviewTheme,
  loadSessionMap,
  loadThreads,
  loadWorkspaceMode,
  MARKDOWN_ASSISTANT_SYSTEM_PROMPT,
  MARKDOWN_FILTERS,
  markdownInvoke,
  MAX_SELECTION_CHARS,
  MARKDOWN_FONT_SCALE_STORAGE_KEY,
  PREVIEW_THEME_STORAGE_KEY,
  rememberLastFile,
  resolvePreviewThemeClass,
  RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  saveJsonStorage,
  saveSessionMap,
  saveThreads,
  stepMarkdownFontScale,
  translateDocumentError,
  trimStoredThread,
  upsertAssistantMessage,
  WORKSPACE_MODE_STORAGE_KEY,
} from "./markdown/utils";

export function MarkdownPanel() {
  const t = useMarkdownT();
  const openSettingsTab = useAppStore((s) => s.openSettingsTab);
  const activeModule = useAppStore((s) => s.activeModule);
  const pendingMarkdownOpenPath = useAppStore((s) => s.pendingMarkdownOpenPath);
  const clearPendingMarkdownOpenPath = useAppStore((s) => s.clearPendingMarkdownOpenPath);
  const fetchModelConfigs = useAIChatStore((s) => s.fetchModelConfigs);
  const modelConfigs = useAIChatStore((s) => s.modelConfigs);
  const selectedModelId = useAIChatStore((s) => s.selectedModelId);
  const createAssistantSession = useAIChatStore((s) => s.createSession);
  const getAssistantStreamState = useAIChatStore((s) => s.getStreamState);
  const sendAssistantMessage = useAIChatStore((s) => s.sendMessage);
  const currentThemeType = useThemeStore((s) => s.currentTheme.theme_type);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const editorSurfaceRef = useRef<MarkdownEditorSurfaceHandle | null>(null);
  const initialRestoreAttemptedRef = useRef(false);
  const currentAiSessionIdRef = useRef<string | null>(null);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const suppressActiveHeadingUntilRef = useRef(0);

  const [recentFiles, setRecentFiles] = useState<RecentMarkdownFile[]>([]);
  const [document, setDocument] = useState<MarkdownDocument | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [question, setQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isAssistantStreaming, setIsAssistantStreaming] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(loadPreviewTheme());
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(loadWorkspaceMode());
  const [fontScale, setFontScale] = useState(loadMarkdownFontScale());
  const [pendingAction, setPendingAction] = useState<
    { kind: "open" | "create"; path: string } | null
  >(null);
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(loadCollapsedState(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY));
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(loadCollapsedState(RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY));
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number | null>(null);

  const activeModel = useMemo<ModelConfig | null>(() => {
    if (modelConfigs.length === 0) return null;
    return modelConfigs.find((item) => item.id === selectedModelId) ?? modelConfigs[0];
  }, [modelConfigs, selectedModelId]);

  const isDirty = Boolean(document && savedContent !== null && document.content !== savedContent);
  const isActiveModule = activeModule === "markdown";
  const windowTitle = isActiveModule ? document?.name?.trim() || null : null;
  const fontScaleLabel = formatMarkdownFontScale(fontScale);

  usePluginWindowTitle(windowTitle, { subtitle: "Markdown" });

  const { width: leftWidth, isResizing: leftResizing, handleMouseDown: handleLeftResize } = useSidebarResize({
    defaultWidth: 280, minWidth: 200, maxWidth: 480,
    storageKey: "hf-md-left-sidebar-width", direction: "right",
  });
  const { width: rightWidth, isResizing: rightResizing, handleMouseDown: handleRightResize } = useSidebarResize({
    defaultWidth: 360, minWidth: 260, maxWidth: 560,
    storageKey: "hf-md-right-sidebar-width", direction: "left",
  });

  useEffect(() => {
    currentAiSessionIdRef.current = assistantSessionId;
  }, [assistantSessionId]);

  useEffect(() => {
    saveJsonStorage(PREVIEW_THEME_STORAGE_KEY, previewTheme);
  }, [previewTheme]);

  useEffect(() => {
    saveJsonStorage(WORKSPACE_MODE_STORAGE_KEY, workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    saveJsonStorage(MARKDOWN_FONT_SCALE_STORAGE_KEY, fontScale);
  }, [fontScale]);

  useEffect(() => {
    saveJsonStorage(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY, isLeftSidebarCollapsed);
  }, [isLeftSidebarCollapsed]);

  useEffect(() => {
    saveJsonStorage(RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY, isRightSidebarCollapsed);
  }, [isRightSidebarCollapsed]);

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

  const replaceCurrentThread = useCallback((path: string, clear = false) => {
    if (clear) {
      setAssistantMessages([]);
      const threads = loadThreads();
      delete threads[path];
      saveThreads(threads);
      return;
    }
    const threads = loadThreads();
    setAssistantMessages(threads[path] ?? []);
  }, []);

  const bindAssistantSession = useCallback((path: string, sessionId: string | null) => {
    currentAiSessionIdRef.current = sessionId;
    setAssistantSessionId(sessionId);
    const sessionMap = loadSessionMap();
    if (sessionId) {
      sessionMap[path] = sessionId;
    } else {
      delete sessionMap[path];
    }
    saveSessionMap(sessionMap);
  }, []);

  const performOpenDocument = useCallback(async (path: string) => {
    setLoadingDocument(true);
    setDocumentError(null);
    setAssistantError(null);
    try {
      const result = await markdownInvoke<{ document: MarkdownDocument }>("md_open_file", { path });
      setDocument(result.document);
      setSavedContent(result.document.content);
      setSelection("");
      setQuestion("");
      rememberLastFile(result.document.path);
      currentAiSessionIdRef.current = null;
      setAssistantSessionId(null);
      replaceCurrentThread(result.document.path, true);
      await loadRecentFiles({ preserveOrder: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    } finally {
      setLoadingDocument(false);
    }
  }, [loadRecentFiles, replaceCurrentThread, t]);

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

  const saveDocument = useCallback(async () => {
    if (!document || !isDirty) {
      return;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t, t("markdown.reader.saveFailed")));
    } finally {
      setSavingDocument(false);
    }
  }, [document, isDirty, loadRecentFiles, t]);

  useEffect(() => {
    void fetchModelConfigs();
  }, [fetchModelConfigs]);

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

  const handleAssistantStreamChunk = useCallback((payload: unknown) => {
    const chunk = payload as StreamChunk;
    if (!currentAiSessionIdRef.current || chunk.session_id !== currentAiSessionIdRef.current) {
      return;
    }
    setAssistantError(null);
    setIsAssistantStreaming(!chunk.done);
    setAssistantMessages((previous) => trimStoredThread(upsertAssistantMessage(previous, chunk)));
  }, []);

  const handleAssistantStreamError = useCallback((payload: unknown) => {
    const streamError = payload as StreamErrorEvent;
    if (!currentAiSessionIdRef.current || streamError.session_id !== currentAiSessionIdRef.current) {
      return;
    }
    setIsAssistantStreaming(false);
    setAssistantError(streamError.error || t("markdown.ai.error.streamFailed"));
  }, [t]);

  useHostEvent("aichat:stream-chunk", handleAssistantStreamChunk);
  useHostEvent("aichat:stream-error", handleAssistantStreamError);

  useEffect(() => {
    if (!document?.path) return;
    const threads = loadThreads();
    threads[document.path] = trimStoredThread(assistantMessages);
    saveThreads(threads);
  }, [assistantMessages, document?.path]);

  useEffect(() => {
    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (document) {
        void saveDocument();
      }
    };

    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut, true);
    };
  }, [document, saveDocument]);

  useEffect(() => {
    const handleFontShortcut = (event: globalThis.KeyboardEvent) => {
      if (!isActiveModule || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale(DEFAULT_MARKDOWN_FONT_SCALE);
        return;
      }

      if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale((previous) => stepMarkdownFontScale(previous, 1));
        return;
      }

      if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        event.stopPropagation();
        setFontScale((previous) => stepMarkdownFontScale(previous, -1));
      }
    };

    window.addEventListener("keydown", handleFontShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleFontShortcut, true);
    };
  }, [isActiveModule]);

  const handleEditorContentChange = useCallback((content: string) => {
    setDocument((previous) => {
      if (!previous) {
        return previous;
      }
      return deriveDocumentFromContent(previous, content);
    });
  }, []);

  const handleEditorSelectionChange = useCallback((value: string) => {
    setSelection(value.trim().slice(0, MAX_SELECTION_CHARS));
  }, []);

  const capturePreviewSelection = useCallback(() => {
    setSelection(getSelectionText(previewRef.current).slice(0, MAX_SELECTION_CHARS));
  }, []);

  const handleActiveHeadingChange = useCallback((index: number | null) => {
    if (Date.now() < suppressActiveHeadingUntilRef.current) return;
    setActiveHeadingIndex((previous) => previous === index ? previous : index);
  }, []);

  useEffect(() => {
    if (selection) {
      setIsSelectionCollapsed(true);
    }
  }, [selection]);

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

  const hydrateAssistantStreamState = useCallback((streamState: StreamState) => {
    setAssistantMessages((previous) => {
      const existingIndex = previous.findIndex((message) => message.id === streamState.message_id);

      if (existingIndex === -1) {
        if (!streamState.content && !streamState.finished) {
          return previous;
        }

        return trimStoredThread([
          ...previous,
          {
            id: streamState.message_id,
            role: "assistant",
            content: streamState.content,
            createdAt: streamState.started_at,
            isStreaming: !streamState.finished,
          },
        ]);
      }

      const existing = previous[existingIndex];
      if (existing.role !== "assistant") {
        return previous;
      }

      if (existing.content.length >= streamState.content.length && existing.isStreaming === !streamState.finished) {
        return previous;
      }

      const next = [...previous];
      next[existingIndex] = {
        ...existing,
        content: streamState.content || existing.content,
        isStreaming: !streamState.finished,
        createdAt: existing.createdAt || streamState.started_at,
      };
      return trimStoredThread(next);
    });

    if (streamState.error) {
      setAssistantError(streamState.error);
      setIsAssistantStreaming(false);
      return;
    }

    if (streamState.finished) {
      setIsAssistantStreaming(false);
    }
  }, []);

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

  useEffect(() => {
    if (!assistantSessionId || !isAssistantStreaming) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      try {
        const streamState = await getAssistantStreamState<StreamState>(assistantSessionId);

        if (cancelled || !streamState) {
          return;
        }

        hydrateAssistantStreamState(streamState);
      } catch (error) {
        if (!cancelled) {
          console.error("Markdown assistant stream fallback poll failed:", error);
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [assistantSessionId, getAssistantStreamState, hydrateAssistantStreamState, isAssistantStreaming]);

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

  const performCreateFile = useCallback(async (path: string) => {
    setLoadingDocument(true);
    setDocumentError(null);
    setAssistantError(null);
    try {
      const result = await markdownInvoke<{ document: MarkdownDocument }>("md_create_file", { path });
      setDocument(result.document);
      setSavedContent(result.document.content);
      setSelection("");
      setQuestion("");
      rememberLastFile(result.document.path);
      currentAiSessionIdRef.current = null;
      setAssistantSessionId(null);
      replaceCurrentThread(result.document.path, true);
      await loadRecentFiles({ preserveOrder: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t, t("markdown.reader.newFailed")));
    } finally {
      setLoadingDocument(false);
    }
  }, [loadRecentFiles, replaceCurrentThread, t]);

  const handleCreateFile = useCallback(async () => {
    const directory = document?.path ? getParentDirectory(document.path) : undefined;
    const targetPath = await saveFile({
      title: t("markdown.reader.newTitle"),
      directory,
      defaultName: t("markdown.reader.newDefaultName"),
      filters: MARKDOWN_FILTERS,
    });

    if (!targetPath) {
      return;
    }

    if (isDirty) {
      setPendingAction({ kind: "create", path: targetPath });
      return;
    }

    await performCreateFile(targetPath);
  }, [document?.path, isDirty, performCreateFile, t]);

  const confirmPendingAction = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.kind === "open") {
      void performOpenDocument(action.path);
    } else {
      void performCreateFile(action.path);
    }
  }, [pendingAction, performCreateFile, performOpenDocument]);

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
        setSelection("");
        setQuestion("");
        setAssistantMessages([]);
        currentAiSessionIdRef.current = null;
        setAssistantSessionId(null);
      }
      await loadRecentFiles({ preserveOrder: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentError(translateDocumentError(message, t));
    }
  }, [document?.path, loadRecentFiles, t]);

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
      // In Tauri, file paths arrive via the tauri://drag-drop event (handled in
      // App.tsx), not via the standard HTML DataTransfer API. Silently ignore
      // null here — the Tauri event will open the file.
      return;
    }
    void openDocument(path);
  }, [openDocument]);

  const sendAssistantIntent = useCallback(async (intent: AssistantIntent) => {
    if (!document) {
      setAssistantError(t("markdown.ai.error.documentRequired"));
      return;
    }

    const trimmedSelection = selection.trim();
    const trimmedQuestion = question.trim();

    if ((intent === "explain" || intent === "translate") && !trimmedSelection) {
      setAssistantError(t("markdown.ai.error.selectionRequired"));
      return;
    }

    if (intent === "ask" && !trimmedQuestion) {
      setAssistantError(t("markdown.ai.error.questionRequired"));
      return;
    }

      if (!activeModel) {
        setAssistantError(t("markdown.ai.modelMissing"));
        openSettingsTab("models");
        return;
      }

    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: buildDisplayPrompt(intent, trimmedQuestion, trimmedSelection, t),
      createdAt: new Date().toISOString(),
    };

    const prompt = buildAssistantPrompt(intent, document, trimmedSelection, trimmedQuestion);

    setAssistantError(null);
    setAssistantMessages((previous) => trimStoredThread([...previous, userMessage]));
    setIsAssistantStreaming(true);
    if (intent === "ask") {
      setQuestion("");
    }

    let sessionId = assistantSessionId;

    try {
      if (!sessionId) {
        const now = new Date().toISOString();
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: `${document.title} · Markdown`,
          model_config_id: activeModel.id,
          system_prompt: MARKDOWN_ASSISTANT_SYSTEM_PROMPT,
          folder_id: null,
          tags: ["markdown"],
          pinned: false,
          token_usage: 0,
          created_at: now,
          updated_at: now,
        };
        const created = await createAssistantSession<ChatSession>(session);
        sessionId = created.id;
        bindAssistantSession(document.path, created.id);
      }

      await sendAssistantMessage({
        session_id: sessionId,
        content: prompt,
        model_config_id: activeModel.id,
        system_prompt_override: MARKDOWN_ASSISTANT_SYSTEM_PROMPT,
      });
    } catch (error) {
      setIsAssistantStreaming(false);
      setAssistantMessages((previous) => previous.filter((message) => message.id !== userMessage.id));
      const message = error instanceof Error ? error.message : String(error);
      setAssistantError(message || t("markdown.ai.error.sendFailed"));
    }
  }, [
    activeModel,
    assistantSessionId,
    bindAssistantSession,
    createAssistantSession,
    document,
    openSettingsTab,
    question,
    selection,
    sendAssistantMessage,
    t,
  ]);

  const handleAssistantKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void sendAssistantIntent("ask");
    }
  }, [sendAssistantIntent]);

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
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[28px] border-2 border-dashed border-primary/40 bg-background/85 text-sm font-medium text-primary shadow-lg backdrop-blur-sm">
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/35">
        <MarkdownHeader
          document={document}
          isDirty={isDirty}
          savingDocument={savingDocument}
          workspaceMode={workspaceMode}
          previewTheme={previewTheme}
          fontScaleLabel={fontScaleLabel}
          onWorkspaceModeChange={setWorkspaceMode}
          onPreviewThemeChange={setPreviewTheme}
          onDecreaseFontScale={() => setFontScale((previous) => stepMarkdownFontScale(previous, -1))}
          onIncreaseFontScale={() => setFontScale((previous) => stepMarkdownFontScale(previous, 1))}
          onResetFontScale={() => setFontScale(DEFAULT_MARKDOWN_FONT_SCALE)}
          onSave={() => {
            void saveDocument();
          }}
          t={t}
        />

        {documentError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {documentError}
          </div>
        )}

        <div
          className={clsx(
            "min-h-0 flex-1 px-6 py-6",
            workspaceMode === "read" ? "overflow-auto" : "overflow-hidden",
          )}
        >
          {loadingDocument ? (
            <div className="flex h-full items-center justify-center text-sm text-foreground-secondary/60">
              <RefreshCw size={16} className="mr-2 animate-spin" />
              {t("markdown.reader.loading")}
            </div>
          ) : !document ? (
            <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-border bg-surface/20 px-8 text-center text-sm text-foreground-secondary/60">
              {t("markdown.reader.emptyState")}
            </div>
          ) : workspaceMode === "read" ? (
            <div
              ref={previewRef}
              onMouseUp={capturePreviewSelection}
              onKeyUp={capturePreviewSelection}
              style={{ "--hf-md-font-scale": String(fontScale) } as React.CSSProperties}
              className={clsx(
                "mx-auto rounded-[28px] border",
                resolvePreviewThemeClass(previewTheme),
              )}
            >
              <MarkdownRenderer
                content={document.content}
                sourcePath={document.path}
                themeType={currentThemeType}
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
                focusToken={editorFocusToken}
                onChange={handleEditorContentChange}
                onSelectionChange={handleEditorSelectionChange}
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
                focusToken={editorFocusToken}
                onChange={handleEditorContentChange}
                onSelectionChange={handleEditorSelectionChange}
                onActiveHeadingChange={handleActiveHeadingChange}
              />
            </div>
          )}
        </div>
      </main>

      {/* Right resize handle */}
      {!isRightSidebarCollapsed && (
        <div
          onMouseDown={handleRightResize}
          className={clsx(
            "w-1 shrink-0 cursor-col-resize z-10 transition-colors",
            rightResizing ? "bg-primary/40" : "hover:bg-primary/25",
          )}
        />
      )}

      <AssistantSidebar
        activeModel={activeModel}
        isCollapsed={isRightSidebarCollapsed}
        width={rightWidth}
        onSetCollapsed={setIsRightSidebarCollapsed}
        isAssistantStreaming={isAssistantStreaming}
        assistantMessages={assistantMessages}
        assistantError={assistantError}
        question={question}
        selection={selection}
        isSelectionCollapsed={isSelectionCollapsed}
        onClearSelection={() => setSelection("")}
        onToggleSelectionCollapsed={() => setIsSelectionCollapsed((previous) => !previous)}
        onQuestionChange={setQuestion}
        onIntent={(intent) => {
          void sendAssistantIntent(intent);
        }}
        onQuestionKeyDown={handleAssistantKeyDown}
        onOpenSettings={() => openSettingsTab("models")}
        onClearMessages={() => {
          if (document?.path) {
            replaceCurrentThread(document.path, true);
          } else {
            setAssistantMessages([]);
          }
        }}
        themeType={currentThemeType}
        t={t}
      />

      {pendingAction && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-sm"
          onClick={cancelPendingAction}
        >
          <div
            className="w-[min(420px,92vw)] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground">
              {t("markdown.reader.unsavedTitle")}
            </h3>
            <p className="mt-2 text-sm text-foreground-secondary">
              {t("markdown.reader.unsavedConfirm")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPendingAction}
                className="inline-flex h-9 items-center rounded-full border border-border bg-transparent px-4 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              >
                {t("markdown.reader.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmPendingAction}
                className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
              >
                {t("markdown.reader.discardAndOpen")}
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
