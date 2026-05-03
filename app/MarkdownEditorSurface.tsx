import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { markdownInvoke, resolveLocalAssetSrc } from "./markdown/utils";

interface MarkdownEditorSurfaceProps {
  value: string;
  sourcePath: string | null;
  themeType: "light" | "dark";
  placeholder: string;
  documentPath: string | null;
  fontScale: number;
  focusToken?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: string) => void;
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

export function MarkdownEditorSurface({
  value,
  sourcePath,
  themeType,
  placeholder,
  documentPath,
  fontScale,
  focusToken,
  onChange,
  onSelectionChange,
}: MarkdownEditorSurfaceProps) {
  const surfaceStyle = {
    "--hf-md-font-scale": String(fontScale),
  } as CSSProperties;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Vditor | null>(null);
  const [isReady, setIsReady] = useState(false);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const documentPathRef = useRef(documentPath);
  const sourcePathRef = useRef(sourcePath);
  const placeholderRef = useRef(placeholder);
  const lastEmittedValueRef = useRef(value);
  const pendingInitialValueRef = useRef(value);

  useEffect(() => {
    sourcePathRef.current = sourcePath;
  }, [sourcePath]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    documentPathRef.current = documentPath;
  }, [documentPath]);

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
    const editable = host?.querySelector<HTMLElement>(".vditor-ir, .vditor-wysiwyg, .vditor-sv");
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
    setIsReady(false);
    lastEmittedValueRef.current = pendingInitialValueRef.current;

    const editor: Vditor = new Vditor(host, {
      mode: "ir",
      value: pendingInitialValueRef.current,
      height: "100%",
      placeholder: placeholderRef.current,
      theme: "classic",
      cdn: "/vditor",
      cache: { enable: false },
      counter: { enable: false },
      preview: {
        hljs: {
          style: "github",
          lineNumber: false,
        },
      },
      toolbar: [
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
        "undo",
        "redo",
      ],
      toolbarConfig: {
        pin: true,
      },
      input: (nextValue: string) => {
        lastEmittedValueRef.current = nextValue;
        onChangeRef.current(nextValue);
      },
      select: (selected: string) => {
        onSelectionChangeRef.current?.(selected.trim());
      },
      unSelect: () => {
        onSelectionChangeRef.current?.("");
      },
      after: () => {
        setIsReady(true);
        focusEditor();
      },
      upload: {
        accept: "image/*",
        multiple: true,
        handler: (async (files: File[]): Promise<string | null> => {
          const sourcePath = documentPathRef.current;
          if (!sourcePath) {
            return "No markdown document is open.";
          }
          try {
            for (const file of files) {
              const fileName = file.name || "image.png";
              const dataBase64 = await blobToBase64(file);
              const result = await markdownInvoke<{ path: string }>("md_save_image", {
                sourcePath,
                dataBase64,
                fileName,
              });
              const inserted = `\n![${fileName}](${result.path.replace(/\\/g, "/")})\n`;
              editor.insertValue(inserted);
            }
            return null;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Failed to save pasted image:", error);
            return message;
          }
        }) as (files: File[]) => Promise<null>,
      },
    });

    editorRef.current = editor;

    let observer: MutationObserver | null = null;
    let observerAttached = false;
    let attachAttempts = 0;

    const rewriteImages = () => {
      host.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        const raw = img.dataset.rawSrc ?? img.getAttribute("src") ?? undefined;
        if (!raw) return;
        if (!img.dataset.rawSrc) {
          img.dataset.rawSrc = raw;
        }
        const resolved = resolveLocalAssetSrc(raw, sourcePathRef.current);
        if (resolved && img.getAttribute("src") !== resolved) {
          img.setAttribute("src", resolved);
        }
      });
    };

    const tryAttachObserver = () => {
      if (observerAttached) return;
      const target = host.querySelector<HTMLElement>(".vditor-ir, .vditor-wysiwyg, .vditor-sv") ?? host;
      observer = new MutationObserver(() => {
        rewriteImages();
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
      observerAttached = true;
      rewriteImages();
      if (!host.querySelector(".vditor-ir, .vditor-wysiwyg, .vditor-sv") && attachAttempts < 30) {
        attachAttempts += 1;
        window.setTimeout(() => {
          observer?.disconnect();
          observer = null;
          observerAttached = false;
          tryAttachObserver();
        }, 80);
      }
    };

    tryAttachObserver();

    return () => {
      setIsReady(false);
      observer?.disconnect();
      observer = null;
      try {
        editor.destroy();
      } catch {
        // Vditor throws if destroyed after the host node has already been
        // removed; safe to swallow during React unmount.
      }
      editorRef.current = null;
      host.innerHTML = "";
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      pendingInitialValueRef.current = value;
      return;
    }
    if (value === lastEmittedValueRef.current) {
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    lastEmittedValueRef.current = value;
    editor.setValue(value, true);
  }, [value, isReady]);

  useEffect(() => {
    if (!isReady) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.setTheme(themeType === "dark" ? "dark" : "classic");
  }, [themeType, isReady]);

  useEffect(() => {
    if (!isReady || !editorRef.current) {
      return;
    }
    focusEditor();
  }, [focusToken, isReady]);

  return (
    <div className="hf-markdown-editor relative h-full min-h-0 overflow-visible rounded-[28px] border border-border bg-background/85" style={surfaceStyle}>
      <div ref={containerRef} className="h-full min-h-0 overflow-visible rounded-[28px]" />
    </div>
  );
}
