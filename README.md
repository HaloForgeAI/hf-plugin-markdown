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

- Frontend UI lives under `app/`
- Native commands live under `backend/`
- The plugin is packaged independently from the main HaloForge app

## Packaging

This repository builds independently from the main HaloForge app. The backend uses the published
`haloforge-plugin-api` crate, and the frontend uses `@haloforge/plugin-sdk`.

Local package check:

```bash
cargo run --manifest-path ../HaloForge/tools/hf-pack/Cargo.toml -- check .
cargo run --manifest-path ../HaloForge/tools/hf-pack/Cargo.toml -- pack . --release --out dist/plugin-release
```

GitHub release packaging uses `.github/workflows/plugin-release.yml`. If the HaloForge tooling
repository is private, set `HALOFORGE_TOOLS_TOKEN` with read access to `HaloForgeAI/HaloForge`.
Set `HF_ADMIN_TOKEN` to submit generated catalog metadata to the production plugin catalog.

## Next evolution

- AST-backed document model
- Inline AI patch accept / reject flow
- Windows/macOS single-instance file-open forwarding
- Chunk-aware retrieval and semantic search across Markdown workspaces
