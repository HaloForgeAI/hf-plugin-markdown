// Live syntax highlighting for actively edited Vditor IR code blocks powered by
// the CSS Custom Highlight API (`CSS.highlights` + `::highlight(...)`).
//
// Why CSS Custom Highlight API instead of injecting `<span>` tags?
// Inside Vditor's `contenteditable` IR `<pre class="vditor-ir__marker--pre"><code>`,
// mutating innerHTML would disturb the caret, IME composition, undo stack, and
// Lute's DOM-to-Markdown serialization. Painting tokens via Range objects keeps
// the editable DOM 100% untouched while delivering real-time syntax colors!

type ThemeType = "light" | "dark";

interface HighlightJsApi {
  getLanguage: (language: string) => { name: string } | undefined;
  highlight: (
    code: string,
    options: { language?: string; ignoreIllegals: boolean },
  ) => { value: string };
}

interface HighlightObject {
  priority?: number;
}

interface HighlightRegistry {
  set: (name: string, highlight: HighlightObject) => void;
  delete: (name: string) => void;
}

type HighlightCtor = new (...ranges: Range[]) => HighlightObject;

const TOKEN_CATEGORIES = [
  "keyword",
  "title",
  "attr",
  "string",
  "built-in",
  "comment",
  "name",
  "section",
  "bullet",
  "addition",
  "deletion",
] as const;

type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

interface TextRun {
  node: Text;
  nodeOffset: number;
  cleanStart: number;
  length: number;
}

interface TokenSpan {
  start: number;
  end: number;
  category: TokenCategory;
}

const MAX_LIVE_HIGHLIGHT_CHARS = 32000;

const LANGUAGE_FALLBACK_ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  js: "javascript",
  rs: "rust",
  py: "python",
  sh: "bash",
  zsh: "bash",
  shell: "bash",
  yml: "yaml",
  toml: "ini",
  md: "markdown",
  cs: "csharp",
  "c++": "cpp",
  "c#": "csharp",
};

const PLAIN_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext"]);

function getHighlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === "undefined") return null;
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null;
}

function getHighlightCtor(): HighlightCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Highlight?: HighlightCtor }).Highlight ?? null;
}

function getHljs(): HighlightJsApi | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { hljs?: HighlightJsApi }).hljs ?? null;
}

function highlightKey(theme: ThemeType, category: TokenCategory): string {
  return `hf-code-${theme}-${category}`;
}

export function liveCodeHighlightSupported(): boolean {
  return Boolean(getHighlightRegistry() && getHighlightCtor());
}

export function clearLiveCodeHighlights(): void {
  const registry = getHighlightRegistry();
  if (!registry) return;
  for (const theme of ["dark", "light"] as const) {
    for (const category of TOKEN_CATEGORIES) {
      registry.delete(highlightKey(theme, category));
    }
  }
}

function resolveLanguage(rawLang: string, hljs: HighlightJsApi): string | null {
  const normalized = rawLang.trim().toLowerCase();
  if (PLAIN_LANGUAGES.has(normalized)) return null;
  if (hljs.getLanguage(normalized)) return normalized;
  const alias = LANGUAGE_FALLBACK_ALIASES[normalized];
  if (alias && hljs.getLanguage(alias)) return alias;
  return null;
}

function extractBlockLanguage(block: HTMLElement): string {
  const infoNode = block.querySelector<HTMLElement>(
    ":scope > span[data-type='code-block-info'], :scope > span.vditor-ir__marker--info",
  );
  const rawInfo = (infoNode?.textContent ?? "").replace(/\u200b/g, "").trim();
  const firstToken = rawInfo.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstToken) return firstToken;
  return (block.getAttribute("data-hf-lang") ?? "").trim().toLowerCase();
}

function collectCodeTextRuns(codeEl: HTMLElement): { cleanCode: string; runs: TextRun[] } {
  const runs: TextRun[] = [];
  const chunks: string[] = [];
  let cleanPos = 0;

  const walker = document.createTreeWalker(
    codeEl,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const textNode = current as Text;
      const raw = textNode.textContent ?? "";
      if (raw.length > 0) {
        if (!raw.includes("\u200b")) {
          runs.push({
            node: textNode,
            nodeOffset: 0,
            cleanStart: cleanPos,
            length: raw.length,
          });
          chunks.push(raw);
          cleanPos += raw.length;
        } else {
          // Skip Vditor's zero-width spaces (`\u200b`) while keeping exact DOM offsets.
          let segStart = -1;
          for (let i = 0; i <= raw.length; i += 1) {
            const isZwsp = i === raw.length || raw.charCodeAt(i) === 0x200b;
            if (!isZwsp && segStart === -1) {
              segStart = i;
            } else if (isZwsp && segStart !== -1) {
              const slice = raw.slice(segStart, i);
              runs.push({
                node: textNode,
                nodeOffset: segStart,
                cleanStart: cleanPos,
                length: slice.length,
              });
              chunks.push(slice);
              cleanPos += slice.length;
              segStart = -1;
            }
          }
        }
      }
    } else if (current.nodeType === Node.ELEMENT_NODE && (current as HTMLElement).tagName === "BR") {
      chunks.push("\n");
      cleanPos += 1;
    }
    current = walker.nextNode();
  }

  return { cleanCode: chunks.join(""), runs };
}

function resolveElementCategory(el: HTMLElement, inherited: TokenCategory | null): TokenCategory | null {
  const classes = el.classList;
  if (classes.length === 0) return inherited;

  if (classes.contains("hljs-comment") || classes.contains("hljs-code") || classes.contains("hljs-formula")) {
    return "comment";
  }
  if (classes.contains("hljs-string") || classes.contains("hljs-regexp")) {
    return "string";
  }
  if (
    classes.contains("hljs-keyword") ||
    classes.contains("hljs-doctag") ||
    classes.contains("hljs-template-tag") ||
    classes.contains("hljs-template-variable") ||
    classes.contains("hljs-type") ||
    (classes.contains("hljs-variable") && classes.contains("language_"))
  ) {
    return "keyword";
  }
  if (classes.contains("hljs-title")) {
    return "title";
  }
  if (classes.contains("hljs-built_in") || classes.contains("hljs-symbol")) {
    return "built-in";
  }
  if (
    classes.contains("hljs-name") ||
    classes.contains("hljs-quote") ||
    classes.contains("hljs-selector-tag") ||
    classes.contains("hljs-selector-pseudo")
  ) {
    return "name";
  }
  if (classes.contains("hljs-section")) {
    return "section";
  }
  if (classes.contains("hljs-bullet")) {
    return "bullet";
  }
  if (classes.contains("hljs-addition")) {
    return "addition";
  }
  if (classes.contains("hljs-deletion")) {
    return "deletion";
  }
  if (
    classes.contains("hljs-attr") ||
    classes.contains("hljs-attribute") ||
    classes.contains("hljs-literal") ||
    classes.contains("hljs-meta") ||
    classes.contains("hljs-number") ||
    classes.contains("hljs-operator") ||
    classes.contains("hljs-variable") ||
    classes.contains("hljs-property") ||
    classes.contains("hljs-selector-attr") ||
    classes.contains("hljs-selector-class") ||
    classes.contains("hljs-selector-id")
  ) {
    return "attr";
  }

  return inherited;
}

function extractTokenSpans(highlightedHtml: string): TokenSpan[] {
  const scratch = document.createElement("div");
  scratch.innerHTML = highlightedHtml;

  const spans: TokenSpan[] = [];
  let offset = 0;

  const walk = (node: Node, inherited: TokenCategory | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (len > 0) {
        if (inherited) {
          spans.push({ start: offset, end: offset + len, category: inherited });
        }
        offset += len;
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const category = resolveElementCategory(node as HTMLElement, inherited);
      for (const child of Array.from(node.childNodes)) {
        walk(child, category);
      }
    }
  };

  walk(scratch, null);
  return spans;
}

function mapSpansToRanges(
  spans: TokenSpan[],
  runs: TextRun[],
  buckets: Record<TokenCategory, Range[]>,
): void {
  if (spans.length === 0 || runs.length === 0) return;

  let runIdx = 0;
  for (const span of spans) {
    while (runIdx < runs.length && runs[runIdx].cleanStart + runs[runIdx].length <= span.start) {
      runIdx += 1;
    }

    let r = runIdx;
    while (r < runs.length && runs[r].cleanStart < span.end) {
      const run = runs[r];
      const overlapStart = Math.max(span.start, run.cleanStart);
      const overlapEnd = Math.min(span.end, run.cleanStart + run.length);
      if (overlapEnd > overlapStart) {
        const range = document.createRange();
        range.setStart(run.node, run.nodeOffset + (overlapStart - run.cleanStart));
        range.setEnd(run.node, run.nodeOffset + (overlapEnd - run.cleanStart));
        buckets[span.category].push(range);
      }
      if (run.cleanStart + run.length >= span.end) {
        break;
      }
      r += 1;
    }
  }
}

export function syncLiveCodeHighlights(host: HTMLElement, themeType: ThemeType): boolean {
  const registry = getHighlightRegistry();
  const HighlightCtor = getHighlightCtor();
  if (!registry || !HighlightCtor) return false;

  const expandedBlocks = Array.from(
    host.querySelectorAll<HTMLElement>(".vditor-ir__node--expand[data-type='code-block']"),
  );

  if (expandedBlocks.length === 0) {
    clearLiveCodeHighlights();
    return true;
  }

  const hljs = getHljs();
  if (!hljs) {
    // hljs script not yet loaded by Vditor; caller can retry once ready.
    return false;
  }

  const buckets: Record<TokenCategory, Range[]> = {
    keyword: [],
    title: [],
    attr: [],
    string: [],
    "built-in": [],
    comment: [],
    name: [],
    section: [],
    bullet: [],
    addition: [],
    deletion: [],
  };

  for (const block of expandedBlocks) {
    const codeEl = block.querySelector<HTMLElement>(":scope > pre.vditor-ir__marker--pre > code");
    if (!codeEl) continue;

    const language = resolveLanguage(extractBlockLanguage(block), hljs);
    if (!language) continue;

    const { cleanCode, runs } = collectCodeTextRuns(codeEl);
    if (!cleanCode || cleanCode.length > MAX_LIVE_HIGHLIGHT_CHARS || runs.length === 0) continue;

    try {
      const { value } = hljs.highlight(cleanCode, { language, ignoreIllegals: true });
      const spans = extractTokenSpans(value);
      mapSpansToRanges(spans, runs, buckets);
    } catch {
      // Never disturb editing if highlight.js fails on partial/transient syntax.
    }
  }

  const otherTheme: ThemeType = themeType === "dark" ? "light" : "dark";
  for (const category of TOKEN_CATEGORIES) {
    registry.delete(highlightKey(otherTheme, category));
    const ranges = buckets[category];
    const key = highlightKey(themeType, category);
    if (ranges.length > 0) {
      const hl = new HighlightCtor(...ranges);
      // Keep priority below Cmd+F find highlights (default 0) so search matches
      // always remain visible on top of code syntax colors.
      hl.priority = -1;
      registry.set(key, hl);
    } else {
      registry.delete(key);
    }
  }

  return true;
}
