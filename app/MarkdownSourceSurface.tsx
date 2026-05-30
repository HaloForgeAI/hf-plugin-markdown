import { forwardRef } from "react";
import { MarkdownEditorSurface, type MarkdownEditorSurfaceHandle } from "./MarkdownEditorSurface";
import type { MarkdownHeading } from "./markdown/types";

interface MarkdownSourceSurfaceProps {
  value: string;
  sourcePath: string | null;
  headings: MarkdownHeading[];
  themeType: "light" | "dark";
  placeholder: string;
  documentPath?: string | null;
  fontScale: number;
  focusToken?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: string) => void;
  onActiveHeadingChange?: (index: number | null) => void;
}

export const MarkdownSourceSurface = forwardRef<MarkdownEditorSurfaceHandle, MarkdownSourceSurfaceProps>(function MarkdownSourceSurface({
  value,
  sourcePath,
  headings,
  themeType,
  placeholder,
  documentPath,
  fontScale,
  focusToken,
  onChange,
  onSelectionChange,
  onActiveHeadingChange,
}, ref) {
  return (
    <MarkdownEditorSurface
      ref={ref}
      value={value}
      sourcePath={sourcePath}
      headings={headings}
      themeType={themeType}
      placeholder={placeholder}
      documentPath={documentPath ?? sourcePath}
      fontScale={fontScale}
      focusToken={focusToken}
      variant="split"
      onChange={onChange}
      onSelectionChange={onSelectionChange}
      onActiveHeadingChange={onActiveHeadingChange}
    />
  );
});
