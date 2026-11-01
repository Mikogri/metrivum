import { Image } from "react-native";
import { useTheme } from "@metrivum/ui-mobile";

export function BrandMark() {
    const theme = useTheme();
    return (
        <Image
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles native image assets through require.
            source={require("../assets/brand/metrivum-mark.png")}
            resizeMode="contain"
            style={{ width: 40, height: 32, tintColor: theme.colors.text }}
        />
    );
}
