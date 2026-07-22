import canvas from "../../design-system.canvas.json";
import manifest from "../../design-system/manifest.json";
import { BoardErrorBoundary } from "../canvas/BoardErrorBoundary";
import { AssetsBoard } from "./AssetsBoard";
import { ComponentsBoard } from "./ComponentsBoard";
import { CompositionsBoard } from "./CompositionsBoard";
import { FoundationsBoard } from "./FoundationsBoard";

const boards = {
  foundations: <FoundationsBoard />,
  assets: <AssetsBoard />,
  components: <ComponentsBoard />,
  compositions: <CompositionsBoard />,
};

export function Workbench() {
  const route = new URLSearchParams(location.search).get("board");

  return (
    <main>
      <header>
        <p>DESIGN SYSTEM</p>
        <h1>{manifest.name}</h1>
        <span>{manifest.description}</span>
      </header>
      {canvas.boards
        .filter((board) => !route || board.id === route)
        .map((board) => (
          <BoardErrorBoundary boardName={board.title} key={board.id}>
            {boards[board.id as keyof typeof boards]}
          </BoardErrorBoundary>
        ))}
    </main>
  );
}
