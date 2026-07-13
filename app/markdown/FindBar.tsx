import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { MarkdownTranslator } from "./types";

interface FindBarProps {
  query: string;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  t: MarkdownTranslator;
}

export function FindBar({
  query,
  matchCount,
  currentIndex,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
  t,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const countLabel = query
    ? matchCount > 0
      ? `${currentIndex + 1}/${matchCount}`
      : t("markdown.reader.find.noMatch")
    : "";

  return (
    <div className="hf-md-find-bar">
      <Search size={13} className="hf-md-find-bar__icon" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              onPrev();
            } else {
              onNext();
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder={t("markdown.reader.find.placeholder")}
        className="hf-md-find-bar__input"
      />
      <span className="hf-md-find-bar__count">{countLabel}</span>
      <button
        type="button"
        title={t("markdown.reader.find.prev")}
        onClick={onPrev}
        disabled={matchCount === 0}
        className="hf-md-find-bar__btn"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        title={t("markdown.reader.find.next")}
        onClick={onNext}
        disabled={matchCount === 0}
        className="hf-md-find-bar__btn"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        title={t("markdown.reader.find.close")}
        onClick={onClose}
        className="hf-md-find-bar__btn"
      >
        <X size={14} />
      </button>
    </div>
  );
}
