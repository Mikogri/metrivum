const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
// Web and Expo intentionally use their own SDK-compatible React versions.
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
        moduleName === "react" ||
        moduleName.startsWith("react/") ||
        moduleName === "react-native" ||
        moduleName.startsWith("react-native/")
    ) {
        return context.resolveRequest(
            {
                ...context,
                originModulePath: path.join(__dirname, "package.json"),
            },
            moduleName,
            platform,
        );
    }
    return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
