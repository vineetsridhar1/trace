export function DiffGapRow({ label, position }: { label: string; position: "between" | "end" }) {
  return (
    <div
      className={
        position === "end"
          ? "flex h-7 items-center rounded-b-[9px] border-t border-[var(--th-edge-faint)] bg-[var(--th-accent)]/[0.05] pl-16 text-[11.5px] text-[var(--th-code-comment)]"
          : "flex h-[26px] items-center bg-[var(--th-accent)]/[0.05] pl-16 text-[11.5px] text-[var(--th-code-comment)]"
      }
    >
      &ctdot; {label}
    </div>
  );
}
