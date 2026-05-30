import clsx from "clsx";
import { FilePlus, FileText, FolderOpen, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import type { MarkdownDocument, MarkdownTranslator, RecentMarkdownFile } from "./types";
import { formatTimestamp } from "./utils";
import { SectionTitle } from "./SectionTitle";

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function resolveHeadingRowClass(level: number): string {
  if (level <= 1) return "text-[13px] font-semibold text-foreground";
  if (level === 2) return "text-[12.5px] font-medium text-foreground";
  if (level === 3) return "text-[12px] text-foreground/90";
  if (level === 4) return "text-[11.5px] text-foreground-secondary";
  if (level === 5) return "text-[11px] text-foreground-secondary/80";
  return "text-[10.5px] text-foreground-secondary/70";
}

interface ReaderSidebarProps {
  recentFiles: RecentMarkdownFile[];
  document: MarkdownDocument | null;
  isCollapsed: boolean;
  width?: number;
  onSetCollapsed: (collapsed: boolean) => void;
  onPickFile: () => void;
  onCreateFile: () => void;
  onOpenDocument: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onJumpToHeading: (index: number) => void;
  activeHeadingIndex?: number | null;
  t: MarkdownTranslator;
}

export function ReaderSidebar({
  recentFiles,
  document,
  isCollapsed,
  width,
  onSetCollapsed,
  onPickFile,
  onCreateFile,
  onOpenDocument,
  onRemoveRecent,
  onJumpToHeading,
  activeHeadingIndex,
  t,
}: ReaderSidebarProps) {
  const sidebarWidth = isCollapsed ? 76 : (width ?? 280);

  return (
    <aside
      className="flex shrink-0 overflow-hidden border-r border-border bg-sidebar/35"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-full w-full flex-col">
        <div className="border-b border-border px-3 py-3">
          <div className={clsx("flex items-center gap-1.5", isCollapsed ? "flex-col" : "flex-nowrap")}>
            <button
              onClick={onPickFile}
              title={t("markdown.reader.open")}
              className={clsx(
                "inline-flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-lg bg-primary text-xs font-medium text-white transition-colors hover:bg-primary/90",
                isCollapsed ? "h-9 w-9" : "h-8 flex-1 gap-1.5 px-3",
              )}
            >
              <FolderOpen size={14} />
              {!isCollapsed && t("markdown.reader.open")}
            </button>
            <button
              onClick={onCreateFile}
              title={t("markdown.reader.new")}
              className={clsx(
                "inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground",
                isCollapsed ? "h-9 w-9" : "h-8 w-8 shrink-0",
              )}
            >
              <FilePlus size={14} />
            </button>
            <button
              title={isCollapsed ? t("markdown.reader.expandSidebar") : t("markdown.reader.collapseSidebar")}
              onClick={() => onSetCollapsed(!isCollapsed)}
              className={clsx(
                "inline-flex items-center justify-center rounded-lg border border-border bg-background text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground",
                isCollapsed ? "h-9 w-9" : "h-8 w-8 shrink-0",
              )}
            >
              {isCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {isCollapsed ? (
            <div className="flex h-full flex-col items-center gap-2 pt-1">
              <button
                title={t("markdown.reader.recentFiles")}
                onClick={() => onSetCollapsed(false)}
                className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 px-2 py-2 text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                <FileText size={14} />
                <span className="text-[10px] font-semibold">{recentFiles.length}</span>
              </button>
              <button
                title={t("markdown.reader.outline")}
                onClick={() => onSetCollapsed(false)}
                className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 px-2 py-2 text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                <Search size={14} />
                <span className="text-[10px] font-semibold">{document?.headings.length ?? 0}</span>
              </button>
            </div>
          ) : (
            <>
              <SectionTitle icon={<FileText size={13} />} title={t("markdown.reader.recentFiles")} meta={String(recentFiles.length)} />
              <div className="mt-1 space-y-0.5">
                {recentFiles.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-foreground-secondary/55">
                    {t("markdown.reader.emptyRecent")}
                  </div>
                )}

                {recentFiles.map((file) => {
                  const isActive = file.path === document?.path;
                  const displayName = fileNameFromPath(file.path);
                  return (
                    <div
                      key={file.id}
                      className={clsx(
                        "group flex h-7 items-center gap-1 rounded-md px-2 transition-colors",
                        isActive
                          ? "bg-primary/15 text-foreground"
                          : "text-foreground-secondary hover:bg-primary/[0.06] hover:text-foreground",
                      )}
                    >
                      <button
                        onClick={() => onOpenDocument(file.path)}
                        title={`${displayName}\n${file.path}\n${formatTimestamp(file.opened_at)}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <FileText
                          size={12}
                          className={clsx("shrink-0", isActive ? "text-primary" : "text-foreground-secondary/50")}
                        />
                        <span className="truncate text-[13px]">{displayName}</span>
                      </button>
                      <button
                        title={t("markdown.reader.removeRecent")}
                        onClick={() => onRemoveRecent(file.path)}
                        className="invisible h-5 w-5 shrink-0 rounded text-foreground-secondary/60 transition-colors hover:bg-background hover:text-red-400 group-hover:visible"
                      >
                        <X size={11} className="mx-auto" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5">
                <SectionTitle
                  icon={<Search size={13} />}
                  title={t("markdown.reader.outline")}
                  meta={document ? String(document.headings.length) : undefined}
                />
                {!document || document.headings.length === 0 ? (
                  <div className="mt-1 rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-foreground-secondary/55">
                    {t("markdown.reader.emptyOutline")}
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {document.headings.map((heading, index) => (
                      <button
                        key={`${heading.line}-${heading.text}`}
                        type="button"
                        title={`${heading.text} · L${heading.line}`}
                        onClick={() => onJumpToHeading(index)}
                        className={clsx(
                          "hf-outline-heading flex w-full items-center rounded-md py-1 pr-2 text-left leading-tight transition-colors hover:bg-primary/[0.08] hover:text-foreground focus-visible:bg-primary/[0.1] focus-visible:outline-none",
                          activeHeadingIndex === index && "hf-outline-heading--active",
                          resolveHeadingRowClass(heading.level),
                        )}
                        aria-current={activeHeadingIndex === index ? "location" : undefined}
                        style={{ paddingLeft: `${6 + (heading.level - 1) * 12}px` }}
                      >
                        <span className="truncate">{heading.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
