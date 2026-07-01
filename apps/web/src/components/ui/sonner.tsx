import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
} from "lucide-react";
import { TraceLoader } from "./trace-loader";

const icons = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <TraceLoader size={16} showLabel={false} />,
};

const toasterStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
} as CSSProperties;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={icons}
      style={toasterStyle}
      closeButton
      // Toasts render at top-right, overlapping the Electron title-bar drag
      // region, which would swallow clicks on the close/action buttons. Opt the
      // toast (and its children) out of the drag region so they stay clickable.
      toastOptions={{ className: "app-region-no-drag" }}
      {...props}
    />
  );
};

export { Toaster };
