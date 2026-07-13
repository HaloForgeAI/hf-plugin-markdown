import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties } from "react";
import clsx from "clsx";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ClipboardPaste, Code, Copy, Heading,
  Image as ImageIcon, Italic, Link2, List, ListChecks, ListOrdered, Quote, Scissors,
  Strikethrough, Table as TableIcon, Trash2,
} from "lucide-react";
import "./vditorLocalAssets";
import Vditor from "./vendor/vditor/dist/index.js";
import "./vendor/vditor/dist/index.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getMarkdownCodeTheme, queueMarkdownCodeHighlight } from "./markdown/codeHighlight";
import type { MarkdownHeading } from "./markdown/types";
import { isUntitledPath, markdownInvoke } from "./markdown/utils";
import { useMarkdownT } from "./i18n";
import { VDITOR_CDN, VDITOR_ZH_CN_I18N } from "./vditorConfig";
import { EditorContextMenu, LinkEditorPopover, TableGridPicker, type ContextMenuItem } from "./markdown/EditorContextMenu";
import {
  buildTableMarkdown, domDeleteColumn, domDeleteRow, domInsertColumn, domInsertRow,
  domSetColumnAlign, findCellFromNode, findTableFromNode, triggerToolbarAction,
} from "./markdown/editorActions";

type VditorInstance = InstanceType<typeof Vditor>;
type ToolbarItem = string | { name: string; tipPosition: string };
type EditorMode = "ir" | "sv" | "wysiwyg";

type VditorInternal = {
  currentMode?: EditorMode;
  sv?: { element: HTMLElement };
  ir?: { element: HTMLElement };
  wysiwyg?: { element: HTMLElement };
  element?: HTMLElement;
  preview?: { element: HTMLElement; previewElement: HTMLElement };
  lute?: { VditorDOM2Md?: (html: string) => string };
  options?: { customRenders?: Array<{ language: string; render: (element: HTMLElement, vditor: unknown) => void }> };
};

const SPECIAL_RENDER_LANGUAGES = new Set([
  "abc",
  "echarts",
  "flowchart",
  "graphviz",
  "markmap",
  "math",
  "mermaid",
  "mindmap",
  "plantuml",
  "smiles",
]);

interface MarkdownEditorSurfaceProps {
  value: string;
  sourcePath: string | null;
  headings?: MarkdownHeading[];
  themeType: "light" | "dark";
  placeholder: string;
  documentPath: string | null;
  fontScale: number;
  focusToken?: string;
  variant?: "standalone" | "split";
  onChange: (value: string) => void;
  onSelectionChange?: (selection: string) => void;
  onActiveHeadingChange?: (index: number | null) => void;
}

export interface MarkdownEditorSurfaceHandle {
  jumpToHeading: (index: number) => boolean;
  getActiveHeadingIndex: () => number | null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const MarkdownEditorSurface = forwardRef<MarkdownEditorSurfaceHandle, MarkdownEditorSurfaceProps>(function MarkdownEditorSurface({
  value,
  sourcePath: _sourcePath,
  headings = [],
  themeType: _themeType,
  placeholder,
  documentPath,
  fontScale,
  focusToken,
  variant = "standalone",
  onChange,
  onSelectionChange,
  onActiveHeadingChange,
}, ref) {
  const t = useMarkdownT();
  const surfaceStyle = {
    "--hf-md-font-scale": String(fontScale),
  } as CSSProperties;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [gridPicker, setGridPicker] = useState<{ x: number; y: number } | null>(null);
  const [linkEditor, setLinkEditor] = useState<{ x: number; y: number; text: string; href: string } | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const contextCellRef = useRef<HTMLTableCellElement | null>(null);
  const contextAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onActiveHeadingChangeRef = useRef(onActiveHeadingChange);
  const valueRef = useRef(value);
  const headingsRef = useRef(headings);
  const documentPathRef = useRef(documentPath);
  const vditorHostRef = useRef<HTMLDivElement | null>(null);
  const vditorRef = useRef<VditorInstance | null>(null);
  const isVditorReadyRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const pendingHeadingJumpRef = useRef<number | null>(null);
  const sourcePathRef = useRef(_sourcePath);
  const themeTypeRef = useRef(_themeType);
  const pendingInitialValueRef = useRef(value);
  const cancelHighlightRef = useRef<(() => void) | null>(null);
  const selectionGestureUntilRef = useRef(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onActiveHeadingChangeRef.current = onActiveHeadingChange;
  }, [onActiveHeadingChange]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    headingsRef.current = headings;
  }, [headings]);

  useEffect(() => {
    sourcePathRef.current = _sourcePath;
  }, [_sourcePath]);

  useEffect(() => {
    themeTypeRef.current = _themeType;
  }, [_themeType]);

  useEffect(() => {
    documentPathRef.current = documentPath;
  }, [documentPath]);

  useImperativeHandle(ref, () => ({
    jumpToHeading: (index: number) => jumpToEditorHeading(index),
    getActiveHeadingIndex: () => getCurrentEditorHeadingIndex(),
  }), []);

  useEffect(() => {
    const host = vditorHostRef.current;
    if (!host) return;

    host.innerHTML = "";
    cancelHighlightRef.current?.();
    cancelHighlightRef.current = null;
    isVditorReadyRef.current = false;
    pendingInitialValueRef.current = valueRef.current;
    const isSplitMode = variant === "split";
    // Standalone "write" mode uses IR (instant rendering) — vditor's Typora-like
    // model where a node's raw markers (`[text](url)`, code fences, emphasis)
    // are revealed only while the caret is on that node (via expandMarker) and
    // render everywhere else. Split mode stays on the source (sv) view.
    const editorMode: EditorMode = isSplitMode ? "sv" : "ir";
    const activeListenerElements: HTMLElement[] = [];

    const editor = new Vditor(host, {
      mode: editorMode,
      value: pendingInitialValueRef.current,
      height: "100%",
      minHeight: 320,
      placeholder,
      theme: _themeType === "dark" ? "dark" : "classic",
      lang: "zh_CN",
      i18n: VDITOR_ZH_CN_I18N,
      cdn: VDITOR_CDN,
      _lutePath: `${VDITOR_CDN}/dist/js/lute/lute.min.js`,
      cache: { enable: false },
      counter: { enable: false },
      tab: "  ",
      preview: {
        actions: [],
        delay: 80,
        maxWidth: isSplitMode ? 760 : 800,
        mode: isSplitMode ? "both" : "editor",
        theme: {
          current: _themeType === "dark" ? "dark" : "light",
          path: `${VDITOR_CDN}/dist/css/content-theme`,
        },
        hljs: {
          enable: true,
          style: getMarkdownCodeTheme(_themeType),
          lineNumber: false,
        },
        markdown: {
          codeBlockPreview: true,
          mathBlockPreview: true,
          toc: true,
        },
        parse: () => {
          normalizeVditorRenderedDom(host);
          renderPendingVditorPreviews(host);
        },
      },
      link: {
        isOpen: false,
        click: () => undefined,
      },
      image: {
        // The panel provides a unified click-to-preview lightbox across all
        // three modes, so vditor's own image preview stays disabled.
        isPreview: false,
      },
      toolbar: getHaloForgeToolbarConfig(),
      toolbarConfig: {
        pin: true,
      },
      input: (nextValue: string) => {
        if (shouldIgnoreSelectionOnlyInput(nextValue)) {
          restoreEditorValueAfterSelectionGesture(editor, host);
          return;
        }
        valueRef.current = nextValue;
        onChangeRef.current(nextValue);
        if (isSplitMode) {
          window.setTimeout(() => {
            if (vditorRef.current === editor && isVditorReadyRef.current) {
              editor.renderPreview();
            }
          }, 0);
        }
        window.requestAnimationFrame(() => {
          normalizeVditorRenderedDom(host);
        renderPendingVditorPreviews(host);
        queueEditorHighlight(host);
        emitActiveHeadingChange();
      });
      },
      select: (selected: string) => {
        onSelectionChangeRef.current?.(selected.trim());
      },
      unSelect: () => {
        onSelectionChangeRef.current?.("");
      },
      after: () => {
        vditorRef.current = editor;
        isVditorReadyRef.current = true;
        normalizeVditorRenderedDom(host);
        renderPendingVditorPreviews(host);
        bindActiveHeadingListeners(editor, activeListenerElements);
        if (valueRef.current !== pendingInitialValueRef.current) {
          editor.setValue(valueRef.current, true);
          renderPendingVditorPreviews(host);
        }
        editor.setTheme(
          themeTypeRef.current === "dark" ? "dark" : "classic",
          themeTypeRef.current === "dark" ? "dark" : "light",
          getMarkdownCodeTheme(themeTypeRef.current),
        );
        queueEditorHighlight(host);
        if (pendingFocusRef.current) {
          pendingFocusRef.current = false;
          window.requestAnimationFrame(() => editor.focus());
        }
        if (pendingHeadingJumpRef.current !== null) {
          const index = pendingHeadingJumpRef.current;
          pendingHeadingJumpRef.current = null;
          window.requestAnimationFrame(() => {
            jumpToEditorHeading(index);
          });
        }
        window.requestAnimationFrame(emitActiveHeadingChange);
      },
      upload: {
        accept: "image/*",
        multiple: true,
        handler: async (files: File[]): Promise<string | null> => {
          const sourcePath = documentPathRef.current;
          if (!sourcePath) {
            return "No markdown document is open.";
          }
          if (isUntitledPath(sourcePath)) {
            return t("markdown.editor.saveBeforeImage");
          }
          try {
            for (const file of files) {
              const fileName = file.name || "image.png";
              const dataBase64 = await blobToBase64(file);
              const result = await markdownInvoke<{ path: string; relativePath?: string }>("md_save_image", {
                sourcePath,
                dataBase64,
                fileName,
              });
              if (!isVditorReadyRef.current) {
                return "The editor is still initializing.";
              }
              editor.insertValue(`\n![${fileName}](${(result.relativePath ?? result.path).replace(/\\/g, "/")})\n`);
            }
            return null;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Failed to save pasted markdown image", error);
            return message;
          }
        },
      },
    });

    vditorRef.current = editor;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const tocTarget = findTocTargetElement(target, host);
      window.requestAnimationFrame(() => {
        normalizeVditorRenderedDom(host);
        queueEditorHighlight(host);
        emitActiveHeadingChange();
      });
      if (tocTarget) {
        event.preventDefault();
        event.stopPropagation();
        scrollToRenderedHeadingTarget({
          rawId: tocTarget.getAttribute("data-target-id") ?? "",
          anchorText: tocTarget.textContent ?? "",
          root: resolveTocSearchRoot(tocTarget, getInternalVditor()) ?? host,
        });
        return;
      }

      const anchor = target?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      event.stopPropagation();
      handleRenderedLinkClick(anchor.getAttribute("href"), anchor.textContent ?? "", host, sourcePathRef.current);
    };

    const handleSelectionGesture = () => {
      selectionGestureUntilRef.current = Date.now() + 600;
    };

    // Belt-and-suspenders keyboard navigation for vditor's code-fence language
    // hint. vditor binds its own Up/Down/Enter handling to `vditor.ir.element`
    // in the bubble phase, but we drive it ourselves in the capture phase so
    // hint navigation is reliable regardless of focus/composition quirks that
    // can keep the native handler from ever seeing the keydown. Only engages
    // while the real language hint is visible (identified by being a direct
    // child of `.vditor-content`, unlike the toolbar's own dropdown panels
    // which share the same `.vditor-hint` class but live under `.vditor-toolbar`)
    // and defers to vditor's own handling for every other key.
    const getLanguageHintElement = (): HTMLElement | null => {
      const hint = host.querySelector<HTMLElement>(".vditor-content > .vditor-hint");
      if (!hint || getComputedStyle(hint).display === "none") return null;
      return hint;
    };
    const handleHintKeydown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      if (event.isComposing) return;
      const hint = getLanguageHintElement();
      if (!hint) return;
      const buttons = Array.from(hint.querySelectorAll<HTMLButtonElement>("button"));
      if (buttons.length === 0) return;

      if (event.key === "Enter") {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const current = hint.querySelector<HTMLButtonElement>(".vditor-hint--current") ?? buttons[0];
        event.preventDefault();
        event.stopPropagation();
        current.click();
        return;
      }

      const currentIndex = buttons.findIndex((button) => button.classList.contains("vditor-hint--current"));
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex + 1) % buttons.length
        : (currentIndex - 1 + buttons.length) % buttons.length;
      event.preventDefault();
      event.stopPropagation();
      buttons.forEach((button) => button.classList.remove("vditor-hint--current"));
      buttons[nextIndex].classList.add("vditor-hint--current");
      buttons[nextIndex].scrollIntoView({ block: "nearest" });
    };
    host.addEventListener("keydown", handleHintKeydown, true);

    host.addEventListener("click", handleClick, true);
    host.addEventListener("dblclick", handleSelectionGesture, true);
    host.addEventListener("selectstart", handleSelectionGesture, true);

    const handleEditorActivity = () => {
      window.requestAnimationFrame(() => {
        normalizeVditorRenderedDom(host);
        renderPendingVditorPreviews(host);
        emitActiveHeadingChange();
      });
    };

    host.addEventListener("focusin", handleEditorActivity, true);
    host.addEventListener("keyup", handleEditorActivity, true);

    const observer = new MutationObserver(() => {
      normalizeVditorRenderedDom(host);
      renderPendingVditorPreviews(host);
      emitActiveHeadingChange();
    });
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", "style", "class", "data-render"],
    });

    return () => {
      host.removeEventListener("keydown", handleHintKeydown, true);
      host.removeEventListener("click", handleClick, true);
      host.removeEventListener("dblclick", handleSelectionGesture, true);
      host.removeEventListener("selectstart", handleSelectionGesture, true);
      host.removeEventListener("focusin", handleEditorActivity, true);
      host.removeEventListener("keyup", handleEditorActivity, true);
      activeListenerElements.forEach((element) => {
        element.removeEventListener("scroll", scheduleActiveHeadingChange);
        element.removeEventListener("keyup", scheduleActiveHeadingChange);
        element.removeEventListener("mouseup", scheduleActiveHeadingChange);
        element.removeEventListener("input", scheduleActiveHeadingChange);
      });
      cancelHighlightRef.current?.();
      cancelHighlightRef.current = null;
      observer.disconnect();
      try {
        if (isVditorReadyRef.current && editor.vditor) {
          editor.destroy();
        }
      } catch {
        // Vditor can throw if the host has already been torn down by React.
      }
      isVditorReadyRef.current = false;
      pendingFocusRef.current = false;
      pendingHeadingJumpRef.current = null;
      vditorRef.current = null;
      host.innerHTML = "";
    };
  }, [variant]);

  useEffect(() => {
    const editor = vditorRef.current;
    if (!editor || !isVditorReadyRef.current) {
      pendingInitialValueRef.current = value;
      return;
    }
    if (value === valueRef.current) return;
    valueRef.current = value;
    editor.setValue(value, true);
    window.requestAnimationFrame(() => {
      if (!vditorHostRef.current) return;
      normalizeVditorRenderedDom(vditorHostRef.current);
      renderPendingVditorPreviews(vditorHostRef.current);
      queueEditorHighlight(vditorHostRef.current);
      emitActiveHeadingChange();
    });
  }, [value]);

  useEffect(() => {
    const editor = vditorRef.current;
    if (!editor || !isVditorReadyRef.current) return;
    editor.setTheme(
      _themeType === "dark" ? "dark" : "classic",
      _themeType === "dark" ? "dark" : "light",
      getMarkdownCodeTheme(_themeType),
    );
    window.requestAnimationFrame(() => {
      if (!vditorHostRef.current) return;
      normalizeVditorRenderedDom(vditorHostRef.current);
      renderPendingVditorPreviews(vditorHostRef.current);
      queueEditorHighlight(vditorHostRef.current);
    });
  }, [_themeType]);

  useEffect(() => {
    if (!focusToken) return;
    if (!isVditorReadyRef.current) {
      pendingFocusRef.current = true;
      return;
    }
    window.requestAnimationFrame(() => vditorRef.current?.focus());
  }, [focusToken, variant]);

  function getInternalVditor(editor = vditorRef.current): VditorInternal | null {
    return (editor as (VditorInstance & { vditor?: VditorInternal }) | null)?.vditor ?? null;
  }

  function getCurrentEditorHeadingIndex(): number | null {
    const internal = getInternalVditor();
    if (!internal) return null;
    return resolveActiveHeadingIndex(internal, headingsRef.current);
  }

  function jumpToEditorHeading(index: number): boolean {
    const editor = vditorRef.current;
    const internal = getInternalVditor(editor);
    if (!editor || !isVditorReadyRef.current || !internal) {
      pendingHeadingJumpRef.current = index;
      return false;
    }

    const didJump = jumpToVditorHeading(internal, headingsRef.current, index);
    if (didJump) {
      editor.focus();
      onActiveHeadingChangeRef.current?.(index);
    }
    return didJump;
  }

  function scheduleActiveHeadingChange() {
    window.requestAnimationFrame(emitActiveHeadingChange);
  }

  function emitActiveHeadingChange() {
    const index = getCurrentEditorHeadingIndex();
    onActiveHeadingChangeRef.current?.(index);
  }

  function bindActiveHeadingListeners(editor: VditorInstance, elements: HTMLElement[]) {
    const internal = getInternalVditor(editor);
    const candidates = [
      internal?.sv?.element,
      internal?.ir?.element,
      internal?.wysiwyg?.element,
      internal?.preview?.element,
    ].filter((element): element is HTMLElement => Boolean(element));

    candidates.forEach((element) => {
      if (elements.includes(element)) return;
      elements.push(element);
      element.addEventListener("scroll", scheduleActiveHeadingChange, { passive: true });
      element.addEventListener("keyup", scheduleActiveHeadingChange);
      element.addEventListener("mouseup", scheduleActiveHeadingChange);
      element.addEventListener("input", scheduleActiveHeadingChange);
    });
  }

  const normalizeVditorRenderedDom = (host: HTMLElement) => {
    host.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const raw = img.dataset.rawSrc ?? img.getAttribute("src") ?? undefined;
      if (!raw) return;
      if (!img.dataset.rawSrc) {
        img.dataset.rawSrc = raw;
      }

      const mediaKind = detectMediaKindFromSrc(raw);
      if (mediaKind !== "image") {
        const resolved = resolveMarkdownAssetSrc(raw, sourcePathRef.current) ?? raw;
        const replacement = document.createElement(mediaKind === "video" ? "video" : "audio");
        replacement.src = resolved;
        replacement.setAttribute("controls", "");
        replacement.setAttribute("preload", "metadata");
        replacement.className = mediaKind === "video"
          ? "hf-media-embed hf-media-embed--video"
          : "hf-media-embed hf-media-embed--audio";
        if (mediaKind === "video") {
          replacement.setAttribute("playsinline", "");
        }
        if (img.alt) {
          replacement.setAttribute("aria-label", img.alt);
        }
        replacement.dataset.rawSrc = raw;
        img.replaceWith(replacement);
        return;
      }

      const resolved = resolveMarkdownAssetSrc(raw, sourcePathRef.current);
      if (resolved && img.getAttribute("src") !== resolved) {
        img.setAttribute("src", resolved);
      }
    });

    // NOTE: do NOT strip `.vditor-ir__node--hidden` here. That class is how IR
    // hides a node's raw markers when the caret isn't on it; vditor toggles it
    // via expandMarker so markers reveal near the caret and render otherwise
    // (Typora behavior). Force-removing it made every marker always visible.

    normalizeEditableCodeBlocks(host);
  };

  const queueEditorHighlight = (host: HTMLElement) => {
    cancelHighlightRef.current?.();
    cancelHighlightRef.current = queueMarkdownCodeHighlight(host, themeTypeRef.current);
  };

  const renderPendingVditorPreviews = (host: HTMLElement) => {
    const editor = vditorRef.current;
    if (!editor || !isVditorReadyRef.current) return;
    const vditor = getInternalVditor(editor);

    host.querySelectorAll<HTMLElement>(".vditor-ir__preview[data-render='2'], .vditor-wysiwyg__preview[data-render='2']").forEach((preview) => {
      if (preview.parentElement?.getAttribute("data-type") === "html-block") {
        preview.setAttribute("data-render", "1");
        return;
      }

      const code = preview.querySelector<HTMLElement>("pre > code, :scope > code");
      if (!code) {
        preview.setAttribute("data-render", "1");
        return;
      }

      const language = getLanguageClass(code);
      if (SPECIAL_RENDER_LANGUAGES.has(language)) return;

      const customRender = vditor?.options?.customRenders?.find((item) => item.language === language);
      if (customRender) {
        customRender.render(preview, vditor);
      }
      preview.setAttribute("data-render", "1");
    });
  };

  const restoreEditorSelection = () => {
    const range = savedRangeRef.current;
    vditorRef.current?.focus();
    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      try {
        selection?.addRange(range);
      } catch {
        // Range can be stale if the DOM changed; ignore.
      }
    }
  };

  const resyncEditorFromDom = () => {
    const editor = vditorRef.current;
    const host = vditorHostRef.current;
    if (!editor || !isVditorReadyRef.current) return;
    const markdown = editor.getValue();
    editor.setValue(markdown);
    valueRef.current = markdown;
    onChangeRef.current(markdown);
    if (host) {
      window.requestAnimationFrame(() => {
        normalizeVditorRenderedDom(host);
        renderPendingVditorPreviews(host);
        queueEditorHighlight(host);
        emitActiveHeadingChange();
      });
    }
  };

  const runToolbarAction = (type: string) => {
    const host = vditorHostRef.current;
    if (!host) return;
    restoreEditorSelection();
    triggerToolbarAction(host, type);
    window.requestAnimationFrame(() => {
      normalizeVditorRenderedDom(host);
      queueEditorHighlight(host);
    });
  };

  const insertTableAt = (rows: number, cols: number) => {
    const editor = vditorRef.current;
    if (!editor) return;
    restoreEditorSelection();
    editor.insertValue(buildTableMarkdown(rows, cols));
    const host = vditorHostRef.current;
    if (host) {
      window.requestAnimationFrame(() => {
        normalizeVditorRenderedDom(host);
        queueEditorHighlight(host);
        emitActiveHeadingChange();
      });
    }
  };

  const insertImageViaPicker = () => {
    const sourcePath = documentPathRef.current;
    if (!sourcePath || isUntitledPath(sourcePath)) {
      vditorRef.current?.tip(t("markdown.editor.saveBeforeImage"), 3000);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      const sourcePath = documentPathRef.current;
      const editor = vditorRef.current;
      if (!sourcePath || !editor) return;
      for (const file of files) {
        try {
          const fileName = file.name || "image.png";
          const dataBase64 = await blobToBase64(file);
          const result = await markdownInvoke<{ path: string; relativePath?: string }>("md_save_image", {
            sourcePath,
            dataBase64,
            fileName,
          });
          editor.insertValue(`\n![${fileName}](${(result.relativePath ?? result.path).replace(/\\/g, "/")})\n`);
        } catch (error) {
          console.error("Failed to insert markdown image", error);
        }
      }
    });
    document.body.appendChild(input);
    input.click();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        restoreEditorSelection();
        vditorRef.current?.insertValue(text);
      }
    } catch (error) {
      console.error("Failed to paste from clipboard", error);
    }
  };

  type TableOp = "rowAbove" | "rowBelow" | "colLeft" | "colRight" | "delRow" | "delCol" | "alignLeft" | "alignCenter" | "alignRight";

  const runTableOp = (op: TableOp) => {
    const cell = contextCellRef.current;
    const table = cell ? findTableFromNode(cell) : null;
    if (!cell || !table) return;
    switch (op) {
      case "rowAbove": domInsertRow(table, cell, "above"); break;
      case "rowBelow": domInsertRow(table, cell, "below"); break;
      case "colLeft": domInsertColumn(table, cell, "left"); break;
      case "colRight": domInsertColumn(table, cell, "right"); break;
      case "delRow": if (!domDeleteRow(table, cell)) return; break;
      case "delCol": if (!domDeleteColumn(table, cell)) return; break;
      case "alignLeft": domSetColumnAlign(table, cell, "left"); break;
      case "alignCenter": domSetColumnAlign(table, cell, "center"); break;
      case "alignRight": domSetColumnAlign(table, cell, "right"); break;
    }
    resyncEditorFromDom();
  };

  const applyLinkEdit = (text: string, href: string) => {
    const anchor = contextAnchorRef.current;
    setLinkEditor(null);
    if (!anchor) return;
    anchor.textContent = text || href || anchor.textContent || "";
    if (href) {
      anchor.setAttribute("href", href);
    } else {
      anchor.removeAttribute("href");
    }
    resyncEditorFromDom();
  };

  const buildContextMenuItems = (
    cell: HTMLTableCellElement | null,
    anchor: HTMLAnchorElement | null,
    hasSelection: boolean,
    x: number,
    y: number,
  ): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (anchor) {
      items.push(
        {
          id: "edit-link",
          label: t("markdown.editor.ctx.editLink"),
          icon: <Link2 size={14} />,
          onSelect: () => setLinkEditor({
            x,
            y,
            text: anchor.textContent ?? "",
            href: anchor.getAttribute("href") ?? "",
          }),
        },
        { id: "sep-link", separator: true },
      );
    }

    if (cell) {
      items.push(
        { id: "row-above", label: t("markdown.editor.ctx.insertRowAbove"), icon: <ListOrdered size={14} />, onSelect: () => runTableOp("rowAbove") },
        { id: "row-below", label: t("markdown.editor.ctx.insertRowBelow"), icon: <ListOrdered size={14} />, onSelect: () => runTableOp("rowBelow") },
        { id: "col-left", label: t("markdown.editor.ctx.insertColLeft"), icon: <List size={14} />, onSelect: () => runTableOp("colLeft") },
        { id: "col-right", label: t("markdown.editor.ctx.insertColRight"), icon: <List size={14} />, onSelect: () => runTableOp("colRight") },
        { id: "align-left", label: t("markdown.editor.ctx.alignLeft"), icon: <AlignLeft size={14} />, onSelect: () => runTableOp("alignLeft") },
        { id: "align-center", label: t("markdown.editor.ctx.alignCenter"), icon: <AlignCenter size={14} />, onSelect: () => runTableOp("alignCenter") },
        { id: "align-right", label: t("markdown.editor.ctx.alignRight"), icon: <AlignRight size={14} />, onSelect: () => runTableOp("alignRight") },
        { id: "del-row", label: t("markdown.editor.ctx.deleteRow"), icon: <Trash2 size={14} />, danger: true, onSelect: () => runTableOp("delRow") },
        { id: "del-col", label: t("markdown.editor.ctx.deleteCol"), icon: <Trash2 size={14} />, danger: true, onSelect: () => runTableOp("delCol") },
        { id: "sep-table", separator: true },
      );
    }

    items.push(
      { id: "bold", label: t("markdown.editor.ctx.bold"), icon: <Bold size={14} />, disabled: !hasSelection, onSelect: () => runToolbarAction("bold") },
      { id: "italic", label: t("markdown.editor.ctx.italic"), icon: <Italic size={14} />, disabled: !hasSelection, onSelect: () => runToolbarAction("italic") },
      { id: "strike", label: t("markdown.editor.ctx.strike"), icon: <Strikethrough size={14} />, disabled: !hasSelection, onSelect: () => runToolbarAction("strike") },
      { id: "inline-code", label: t("markdown.editor.ctx.inlineCode"), icon: <Code size={14} />, disabled: !hasSelection, onSelect: () => runToolbarAction("inline-code") },
      { id: "heading", label: t("markdown.editor.ctx.heading"), icon: <Heading size={14} />, onSelect: () => runToolbarAction("headings") },
      { id: "sep-format", separator: true },
      { id: "insert-table", label: t("markdown.editor.ctx.insertTable"), icon: <TableIcon size={14} />, onSelect: () => setGridPicker({ x, y }) },
      { id: "insert-image", label: t("markdown.editor.ctx.insertImage"), icon: <ImageIcon size={14} />, onSelect: insertImageViaPicker },
      { id: "insert-link", label: t("markdown.editor.ctx.insertLink"), icon: <Link2 size={14} />, onSelect: () => runToolbarAction("link") },
      { id: "insert-quote", label: t("markdown.editor.ctx.insertQuote"), icon: <Quote size={14} />, onSelect: () => runToolbarAction("quote") },
      { id: "insert-check", label: t("markdown.editor.ctx.insertCheck"), icon: <ListChecks size={14} />, onSelect: () => runToolbarAction("check") },
      { id: "sep-insert", separator: true },
      { id: "cut", label: t("markdown.editor.ctx.cut"), icon: <Scissors size={14} />, disabled: !hasSelection, onSelect: () => { restoreEditorSelection(); document.execCommand("cut"); } },
      { id: "copy", label: t("markdown.editor.ctx.copy"), icon: <Copy size={14} />, disabled: !hasSelection, onSelect: () => { restoreEditorSelection(); document.execCommand("copy"); } },
      { id: "paste", label: t("markdown.editor.ctx.paste"), icon: <ClipboardPaste size={14} />, onSelect: () => { void pasteFromClipboard(); } },
    );

    return items;
  };

  const openEditorContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".vditor-toolbar") || target.closest(".hf-code-language-inline") || target.closest("input, textarea")) {
      return;
    }
    event.preventDefault();
    const selection = window.getSelection();
    savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const hasSelection = Boolean(savedRangeRef.current && !savedRangeRef.current.collapsed);
    const cell = findCellFromNode(target);
    contextCellRef.current = cell;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    contextAnchorRef.current = anchor ?? null;
    setContextMenu({ x: event.clientX, y: event.clientY, items: buildContextMenuItems(cell, anchor ?? null, hasSelection, event.clientX, event.clientY) });
  };

  const interceptToolbarTableClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const tableButton = target?.closest?.<HTMLElement>('.vditor-toolbar [data-type="table"]');
    if (!tableButton) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = tableButton.getBoundingClientRect();
    const selection = window.getSelection();
    savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    setGridPicker({ x: rect.left, y: rect.bottom + 6 });
  };

  useEffect(() => {
    const host = vditorHostRef.current;
    if (!host) return;
    host.addEventListener("contextmenu", openEditorContextMenu);
    host.addEventListener("click", interceptToolbarTableClick, true);
    return () => {
      host.removeEventListener("contextmenu", openEditorContextMenu);
      host.removeEventListener("click", interceptToolbarTableClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shouldIgnoreSelectionOnlyInput(nextValue: string) {
    if (Date.now() > selectionGestureUntilRef.current) return false;
    const internal = getInternalVditor();
    if (internal?.currentMode !== "wysiwyg") return false;
    const previousValue = valueRef.current;
    if (nextValue === previousValue) return true;
    return isLikelySelectionOnlyLineJoin(previousValue, nextValue);
  }

  function restoreEditorValueAfterSelectionGesture(editor: VditorInstance, host: HTMLElement) {
    const restoredValue = valueRef.current;
    window.requestAnimationFrame(() => {
      if (vditorRef.current !== editor || !isVditorReadyRef.current) return;
      if (editor.getValue() === restoredValue) return;
      editor.setValue(restoredValue);
      normalizeVditorRenderedDom(host);
      renderPendingVditorPreviews(host);
      queueEditorHighlight(host);
      emitActiveHeadingChange();
    });
  }

  return (
    <div
      className={clsx(
        "hf-markdown-editor relative h-full min-h-0 overflow-hidden",
        variant === "standalone" ? "hf-markdown-editor--standalone rounded-[28px] border" : "hf-markdown-editor--split",
      )}
      style={surfaceStyle}
    >
      <div ref={vditorHostRef} className="hf-vditor-host h-full min-h-0" />
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {gridPicker && (
        <TableGridPicker
          x={gridPicker.x}
          y={gridPicker.y}
          t={t}
          onClose={() => setGridPicker(null)}
          onPick={(rows, cols) => {
            setGridPicker(null);
            insertTableAt(rows, cols);
          }}
        />
      )}
      {linkEditor && (
        <LinkEditorPopover
          x={linkEditor.x}
          y={linkEditor.y}
          initialText={linkEditor.text}
          initialHref={linkEditor.href}
          t={t}
          onClose={() => setLinkEditor(null)}
          onApply={applyLinkEdit}
        />
      )}
    </div>
  );
});

function jumpToVditorHeading(internal: VditorInternal, headings: MarkdownHeading[], index: number) {
  const heading = headings[index];
  if (!heading) return false;

  if (internal.currentMode === "sv") {
    suppressVditorScrollSync(internal);
    const sourceJumped = internal.sv?.element
      ? jumpToSourceLine(internal.sv.element, heading.line)
      : false;
    const previewJumped = scrollVditorPreviewHeading(internal, headings, index);
    return sourceJumped || previewJumped;
  }

  const editorElement = getCurrentModeElement(internal);
  const target = editorElement ? findRenderedHeading(editorElement, headings, index) : null;
  if (!target) {
    return scrollVditorPreviewHeading(internal, headings, index);
  }

  target.scrollIntoView({ behavior: "auto", block: "start" });
  target.classList.add("hf-markdown-heading-target");
  window.setTimeout(() => target.classList.remove("hf-markdown-heading-target"), 1400);
  placeCaretInElement(target);
  return true;
}

function suppressVditorScrollSync(internal: VditorInternal) {
  if (!internal.element) return;
  internal.element.dataset.hfSuppressScrollSync = "true";
  window.setTimeout(() => {
    if (internal.element?.dataset.hfSuppressScrollSync === "true") {
      delete internal.element.dataset.hfSuppressScrollSync;
    }
  }, 760);
}

function resolveActiveHeadingIndex(internal: VditorInternal, headings: MarkdownHeading[]) {
  if (headings.length === 0) return null;

  if (internal.currentMode === "sv") {
    const previewIndex = internal.preview?.element.style.display !== "none"
      ? getActiveHeadingIndexFromRendered(internal.preview.element, internal.preview.previewElement, headings)
      : null;
    if (previewIndex !== null) return previewIndex;

    const sourceLine = getVisibleSourceLine(internal.sv?.element ?? null);
    return sourceLine === null ? null : getHeadingIndexForLine(headings, sourceLine);
  }

  const editorElement = getCurrentModeElement(internal);
  return editorElement
    ? getActiveHeadingIndexFromRendered(editorElement, editorElement, headings)
    : null;
}

function getCurrentModeElement(internal: VditorInternal) {
  if (internal.currentMode === "sv") return internal.sv?.element ?? null;
  if (internal.currentMode === "ir") return internal.ir?.element ?? null;
  return internal.wysiwyg?.element ?? null;
}

function findRenderedHeading(root: HTMLElement, headings: MarkdownHeading[], index: number) {
  const renderedHeadings = getRenderedHeadings(root);
  if (renderedHeadings[index]) return renderedHeadings[index];

  const target = headings[index];
  if (!target) return null;
  const normalizedTarget = normalizeHeadingText(target.text);
  return renderedHeadings.find((heading) => normalizeHeadingText(heading.textContent ?? "") === normalizedTarget) ?? null;
}

function scrollVditorPreviewHeading(internal: VditorInternal, headings: MarkdownHeading[], index: number) {
  const previewScroller = internal.preview?.element;
  const previewRoot = internal.preview?.previewElement;
  if (!previewScroller || !previewRoot || previewScroller.style.display === "none") return false;

  const target = findRenderedHeading(previewRoot, headings, index);
  if (!target) return false;

  previewScroller.scrollTo({
    top: getOffsetWithinScroller(target, previewScroller),
    behavior: "auto",
  });
  target.classList.add("hf-markdown-heading-target");
  window.setTimeout(() => target.classList.remove("hf-markdown-heading-target"), 1400);
  return true;
}

function jumpToSourceLine(sourceRoot: HTMLElement, line: number) {
  const text = sourceRoot.textContent ?? "";
  const offset = textOffsetForLine(text, line);
  const position = findTextPosition(sourceRoot, offset);
  if (!position) return false;

  const range = sourceRoot.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  const selection = sourceRoot.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  sourceRoot.focus();
  scrollSourceToLine(sourceRoot, line);
  return true;
}

function scrollSourceToLine(sourceRoot: HTMLElement, line: number) {
  const totalLines = Math.max(1, (sourceRoot.textContent ?? "").split(/\n/).length);
  const lineHeight = resolveLineHeight(sourceRoot);
  const byLineHeight = Math.max(0, (line - 1) * lineHeight - sourceRoot.clientHeight * 0.12);
  const byRatio = totalLines <= 1
    ? 0
    : ((line - 1) / (totalLines - 1)) * Math.max(0, sourceRoot.scrollHeight - sourceRoot.clientHeight);
  sourceRoot.scrollTo({
    top: Math.min(Math.max(byLineHeight, byRatio * 0.72), Math.max(0, sourceRoot.scrollHeight - sourceRoot.clientHeight)),
    behavior: "auto",
  });
}

function getVisibleSourceLine(sourceRoot: HTMLElement | null) {
  if (!sourceRoot) return null;

  const selection = sourceRoot.ownerDocument.getSelection();
  if (selection?.rangeCount && selection.anchorNode && sourceRoot.contains(selection.anchorNode)) {
    const offset = getTextOffset(sourceRoot, selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
    if (offset !== null) {
      return lineForTextOffset(sourceRoot.textContent ?? "", offset);
    }
  }

  const lineHeight = resolveLineHeight(sourceRoot);
  return Math.max(1, Math.floor((sourceRoot.scrollTop + sourceRoot.clientHeight * 0.12) / lineHeight) + 1);
}

function getHeadingIndexForLine(headings: MarkdownHeading[], line: number) {
  let activeIndex = 0;
  headings.forEach((heading, index) => {
    if (heading.line <= line) {
      activeIndex = index;
    }
  });
  return activeIndex;
}

function getActiveHeadingIndexFromRendered(scroller: HTMLElement, root: HTMLElement, headings: MarkdownHeading[]) {
  const renderedHeadings = getRenderedHeadings(root);
  if (renderedHeadings.length === 0) return null;

  const top = scroller.scrollTop + Math.max(24, scroller.clientHeight * 0.16);
  let renderedIndex = 0;
  renderedHeadings.forEach((heading, index) => {
    if (getOffsetWithinScroller(heading, scroller) <= top) {
      renderedIndex = index;
    }
  });

  const renderedHeading = renderedHeadings[renderedIndex];
  if (!renderedHeading) return null;
  const exactIndex = headings.findIndex((heading, headingIndex) =>
    Math.abs(headingIndex - renderedIndex) <= 2 &&
    normalizeHeadingText(heading.text) === normalizeHeadingText(renderedHeading.textContent ?? "")
  );
  return exactIndex >= 0 ? exactIndex : Math.min(renderedIndex, headings.length - 1);
}

function getRenderedHeadings(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .filter((heading) => heading.offsetParent !== null || heading.getClientRects().length > 0);
}

function normalizeHeadingText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function getOffsetWithinScroller(element: HTMLElement, scroller: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return elementRect.top - scrollerRect.top + scroller.scrollTop;
}

function placeCaretInElement(element: HTMLElement) {
  const textNode = findFirstTextNode(element);
  const range = element.ownerDocument.createRange();
  if (textNode) {
    range.setStart(textNode, 0);
  } else {
    range.selectNodeContents(element);
    range.collapse(true);
  }
  range.collapse(true);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findFirstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  for (const child of Array.from(root.childNodes)) {
    const textNode = findFirstTextNode(child);
    if (textNode) return textNode;
  }
  return null;
}

function resolveLineHeight(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(computed.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = Number.parseFloat(computed.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.72 : 24;
}

function textOffsetForLine(text: string, line: number) {
  if (line <= 1) return 0;
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const nextBreak = text.indexOf("\n", offset);
    if (nextBreak === -1) return text.length;
    offset = nextBreak + 1;
  }
  return offset;
}

function lineForTextOffset(text: string, offset: number) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function findTextPosition(root: Node, targetOffset: number): { node: Text; offset: number } | null {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  if (!walker) return null;

  let consumed = 0;
  let current = walker.nextNode() as Text | null;
  let lastText: Text | null = null;
  while (current) {
    lastText = current;
    const length = current.textContent?.length ?? 0;
    if (consumed + length >= targetOffset) {
      return { node: current, offset: Math.max(0, Math.min(length, targetOffset - consumed)) };
    }
    consumed += length;
    current = walker.nextNode() as Text | null;
  }

  if (lastText) {
    return { node: lastText, offset: lastText.textContent?.length ?? 0 };
  }
  return null;
}

function getTextOffset(root: Node, targetNode: Node, targetNodeOffset: number) {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  if (!walker) return null;

  let offset = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current === targetNode) {
      return offset + targetNodeOffset;
    }
    offset += current.textContent?.length ?? 0;
    current = walker.nextNode() as Text | null;
  }
  return null;
}

// Toggle a wysiwyg code block between its editable source (`<pre>`) and its
// highlighted preview so only one shows at a time. Without this, both the raw
// source and the rendered preview render together (the code block appears as
// two duplicate rows). The old inline language <input> control is intentionally
// gone — vditor's native code block handles the language.
function normalizeEditableCodeBlocks(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>(".vditor-wysiwyg__block[data-type='code-block']").forEach((block) => {
    const sourcePre = block.querySelector<HTMLElement>(":scope > pre:first-child");
    const preview = block.querySelector<HTMLElement>(":scope > .vditor-wysiwyg__preview");
    if (!sourcePre || !preview) return;

    const isEditing = sourcePre.style.display !== "none";
    block.classList.toggle("hf-vditor-code-block--editing", isEditing);
    preview.style.display = isEditing ? "none" : "";
    preview.setAttribute("aria-hidden", isEditing ? "true" : "false");

    // Strip any legacy inline language control left over from older builds.
    sourcePre.querySelector<HTMLElement>(":scope > .hf-code-language-inline")?.remove();
  });
}

function getHaloForgeToolbarConfig(): ToolbarItem[] {
  return [
    "headings",
    "bold",
    "italic",
    "strike",
    "|",
    "line",
    "quote",
    "list",
    "ordered-list",
    "check",
    "|",
    "code",
    "inline-code",
    "link",
    "table",
    "|",
    "both",
    "|",
    "undo",
    "redo",
  ].map((item) => item === "|" ? item : { name: item, tipPosition: "s" });
}

const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "m4a"]);

type MediaKind = "image" | "video" | "audio";

function detectMediaKindFromSrc(src: string | undefined | null): MediaKind {
  if (!src) return "image";
  const withoutQuery = src.split(/[?#]/)[0] ?? "";
  const dot = withoutQuery.lastIndexOf(".");
  if (dot < 0) return "image";
  const ext = withoutQuery.slice(dot + 1).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "image";
}

function getMarkdownParentDir(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash < 0 ? "" : normalized.slice(0, lastSlash);
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function resolveMarkdownAssetSrc(rawSrc: string | undefined, sourcePath: string | null | undefined): string | undefined {
  if (!rawSrc) return rawSrc;
  const trimmed = rawSrc.trim();
  if (!trimmed) return rawSrc;
  if (trimmed.startsWith("file:")) {
    try {
      return convertFileSrc(decodeURIComponent(new URL(trimmed).pathname));
    } catch {
      return trimmed;
    }
  }
  if (isAbsoluteLocalPath(trimmed)) {
    try {
      return convertFileSrc(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (ABSOLUTE_URL_RE.test(trimmed) || trimmed.startsWith("//") || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("#")) {
    return trimmed;
  }
  if (!sourcePath) return trimmed;

  const parentDir = getMarkdownParentDir(sourcePath);
  if (!parentDir) return trimmed;
  const decoded = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const cleaned = decoded.replace(/\\/g, "/").replace(/^\.\//, "");
  const joined = `${parentDir}/${cleaned}`.replace(/\/+/g, "/");

  try {
    return convertFileSrc(joined);
  } catch {
    return trimmed;
  }
}

function isSupportedExternalProtocol(protocol: string): boolean {
  return protocol === "file:" || protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:";
}

function toFileUrl(filePath: string): URL {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const pathname = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const url = new URL("file:///");
  url.pathname = pathname;
  return url;
}

function resolveMarkdownLink(href: string | undefined, sourcePath?: string | null): string | undefined {
  if (!href) return undefined;

  if (isAbsoluteLocalPath(href)) {
    return toFileUrl(href).toString();
  }

  try {
    const externalUrl = new URL(href);
    return isSupportedExternalProtocol(externalUrl.protocol) ? externalUrl.toString() : undefined;
  } catch {
    if (!sourcePath) return undefined;
    try {
      const baseUrl = new URL("./", toFileUrl(sourcePath));
      const resolvedUrl = new URL(href, baseUrl);
      return isSupportedExternalProtocol(resolvedUrl.protocol) ? resolvedUrl.toString() : undefined;
    } catch {
      return undefined;
    }
  }
}

function handleRenderedLinkClick(href: string | undefined | null, anchorText: string, root: HTMLElement, sourcePath: string | null | undefined) {
  const rawHref = href?.trim();
  if (!rawHref || rawHref === "#") return;

  if (rawHref.startsWith("#")) {
    scrollToRenderedHeadingTarget({ rawId: rawHref.slice(1), anchorText, root });
    return;
  }

  const resolved = resolveMarkdownLink(rawHref, sourcePath);
  if (!resolved) return;
  void openUrl(resolved).catch((error) => {
    console.error("Failed to open markdown link", error);
  });
}

function findTocTargetElement(target: HTMLElement | null, root: HTMLElement) {
  const targetElement = target?.closest?.("[data-target-id]");
  if (!(targetElement instanceof HTMLElement) || !root.contains(targetElement)) {
    return null;
  }
  const targetId = targetElement.getAttribute("data-target-id")?.trim();
  if (!targetId || !targetElement.closest(".vditor-toc")) {
    return null;
  }
  return targetElement;
}

function resolveTocSearchRoot(tocTarget: HTMLElement, internal: VditorInternal | null) {
  const previewRoot = internal?.preview?.previewElement;
  if (previewRoot?.contains(tocTarget)) {
    return previewRoot;
  }
  const previewScroller = internal?.preview?.element;
  if (previewScroller?.contains(tocTarget)) {
    return previewRoot ?? previewScroller;
  }
  const editorElement = internal ? getCurrentModeElement(internal) : null;
  if (editorElement?.contains(tocTarget)) {
    return editorElement;
  }
  return tocTarget.closest<HTMLElement>(".vditor-reset, .vditor-wysiwyg, .vditor-ir, .vditor-sv");
}

function scrollToRenderedHeadingTarget({
  rawId,
  anchorText,
  root,
}: {
  rawId: string;
  anchorText: string;
  root: HTMLElement;
}) {
  const decodedId = decodeHashId(rawId);
  const target = findHeadingTarget(root, decodedId, rawId, anchorText);
  if (!target) return false;

  const scroller = findScrollableAncestor(target, root);
  if (scroller) {
    scroller.scrollTo({
      top: Math.max(0, getOffsetWithinScroller(target, scroller) - 12),
      behavior: "smooth",
    });
  } else {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  target.classList.add("hf-markdown-heading-target");
  window.setTimeout(() => target.classList.remove("hf-markdown-heading-target"), 1400);
  return true;
}

function decodeHashId(rawId: string) {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}

function findHeadingTarget(root: HTMLElement, decodedId: string, rawId: string, anchorText: string) {
  const trimmedAnchorText = anchorText.trim();
  const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  return headings.find((heading) => heading.id === decodedId) ??
    headings.find((heading) => heading.id === rawId) ??
    headings.find((heading) => (heading.textContent ?? "").trim() === trimmedAnchorText) ??
    null;
}

function findScrollableAncestor(element: HTMLElement, _root: HTMLElement) {
  let current: HTMLElement | null = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScrollY && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function isLikelySelectionOnlyLineJoin(previousValue: string, nextValue: string) {
  if (previousValue === nextValue) return true;
  if (previousValue.length <= nextValue.length) return false;
  const removedLength = previousValue.length - nextValue.length;
  if (removedLength > 8) return false;
  const previousWithoutSoftBreaks = previousValue.replace(/(?<!\n)\n(?!\n)/g, "");
  return previousWithoutSoftBreaks === nextValue;
}

function getLanguageClass(block: HTMLElement) {
  return Array.from(block.classList)
    .find((className) => className.startsWith("language-"))
    ?.slice("language-".length)
    .toLowerCase() ?? "";
}
