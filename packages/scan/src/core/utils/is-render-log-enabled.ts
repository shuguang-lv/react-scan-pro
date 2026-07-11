import type { RenderLogOptions } from "~core/index";

export const isRenderLogEnabled = (
  logOptions: boolean | RenderLogOptions | undefined,
  namespace: keyof RenderLogOptions,
): boolean => {
  if (typeof logOptions === "boolean") return namespace === "notification" && logOptions;
  return logOptions?.[namespace] === true;
};
