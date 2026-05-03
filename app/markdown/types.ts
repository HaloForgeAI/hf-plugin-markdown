import type { ReactNode } from "react";
import type { MarkdownTranslationKey } from "../i18n";

export interface RecentMarkdownFile {
  id: string;
  path: string;
  title: string;
  opened_at: string;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
}

export interface MarkdownDocument {
  path: string;
  name: string;
  title: string;
  content: string;
  headings: MarkdownHeading[];
  word_count: number;
  estimated_read_time_min: number;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export type PreviewTheme = "paper" | "focus" | "compact";
export type AssistantIntent = "summarize" | "explain" | "translate" | "ask";
export type WorkspaceMode = "read" | "split" | "write";
export type SessionMap = Record<string, string>;
export type ThreadStore = Record<string, AssistantMessage[]>;
export type MarkdownTranslator = (key: MarkdownTranslationKey, vars?: Record<string, string | number>) => string;

export interface CommandResult {
  success?: boolean;
}

export interface SaveDocumentResult extends CommandResult {
  document: MarkdownDocument;
}

export interface FileWithPath extends File {
  path?: string;
}

export interface SectionTitleProps {
  icon: ReactNode;
  title: string;
  meta?: string;
}