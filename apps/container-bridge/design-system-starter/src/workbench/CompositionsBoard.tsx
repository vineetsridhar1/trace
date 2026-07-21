export function CompositionsBoard() {
  return (
    <section data-board="compositions">
      <h2>Compositions</h2>
      <div className="composition">
        <nav>Navigation</nav>
        <div className="composition-content">
          <h3>Representative product surface</h3>
          <label>
            Field
            <input placeholder="Example" />
          </label>
          <button>Primary action</button>
        </div>
      </div>
    </section>
  );
}
