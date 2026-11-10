import type { ReactNode } from "react";

/**
 * `content` sizes the sheet to what it holds; `half` opens at about half height and can be dragged
 * to full; `full` opens tall, for long scrolling content such as check-in details.
 */
export type SheetSize = "content" | "half" | "full";

export interface NativeSheetProps {
  open: boolean;
  /** The person asked to close it: swipe, scrim tap, Android Back or the system. */
  onRequestClose: () => void;
  /** Called once the sheet has left the screen. */
  onClosed?: () => void;
  size?: SheetSize;
  /**
   * False while closing would lose work. Swipe and scrim then do nothing, and Back reports
   * `onRequestClose` without tearing the content down, so the owner can ask inside the sheet.
   */
  dismissible?: boolean;
  /** Opaque sheet colour, used where the backdrop cannot be blurred. */
  background: string;
  /** Translucent sheet colour, used over a blurred backdrop. */
  glass: string;
  scrim: string;
  /** False when the person asked for reduced transparency. */
  translucent: boolean;
  scheme: "light" | "dark";
  children: ReactNode;
}
