import type { ReactNode } from "react";
import clsx from "clsx";
import { BookOpen, Columns2, FilePenLine, Minus, Palette, Plus, RefreshCw, Save } from "lucide-react";
import type {
  MarkdownDocument,
  MarkdownTranslator,
  PreviewTheme,
  WorkspaceMode,
} from "./types";

interface MarkdownHeaderProps {
  document: MarkdownDocument | null;
  isDirty: boolean;
  savingDocument: boolean;
  workspaceMode: WorkspaceMode;
  previewTheme: PreviewTheme;
  fontScaleLabel: string;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onPreviewThemeChange: (theme: PreviewTheme) => void;
  onDecreaseFontScale: () => void;
  onIncreaseFontScale: () => void;
  onResetFontScale: () => void;
  onSave: () => void;
  t: MarkdownTranslator;
}

interface ToolbarIconButtonProps {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarIconButton({ title, active = false, disabled = false, onClick, children }: ToolbarIconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-primary bg-primary text-white shadow-sm"
          : "border-transparent bg-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      {children}
    </button>
  );
}

function getWorkspaceModeLabel(mode: WorkspaceMode, t: MarkdownTranslator) {
  switch (mode) {
    case "read":
      return t("markdown.reader.mode.read");
    case "split":
      return t("markdown.reader.mode.split");
    case "write":
      return t("markdown.reader.mode.write");
  }
}

function getPreviewThemeLabel(theme: PreviewTheme, t: MarkdownTranslator) {
  switch (theme) {
    case "paper":
      return t("markdown.reader.theme.paper");
    case "focus":
      return t("markdown.reader.theme.focus");
    case "compact":
      return t("markdown.reader.theme.compact");
  }
}

export function MarkdownHeader({
  document,
  isDirty,
  savingDocument,
  workspaceMode,
  previewTheme,
  fontScaleLabel,
  onWorkspaceModeChange,
  onPreviewThemeChange,
  onDecreaseFontScale,
  onIncreaseFontScale,
  onResetFontScale,
  onSave,
  t,
}: MarkdownHeaderProps) {
  const workspaceModes: Array<{ mode: WorkspaceMode; icon: typeof BookOpen }> = [
    { mode: "read", icon: BookOpen },
    { mode: "split", icon: Columns2 },
    { mode: "write", icon: FilePenLine },
  ];
  const previewThemes: PreviewTheme[] = ["paper", "focus", "compact"];

  const documentMeta = document
    ? [
        t("markdown.reader.words", { count: document.word_count }),
        t("markdown.reader.readTime", { count: document.estimated_read_time_min }),
      ].join(" · ")
    : null;

  const saveTitle = savingDocument
    ? t("markdown.reader.saving")
    : isDirty
      ? t("markdown.reader.save")
      : t("markdown.reader.saved");

  return (
    <div className="border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        {/* Title — primary, takes all remaining space */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <FilePenLine size={13} className="shrink-0 text-primary" />
            <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
              {document?.title ?? t("markdown.reader.preview")}
            </h2>
            {document && (
              <span
                className={clsx(
                  "shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.12em]",
                  isDirty
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-emerald-500/10 text-emerald-300",
                )}
              >
                {isDirty ? t("markdown.reader.unsaved") : t("markdown.reader.saved")}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-foreground-secondary/50">
            {document
              ? [document.path, documentMeta].filter(Boolean).join("  ·  ")
              : t("markdown.reader.emptyState")}
          </p>
        </div>

        {/* Toolbar — compact, never shrinks */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Mode switcher */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-0.5 shadow-sm">
            {workspaceModes.map(({ mode, icon: Icon }) => (
              <ToolbarIconButton
                key={mode}
                title={getWorkspaceModeLabel(mode, t)}
                active={workspaceMode === mode}
                onClick={() => onWorkspaceModeChange(mode)}
              >
                <Icon size={13} />
              </ToolbarIconButton>
            ))}
          </div>

          {/* Font size */}
          <div
            className={clsx(
              "flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-0.5 shadow-sm",
              !document && "invisible pointer-events-none",
            )}
            aria-hidden={!document}
          >
            <ToolbarIconButton
              title={`${t("markdown.reader.fontDecrease")} · Cmd/Ctrl -`}
              onClick={onDecreaseFontScale}
            >
              <Minus size={12} />
            </ToolbarIconButton>
            <button
              type="button"
              title={`${t("markdown.reader.fontReset")} · Cmd/Ctrl 0`}
              onClick={onResetFontScale}
              className="inline-flex h-7 min-w-[40px] items-center justify-center rounded-full border border-transparent px-1.5 text-[11px] font-medium text-foreground-secondary transition-colors hover:border-border hover:bg-surface hover:text-foreground"
            >
              {fontScaleLabel}
            </button>
            <ToolbarIconButton
              title={`${t("markdown.reader.fontIncrease")} · Cmd/Ctrl +`}
              onClick={onIncreaseFontScale}
            >
              <Plus size={12} />
            </ToolbarIconButton>
          </div>

          {/* Theme picker — read mode only, reserved so mode buttons never shift */}
          <div
            className={clsx(
              "flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-0.5 shadow-sm",
              workspaceMode !== "read" && "invisible pointer-events-none",
            )}
            title={t("markdown.reader.previewStyle")}
            aria-hidden={workspaceMode !== "read"}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center text-foreground-secondary/60">
              <Palette size={12} />
            </span>
            {previewThemes.map((theme) => {
              const isActive = previewTheme === theme;
              const label = getPreviewThemeLabel(theme, t);
              return (
                <button
                  key={theme}
                  type="button"
                  title={label}
                  aria-pressed={isActive}
                  tabIndex={workspaceMode === "read" ? 0 : -1}
                  onClick={() => onPreviewThemeChange(theme)}
                  className={clsx(
                    "inline-flex h-7 items-center justify-center rounded-full px-2 text-[11px] font-medium transition-colors",
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-foreground-secondary hover:bg-surface hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Save */}
          <div
            className={clsx(
              "flex items-center rounded-full border border-border bg-background/90 p-0.5 shadow-sm",
              !document && "invisible pointer-events-none",
            )}
            aria-hidden={!document}
          >
            <ToolbarIconButton
              title={saveTitle}
              disabled={!isDirty || savingDocument}
              onClick={onSave}
            >
              {savingDocument ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            </ToolbarIconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
