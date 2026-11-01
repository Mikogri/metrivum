import { Image, type ImageSourcePropType } from "react-native";
import { useTheme, type ThemeColors } from "@metrivum/ui-mobile";

/**
 * Navigation icons shared with the web app (Tabler outline, same paths as
 * `apps/web/app/layouts/components/navIcons.tsx`), rasterised to tintable templates in
 * `assets/nav`. `history`, `menu` and `bell` come from the same set; the web menu has no entry
 * for them.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro resolves image assets (and their @2x/@3x variants) through require. */
const sources = {
    today: require("../../../assets/nav/today.png"),
    training: require("../../../assets/nav/training.png"),
    history: require("../../../assets/nav/history.png"),
    clients: require("../../../assets/nav/clients.png"),
    messages: require("../../../assets/nav/messages.png"),
    calendar: require("../../../assets/nav/calendar.png"),
    menu: require("../../../assets/nav/menu.png"),
    bell: require("../../../assets/nav/bell.png"),
    checkins: require("../../../assets/nav/checkins.png"),
    analysis: require("../../../assets/nav/analysis.png"),
    invitations: require("../../../assets/nav/invitations.png"),
    documents: require("../../../assets/nav/documents.png"),
    settings: require("../../../assets/nav/settings.png"),
} satisfies Record<string, ImageSourcePropType>;
/* eslint-enable @typescript-eslint/no-require-imports */
export type NavIconName = keyof typeof sources;

export function NavIcon({
    name,
    size = 24,
    tone = "text",
    color,
}: {
    name: NavIconName;
    size?: number;
    tone?: keyof ThemeColors;
    color?: string;
}) {
    const theme = useTheme();
    return (
        <Image
            // Decorative: the control that owns the icon carries the label.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            source={sources[name]}
            style={{
                width: size,
                height: size,
                tintColor: color ?? theme.colors[tone],
            }}
        />
    );
}
