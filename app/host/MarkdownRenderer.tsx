import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import "../vditorLocalAssets";
import Vditor from "../vendor/vditor/dist/index.js";
import { VDITOR_CDN, VDITOR_ZH_CN_I18N } from "../vditorConfig";
import { getMarkdownCodeTheme, queueMarkdownCodeHighlight } from "../markdown/codeHighlight";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  afterContent?: ReactNode;
  showStreamingCursor?: boolean;
  sourcePath?: string;
  themeType?: "light" | "dark";
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming,
  afterContent,
  showStreamingCursor,
  sourcePath,
  themeType = "light",
}: MarkdownRendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewId = useMemo(() => `hf-md-preview-${crypto.randomUUID()}`, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let cancelHighlight: (() => void) | undefined;
    root.innerHTML = "";
    root.classList.add("vditor-reset");

    void Vditor.preview(root, content, {
      cdn: VDITOR_CDN,
      lang: "zh_CN",
      i18n: VDITOR_ZH_CN_I18N,
      theme: {
        current: themeType === "dark" ? "dark" : "light",
        path: `${VDITOR_CDN}/dist/css/content-theme`,
      },
      hljs: {
        enable: true,
        style: getMarkdownCodeTheme(themeType),
        lineNumber: false,
      },
      markdown: {
        codeBlockPreview: true,
        mathBlockPreview: true,
        toc: true,
      },
      mode: themeType === "dark" ? "dark" : "light",
      render: {
        media: {
          enable: true,
        },
      },
      after: () => {
        if (cancelled) return;
        rewriteRenderedDom(root, sourcePath);
        cancelHighlight?.();
        cancelHighlight = queueMarkdownCodeHighlight(root, themeType);
      },
    }).catch((error) => {
      if (cancelled) return;
      console.error("Failed to render markdown with Vditor", error);
      root.textContent = content;
    });

    return () => {
      cancelled = true;
      cancelHighlight?.();
      root.innerHTML = "";
    };
  }, [content, sourcePath, themeType]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const tocTarget = findTocTargetElement(target, root);
      if (tocTarget) {
        event.preventDefault();
        event.stopPropagation();
        scrollToHashLink(tocTarget.getAttribute("data-target-id") ?? "", tocTarget.textContent ?? "", root);
        return;
      }

      const anchor = target?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href") ?? "";
      if (rawHref.startsWith("#")) {
        event.preventDefault();
        event.stopPropagation();
        scrollToHashLink(rawHref, anchor.textContent ?? "", root);
        return;
      }

      const resolvedHref = resolveMarkdownLink(rawHref, sourcePath);
      if (!resolvedHref) return;

      event.preventDefault();
      event.stopPropagation();
      void openUrl(resolvedHref).catch((error) => {
        console.error("Failed to open markdown link", error);
      });
    };

    root.addEventListener("click", handleClick, true);
    return () => root.removeEventListener("click", handleClick, true);
  }, [sourcePath]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => rewriteRenderedDom(root, sourcePath));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href"],
    });
    return () => observer.disconnect();
  }, [sourcePath]);

  return (
    <div className="markdown-body text-sm leading-relaxed text-foreground">
      <div id={previewId} ref={rootRef} />
      {afterContent}
      {(showStreamingCursor ?? isStreaming) && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary align-text-bottom" />
      )}
    </div>
  );
});

const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "m4a"]);

type MediaKind = "image" | "video" | "audio";

function rewriteRenderedDom(root: HTMLElement, sourcePath?: string) {
  root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    if (heading.id) return;
    const base = slugifyHeading(heading.textContent ?? "");
    if (!base) return;
    let id = base;
    let index = 1;
    while (root.querySelector(`#${CSS.escape(id)}`)) {
      id = `${base}-${index}`;
      index += 1;
    }
    heading.id = id;
  });

  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const raw = img.dataset.rawSrc ?? img.getAttribute("src") ?? undefined;
    if (!raw) return;
    if (!img.dataset.rawSrc) {
      img.dataset.rawSrc = raw;
    }

    const mediaKind = detectMediaKindFromSrc(raw);
    if (mediaKind !== "image") {
      const replacement = document.createElement(mediaKind === "video" ? "video" : "audio");
      replacement.src = resolveMarkdownAssetSrc(raw, sourcePath) ?? raw;
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

    const resolved = resolveMarkdownAssetSrc(raw, sourcePath);
    if (resolved && img.getAttribute("src") !== resolved) {
      img.setAttribute("src", resolved);
    }
  });
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

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

function scrollToHashLink(rawHref: string, anchorText: string, root: HTMLElement | null) {
  const rawId = rawHref.startsWith("#") ? rawHref.slice(1) : rawHref;
  if (!rawId) return;
  const decodedId = (() => {
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  })();
  const searchRoot = root ?? document;
  const headings = Array.from(searchRoot.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  const target =
    headings.find((heading) => heading.id === decodedId) ??
    headings.find((heading) => heading.id === rawId) ??
    headings.find((heading) => (heading.textContent ?? "").trim() === anchorText.trim());

  if (target) {
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
  }
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

function findScrollableAncestor(element: HTMLElement, _root: HTMLElement | null) {
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

function getOffsetWithinScroller(element: HTMLElement, scroller: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return elementRect.top - scrollerRect.top + scroller.scrollTop;
}

function getMarkdownParentDir(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash < 0 ? "" : normalized.slice(0, lastSlash);
}

function toFileUrl(filePath: string): URL {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const pathname = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const url = new URL("file:///");
  url.pathname = pathname;
  return url;
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function isSupportedExternalProtocol(protocol: string): boolean {
  return protocol === "file:" || protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:";
}

function resolveMarkdownLink(href: string | undefined, sourcePath?: string): string | undefined {
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

function resolveMarkdownAssetSrc(rawSrc: string | undefined, sourcePath?: string): string | undefined {
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
  if (
    ABSOLUTE_URL_RE.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("#")
  ) {
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
