# Vendoring

## Vditor

The Markdown Workspace keeps Vditor as a git subtree under `app/vendor/vditor`.
The subtree source is the HaloForge-maintained fork:

- repository: `git@github-loybot:HaloForgeAI/vditor.git`
- branch: `haloforge/markdown`
- prefix: `app/vendor/vditor`

The current subtree was imported from split commit `559c2ed307ba0cdd5dc215848c9c4c7bdae1449c`.

To pull future fork changes into this plugin:

```bash
git subtree pull --prefix=app/vendor/vditor git@github-loybot:HaloForgeAI/vditor.git haloforge/markdown --squash
```

To push plugin-local Vditor changes back to the fork:

```bash
git subtree push --prefix=app/vendor/vditor git@github-loybot:HaloForgeAI/vditor.git haloforge/markdown
```

Keep `app/vendor/vditor/package.json` minimal so the plugin frontend can install the local runtime without pulling the upstream Vditor development toolchain. Preserve upstream metadata in `app/vendor/vditor/package.upstream.json`.

## Removed Reference Vendors

Toast UI Editor reference bundles were removed from this repository. The plugin runtime now depends on the Vditor subtree and the plugin's own React/Rust sources.
