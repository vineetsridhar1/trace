const colors = [
  "background",
  "surface",
  "foreground",
  "muted-foreground",
  "border",
  "accent",
  "destructive",
  "success",
  "warning",
];

export function FoundationsBoard() {
  return (
    <section data-board="foundations">
      <h2>Foundations</h2>
      <div className="swatches">
        {colors.map((name) => (
          <article key={name}>
            <i style={{ background: `var(--${name})` }} />
            <strong>{name}</strong>
          </article>
        ))}
      </div>
      <div className="scale">
        <span>Typography Aa</span>
        <span>Spacing 4 · 8 · 16 · 24</span>
        <span>Radius · elevation · focus · motion</span>
      </div>
    </section>
  );
}
