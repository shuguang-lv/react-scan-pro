import { useState } from "react";
import { createRoot } from "react-dom/client";

function ScriptReportCounter(): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1 data-testid="heading">React Scan Pro Script Report Fixture</h1>
      <span data-testid="count">{count}</span>
      <button data-testid="increment" type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<ScriptReportCounter />);
