import { useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
  PressableScale,
  ToolbarSurface,
  haptic,
  useTheme,
} from "@metrivum/ui-mobile";
import { NavIcon, type NavIconName } from "./NavIcon";

const icons: Record<string, NavIconName> = {
  index: "today",
  plans: "training",
  history: "history",
  clients: "clients",
  messages: "messages",
  calendar: "calendar",
  more: "menu",
};

/** Height of the floating bar and its distance from the screen edges. */
export const tabBar = { height: 58, margin: 16, item: 46 };

/** Space the bar covers at the bottom of a tab screen, including the system inset. */
export function useTabBarInset() {
  const insets = useSafeAreaInsets();
  return tabBar.height + tabBar.margin + Math.max(insets.bottom, 8);
}

/**
 * The main menu: an icon-only panel floating over the content with a margin from the screen
 * edges. Screens scroll behind it. Liquid Glass on iOS 26, a near-opaque surface elsewhere.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    // A resized Android window would lift the bar over the keyboard and the field above it.
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboard(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const count = state.routes.length;
  const pad = (tabBar.height - tabBar.item) / 2;
  const cell = width > 0 ? (width - pad * 2) / count : 0;
  const x = useSharedValue(0);
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    if (!cell) return;
    const target = state.index * cell + (cell - tabBar.item) / 2;
    x.value = placed ? withSpring(target, theme.motion.spring.settle) : target;
    if (!placed) setPlaced(true);
  }, [state.index, cell, placed, x, theme.motion.spring.settle]);
  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const hidden = useSharedValue(0);
  useEffect(() => {
    hidden.value = withTiming(keyboard ? 1 : 0, {
      duration: theme.motion.duration.fast,
    });
  }, [keyboard, hidden, theme.motion.duration.fast]);
  const visibility = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    transform: [{ translateY: hidden.value * tabBar.height }],
  }));

  return (
    <Animated.View
      pointerEvents={keyboard ? "none" : "box-none"}
      style={[
        {
          position: "absolute",
          left: tabBar.margin + insets.left,
          right: tabBar.margin + insets.right,
          bottom: Math.max(insets.bottom, 8) + tabBar.margin / 2,
        },
        visibility,
      ]}
    >
      <ToolbarSurface
        style={{
          height: tabBar.height,
          padding: 0,
          borderRadius: tabBar.height / 2,
          borderColor: theme.colors.border,
        }}
      >
        <View
          accessibilityRole="tablist"
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: pad,
          }}
        >
          {cell ? (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: pad,
                  width: tabBar.item,
                  height: tabBar.item,
                  borderRadius: tabBar.item / 2,
                  backgroundColor: theme.colors.accent,
                },
                indicator,
              ]}
            />
          ) : null}
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const options = descriptors[route.key]?.options;
            return (
              <PressableScale
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={options?.title ?? route.name}
                accessibilityState={{ selected: focused }}
                scale={0.9}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (focused || event.defaultPrevented) return;
                  haptic.selection();
                  navigation.navigate(route.name, route.params);
                }}
                style={{
                  flex: 1,
                  height: tabBar.height,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NavIcon
                  name={icons[route.name] ?? "menu"}
                  color={
                    focused ? theme.colors.onAccent : theme.colors.mutedText
                  }
                />
              </PressableScale>
            );
          })}
        </View>
      </ToolbarSurface>
    </Animated.View>
  );
}
