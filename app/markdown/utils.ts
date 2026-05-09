import type { DragEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invokePlugin } from "@haloforge/plugin-sdk";
import type {
  AssistantIntent,
  AssistantMessage,
  FileWithPath,
  MarkdownDocument,
  MarkdownHeading,
  MarkdownTranslator,
  PreviewTheme,
  SessionMap,
  ThreadStore,
  WorkspaceMode,
} from "./types";

export const LAST_FILE_STORAGE_KEY = "hf-plugin-markdown:last-file";
export const SESSION_MAP_STORAGE_KEY = "hf-plugin-markdown:assistant-session-map";
export const THREADS_STORAGE_KEY = "hf-plugin-markdown:assistant-threads";
export const PREVIEW_THEME_STORAGE_KEY = "hf-plugin-markdown:preview-theme";
export const WORKSPACE_MODE_STORAGE_KEY = "hf-plugin-markdown:workspace-mode";
export const MARKDOWN_FONT_SCALE_STORAGE_KEY = "hf-plugin-markdown:font-scale";
export const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY = "hf-plugin-markdown:left-sidebar-collapsed";
export const RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY = "hf-plugin-markdown:right-sidebar-collapsed";
export const MARKDOWN_FILTERS = ["md", "markdown", "mdown", "mkd"];
export const MAX_CONTEXT_CHARS = 14000;
export const MAX_SELECTION_CHARS = 2400;
export const MAX_STORED_THREAD_MESSAGES = 24;
export const PREVIEW_THEME_OPTIONS: PreviewTheme[] = ["paper", "focus", "compact"];
export const DEFAULT_MARKDOWN_FONT_SCALE = 1;
export const MIN_MARKDOWN_FONT_SCALE = 0.8;
export const MAX_MARKDOWN_FONT_SCALE = 1.6;
export const MARKDOWN_FONT_SCALE_STEP = 0.1;

export const MARKDOWN_ASSISTANT_SYSTEM_PROMPT = `你是 HaloForge 的 Markdown 阅读助手。

你的任务不是泛泛聊天，而是严格围绕用户当前打开的 Markdown 文档提供帮助：
- 总结文档
- 解释用户选中的段落
- 翻译选中内容
- 回答关于该文档的问题

回答要求：
- 默认使用中文
- 优先基于提供的文档上下文，不要编造文档中没有的事实
- 若上下文不足，要明确说明信息不足
- 回答尽量结构化，便于继续阅读和编辑
- 回答长度适中，不要无谓重复用户已提供的原文`;

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

export function loadPreviewTheme(): PreviewTheme {
  const value = loadJsonStorage<string | null>(PREVIEW_THEME_STORAGE_KEY, null);
  if (value === "paper" || value === "focus" || value === "compact") {
    return value;
  }
  return "paper";
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
  return Math.round(clamped * 10) / 10;
}

export function loadMarkdownFontScale(): number {
  const value = loadJsonStorage<number | null>(MARKDOWN_FONT_SCALE_STORAGE_KEY, null);
  return normalizeMarkdownFontScale(value ?? DEFAULT_MARKDOWN_FONT_SCALE);
}

export function stepMarkdownFontScale(value: number, direction: -1 | 1): number {
  return normalizeMarkdownFontScale(value + direction * MARKDOWN_FONT_SCALE_STEP);
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

export function loadSessionMap(): SessionMap {
  return loadJsonStorage<SessionMap>(SESSION_MAP_STORAGE_KEY, {});
}

export function saveSessionMap(value: SessionMap) {
  saveJsonStorage(SESSION_MAP_STORAGE_KEY, value);
}

export function loadThreads(): ThreadStore {
  return loadJsonStorage<ThreadStore>(THREADS_STORAGE_KEY, {});
}

export function saveThreads(value: ThreadStore) {
  saveJsonStorage(THREADS_STORAGE_KEY, value);
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

export function getSelectionText(container: HTMLElement | null): string {
  if (!container) return "";
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return "";

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) return "";
  if (!container.contains(anchorNode) || !container.contains(focusNode)) return "";

  return selection.toString().trim();
}

function defaultTitleFromPath(path: string): string {
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

export function resolvePreviewThemeClass(theme: PreviewTheme) {
  if (theme === "focus") {
    return "hf-preview-surface hf-preview-surface--focus max-w-[780px] bg-background/70";
  }
  if (theme === "compact") {
    return "hf-preview-surface hf-preview-surface--compact max-w-[840px] bg-background/90";
  }
  return "hf-preview-surface hf-preview-surface--paper max-w-[960px] bg-background";
}

export function buildDisplayPrompt(
  intent: AssistantIntent,
  question: string,
  selection: string,
  t: MarkdownTranslator,
) {
  if (intent === "summarize") {
    return t("markdown.ai.action.summarize");
  }
  if (intent === "explain") {
    return selection || t("markdown.ai.action.explain");
  }
  if (intent === "translate") {
    return selection || t("markdown.ai.action.translate");
  }
  return question.trim();
}

function buildContextWindow(document: MarkdownDocument, selection: string): string {
  const trimmedSelection = selection.trim().slice(0, MAX_SELECTION_CHARS);
  const outline = document.headings
    .slice(0, 18)
    .map((heading) => `${"  ".repeat(Math.max(0, heading.level - 1))}- ${heading.text}`)
    .join("\n");

  if (trimmedSelection) {
    const leading = document.content.slice(0, Math.min(document.content.length, MAX_CONTEXT_CHARS / 2));
    const trailing = document.content.length > MAX_CONTEXT_CHARS / 2
      ? document.content.slice(-Math.min(document.content.length, MAX_CONTEXT_CHARS / 3))
      : "";

    return [
      `用户当前选中的文本：\n"""\n${trimmedSelection}\n"""`,
      outline ? `文档大纲：\n${outline}` : "",
      `文档前文上下文：\n"""\n${leading}\n"""`,
      trailing ? `文档末尾上下文：\n"""\n${trailing}\n"""` : "",
    ].filter(Boolean).join("\n\n");
  }

  const excerpt = document.content.slice(0, Math.min(document.content.length, MAX_CONTEXT_CHARS));
  return [
    outline ? `文档大纲：\n${outline}` : "",
    `文档内容上下文：\n"""\n${excerpt}${document.content.length > excerpt.length ? "\n\n[内容已截断]" : ""}\n"""`,
  ].filter(Boolean).join("\n\n");
}

export function buildAssistantPrompt(
  intent: AssistantIntent,
  document: MarkdownDocument,
  selection: string,
  question: string,
) {
  const baseInstruction = intent === "summarize"
    ? "请总结当前 Markdown 文档，给出核心结论、主要章节和推荐的下一步阅读重点。"
    : intent === "explain"
      ? "请解释用户当前选中的内容，先说明它在文档中的作用，再给出必要的背景知识。"
      : intent === "translate"
        ? "请把用户当前选中的内容翻译成简洁自然的中文，并保留必要的 Markdown 语义。"
        : `请围绕当前 Markdown 文档回答这个问题：${question.trim()}`;

  return [
    `文档标题：${document.title}`,
    `文档路径：${document.path}`,
    buildContextWindow(document, selection),
    baseInstruction,
    "回答要求：如果上下文不足，请明确指出缺失的信息；如果是总结，尽量使用项目符号；如果是解释或翻译，优先针对选区，不要泛化。",
  ].join("\n\n");
}

export function upsertAssistantMessage(messages: AssistantMessage[], chunk: { message_id: string; delta: string; done: boolean }): AssistantMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === chunk.message_id);
  if (existingIndex === -1) {
    return [
      ...messages,
      {
        id: chunk.message_id,
        role: "assistant",
        content: chunk.delta,
        createdAt: new Date().toISOString(),
        isStreaming: !chunk.done,
      },
    ];
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) return message;
    return {
      ...message,
      content: `${message.content}${chunk.delta}`,
      isStreaming: !chunk.done,
    };
  });
}

export function trimStoredThread(messages: AssistantMessage[]): AssistantMessage[] {
  if (messages.length <= MAX_STORED_THREAD_MESSAGES) {
    return messages;
  }
  return messages.slice(messages.length - MAX_STORED_THREAD_MESSAGES);
}

const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "m4a"]);

export type MediaKind = "image" | "video" | "audio";

export function detectMediaKindFromSrc(src: string | undefined | null): MediaKind {
  if (!src) return "image";
  const withoutQuery = src.split(/[?#]/)[0] ?? "";
  const dot = withoutQuery.lastIndexOf(".");
  if (dot < 0) return "image";
  const ext = withoutQuery.slice(dot + 1).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "image";
}

function getParentDirSeparator(path: string): string {
  return /\\/.test(path) && !/\//.test(path) ? "\\" : "/";
}

function getMarkdownParentDir(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return "";
  return normalized.slice(0, lastSlash);
}

export function resolveLocalAssetSrc(rawSrc: string | undefined, sourcePath: string | null | undefined): string | undefined {
  if (!rawSrc) return rawSrc;
  const trimmed = rawSrc.trim();
  if (!trimmed) return rawSrc;

  if (ABSOLUTE_URL_RE.test(trimmed) || trimmed.startsWith("//") || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("#")) {
    return trimmed;
  }

  if (!sourcePath) return trimmed;

  const parentDir = getMarkdownParentDir(sourcePath);
  if (!parentDir) return trimmed;

  const decodedSrc = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();

  const cleaned = decodedSrc.replace(/\\/g, "/").replace(/^\.\//, "");
  const sep = getParentDirSeparator(sourcePath);
  const joined = `${parentDir}/${cleaned}`.replace(/\/+/g, "/");
  const absolute = sep === "\\" ? joined.replace(/\//g, "\\") : joined;

  try {
    return convertFileSrc(absolute);
  } catch {
    return trimmed;
  }
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
