// In-document find powered by the CSS Custom Highlight API. Highlighting via
// Range objects (instead of wrapping text in <mark>) keeps the DOM untouched,
// which is essential inside Vditor's contenteditable surfaces where injected
// markup would be serialized back into the document.

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

type HighlightCtor = new (...ranges: Range[]) => unknown;

const HL_NAME = "hf-md-find";
const HL_ACTIVE = "hf-md-find-active";

function getHighlights(): HighlightRegistry | null {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  return registry ?? null;
}

function getHighlightCtor(): HighlightCtor | null {
  return (window as unknown as { Highlight?: HighlightCtor }).Highlight ?? null;
}

export function findApiSupported(): boolean {
  return Boolean(getHighlights() && getHighlightCtor());
}

export function clearFindHighlights(): void {
  const registry = getHighlights();
  registry?.delete(HL_NAME);
  registry?.delete(HL_ACTIVE);
}

export function computeMatchRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  const needle = query.toLowerCase();
  if (!needle) return ranges;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script, style, .hf-code-language-inline, .vditor-toolbar")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.textContent ?? "";
    const lower = text.toLowerCase();
    let from = 0;
    let index = lower.indexOf(needle, from);
    while (index !== -1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      ranges.push(range);
      from = index + needle.length;
      index = lower.indexOf(needle, from);
    }
    node = walker.nextNode() as Text | null;
  }
  return ranges;
}

export function applyFindHighlights(ranges: Range[], currentIndex: number): void {
  const registry = getHighlights();
  const HighlightCtor = getHighlightCtor();
  clearFindHighlights();
  if (!registry || !HighlightCtor || ranges.length === 0) return;

  const others = ranges.filter((_, index) => index !== currentIndex);
  if (others.length > 0) {
    registry.set(HL_NAME, new HighlightCtor(...others));
  }
  const current = ranges[currentIndex];
  if (current) {
    registry.set(HL_ACTIVE, new HighlightCtor(current));
  }
}

export function scrollRangeIntoView(range: Range | undefined): void {
  if (!range) return;
  const element = range.startContainer.parentElement;
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}
