import { getBatchedRectMap } from "src/new-outlines";
import { HighlightStore, drawHighlights } from "~core/notifications/outline-overlay";

interface HighlightTransitionState {
  current: { alpha: number } | null;
  transitionTo: { alpha: number };
}

const getTransitionPhase = (state: HighlightTransitionState) =>
  state.current && state.current.alpha > 0 ? "fading-out" : "fading-in";

export const highlightElements = async (name: string, elements: Array<Element>) => {
  const state = HighlightStore.value;
  const currentHighlight = state.kind === "transition" ? state.transitionTo : state.current;
  const rects: Array<DOMRect> = [];

  if (state.kind === "transition") {
    HighlightStore.value = {
      kind: "transition",
      current:
        getTransitionPhase(state) === "fading-in"
          ? state.transitionTo
          : state.current
            ? { ...state.current }
            : null,
      transitionTo: { rects, alpha: 0, name },
    };
  } else {
    HighlightStore.value = {
      kind: "transition",
      transitionTo: { rects, alpha: 0, name },
      current: currentHighlight ? { alpha: 0, ...currentHighlight } : null,
    };
  }

  for await (const entries of getBatchedRectMap(elements)) {
    for (const entry of entries) rects.push(entry.boundingClientRect);
    drawHighlights();
  }
};
