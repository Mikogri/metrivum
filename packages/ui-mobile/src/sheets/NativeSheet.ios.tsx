import { View, useWindowDimensions } from "react-native";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  presentationSizing,
  preferredColorScheme,
} from "@expo/ui/swift-ui/modifiers";
import { SheetScrollContextReset } from "./scrollContext";
import type { NativeSheetProps } from "./types";

/**
 * iOS: a SwiftUI sheet hosting React Native content. The system provides detents, keyboard
 * avoidance and the swipe-down gesture. On iOS 26 no background is set, so the sheet keeps the
 * system Liquid Glass; earlier versions get a blurred material; with Reduce Transparency it is
 * an opaque colour.
 */
export function NativeSheet({
  open,
  onRequestClose,
  onClosed,
  size = "content",
  dismissible = true,
  background,
  translucent,
  scheme,
  children,
}: NativeSheetProps) {
  const { width } = useWindowDimensions();
  const fit = size === "content";
  const systemGlass = translucent && isLiquidGlassAvailable();
  return (
    <Host
      style={{ position: "absolute", width }}
      pointerEvents="none"
      colorScheme={scheme}
    >
      <BottomSheet
        isPresented={open}
        onIsPresentedChange={(presented) => {
          if (!presented) onRequestClose();
        }}
        onDismiss={onClosed}
        fitToContents={fit}
      >
        <Group
          modifiers={[
            ...(fit
              ? [presentationSizing("fitted")]
              : [
                  presentationDetents(
                    size === "half" ? ["medium", "large"] : ["large"],
                  ),
                ]),
            presentationDragIndicator("visible"),
            // While closing would lose work the swipe does nothing; the close button
            // still reports the request so the owner can confirm inside the sheet.
            interactiveDismissDisabled(!dismissible),
            ...(systemGlass
              ? []
              : [
                  presentationBackground(
                    translucent
                      ? { type: "material", material: "regular" }
                      : background,
                  ),
                ]),
            preferredColorScheme(scheme),
          ]}
        >
          <RNHostView matchContents={fit}>
            <View
              style={
                fit
                  ? { width, paddingTop: 16 }
                  : { flexGrow: 1, height: 0, paddingTop: 16 }
              }
            >
              <SheetScrollContextReset>{children}</SheetScrollContextReset>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
