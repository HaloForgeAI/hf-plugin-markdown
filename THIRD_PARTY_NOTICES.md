# Third Party Notices

This repository includes third party source and runtime assets used by the HaloForge Markdown Workspace plugin.

## Vditor

- Component: Vditor 3.11.2
- Source: `app/vendor/vditor`
- Upstream repository: `https://github.com/Vanessa219/vditor`
- License: MIT
- Local license file: `app/vendor/vditor/LICENSE`
- Notes: Maintained here as a git subtree from the HaloForgeAI fork. See `VENDORING.md`.

## Vditor Runtime Assets

The Vditor distribution includes browser-side runtime assets for Markdown parsing, syntax highlighting, math, diagrams, charts, chemical rendering, ABC notation, and mind maps. The following notices identify the bundled assets that are shipped through the plugin frontend bundle.

- Component: highlight.js
- Source: `app/vendor/vditor/dist/js/highlight.js`
- License: BSD-3-Clause
- Local license file: `app/vendor/vditor/dist/js/highlight.js/LICENSE`

- Component: highlight.js style themes
- Source: `app/vendor/vditor/dist/js/highlight.js/styles`
- License: primarily MIT or more permissive, as noted in individual theme files

- Component: MathJax
- Source: `app/vendor/vditor/dist/js/mathjax`
- License: Apache-2.0
- Local license file: `app/vendor/vditor/dist/js/mathjax/LICENSE`

- Component: KaTeX and mhchem extension
- Source: `app/vendor/vditor/dist/js/katex`
- License: MIT

- Component: Mermaid
- Source: `app/vendor/vditor/dist/js/mermaid/mermaid.min.js`
- License: MIT
- Notes: The bundled Mermaid file also preserves nested notices for dependencies such as DOMPurify, js-yaml, lodash, and cytoscape.

- Component: Apache ECharts
- Source: `app/vendor/vditor/dist/js/echarts/echarts.min.js`
- License: Apache-2.0

- Component: flowchart.js and Raphael
- Source: `app/vendor/vditor/dist/js/flowchart.js/flowchart.min.js`
- License: MIT

- Component: Viz.js, Graphviz, Expat, and zlib runtime bundle
- Source: `app/vendor/vditor/dist/js/graphviz`
- Licenses: MIT, Eclipse Public License 1.0, and zlib license as preserved in `app/vendor/vditor/dist/js/graphviz/viz.js`

- Component: plantuml-encoder
- Source: `app/vendor/vditor/dist/js/plantuml/plantuml-encoder.min.js`
- License: MIT
- Notes: The bundled encoder includes pako, which is MIT and zlib licensed.

- Component: abcjs
- Source: `app/vendor/vditor/dist/js/abcjs/abcjs_basic.min.js`
- License: MIT

- Component: markmap and D3
- Source: `app/vendor/vditor/dist/js/markmap`
- Licenses: MIT and BSD-3-Clause
- Notes: D3 license information is preserved in `markmap.min.js`.

- Component: SmilesDrawer
- Source: `app/vendor/vditor/dist/js/smiles-drawer/smiles-drawer.min.js`
- License: MIT
- Notes: The bundled file preserves notices for nested color conversion assets, including chroma.js and ColorBrewer data.

- Component: Lute Markdown engine
- Source: `app/vendor/vditor/dist/js/lute/lute.min.js`
- License: MIT

Where a bundled JavaScript or CSS file contains its own license banner or bundled license block, that notice is preserved in the vendored file.
