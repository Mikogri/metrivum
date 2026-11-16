import { createContext, useContext, useMemo, type ReactNode } from "react";
export const defaultUIMessages = {
  openCalendar: "Open calendar",
  calendar: "Calendar",
  previousMonth: "Previous month",
  chooseYearMonth: "Choose year and month",
  nextMonth: "Next month",
  previousYear: "Previous year",
  chooseYear: "Choose year",
  nextYear: "Next year",
  months: "Months",
  earlierYears: "Earlier years",
  laterYears: "Later years",
  years: "Years",
  close: "Close",
  clearSearch: "Clear search",
  increase: "Increase",
  decrease: "Decrease",
  loading: "Loading…",
} as const;
export type UIMessages = { [K in keyof typeof defaultUIMessages]: string };
const UIContext = createContext<{
  messages: UIMessages;
  mobileMaxWidth: number;
}>({ messages: defaultUIMessages, mobileMaxWidth: 767 });
/** Configure copy and responsive overlays without depending on an application or locale catalogue. */
export function UIProvider({
  children,
  messages,
  mobileMaxWidth = 767,
}: {
  children: ReactNode;
  messages?: Partial<UIMessages>;
  mobileMaxWidth?: number;
}) {
  if (!Number.isFinite(mobileMaxWidth) || mobileMaxWidth < 0)
    throw new Error("mobileMaxWidth must be a non-negative finite number.");
  const value = useMemo(
    () => ({ messages: { ...defaultUIMessages, ...messages }, mobileMaxWidth }),
    [messages, mobileMaxWidth],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
export const useUI = () => useContext(UIContext);
