import { VDITOR_LOCAL_ASSETS_BASE64 } from "./vditorLocalAssets.generated";

declare global {
  interface Window {
    __HF_VDITOR_ASSETS__?: Record<string, string>;
  }
}

if (typeof window !== "undefined") {
  window.__HF_VDITOR_ASSETS__ = {
    ...(window.__HF_VDITOR_ASSETS__ ?? {}),
    ...decodeLocalAssets(VDITOR_LOCAL_ASSETS_BASE64),
  };
}

function decodeLocalAssets(assets: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assets).map(([path, content]) => [path, decodeBase64Utf8(content)]),
  );
}

function decodeBase64Utf8(content: string): string {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export {};
