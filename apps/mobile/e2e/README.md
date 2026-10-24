# Native smoke flows — authored, NOT RUN

These Maestro flows exercise the actual native app, not the DOM test adapters. They have only been parsed as YAML on this host; no device acceptance or selector reliability is claimed. Maestro is not installed here and device authorization is pending. See the complete [acceptance matrix](../../../docs/mobile/device-acceptance.md).

Use a disposable DEV installation and an onboarded, confirmed fixture with English profile language. Log in manually first; do not put credentials in flow files. `client-smoke.yaml` starts in Client mode. `coach-role-switch.yaml` requires a Coach account initially in Coach mode and restores that mode. API and Metro must be reachable; open the development project once before running so the Expo launcher does not intercept startup. A signed standalone preview build avoids that launcher.

```sh
maestro test apps/mobile/e2e/client-smoke.yaml
maestro test apps/mobile/e2e/coach-role-switch.yaml
```

Run separately on an authorized Android device and iOS simulator/device with the [official Maestro CLI](https://docs.maestro.dev/). Do not use `clearState` or `clearKeychain` on a user's installation. Flows restart only Metrivum and do not create messages, submit workouts, or change backend records. Permission prompts remain unset; neither flow needs microphone or notification permission. Use disposable data because the runner's failure artifacts may contain visible account information.

Passing these smoke flows would prove only native tab/role navigation and retained login across app restarts. They do not cover multi-account races, workout durability, encryption, push, recording, private files or local ML. Those scenarios remain mandatory acceptance work.
