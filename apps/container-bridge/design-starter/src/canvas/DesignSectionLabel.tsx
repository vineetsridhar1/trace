export function DesignSectionLabel({ name, zoom }: { name: string; zoom: number }) {
  return (
    <h2
      className="origin-bottom-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600"
      style={{ transform: `scale(${1 / zoom})` }}
    >
      {name}
    </h2>
  );
}
