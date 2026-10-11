import type { Context, ReactNode } from "react";
import { ScrollView, VirtualizedList } from "react-native";

const VirtualizedListContext = (
    VirtualizedList as unknown as { contextType?: Context<unknown> }
).contextType;
const ScrollViewContext = (
    ScrollView as unknown as { Context?: Context<unknown> }
).Context;

/**
 * A sheet is declared inside a screen that usually scrolls. Without this, a list in the sheet
 * believes it is nested in that screen's scroll view and stops scrolling. The `Modal` of React
 * Native resets the same contexts.
 */
export function SheetScrollContextReset({ children }: { children: ReactNode }) {
    let node: ReactNode = children;
    if (ScrollViewContext)
        node = (
            <ScrollViewContext.Provider value={null}>
                {node}
            </ScrollViewContext.Provider>
        );
    if (VirtualizedListContext)
        node = (
            <VirtualizedListContext.Provider value={null}>
                {node}
            </VirtualizedListContext.Provider>
        );
    return <>{node}</>;
}
