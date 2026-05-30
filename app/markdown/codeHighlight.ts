import Vditor from "../vendor/vditor/dist/index.js";
import { VDITOR_CDN } from "../vditorConfig";

type ThemeType = "light" | "dark";

interface HighlightJsApi {
  getLanguage: (language: string) => { name: string } | undefined;
  highlight: (
    code: string,
    options: { language?: string; ignoreIllegals: boolean },
  ) => { value: string };
}

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

export function getMarkdownCodeTheme(themeType: ThemeType) {
  return themeType === "dark" ? "github-dark" : "github";
}

export function queueMarkdownCodeHighlight(root: HTMLElement, themeType: ThemeType) {
  const timers: number[] = [];

  runVditorHighlight(root, themeType);
  [0, 80, 220, 520].forEach((delay) => {
    timers.push(
      window.setTimeout(() => {
        runFallbackHighlight(root);
      }, delay),
    );
  });

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}

export function runVditorHighlight(root: HTMLElement, themeType: ThemeType) {
  Vditor.highlightRender({
    enable: true,
    lineNumber: false,
    defaultLang: "",
    style: getMarkdownCodeTheme(themeType),
  }, root, VDITOR_CDN);
}

export function runFallbackHighlight(root: HTMLElement) {
  const highlighter = (window as Window & { hljs?: HighlightJsApi }).hljs;
  if (!highlighter) return;

  root.querySelectorAll<HTMLElement>("pre > code").forEach((block) => {
    if (shouldSkipCodeBlock(block)) return;

    const hasTokenSpans = Boolean(block.querySelector("[class^='hljs-'], [class*=' hljs-']"));
    block.classList.add("hljs");
    if (hasTokenSpans) return;

    const language = resolveHighlightLanguage(block, highlighter);
    const code = block.textContent ?? "";
    block.innerHTML = highlighter.highlight(code, {
      language,
      ignoreIllegals: true,
    }).value;
  });
}

function shouldSkipCodeBlock(block: HTMLElement) {
  const parent = block.parentElement;
  if (!parent) return true;
  if (
    parent.classList.contains("vditor-ir__marker--pre") ||
    parent.classList.contains("vditor-wysiwyg__pre") ||
    (parent.matches("pre:first-child") && parent.parentElement?.classList.contains("hf-vditor-code-block--editing"))
  ) {
    return true;
  }

  const language = getLanguageClass(block);
  return Boolean(language && SPECIAL_RENDER_LANGUAGES.has(language));
}

function resolveHighlightLanguage(block: HTMLElement, highlighter: HighlightJsApi) {
  const language = getLanguageClass(block);
  if (language && highlighter.getLanguage(language)) {
    return language;
  }
  return "plaintext";
}

function getLanguageClass(block: HTMLElement) {
  const languageClass = Array.from(block.classList).find((className) => className.startsWith("language-"));
  return languageClass?.slice("language-".length).toLowerCase() ?? "";
}
