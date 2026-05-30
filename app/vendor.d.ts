declare module "./vendor/vditor/dist/index.js" {
  import Vditor from "vditor";
  export default Vditor;
}

declare module "*?raw" {
  const content: string;
  export default content;
}

interface ImportMeta {
  glob(
    pattern: string,
    options: { eager: true; import: "default"; query: "?raw" },
  ): Record<string, string>;
}
