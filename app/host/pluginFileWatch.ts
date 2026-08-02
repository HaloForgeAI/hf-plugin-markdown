import { invokeHost } from "@haloforge/plugin-sdk";

const PLUGIN_ID = "dev.haloforge.markdown";

export const MARKDOWN_FILE_CHANGED_EVENT = `plugin:${PLUGIN_ID}:file-changed`;

export interface PluginFileChangedEvent {
  watchId: string;
  path: string;
  kind: "create" | "modify" | "remove" | "other";
}

interface PluginWatchFileResponse {
  watchId: string;
}

export function isPluginFileChangedEvent(payload: unknown): payload is PluginFileChangedEvent {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Partial<PluginFileChangedEvent>;
  return typeof candidate.watchId === "string" && typeof candidate.path === "string";
}

export async function startPluginFileWatch(path: string): Promise<string> {
  const response = await invokeHost<PluginWatchFileResponse>("plugin_watch_file", {
    request: {
      pluginId: PLUGIN_ID,
      path,
    },
  });
  return response.watchId;
}

export async function stopPluginFileWatch(watchId: string): Promise<void> {
  await invokeHost("plugin_unwatch_file", {
    request: {
      pluginId: PLUGIN_ID,
      watchId,
    },
  });
}
