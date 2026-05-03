import { invoke } from "@tauri-apps/api/core";

interface PickFileOptions {
  title?: string;
  directory?: string;
  filters?: string[];
}

interface PickDirectoryOptions {
  title?: string;
  directory?: string;
}

interface SaveFileOptions {
  title?: string;
  directory?: string;
  defaultName?: string;
  filters?: string[];
}

export async function pickFile(options: PickFileOptions = {}): Promise<string | null> {
  return invoke<string | null>("devkit_pick_file", {
    title: options.title ?? null,
    directory: options.directory ?? null,
    filters: options.filters ?? null,
  });
}

export async function pickDirectory(options: PickDirectoryOptions = {}): Promise<string | null> {
  return invoke<string | null>("devkit_pick_directory", {
    title: options.title ?? null,
    directory: options.directory ?? null,
  });
}

export async function saveFile(options: SaveFileOptions = {}): Promise<string | null> {
  return invoke<string | null>("devkit_save_file", {
    title: options.title ?? null,
    directory: options.directory ?? null,
    defaultName: options.defaultName ?? null,
    filters: options.filters ?? null,
  });
}

export function getParentDirectory(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/").trim();
  if (!normalizedPath) {
    return "";
  }

  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  if (lastSlashIndex <= 0) {
    return normalizedPath;
  }

  return normalizedPath.slice(0, lastSlashIndex);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}