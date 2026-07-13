import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { useMarkdownT } from "../i18n";

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
  t: ReturnType<typeof useMarkdownT>;
}

interface ImageView {
  scale: number;
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.25;
const DEFAULT_VIEW: ImageView = { scale: 1, x: 0, y: 0 };

export function ImageLightbox({ src, onClose, t }: ImageLightboxProps) {
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [view, setView] = useState<ImageView>(DEFAULT_VIEW);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setView(DEFAULT_VIEW);
    dragRef.current = null;
    setIsDragging(false);
  }, [src]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const zoomAt = (
    nextScale: number | ((currentScale: number) => number),
    clientX?: number,
    clientY?: number,
  ) => {
    setView((previous) => {
      const requestedScale = typeof nextScale === "function"
        ? nextScale(previous.scale)
        : nextScale;
      const scale = clamp(requestedScale, MIN_SCALE, MAX_SCALE);
      if (scale === previous.scale) return previous;

      const rect = lightboxRef.current?.getBoundingClientRect();
      const anchorX = rect && clientX !== undefined ? clientX - (rect.left + rect.width / 2) : 0;
      const anchorY = rect && clientY !== undefined ? clientY - (rect.top + rect.height / 2) : 0;
      const ratio = scale / previous.scale;
      return {
        scale,
        x: anchorX - (anchorX - previous.x) * ratio,
        y: anchorY - (anchorY - previous.y) * ratio,
      };
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt((currentScale) => currentScale * factor, event.clientX, event.clientY);
  };

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((previous) => ({
      ...previous,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  };

  const finishDragging = (event: PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetView = () => setView(DEFAULT_VIEW);

  return (
    <div
      ref={lightboxRef}
      className="hf-md-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("markdown.reader.imagePreview")}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onWheel={handleWheel}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={`hf-md-lightbox__img${isDragging ? " is-dragging" : ""}`}
        style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={() => {
          if (view.scale === 1 && view.x === 0 && view.y === 0) {
            zoomAt(2);
          } else {
            resetView();
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
      />

      <button
        type="button"
        title={t("markdown.reader.imagePreviewClose")}
        aria-label={t("markdown.reader.imagePreviewClose")}
        onClick={onClose}
        className="hf-md-lightbox__close"
      >
        <X size={18} />
      </button>

      <div className="hf-md-lightbox__toolbar">
        <button
          type="button"
          title={t("markdown.reader.imageZoomOut")}
          aria-label={t("markdown.reader.imageZoomOut")}
          onClick={() => zoomAt((currentScale) => currentScale / ZOOM_FACTOR)}
          disabled={view.scale <= MIN_SCALE}
        >
          <ZoomOut size={17} />
        </button>
        <output className="hf-md-lightbox__scale" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </output>
        <button
          type="button"
          title={t("markdown.reader.imageZoomReset")}
          aria-label={t("markdown.reader.imageZoomReset")}
          onClick={resetView}
          disabled={view.scale === 1 && view.x === 0 && view.y === 0}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          title={t("markdown.reader.imageZoomIn")}
          aria-label={t("markdown.reader.imageZoomIn")}
          onClick={() => zoomAt((currentScale) => currentScale * ZOOM_FACTOR)}
          disabled={view.scale >= MAX_SCALE}
        >
          <ZoomIn size={17} />
        </button>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
