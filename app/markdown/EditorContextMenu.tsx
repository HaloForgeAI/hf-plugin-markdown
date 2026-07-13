import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { MarkdownTranslator } from "./types";

interface LinkEditorPopoverProps {
  x: number;
  y: number;
  initialText: string;
  initialHref: string;
  onApply: (text: string, href: string) => void;
  onClose: () => void;
  t: MarkdownTranslator;
}

/** Small popover to edit an inline link's text and URL (wysiwyg renders links to non-editable <a>). */
export function LinkEditorPopover({ x, y, initialText, initialHref, onApply, onClose, t }: LinkEditorPopoverProps) {
  const [text, setText] = useState(initialText);
  const [href, setHref] = useState(initialHref);
  const ref = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  const apply = () => onApply(text.trim(), href.trim());

  return (
    <>
      <div className="hf-md-overlay-backdrop" onMouseDown={onClose} />
      <div ref={ref} className="hf-md-linkedit" style={{ left: position.left, top: position.top }}>
        <label className="hf-md-linkedit__row">
          <span className="hf-md-linkedit__label">{t("markdown.editor.linkText")}</span>
          <input
            ref={firstInputRef}
            className="hf-md-linkedit__input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } if (event.key === "Escape") onClose(); }}
          />
        </label>
        <label className="hf-md-linkedit__row">
          <span className="hf-md-linkedit__label">{t("markdown.editor.linkUrl")}</span>
          <input
            className="hf-md-linkedit__input"
            value={href}
            placeholder="https://"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } if (event.key === "Escape") onClose(); }}
          />
        </label>
        <div className="hf-md-linkedit__actions">
          <button type="button" className="hf-md-btn hf-md-btn--ghost" onClick={onClose}>{t("markdown.reader.cancel")}</button>
          <button type="button" className="hf-md-btn hf-md-btn--primary" onClick={apply}>{t("markdown.editor.apply")}</button>
        </div>
      </div>
    </>
  );
}

const GRID_DEFAULT = 5;
const GRID_MAX = 10;
const CELL = 18;
const CELL_GAP = 3;

interface TableGridPickerProps {
  x: number;
  y: number;
  onPick: (rows: number, cols: number) => void;
  onClose: () => void;
  t: MarkdownTranslator;
}

/** Typora-style hover grid for choosing table dimensions, with a manual size input for larger tables. */
export function TableGridPicker({ x, y, onPick, onClose, t }: TableGridPickerProps) {
  const [hover, setHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 });
  const [visibleRows, setVisibleRows] = useState(GRID_DEFAULT);
  const [visibleCols, setVisibleCols] = useState(GRID_DEFAULT);
  const [customRows, setCustomRows] = useState("3");
  const [customCols, setCustomCols] = useState("3");
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 12);
    const top = Math.min(y, window.innerHeight - rect.height - 12);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const handleHover = (rows: number, cols: number) => {
    setHover({ rows, cols });
    setVisibleRows((previous) => Math.min(GRID_MAX, Math.max(previous, rows === previous ? rows + 1 : previous, GRID_DEFAULT)));
    setVisibleCols((previous) => Math.min(GRID_MAX, Math.max(previous, cols === previous ? cols + 1 : previous, GRID_DEFAULT)));
  };

  const label = hover.rows > 0 ? `${hover.rows} × ${hover.cols}` : t("markdown.editor.tablePickerHint");

  return (
    <>
      <div className="hf-md-overlay-backdrop" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="hf-md-picker"
        style={{ left: position.left, top: position.top }}
        onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
      >
        <div className="hf-md-picker__label">{label}</div>
        <div
          className="hf-md-picker__grid"
          style={{ gridTemplateColumns: `repeat(${visibleCols}, ${CELL}px)`, width: visibleCols * CELL + (visibleCols - 1) * CELL_GAP }}
        >
          {Array.from({ length: visibleRows }, (_, rowIndex) =>
            Array.from({ length: visibleCols }, (_, colIndex) => {
              const active = rowIndex < hover.rows && colIndex < hover.cols;
              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  className={active ? "hf-md-table-picker-cell hf-md-table-picker-cell--active" : "hf-md-table-picker-cell"}
                  onMouseEnter={() => handleHover(rowIndex + 1, colIndex + 1)}
                  onClick={() => onPick(rowIndex + 1, colIndex + 1)}
                />
              );
            }),
          )}
        </div>
        <div className="hf-md-picker__footer">
          <input
            type="number"
            min={1}
            max={99}
            value={customRows}
            onChange={(event) => setCustomRows(event.target.value)}
            className="hf-md-picker__input"
            aria-label={t("markdown.editor.tableRows")}
          />
          <span className="hf-md-picker__sep">×</span>
          <input
            type="number"
            min={1}
            max={99}
            value={customCols}
            onChange={(event) => setCustomCols(event.target.value)}
            className="hf-md-picker__input"
            aria-label={t("markdown.editor.tableCols")}
          />
          <button
            type="button"
            onClick={() => {
              const rows = Math.max(1, Math.min(99, Number.parseInt(customRows, 10) || 1));
              const cols = Math.max(1, Math.min(99, Number.parseInt(customCols, 10) || 1));
              onPick(rows, cols);
            }}
            className="hf-md-picker__insert"
          >
            {t("markdown.editor.tableInsert")}
          </button>
        </div>
      </div>
    </>
  );
}

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

interface EditorContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function EditorContextMenu({ x, y, items, onClose }: EditorContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <>
      <div
        className="hf-md-overlay-backdrop"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="hf-md-context-menu"
        style={{ left: position.left, top: position.top }}
      >
        {items.map((item) =>
          item.separator ? (
            <div key={item.id} className="hf-md-context-menu__sep" />
          ) : (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                onClose();
              }}
              className={[
                "hf-md-context-menu__item",
                item.disabled ? "hf-md-context-menu__item--disabled" : "",
                item.danger ? "hf-md-context-menu__item--danger" : "",
              ].filter(Boolean).join(" ")}
            >
              {item.icon && <span className="hf-md-context-menu__icon">{item.icon}</span>}
              <span className="hf-md-context-menu__label">{item.label}</span>
            </button>
          ),
        )}
      </div>
    </>
  );
}
