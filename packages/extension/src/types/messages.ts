import { z } from "zod";

export const BroadcastSchema = z.object({
  type: z.enum([
    "react-scan-pro:ping",
    "react-scan-pro:is-enabled",
    "react-scan-pro:toggle-state",
    "react-scan-pro:page-reload",
  ]),
  data: z.any().optional(),
});

export type BroadcastMessage = z.infer<typeof BroadcastSchema>;

export interface IEvents {
  "react-scan-pro:toggle-state": {
    topic: "react-scan-pro:toggle-state";
    message: undefined;
  };
  "react-scan-pro:send-to-background": {
    topic: "react-scan-pro:send-to-background";
    message: BroadcastMessage;
  };
}
