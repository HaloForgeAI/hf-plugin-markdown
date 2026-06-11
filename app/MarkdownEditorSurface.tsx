import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import clsx from "clsx";
import "./vditorLocalAssets";
import Vditor from "./vendor/vditor/dist/index.js";
import "./vendor/vditor/dist/index.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getMarkdownCodeTheme, queueMarkdownCodeHighlight } from "./markdown/codeHighlight";
import type { MarkdownHeading } from "./markdown/types";
import { markdownInvoke } from "./markdown/utils";
import { VDITOR_CDN, VDITOR_ZH_CN_I18N } from "./vditorConfig";

type VditorInstance = InstanceType<typeof Vditor>;
type ToolbarItem = string | { name: string; tipPosition: string };
type EditorMode = "ir" | "sv" | "wysiwyg";
type CodeLanguageChangeHandler = (block: HTMLElement, language: string) => void;

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

type HighlightJsGlobal = Window & {
  hljs?: {
    listLanguages?: () => string[];
    getLanguage?: (language: string) => unknown;
  };
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

const CODE_LANGUAGE_OPTIONS = uniqueSortedLanguages([
  "plaintext", "text", "txt",
  "1c", "abnf", "accesslog", "actionscript", "ada", "angelscript", "apache", "applescript",
  "arcade", "arduino", "armasm", "asciidoc", "aspectj", "autohotkey", "autoit", "avrasm",
  "awk", "axapta", "basic", "bnf", "brainfuck",
  "bash", "shell", "sh", "zsh", "powershell", "ps1", "bat", "batch", "cmd", "console",
  "cal", "capnproto", "ceylon", "clean", "coffeescript", "cos", "coq", "crmsh", "csp",
  "javascript", "js", "jsx", "typescript", "ts", "tsx",
  "html", "xml", "xhtml", "xquery", "xpath", "css", "scss", "sass", "less", "stylus",
  "json", "jsonc", "yaml", "yml", "toml", "ini", "properties", "dotenv",
  "markdown", "md", "asciidoc", "latex", "tex", "bibtex",
  "python", "py", "java", "kotlin", "kts", "scala", "groovy",
  "c", "cpp", "c++", "cxx", "h", "hpp", "objectivec", "objc",
  "csharp", "cs", "c#", "fsharp", "fs",
  "go", "golang", "rust", "rs", "swift", "php", "ruby", "rb", "dart",
  "r", "matlab", "julia", "julia-repl", "lua", "perl", "elixir", "erlang", "clojure",
  "haskell", "ocaml", "nim", "zig", "crystal", "d", "delphi", "fortran", "lisp",
  "scheme", "smalltalk", "sml", "vala", "vbnet", "vbscript",
  "sql", "mysql", "pgsql", "postgresql", "plsql", "graphql", "cypher", "n1ql",
  "dockerfile", "docker", "nginx", "apache", "makefile", "cmake", "gradle", "gams",
  "terraform", "hcl", "tf", "nix", "proto", "protobuf", "thrift", "capnproto",
  "llvm", "mipsasm", "wasm", "x86asm", "verilog", "vhdl",
  "solidity", "sol", "yul", "abap", "hlsl", "glsl", "wgsl",
  "diff", "patch", "http", "regexp", "regex", "dns", "fix", "gcode", "gherkin",
  "handlebars", "hbs", "haml", "django", "twig", "erb", "ejs", "dust",
  "leaf", "livescript", "moonscript", "qml", "routeros", "vim", "stan", "stata",
  "sas", "scilab", "stata", "tap", "tcl", "tp", "vbscript-html",
  "mermaid", "plantuml", "math", "mindmap", "markmap", "flowchart", "graphviz", "echarts", "abc", "smiles",
]);

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  "golang": "go",
  "postgresql": "pgsql",
  "shell": "bash",
  "sh": "bash",
  "text": "plaintext",
  "txt": "plaintext",
};

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
  const surfaceStyle = {
    "--hf-md-font-scale": String(fontScale),
  } as CSSProperties;

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
    const editorMode: EditorMode = isSplitMode ? "sv" : "wysiwyg";
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
        isPreview: true,
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

    host.querySelectorAll<HTMLElement>(".vditor-ir__node--hidden").forEach((node) => {
      node.classList.remove("vditor-ir__node--hidden");
    });

    normalizeEditableCodeBlocks(host, handleInlineCodeLanguageChange);
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

  function handleInlineCodeLanguageChange(block: HTMLElement, language: string) {
    const normalizedLanguage = normalizeCodeLanguageInput(language);

    setEditableCodeBlockLanguage(block, normalizedLanguage);
    const editor = vditorRef.current;
    const markdown = editor?.getValue();
    if (typeof markdown === "string") {
      valueRef.current = markdown;
      onChangeRef.current(markdown);
    }
    window.requestAnimationFrame(() => {
      if (!vditorHostRef.current) return;
      normalizeVditorRenderedDom(vditorHostRef.current);
      renderPendingVditorPreviews(vditorHostRef.current);
      queueEditorHighlight(vditorHostRef.current);
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

function normalizeEditableCodeBlocks(host: HTMLElement, onLanguageChange: CodeLanguageChangeHandler) {
  host.querySelectorAll<HTMLElement>(".vditor-wysiwyg__block[data-type='code-block']").forEach((block) => {
    const sourcePre = block.querySelector<HTMLElement>(":scope > pre:first-child");
    const preview = block.querySelector<HTMLElement>(":scope > .vditor-wysiwyg__preview");
    if (!sourcePre || !preview) return;

    const isEditing = sourcePre.style.display !== "none";
    block.classList.toggle("hf-vditor-code-block--editing", isEditing);
    preview.style.display = isEditing ? "none" : "";
    preview.setAttribute("aria-hidden", isEditing ? "true" : "false");

    if (isEditing) {
      ensureInlineCodeLanguageControl(block, sourcePre, onLanguageChange);
    } else {
      sourcePre.querySelector<HTMLElement>(":scope > .hf-code-language-inline")?.remove();
    }
  });
}

function ensureInlineCodeLanguageControl(block: HTMLElement, sourcePre: HTMLElement, onLanguageChange: CodeLanguageChangeHandler) {
  const ownerDocument = block.ownerDocument;
  ensureCodeLanguageDatalist(ownerDocument);

  let control = sourcePre.querySelector<HTMLElement>(":scope > .hf-code-language-inline");
  if (!control) {
    control = ownerDocument.createElement("span");
    control.className = "hf-code-language-inline";
    control.contentEditable = "false";
    control.setAttribute("data-hf-transient", "true");

    const input = ownerDocument.createElement("input");
    input.className = "hf-code-language-input";
    input.type = "text";
    input.placeholder = "language";
    input.setAttribute("aria-label", "Code block language");
    input.setAttribute("list", "hf-code-language-options");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    bindInlineCodeLanguageInput(input, onLanguageChange);

    control.appendChild(input);
    sourcePre.appendChild(control);
  }

  const input = control.querySelector<HTMLInputElement>("input");
  if (!input) return;
  input.setAttribute("list", "hf-code-language-options");
  if (ownerDocument.activeElement !== input) {
    input.value = getEditableCodeBlockLanguage(block);
  }
}

function bindInlineCodeLanguageInput(input: HTMLInputElement, onLanguageChange: CodeLanguageChangeHandler) {
  if (input.dataset.hfLanguageInputBound === "true") return;
  input.dataset.hfLanguageInputBound = "true";

  const stopPropagation = (event: Event) => {
    event.stopPropagation();
  };

  ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "beforeinput", "paste", "compositionstart", "compositionupdate", "compositionend"].forEach((eventName) => {
    input.addEventListener(eventName, stopPropagation);
  });

  input.addEventListener("input", (event) => {
    event.stopPropagation();
    const block = input.closest(".vditor-wysiwyg__block[data-type='code-block']");
    if (block instanceof HTMLElement) {
      onLanguageChange(block, input.value);
    }
  });

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      input.blur();
      focusEditableCodeBlock(input);
    }
  });

  input.addEventListener("keyup", stopPropagation);

  input.addEventListener("blur", () => {
    const block = input.closest(".vditor-wysiwyg__block[data-type='code-block']");
    if (block instanceof HTMLElement) {
      input.value = getEditableCodeBlockLanguage(block);
    }
  });
}

function focusEditableCodeBlock(input: HTMLInputElement) {
  const code = input.closest(".vditor-wysiwyg__block[data-type='code-block']")?.querySelector<HTMLElement>(":scope > pre:first-child > code");
  if (!code) return;
  code.focus();
}

function ensureCodeLanguageDatalist(ownerDocument: Document) {
  let datalist = ownerDocument.getElementById("hf-code-language-options") as HTMLDataListElement | null;
  if (!datalist) {
    datalist = ownerDocument.createElement("datalist");
    datalist.id = "hf-code-language-options";
    ownerDocument.body.appendChild(datalist);
  }

  const languages = resolveCodeLanguageOptions();
  const signature = languages.join("\n");
  if (datalist.dataset.hfLanguageOptions === signature) return;

  datalist.replaceChildren(...languages.map((language) => {
    const option = ownerDocument.createElement("option");
    option.value = language;
    return option;
  }));
  datalist.dataset.hfLanguageOptions = signature;
}

function getEditableCodeBlockLanguage(block: HTMLElement) {
  const code = block.querySelector<HTMLElement>(":scope > pre:first-child > code");
  return code ? getLanguageClass(code) : "";
}

function setEditableCodeBlockLanguage(block: HTMLElement, language: string) {
  const code = block.querySelector<HTMLElement>(":scope > pre:first-child > code");
  if (!code) return;

  Array.from(code.classList).forEach((className) => {
    if (className.startsWith("language-")) {
      code.classList.remove(className);
    }
  });

  if (language) {
    code.classList.add(`language-${language}`);
  }

  const preview = block.querySelector<HTMLElement>(":scope > .vditor-wysiwyg__preview");
  if (preview) {
    preview.innerHTML = code.outerHTML;
    preview.setAttribute("data-render", "2");
  }
}

function normalizeCodeLanguageInput(language: string) {
  const normalized = language.trim().toLowerCase();
  return CODE_LANGUAGE_ALIASES[normalized] ?? normalized;
}

function resolveCodeLanguageOptions() {
  const highlighterLanguages = ((window as HighlightJsGlobal).hljs?.listLanguages?.() ?? [])
    .map(normalizeCodeLanguageInput);
  return uniqueSortedLanguages([...CODE_LANGUAGE_OPTIONS, ...highlighterLanguages]);
}

function uniqueSortedLanguages(languages: string[]) {
  return Array.from(new Set(languages.map((language) => language.trim().toLowerCase()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
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
