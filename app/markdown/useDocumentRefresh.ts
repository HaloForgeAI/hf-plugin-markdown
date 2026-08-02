import { useCallback, useEffect, useRef, useState } from "react";
import { useHostEvent } from "@haloforge/plugin-sdk";
import {
  isPluginFileChangedEvent,
  MARKDOWN_FILE_CHANGED_EVENT,
  startPluginFileWatch,
  stopPluginFileWatch,
} from "../host/pluginFileWatch";
import type { MarkdownDocument, RefreshDocumentResult } from "./types";
import { isUntitledPath, markdownInvoke } from "./utils";

const FILE_CHANGE_DEBOUNCE_MS = 200;

function releaseFileWatch(watchId: string) {
  void stopPluginFileWatch(watchId).catch((error) => {
    console.warn("Failed to stop Markdown file watch", error);
  });
}

interface UseDocumentRefreshOptions {
  document: MarkdownDocument | null;
  active: boolean;
  dirty: boolean;
  busy: boolean;
  onRefresh: (document: MarkdownDocument) => void;
  onError: (error: unknown) => void;
}

export function useDocumentRefresh({
  document,
  active,
  dirty,
  busy,
  onRefresh,
  onError,
}: UseDocumentRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const pendingAutoRefreshRef = useRef(false);
  const watchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const refreshRef = useRef<(force: boolean, silent: boolean) => Promise<void>>(async () => {});
  const canRefresh = Boolean(document && !isUntitledPath(document.path) && !dirty && !busy);
  const currentStateRef = useRef({ document, dirty, busy });
  currentStateRef.current = { document, dirty, busy };

  const refresh = useCallback(async (force: boolean, silent: boolean) => {
    if (!document || isUntitledPath(document.path) || dirty || busy) {
      return;
    }
    if (inFlightRef.current) {
      pendingAutoRefreshRef.current ||= silent;
      return;
    }

    inFlightRef.current = true;
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const result = await markdownInvoke<RefreshDocumentResult>("md_refresh_file", {
        path: document.path,
        knownRevision: document.file_revision,
        force,
      });
      if (result.changed && result.document) {
        const current = currentStateRef.current;
        const requestIsStillCurrent =
          current.document?.path === document.path &&
          current.document.file_revision === document.file_revision &&
          !current.dirty &&
          !current.busy;
        if (requestIsStillCurrent) {
          onRefresh(result.document);
        }
      }
    } catch (error) {
      if (!silent) {
        onError(error);
      }
    } finally {
      inFlightRef.current = false;
      if (!silent) {
        setRefreshing(false);
      }
      if (pendingAutoRefreshRef.current) {
        pendingAutoRefreshRef.current = false;
        window.setTimeout(() => void refreshRef.current(false, true), 0);
      }
    }
  }, [busy, dirty, document, onError, onRefresh]);
  refreshRef.current = refresh;

  const handleFileChanged = useCallback((payload: unknown) => {
    if (!isPluginFileChangedEvent(payload) || payload.watchId !== watchIdRef.current) {
      return;
    }
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      const current = currentStateRef.current;
      if (current.document && !current.dirty && !current.busy) {
        void refreshRef.current(false, true);
      }
    }, FILE_CHANGE_DEBOUNCE_MS);
  }, []);
  useHostEvent(MARKDOWN_FILE_CHANGED_EVENT, handleFileChanged);

  useEffect(() => {
    const path = document?.path;
    if (!active || !path || isUntitledPath(path)) {
      return;
    }

    let disposed = false;
    void startPluginFileWatch(path)
      .then((watchId) => {
        if (disposed) {
          releaseFileWatch(watchId);
          return;
        }
        watchIdRef.current = watchId;
      })
      .catch((error) => {
        if (!disposed) {
          console.warn("Failed to watch Markdown file for changes", error);
        }
      });

    return () => {
      disposed = true;
      pendingAutoRefreshRef.current = false;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const watchId = watchIdRef.current;
      watchIdRef.current = null;
      if (watchId) {
        releaseFileWatch(watchId);
      }
    };
  }, [active, document?.path]);

  useEffect(() => {
    if (!active || !canRefresh) {
      return;
    }

    const refreshAfterReturningToApp = () => {
      void refresh(true, true);
    };
    window.addEventListener("focus", refreshAfterReturningToApp);

    return () => {
      window.removeEventListener("focus", refreshAfterReturningToApp);
    };
  }, [active, canRefresh, refresh]);

  return {
    canRefresh,
    refreshing,
    refreshNow: () => refresh(true, false),
  };
}
