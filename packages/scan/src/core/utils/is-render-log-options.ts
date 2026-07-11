import type { RenderLogOptions } from "~core/index";

export const isRenderLogOptions = (value: unknown): value is RenderLogOptions => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => key !== "notification" && key !== "report")) return false;
  if ("notification" in value && typeof value.notification !== "boolean") return false;
  if ("report" in value && typeof value.report !== "boolean") return false;
  return true;
};
