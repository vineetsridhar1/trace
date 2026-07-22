import components from "../../design-system/components.manifest.json";

const componentItems = components.components as Array<{ name: string; reuseMode: string }>;

export function ComponentsBoard() {
  return (
    <section data-board="components">
      <h2>Components</h2>
      <div className="component-grid">
        {componentItems.length ? (
          componentItems.map((item) => (
            <article key={item.name}>
              <h3>{item.name}</h3>
              <p>{item.reuseMode}</p>
            </article>
          ))
        ) : (
          <article>
            <h3>Component inventory</h3>
            <button>Default</button>
            <button disabled>Disabled</button>
            <p>Hover · focus · loading · empty · error</p>
          </article>
        )}
      </div>
    </section>
  );
}
