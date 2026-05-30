import {code160to32} from "../util/code160to32";

const stripHaloForgeTransientControls = (html: string) => {
    if (html.indexOf("data-hf-transient") === -1 && html.indexOf("hf-code-language-inline") === -1) {
        return html;
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    container.querySelectorAll("[data-hf-transient], .hf-code-language-inline").forEach((item) => {
        item.remove();
    });
    return container.innerHTML;
};

export const getMarkdown = (vditor: IVditor) => {
    if (vditor.currentMode === "sv") {
        return code160to32(`${vditor.sv.element.textContent}\n`.replace(/\n\n$/, "\n"));
    } else if (vditor.currentMode === "wysiwyg") {
        return vditor.lute.VditorDOM2Md(stripHaloForgeTransientControls(vditor.wysiwyg.element.innerHTML));
    } else if (vditor.currentMode === "ir") {
        return vditor.lute.VditorIRDOM2Md(vditor.ir.element.innerHTML);
    }
    return "";
};
