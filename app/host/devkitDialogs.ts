import {
  pickHostDirectory,
  pickHostFile,
  saveHostFile,
  type HostFileDialogOptions,
} from "@haloforge/plugin-sdk";

type PickFileOptions = HostFileDialogOptions;
type PickDirectoryOptions = HostFileDialogOptions;
type SaveFileOptions = HostFileDialogOptions;

export async function pickFile(options: PickFileOptions = {}): Promise<string | null> {
  return pickHostFile(options);
}

export async function pickDirectory(options: PickDirectoryOptions = {}): Promise<string | null> {
  return pickHostDirectory(options);
}

export async function saveFile(options: SaveFileOptions = {}): Promise<string | null> {
  return saveHostFile(options);
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
