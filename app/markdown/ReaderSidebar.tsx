import { useMemo, useState } from "react";
import clsx from "clsx";
import { Copy, FileText, FilePlus, FileX2, FolderOpen, ListTree, PanelLeftClose, PanelLeftOpen, Search, SquareArrowOutUpRight, Trash2, X } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { MarkdownDocument, MarkdownTranslator, RecentMarkdownFile } from "./types";
import { formatTimestamp, isUntitledPath } from "./utils";
import { SectionTitle } from "./SectionTitle";
import { EditorContextMenu, type ContextMenuItem } from "./EditorContextMenu";

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
  onClearRecent: () => void;
  onPruneMissing: () => void;
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
  onClearRecent,
  onPruneMissing,
  onJumpToHeading,
  activeHeadingIndex,
  t,
}: ReaderSidebarProps) {
  const sidebarWidth = isCollapsed ? 76 : (width ?? 280);
  const [filter, setFilter] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [recentMenu, setRecentMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const openRecentMenu = (event: React.MouseEvent, file: RecentMarkdownFile) => {
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuItem[] = [
      {
        id: "open",
        label: t("markdown.reader.ctx.openFile"),
        icon: <FileText size={14} />,
        onSelect: () => onOpenDocument(file.path),
      },
      {
        id: "reveal",
        label: t("markdown.reader.ctx.revealInFolder"),
        icon: <SquareArrowOutUpRight size={14} />,
        disabled: isUntitledPath(file.path),
        onSelect: () => {
          void revealItemInDir(file.path).catch((error) => console.warn("reveal failed", error));
        },
      },
      {
        id: "copy",
        label: t("markdown.reader.ctx.copyPath"),
        icon: <Copy size={14} />,
        onSelect: () => {
          void navigator.clipboard?.writeText(file.path).catch(() => undefined);
        },
      },
      { id: "sep", separator: true },
      {
        id: "remove",
        label: t("markdown.reader.ctx.removeFromList"),
        icon: <X size={14} />,
        onSelect: () => onRemoveRecent(file.path),
      },
      {
        id: "prune",
        label: t("markdown.reader.ctx.pruneMissing"),
        icon: <FileX2 size={14} />,
        danger: true,
        onSelect: onPruneMissing,
      },
    ];
    setRecentMenu({ x: event.clientX, y: event.clientY, items });
  };

  const filteredRecent = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return recentFiles;
    return recentFiles.filter((file) => {
      const name = fileNameFromPath(file.path).toLowerCase();
      return name.includes(needle) || file.path.toLowerCase().includes(needle);
    });
  }, [recentFiles, filter]);

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

        {isCollapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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
                <ListTree size={14} />
                <span className="text-[10px] font-semibold">{document?.headings.length ?? 0}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Recent files — bounded, independently scrollable region */}
            <div className="flex min-h-0 flex-col px-3 pt-3" style={{ flex: "1 1 42%" }}>
              <div className="flex items-center justify-between gap-1 pr-0.5">
                <SectionTitle
                  icon={<FileText size={13} />}
                  title={t("markdown.reader.recentFiles")}
                  meta={String(recentFiles.length)}
                />
                {recentFiles.length > 0 && (
                  <button
                    type="button"
                    title={t("markdown.reader.clearRecent")}
                    onClick={() => setConfirmingClear((previous) => !previous)}
                    className={clsx(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
                      confirmingClear
                        ? "bg-red-500/15 text-red-400"
                        : "text-foreground-secondary/55 hover:bg-background hover:text-red-400",
                    )}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {confirmingClear && (
                <div className="mt-1.5 rounded-md border border-red-500/25 bg-red-500/[0.06] px-2.5 py-2 text-[11px] text-foreground-secondary">
                  <p className="leading-snug">
                    {t("markdown.reader.clearRecentConfirm")}
                  </p>
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(false)}
                      className="inline-flex h-6 items-center rounded-md border border-border bg-background px-2 text-[11px] text-foreground-secondary hover:text-foreground"
                    >
                      {t("markdown.reader.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingClear(false);
                        onClearRecent();
                      }}
                      className="inline-flex h-6 items-center rounded-md bg-red-500 px-2 text-[11px] font-medium text-white hover:bg-red-500/90"
                    >
                      {t("markdown.reader.clearRecentAction")}
                    </button>
                  </div>
                </div>
              )}

              {recentFiles.length > 4 && (
                <div className="relative mt-1.5">
                  <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-foreground-secondary/45" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder={t("markdown.reader.filterRecent")}
                    className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-6 text-[12px] text-foreground outline-none placeholder:text-foreground-secondary/45 focus:border-primary/50"
                  />
                  {filter && (
                    <button
                      type="button"
                      onClick={() => setFilter("")}
                      className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-foreground-secondary/60 hover:text-foreground"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2 pr-0.5">
                {recentFiles.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-foreground-secondary/55">
                    {t("markdown.reader.emptyRecent")}
                  </div>
                ) : filteredRecent.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-foreground-secondary/55">
                    {t("markdown.reader.noRecentMatch")}
                  </div>
                ) : (
                  filteredRecent.map((file) => {
                    const isActive = file.path === document?.path;
                    const displayName = fileNameFromPath(file.path);
                    return (
                      <div
                        key={file.id}
                        onContextMenu={(event) => openRecentMenu(event, file)}
                        className={clsx(
                          "hf-md-recent-row flex h-7 items-center gap-1 rounded-md px-2 transition-colors",
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
                          className="hf-md-recent-remove"
                        >
                          <X size={11} className="mx-auto" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Outline — independently scrollable region */}
            <div className="flex min-h-0 flex-col border-t border-border/60 px-3 pb-3 pt-2.5" style={{ flex: "1 1 58%" }}>
              <SectionTitle
                icon={<ListTree size={13} />}
                title={t("markdown.reader.outline")}
                meta={document ? String(document.headings.length) : undefined}
              />
              <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-0.5">
                {!document || document.headings.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-foreground-secondary/55">
                    {t("markdown.reader.emptyOutline")}
                  </div>
                ) : (
                  <div className="space-y-0.5">
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
            </div>
          </div>
        )}
      </div>
      {recentMenu && (
        <EditorContextMenu
          x={recentMenu.x}
          y={recentMenu.y}
          items={recentMenu.items}
          onClose={() => setRecentMenu(null)}
        />
      )}
    </aside>
  );
}
