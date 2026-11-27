import type { DragEvent } from "react";
import { invokePlugin } from "@haloforge/plugin-sdk";
import type {
  FileWithPath,
  MarkdownDocument,
  MarkdownHeading,
  MarkdownTranslator,
  WorkspaceMode,
} from "./types";

export const LAST_FILE_STORAGE_KEY = "hf-plugin-markdown:last-file";
export const WORKSPACE_MODE_STORAGE_KEY = "hf-plugin-markdown:workspace-mode";
export const MARKDOWN_FONT_SCALE_STORAGE_KEY = "hf-plugin-markdown:font-scale";
export const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY = "hf-plugin-markdown:left-sidebar-collapsed";
export const MARKDOWN_FILTERS = ["md", "markdown", "mdown", "mkd"];

/**
 * Sentinel path prefix for documents created with "New" that only live in
 * memory until the first save. They never touch disk, are excluded from the
 * recent-files list, and trigger a Save As on first save.
 */
export const UNTITLED_PATH_PREFIX = "untitled:";

export function isUntitledPath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(UNTITLED_PATH_PREFIX);
}

export function createUntitledDocument(): MarkdownDocument {
  return {
    path: `${UNTITLED_PATH_PREFIX}${crypto.randomUUID()}`,
    name: "Untitled.md",
    title: "Untitled",
    content: "",
    file_revision: "",
    headings: [],
    word_count: 0,
    estimated_read_time_min: 0,
  };
}

export const DEFAULT_MARKDOWN_FONT_SCALE = 1;
export const MIN_MARKDOWN_FONT_SCALE = 0.6;
export const MAX_MARKDOWN_FONT_SCALE = 2.2;
export const MARKDOWN_FONT_SCALE_STEP = 0.1;
export const MARKDOWN_WHEEL_ZOOM_STEP = 0.05;

export function markdownInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return invokePlugin<T>(cmd, args);
}

export function loadJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJsonStorage<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore localStorage failures
  }
}

export function loadWorkspaceMode(): WorkspaceMode {
  const value = loadJsonStorage<string | null>(WORKSPACE_MODE_STORAGE_KEY, null);
  if (value === "read") return "read";
  if (value === "split") return "split";
  return "write";
}

export function normalizeMarkdownFontScale(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MARKDOWN_FONT_SCALE;
  }

  const clamped = Math.min(MAX_MARKDOWN_FONT_SCALE, Math.max(MIN_MARKDOWN_FONT_SCALE, value));
  return Math.round(clamped * 20) / 20;
}

export function loadMarkdownFontScale(): number {
  const value = loadJsonStorage<number | null>(MARKDOWN_FONT_SCALE_STORAGE_KEY, null);
  return normalizeMarkdownFontScale(value ?? DEFAULT_MARKDOWN_FONT_SCALE);
}

export function stepMarkdownFontScale(
  value: number,
  direction: -1 | 1,
  step = MARKDOWN_FONT_SCALE_STEP,
): number {
  return normalizeMarkdownFontScale(value + direction * step);
}

export function formatMarkdownFontScale(value: number): string {
  return `${Math.round(normalizeMarkdownFontScale(value) * 100)}%`;
}

export function loadCollapsedState(key: string): boolean {
  return loadJsonStorage<boolean>(key, false);
}

export function rememberLastFile(path: string | null) {
  try {
    if (path) {
      window.localStorage.setItem(LAST_FILE_STORAGE_KEY, path);
    } else {
      window.localStorage.removeItem(LAST_FILE_STORAGE_KEY);
    }
  } catch {
    // ignore localStorage failures
  }
}

export function formatTimestamp(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function truncateMiddle(value: string, max = 54): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const HEADING_ESCAPE_RE = /\\([\\`*_[\]{}()#+\-.!>|])/g;

export function normalizeMarkdownHeadingText(value: string): string {
  return value
    .trim()
    .replace(/\s+#+\s*$/, "")
    .replace(HEADING_ESCAPE_RE, "$1")
    .trim();
}

function decodeFileUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") {
      return null;
    }

    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
    return path;
  } catch {
    return null;
  }
}

export function getDroppedMarkdownPath(event: DragEvent<HTMLDivElement>): string | null {
  const firstFile = event.dataTransfer.files?.[0] as FileWithPath | undefined;
  if (firstFile?.path) {
    return firstFile.path;
  }

  const uriList = event.dataTransfer.getData("text/uri-list");
  if (uriList) {
    const fileUri = uriList
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.startsWith("file://"));
    if (fileUri) {
      return decodeFileUri(fileUri);
    }
  }

  return null;
}

function defaultTitleFromPath(path: string): string {
  if (isUntitledPath(path)) return "Untitled";
  const parts = path.split(/[\\/]/).filter(Boolean);
  const fileName = parts[parts.length - 1] ?? path;
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function extractHeadingsFromContent(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = content.split(/\r?\n/);
  let fenceChar: string | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trimStart();

    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fenceChar === null) {
        fenceChar = marker[0];
      } else if (marker[0] === fenceChar) {
        fenceChar = null;
      }
      continue;
    }

    if (fenceChar !== null) {
      continue;
    }

    if (!trimmed.startsWith("#")) {
      continue;
    }

    const level = trimmed.match(/^#+/)?.[0].length ?? 0;
    if (level < 1 || level > 6) {
      continue;
    }

    // ATX headings require a space (or end-of-line) after the hashes.
    const afterHashes = trimmed.charAt(level);
    if (afterHashes !== "" && afterHashes !== " " && afterHashes !== "\t") {
      continue;
    }

    const text = normalizeMarkdownHeadingText(trimmed.slice(level));
    if (!text) {
      continue;
    }

    headings.push({ level, text, line: index + 1 });
  }

  return headings;
}

function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function estimateReadTimeMinutes(words: number): number {
  return Math.max(1, Math.ceil(Math.max(words, 1) / 220));
}

export function deriveDocumentFromContent(previous: MarkdownDocument, content: string): MarkdownDocument {
  const headings = extractHeadingsFromContent(content);
  const words = countWords(content);
  return {
    ...previous,
    title: headings.find((heading) => heading.level === 1)?.text ?? headings[0]?.text ?? defaultTitleFromPath(previous.path),
    content,
    headings,
    word_count: words,
    estimated_read_time_min: estimateReadTimeMinutes(words),
  };
}

export function translateDocumentError(message: string, t: MarkdownTranslator, fallback?: string): string {
  if (message === "missing required field: path") {
    return t("markdown.reader.pathMissing");
  }
  if (message === "Selected file is not a supported Markdown document.") {
    return t("markdown.reader.notMarkdown");
  }
  if (message.startsWith("path not found: ")) {
    return t("markdown.reader.pathNotFound", { path: message.slice("path not found: ".length) });
  }
  if (message.startsWith("path is not a file: ")) {
    return t("markdown.reader.notFile", { path: message.slice("path is not a file: ".length) });
  }
  if (message === "missing required field: content") {
    return fallback ?? t("markdown.reader.saveFailed");
  }
  if (message.startsWith("path already exists")) {
    return t("markdown.reader.newExists");
  }
  return message || fallback || t("markdown.reader.saveFailed");
}

const TOC_MARKER_RE = /^\[toc\]$/i;

export function hasTocMarker(content: string): boolean {
  return content.split(/\r?\n/).some((line) => TOC_MARKER_RE.test(line.trim()));
}

function headingAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function buildTocMarkdown(headings: MarkdownHeading[]): string {
  if (headings.length === 0) return "";
  const minLevel = Math.min(...headings.map((heading) => heading.level));
  const seenCounts = new Map<string, number>();
  return headings
    .map((heading) => {
      const indent = "  ".repeat(Math.max(0, heading.level - minLevel));
      const base = headingAnchorId(heading.text);
      const seen = seenCounts.get(base) ?? 0;
      seenCounts.set(base, seen + 1);
      const anchor = seen === 0 ? base : `${base}-${seen}`;
      const safeText = heading.text.replace(/\]/g, "\\]");
      return `${indent}- [${safeText}](#${anchor})`;
    })
    .join("\n");
}

export function expandTocMarkers(content: string, headings: MarkdownHeading[]): string {
  if (!hasTocMarker(content)) return content;
  const outline = buildTocMarkdown(headings);
  const replacement = outline || "_No headings_";
  return content
    .split(/\r?\n/)
    .map((line) => (TOC_MARKER_RE.test(line.trim()) ? replacement : line))
    .join("\n");
}
