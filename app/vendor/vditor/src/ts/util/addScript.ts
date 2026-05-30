export const addScriptSync = (path: string, id: string) => {
    if (document.getElementById(id)) {
        return false;
    }
    const localPath = getLocalAssetPath(path);
    if (localPath) {
        const localScript = appendInlineScript(localPath, id);
        if (localScript) {
            return localScript;
        }
    }
    const xhrObj = new XMLHttpRequest();
    xhrObj.open("GET", path, false);
    xhrObj.setRequestHeader("Accept",
        "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01");
    xhrObj.send("");
    const scriptElement = document.createElement("script");
    scriptElement.type = "text/javascript";
    scriptElement.text = xhrObj.responseText;
    scriptElement.id = id;
    document.head.appendChild(scriptElement);
};

export const addScript = (path: string, id: string) => {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            // 脚本加载后再次调用直接返回
            resolve(true);
            return false;
        }
        const localPath = getLocalAssetPath(path);
        if (localPath) {
            const localScript = appendInlineScript(localPath, id);
            if (localScript) {
                resolve(true);
                return false;
            }
        }
        const scriptElement = document.createElement("script");
        scriptElement.src = path;
        scriptElement.async = true;
        // 循环调用时 Chrome 不会重复请求 js
        document.head.appendChild(scriptElement);
        scriptElement.onerror = (event) => {
            reject(event);
        }
        scriptElement.onload = () => {
            if (document.getElementById(id)) {
                // 循环调用需清除 DOM 中的 script 标签
                scriptElement.remove();
                resolve(true);
                return false;
            }
            scriptElement.id = id;
            resolve(true);
        };
    });
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

const appendInlineScript = (assetPath: string, id: string) => {
    const content = window.__HF_VDITOR_ASSETS__?.[assetPath];
    if (!content) {
        return undefined;
    }
    const scriptElement = document.createElement("script");
    scriptElement.type = "text/javascript";
    scriptElement.text = content;
    scriptElement.id = id;
    document.head.appendChild(scriptElement);
    return scriptElement;
};
