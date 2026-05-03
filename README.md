# Markdown Workspace

A built-in Level 0 HaloForge plugin that adds an AI-native Markdown workspace to the left sidebar.

## Current MVP scaffold

- Sidebar-level Markdown module
- Open Markdown files from a native file picker
- Save Markdown files back to disk with existing line-ending preservation
- Persist recently opened files in the plugin database
- High-quality Markdown rendering using the shared renderer
- Read / write workspace modes
- Typora-style instant-rendering (IR) Markdown editing powered by Vditor
- Selection-aware AI reading panel scaffold backed by the existing AI Chat transport
- Startup file-open bridge, macOS Opened event handling, and window drag-and-drop bridge

## Plugin boundaries

- Frontend UI lives under `plugins/hf-plugin-markdown/app/`
- Native commands live under `plugins/hf-plugin-markdown/backend/`
- The plugin is registered as a built-in plugin by the Tauri host

## Next evolution

- AST-backed document model
- Inline AI patch accept / reject flow
- Windows/macOS single-instance file-open forwarding
- Chunk-aware retrieval and semantic search across Markdown workspaces