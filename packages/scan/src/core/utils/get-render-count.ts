import type { Render } from "../instrumentation";

export const getRenderCount = (render: Render) =>
  Number.isFinite(render.count) && render.count > 0 ? Math.floor(render.count) : 1;
