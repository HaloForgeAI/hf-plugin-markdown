import { definePlugin, registerPlugin } from "@haloforge/plugin-sdk";
import { MarkdownPanel } from "./MarkdownPanel";

registerPlugin("dev.haloforge.markdown", definePlugin({ panel: MarkdownPanel }));
