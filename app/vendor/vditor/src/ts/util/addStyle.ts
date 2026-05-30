export const addStyle = (url: string, id: string) => {
    if (!document.getElementById(id)) {
        const localPath = getLocalAssetPath(url);
        const localContent = localPath ? window.__HF_VDITOR_ASSETS__?.[localPath] : undefined;
        if (localContent) {
            const styleElement = document.createElement("style");
            styleElement.id = id;
            styleElement.textContent = localContent;
            document.getElementsByTagName("head")[0].appendChild(styleElement);
            return;
        }
        const styleElement = document.createElement("link");
        styleElement.id = id;
        styleElement.rel = "stylesheet";
        styleElement.type = "text/css";
        styleElement.href = url;
        document.getElementsByTagName("head")[0].appendChild(styleElement);
    }
};

const getLocalAssetPath = (path: string) => {
    const normalized = path.split("?")[0]?.replace(/\\/g, "/") ?? "";
    const marker = "/dist/";
    const index = normalized.indexOf(marker);
    if (index < 0) {
        return undefined;
    }
    return normalized.slice(index + 1);
};
