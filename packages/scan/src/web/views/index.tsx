import { computed } from "@preact/signals";
import { Store } from "~core/index";
import { signalWidgetViews } from "~web/state";
import { cn } from "~web/utils/helpers";
import { Header } from "~web/widget/header";
import { ViewInspector } from "./inspector";
import { Toolbar } from "./toolbar";
import { NotificationWrapper } from "./notifications/notifications";
import { ReportsPanel } from "./reports";

const isInspecting = computed(() => Store.inspectState.value.kind === "inspecting");

const headerClassName = computed(() =>
  cn(
    "relative",
    "flex-1",
    "flex flex-col",
    "rounded-t-lg",
    "overflow-hidden",
    "opacity-100",
    "transition-[opacity]",
    isInspecting.value && "opacity-0 duration-0 delay-0",
  ),
);

export const Content = () => {
  const activeView = signalWidgetViews.value.view;

  return (
    <div
      className={cn(
        "flex flex-1 flex-col",
        "overflow-hidden z-10",
        "rounded-lg",
        "bg-black",
        "opacity-100",
        "transition-[border-radius]",
        "peer-hover/left:rounded-l-none",
        "peer-hover/right:rounded-r-none",
        "peer-hover/top:rounded-t-none",
        "peer-hover/bottom:rounded-b-none",
      )}
    >
      <div className={headerClassName}>
        <Header />
        <div
          className={cn(
            "relative",
            "flex-1 flex",
            "text-white",
            "bg-[#0A0A0A]",
            "transition-opacity delay-150",
            "overflow-hidden",
            "border-b border-[#222]",
          )}
        >
          <div className="absolute inset-0 flex overflow-y-auto overflow-x-hidden">
            {activeView === "inspector" && <ViewInspector />}
            {activeView === "notifications" && <NotificationWrapper />}
            {activeView === "reports" && <ReportsPanel />}
          </div>
        </div>
      </div>
      <Toolbar />
    </div>
  );
};
