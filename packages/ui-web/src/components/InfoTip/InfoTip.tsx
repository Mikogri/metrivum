import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton/IconButton";
import { Tooltip, TooltipTrigger, type TooltipProps } from "../Tooltip/Tooltip";

/**
 * The app's one "how does this work" button: a quiet (i) that shows a short explanation on hover or focus.
 * Use it wherever a paragraph of help would otherwise sit on the page.
 */
export function InfoTip({ label, children, placement = "bottom", className }: { label: string; children: ReactNode; placement?: TooltipProps["placement"]; className?: string }) {
  return (
    <TooltipTrigger delay={150}>
      <IconButton size="sm" variant="ghost" label={label} icon={<Info />} showTooltip={false} className={className} />
      <Tooltip placement={placement}>
        <strong>{label}</strong>
        <br />
        {children}
      </Tooltip>
    </TooltipTrigger>
  );
}
