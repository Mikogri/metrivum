import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose";
import { canBlurBackdrop, useSheetPresence } from "./backdrop";
import { SheetScrollContextReset } from "./scrollContext";
import type { NativeSheetProps } from "./types";

/**
 * Android: Material 3 `ModalBottomSheet` (Jetpack Compose) hosting React Native content. The
 * system owns the drag gesture, the scrim, IME insets and the Back press. On Android 12+ the sheet
 * is translucent and the app behind it is blurred (see `SheetBackdrop`).
 */
export function NativeSheet({
  open,
  onRequestClose,
  onClosed,
  size = "content",
  dismissible = true,
  background,
  glass,
  scrim,
  translucent,
  scheme,
  children,
}: NativeSheetProps) {
  const { width } = useWindowDimensions();
  const sheet = useRef<ModalBottomSheetRef>(null);
  const [mounted, setMounted] = useState(open);
  // The blur follows the request, so it clears while the sheet is still sliding away.
  useSheetPresence(open);
  const closed = useRef(onClosed);
  closed.current = onClosed;
  const fit = size === "content";

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    let cancelled = false;
    // Play the native hide animation before removing the view.
    const done = () => {
      if (cancelled) return;
      setMounted(false);
      closed.current?.();
    };
    const pending = sheet.current?.hide();
    if (pending) void pending.then(done, done);
    else done();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!mounted) return null;
  return (
    <Host
      style={{ position: "absolute", width }}
      pointerEvents="none"
      colorScheme={scheme}
    >
      <ModalBottomSheet
        ref={sheet}
        containerColor={translucent && canBlurBackdrop ? glass : background}
        scrimColor={scrim}
        skipPartiallyExpanded={size !== "half"}
        sheetGesturesEnabled={dismissible}
        properties={{
          shouldDismissOnBackPress: true,
          shouldDismissOnClickOutside: dismissible,
        }}
        onDismissRequest={() => {
          // Material hides the sheet before reporting the request. When closing is not
          // allowed yet (unsaved work), bring the same content back and let the owner ask.
          if (!dismissible)
            void (size === "half"
              ? sheet.current?.partialExpand()
              : sheet.current?.expand());
          onRequestClose();
        }}
      >
        <RNHostView matchContents={fit}>
          {/* Content-sized sheets take the window width and their own height. Sized sheets
                        fill the measured height without inheriting a scroller's content height. */}
          <View style={fit ? { width } : { flexGrow: 1, height: 0 }}>
            <SheetScrollContextReset>{children}</SheetScrollContextReset>
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
