import { HighlightStore } from "~core/notifications/outline-overlay";

export const fadeOutHighlights = () => {
  const currentHighlight = HighlightStore.value.current
    ? HighlightStore.value.current
    : HighlightStore.value.kind === "transition"
      ? HighlightStore.value.transitionTo
      : null;
  if (!currentHighlight) return;

  if (HighlightStore.value.kind === "transition") {
    HighlightStore.value = {
      kind: "move-out",
      current:
        HighlightStore.value.current?.alpha === 0
          ? HighlightStore.value.transitionTo
          : (HighlightStore.value.current ?? HighlightStore.value.transitionTo),
    };
    return;
  }

  HighlightStore.value = {
    kind: "move-out",
    current: {
      ...currentHighlight,
      alpha: HighlightStore.value.kind === "move-out" ? HighlightStore.value.current.alpha : 0,
    },
  };
};
