export function DiffGapRow({ label, position }: { label: string; position: "between" | "end" }) {
  return (
    <div
      className={
        position === "end"
          ? "flex h-7 items-center rounded-b-[9px] border-t border-[#1f1f23] bg-[#3b82f6]/[0.05] pl-16 text-[11.5px] text-[#6b7a99]"
          : "flex h-[26px] items-center bg-[#3b82f6]/[0.05] pl-16 text-[11.5px] text-[#6b7a99]"
      }
    >
      &ctdot; {label}
    </div>
  );
}
