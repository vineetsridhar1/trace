export function DesignSectionLabel({ name, zoom }: { name: string; zoom: number }) {
  return (
    <h2
      className="origin-bottom-left whitespace-nowrap text-[28px] font-semibold leading-9 uppercase tracking-[0.18em] text-zinc-600"
      style={{ transform: `scale(${1 / zoom})` }}
    >
      {name}
    </h2>
  );
}
