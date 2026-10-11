import type { PropsWithChildren } from "react";
import {
    Pressable,
    StyleSheet,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    FadeOut,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { motion } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const bezier = (points: readonly [number, number, number, number]) =>
    Easing.bezier(points[0], points[1], points[2], points[3]);

/**
 * Shared transitions. Reanimated follows the system Reduce Motion setting by default: with it on,
 * these jump to their end state, so the state change stays visible but nothing moves.
 */
export const transitions = {
    /** Content that appears once: a new message, a row added by the user, a revealed section. */
    enter: FadeInDown.duration(motion.duration.base).easing(
        bezier(motion.easing.out),
    ),
    fade: FadeIn.duration(motion.duration.fast),
    exit: FadeOut.duration(motion.duration.fast),
    /** Neighbours move out of the way instead of jumping when something expands or is removed. */
    layout: LinearTransition.duration(motion.duration.base).easing(
        bezier(motion.easing.standard),
    ),
};

/**
 * Pressable with the app's press feedback: a small spring scale plus a dim, both interruptible.
 * The action itself is never delayed for the animation.
 */
export function PressableScale({
    children,
    style,
    disabled,
    scale = motion.pressScale,
    ...props
}: PropsWithChildren<
    Omit<PressableProps, "style" | "children"> & {
        style?: StyleProp<ViewStyle>;
        scale?: number;
    }
>) {
    const pressed = useSharedValue(0);
    // The caller's own opacity (a dimmed disabled control) is kept and the press dim multiplies it.
    const flat = StyleSheet.flatten(style);
    const rest = typeof flat?.opacity === "number" ? flat.opacity : 1;
    const animated = useAnimatedStyle(
        () => ({
            transform: [{ scale: 1 - (1 - scale) * pressed.value }],
            opacity: rest * (1 - 0.18 * pressed.value),
        }),
        [rest, scale],
    );
    return (
        <AnimatedPressable
            {...props}
            disabled={disabled}
            onPressIn={(event) => {
                pressed.value = withTiming(1, {
                    duration: motion.duration.instant,
                });
                props.onPressIn?.(event);
            }}
            onPressOut={(event) => {
                pressed.value = withSpring(0, motion.spring.press);
                props.onPressOut?.(event);
            }}
            style={[style, animated]}
        >
            {children}
        </AnimatedPressable>
    );
}

/** Fades and lifts content in once, when it mounts. Do not wrap whole lists that refetch. */
export function Appear({
    children,
    style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
    return (
        <Animated.View
            entering={transitions.enter}
            exiting={transitions.exit}
            layout={transitions.layout}
            style={style}
        >
            {children}
        </Animated.View>
    );
}
