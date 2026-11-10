import { useEffect, useRef } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeSheetProps } from "./types";

/**
 * Fallback for platforms without a native sheet module (web preview): a bottom-anchored panel in
 * a React Native `Modal`. iOS and Android resolve the platform files and never load this one.
 */
export function NativeSheet({
  open,
  onRequestClose,
  onClosed,
  size = "content",
  dismissible = true,
  background,
  children,
}: NativeSheetProps) {
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) onClosed?.();
    wasOpen.current = open;
  }, [open, onClosed]);
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onRequestClose}
    >
      <Pressable
        accessible={false}
        style={{ flex: 1 }}
        onPress={dismissible ? onRequestClose : undefined}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={{
          backgroundColor: background,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: "92%",
          ...(size === "full"
            ? { height: "92%" }
            : size === "half"
              ? { height: "55%" }
              : {}),
        }}
      >
        <View style={size === "content" ? undefined : { flex: 1 }}>
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
