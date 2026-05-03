import type { SectionTitleProps } from "./types";

export function SectionTitle({ icon, title, meta }: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-secondary/70">{title}</h3>
      </div>
      {meta && <span className="text-[11px] text-foreground-secondary/55">{meta}</span>}
    </div>
  );
}