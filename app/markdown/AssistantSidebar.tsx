import type { KeyboardEvent } from "react";
import clsx from "clsx";
import { Bot, ChevronDown, ChevronRight, FileText, MessageSquare, PanelRightClose, PanelRightOpen, RefreshCw, Search, Settings, Trash2 } from "lucide-react";
import { MarkdownRenderer } from "../../../../src/shared/components/MarkdownRenderer";
import type { AssistantIntent, AssistantMessage, MarkdownTranslator } from "./types";
import { formatTimestamp } from "./utils";
import type { ModelConfig } from "../../../../src/shared/types";

interface AssistantSidebarProps {
  activeModel: ModelConfig | null;
  isCollapsed: boolean;
  width?: number;
  onSetCollapsed: (collapsed: boolean) => void;
  isAssistantStreaming: boolean;
  assistantMessages: AssistantMessage[];
  assistantError: string | null;
  question: string;
  selection: string;
  isSelectionCollapsed: boolean;
  onClearSelection: () => void;
  onToggleSelectionCollapsed: () => void;
  onQuestionChange: (value: string) => void;
  onIntent: (intent: AssistantIntent) => void;
  onQuestionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenSettings: () => void;
  onClearMessages: () => void;
  t: MarkdownTranslator;
}

export function AssistantSidebar({
  activeModel,
  isCollapsed,
  width,
  onSetCollapsed,
  isAssistantStreaming,
  assistantMessages,
  assistantError,
  question,
  selection,
  isSelectionCollapsed,
  onClearSelection,
  onToggleSelectionCollapsed,
  onQuestionChange,
  onIntent,
  onQuestionKeyDown,
  onOpenSettings,
  onClearMessages,
  t,
}: AssistantSidebarProps) {
  const sidebarWidth = isCollapsed ? 76 : (width ?? 360);

  return (
    <aside
      className="flex shrink-0 overflow-hidden border-l border-border bg-sidebar/25"
      style={{ width: sidebarWidth }}
    >
      {isCollapsed ? (
        <div className="flex h-full w-full flex-col items-center gap-3 px-3 py-4">
          <button
            title={t("markdown.ai.expandSidebar")}
            onClick={() => onSetCollapsed(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
          >
            <PanelRightOpen size={16} />
          </button>
          <div className="flex w-full flex-col items-center gap-1 rounded-2xl border border-border/70 bg-background/60 px-2 py-3 text-foreground-secondary">
            <Bot size={16} className={clsx(isAssistantStreaming && "animate-pulse text-primary")} />
            <span className="text-[10px] font-semibold">{assistantMessages.length}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col">
          {/* Header — compact single row */}
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Bot size={15} className={clsx("shrink-0 text-primary", isAssistantStreaming && "animate-pulse")} />
              <span className="truncate text-sm font-semibold text-foreground">{t("markdown.ai.title")}</span>
              {activeModel && (
                <span className="shrink-0 rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary/70">
                  {activeModel.display_name}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {assistantMessages.length > 0 && (
                <button
                  title={t("markdown.ai.clearMessages")}
                  onClick={onClearMessages}
                  disabled={isAssistantStreaming}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-secondary/60 transition-colors hover:bg-red-500/8 hover:text-red-400 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                title={t("markdown.ai.collapseSidebar")}
                onClick={() => onSetCollapsed(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground-secondary/60 transition-colors hover:bg-background hover:text-foreground"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </div>

          {/* Messages — dominant, takes all remaining space */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {assistantMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-xs leading-relaxed text-foreground-secondary/45">
                  {t("markdown.ai.empty")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {assistantMessages.map((message) => (
                  <div
                    key={message.id}
                    className={clsx(
                      "rounded-xl border px-3 py-2.5",
                      message.role === "user"
                        ? "border-primary/15 bg-primary/6"
                        : "border-border bg-background/70",
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-secondary/50">
                        {message.role === "user" ? t("markdown.ai.userLabel") : t("markdown.ai.assistantLabel")}
                      </span>
                      <span className="text-[10px] text-foreground-secondary/40">{formatTimestamp(message.createdAt)}</span>
                    </div>
                    {message.role === "assistant" ? (
                      <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
                    ) : (
                      <div className="text-sm leading-relaxed text-foreground">{message.content}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom panel — input + quick actions */}
          <div className="shrink-0 border-t border-border">
            {!activeModel ? (
              <div className="px-4 py-3">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
                  <div>{t("markdown.ai.modelMissing")}</div>
                  <button
                    onClick={onOpenSettings}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-background px-2.5 py-1 text-[11px] text-amber-200 transition-colors hover:bg-surface"
                  >
                    <Settings size={12} />
                    {t("markdown.ai.openSettings")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Selection indicator — compact */}
                {selection && (
                  <div className="border-b border-border/60 px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onToggleSelectionCollapsed}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1.5 text-left transition-colors hover:bg-primary/8"
                      >
                        {isSelectionCollapsed
                          ? <ChevronRight size={12} className="shrink-0 text-primary/70" />
                          : <ChevronDown size={12} className="shrink-0 text-primary/70" />}
                        <span className={clsx(
                          "min-w-0 text-[11px] text-foreground-secondary",
                          isSelectionCollapsed ? "truncate" : "whitespace-pre-wrap break-words",
                        )}>
                          {selection}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={t("markdown.reader.clearSelection")}
                        onClick={onClearSelection}
                        className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] text-foreground-secondary/50 transition-colors hover:bg-background hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick action chips */}
                <div className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-none">
                  <button
                    onClick={() => onIntent("summarize")}
                    disabled={isAssistantStreaming}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground-secondary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-40"
                  >
                    <FileText size={11} />
                    {t("markdown.ai.summarize")}
                  </button>
                  <button
                    onClick={() => onIntent("explain")}
                    disabled={isAssistantStreaming || !selection.trim()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground-secondary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-40"
                  >
                    <Search size={11} />
                    {t("markdown.ai.explainSelection")}
                  </button>
                  <button
                    onClick={() => onIntent("translate")}
                    disabled={isAssistantStreaming || !selection.trim()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground-secondary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-40"
                  >
                    <MessageSquare size={11} />
                    {t("markdown.ai.translateSelection")}
                  </button>
                </div>

                {/* Textarea + send */}
                <div className="px-4 pb-4">
                  <div className="rounded-xl border border-border bg-background px-3 py-2.5 transition-colors focus-within:border-primary/50">
                    <textarea
                      value={question}
                      onChange={(event) => onQuestionChange(event.target.value)}
                      onKeyDown={onQuestionKeyDown}
                      placeholder={t("markdown.ai.askPlaceholder")}
                      rows={3}
                      className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-secondary/35"
                      style={{ outline: "none", boxShadow: "none" }}
                    />
                    <div className="flex items-center justify-between gap-2 pt-1.5">
                      <span className="text-[10px] text-foreground-secondary/40">⌘ Enter</span>
                      <button
                        onClick={() => onIntent("ask")}
                        disabled={isAssistantStreaming || !question.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
                      >
                        {isAssistantStreaming && <RefreshCw size={12} className="animate-spin" />}
                        {isAssistantStreaming ? t("markdown.ai.generating") : t("markdown.ai.send")}
                      </button>
                    </div>
                  </div>

                  {assistantError && (
                    <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                      {assistantError}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
