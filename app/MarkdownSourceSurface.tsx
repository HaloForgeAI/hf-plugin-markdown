import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import Editor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import type { MarkdownHeading } from "./markdown/types";
import { detectMediaKindFromSrc, resolveLocalAssetSrc } from "./markdown/utils";

interface MarkdownSourceSurfaceProps {
  value: string;
  sourcePath: string | null;
  headings: MarkdownHeading[];
  themeType: "light" | "dark";
  placeholder: string;
  fontScale: number;
  focusToken?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: string) => void;
}

export function MarkdownSourceSurface({
  value,
  sourcePath,
  headings,
  themeType,
  placeholder,
  fontScale,
  focusToken,
  onChange,
  onSelectionChange,
}: MarkdownSourceSurfaceProps) {
  const surfaceStyle = {
    "--hf-md-font-scale": String(fontScale),
  } as CSSProperties;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const placeholderRef = useRef(placeholder);
  const lastEmittedValueRef = useRef(value);
  const pendingInitialValueRef = useRef(value);
  const sourcePathRef = useRef(sourcePath);
  const headingsRef = useRef(headings);

  useEffect(() => {
    sourcePathRef.current = sourcePath;
  }, [sourcePath]);

  useEffect(() => {
    headingsRef.current = headings;
  }, [headings]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    placeholderRef.current = placeholder;
  }, [placeholder]);

  const focusEditor = () => {
    const editor = editorRef.current;
    if (editor) {
      window.requestAnimationFrame(() => {
        editor.focus();
      });
      return;
    }

    const host = containerRef.current;
    const editable = host?.querySelector<HTMLElement>(".toastui-editor-contents[contenteditable='true']");
    if (editable) {
      window.requestAnimationFrame(() => {
        editable.focus();
      });
    }
  };

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    host.innerHTML = "";
    lastEmittedValueRef.current = pendingInitialValueRef.current;

    const editor = new Editor({
      el: host,
      height: "100%",
      minHeight: "320px",
      initialValue: pendingInitialValueRef.current,
      initialEditType: "markdown",
      previewStyle: "vertical",
      hideModeSwitch: true,
      usageStatistics: false,
      autofocus: false,
      placeholder: placeholderRef.current,
      theme: themeType === "dark" ? "dark" : undefined,
    });

    const emitSelection = () => {
      onSelectionChangeRef.current?.(editor.getSelectedText().trim());
    };

    editor.on("change", () => {
      const next = editor.getMarkdown();
      lastEmittedValueRef.current = next;
      onChangeRef.current(next);
      emitSelection();
    });

    const handlePointerSelection = () => {
      emitSelection();
    };

    host.addEventListener("mouseup", handlePointerSelection);
    host.addEventListener("keyup", handlePointerSelection);

    editorRef.current = editor;
  focusEditor();

    let observer: MutationObserver | null = null;
    let observerAttached = false;
    let attachAttempts = 0;

    const rewritePreview = () => {
      const preview = host.querySelector<HTMLElement>(".toastui-editor-md-preview");
      if (!preview) return;

      preview.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        const raw = img.dataset.rawSrc ?? img.getAttribute("src") ?? undefined;
        if (!raw) return;
        if (!img.dataset.rawSrc) {
          img.dataset.rawSrc = raw;
        }

        const mediaKind = detectMediaKindFromSrc(raw);
        if (mediaKind !== "image") {
          const resolved = resolveLocalAssetSrc(raw, sourcePathRef.current) ?? raw;
          const replacement = document.createElement(mediaKind === "video" ? "video" : "audio");
          replacement.src = resolved;
          replacement.setAttribute("controls", "");
          replacement.setAttribute("preload", "metadata");
          if (mediaKind === "video") {
            replacement.setAttribute("playsinline", "");
            replacement.className = "hf-media-embed hf-media-embed--video";
          } else {
            replacement.className = "hf-media-embed hf-media-embed--audio";
          }
          if (img.alt) {
            replacement.setAttribute("aria-label", img.alt);
          }
          (replacement as HTMLElement).dataset.rawSrc = raw;
          img.replaceWith(replacement);
          return;
        }

        const resolved = resolveLocalAssetSrc(raw, sourcePathRef.current);
        if (resolved && img.getAttribute("src") !== resolved) {
          img.setAttribute("src", resolved);
        }
      });

      preview.querySelectorAll<HTMLParagraphElement>("p").forEach((paragraph) => {
        if (paragraph.dataset.hfTocExpanded === "1") return;
        const text = (paragraph.textContent ?? "").trim();
        if (text.toLowerCase() !== "[toc]") return;

        paragraph.dataset.hfTocExpanded = "1";
        paragraph.innerHTML = "";
        paragraph.classList.add("hf-toc-block");

        const headings = headingsRef.current;
        if (headings.length === 0) {
          const empty = document.createElement("span");
          empty.className = "hf-toc-empty";
          empty.textContent = "No headings";
          paragraph.appendChild(empty);
          return;
        }

        const list = document.createElement("ul");
        list.className = "hf-toc-list";
        const minLevel = Math.min(...headings.map((heading) => heading.level));
        headings.forEach((heading) => {
          const item = document.createElement("li");
          item.className = "hf-toc-item";
          item.style.paddingLeft = `${(heading.level - minLevel) * 14}px`;
          item.textContent = heading.text;
          list.appendChild(item);
        });
        paragraph.appendChild(list);
      });
    };

    const tryAttachObserver = () => {
      if (observerAttached) return;
      const preview = host.querySelector<HTMLElement>(".toastui-editor-md-preview");
      if (!preview) {
        if (attachAttempts < 30) {
          attachAttempts += 1;
          window.setTimeout(tryAttachObserver, 60);
        }
        return;
      }
      observer = new MutationObserver(() => {
        rewritePreview();
      });
      observer.observe(preview, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
      observerAttached = true;
      rewritePreview();
    };

    tryAttachObserver();

    return () => {
      host.removeEventListener("mouseup", handlePointerSelection);
      host.removeEventListener("keyup", handlePointerSelection);
      observer?.disconnect();
      observer = null;
      try {
        editor.destroy();
      } catch {
        // Toast UI can throw on destroy after unmount; safe to swallow.
      }
      editorRef.current = null;
      host.innerHTML = "";
    };
  }, [themeType]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    focusEditor();
  }, [focusToken]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      pendingInitialValueRef.current = value;
      return;
    }
    if (value === lastEmittedValueRef.current) {
      return;
    }
    lastEmittedValueRef.current = value;
    const scrollTop = editor.getScrollTop();
    editor.setMarkdown(value, false);
    editor.setScrollTop(scrollTop);
  }, [value]);

  return (
    <div className="hf-markdown-source relative h-full min-h-0 overflow-visible rounded-[28px] border border-border bg-background/85" style={surfaceStyle}>
      <div ref={containerRef} className="h-full min-h-0 overflow-visible rounded-[28px]" />
    </div>
  );
}
