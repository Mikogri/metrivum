# Mobile branding

Metrivum's white symbol is copied from the current web brand asset. Mobile owns this copy; its rendering and native icon configuration do not depend on web code. `BrandMark` tints the transparent symbol for the current theme.

Run `node apps/mobile/scripts/brand-assets.mjs` from the repository root to regenerate the opaque 1024px app icon and transparent adaptive foreground. Both keep the symbol within Android's mask-safe area; rounded corners are supplied by the OS.

After changing the name or native icons, run Expo prebuild and rebuild/reinstall the development application. Metro reload alone cannot update the launcher name/icon:

```powershell
cd C:\Work\Projects\train-flow\apps\mobile
& 'C:\Program Files\nodejs\node.exe' ../../node_modules/expo/bin/cli prebuild --platform android --no-install
& 'C:\Program Files\nodejs\npm.cmd' run android
```

The historical `com.trainflow.app` package/bundle ID, `trainflow` URL scheme, Expo slug and private-storage keys remain stable to preserve installed accounts and authentication callbacks. iOS native builds require macOS/Xcode or the existing EAS workflow.
