# Handoff: Android app without Hardware Report and PID Review

Task for the agent on the Windows machine (where the Android SDK, Gradle and the signing key are). The code change is already committed; what is left is building, testing and delivering the APK.

## Context
Hardware Report and PID Review fail on some limited Android devices. The app bundles the same `dist/SpeedLog.html` as the web/PWA build, so the web version keeps both views and only the app hides them.

The app is detected at run time by `window.AndroidBridge`, which `MainActivity.kt` registers before `loadUrl` (`IS_ANDROID_APP` and `tool_enabled()` in `views.js`). Nothing in `android/` Kotlin changed.

## What the commit changed
- `views.js`: in the app the Hardware and PID tabs are hidden, the tab bar is hidden (only the Log Viewer is left), `show_view()` falls back to the viewer for a disabled tool, `run_tool()` returns early (so `hardware.js` / `pid.js` are never initialised), and the "also opens .param" welcome note is hidden.
- `SpeedLog.js` (`open_file`): `.param` / `.parm` files are refused in the app with a toast (`load.no_param`), since only the Hardware Report opened them.
- `i18n.js`: new key `load.no_param` (PT and EN).
- `CLAUDE.md`: one line on the Android behaviour.

## To do (in this order)
1. `git pull`, then `npm ci` and `npm run lint` (Node >= 22.13). It was not run on the Linux machine (Node 18 there), so fix anything it reports in the files above.
2. Test in a browser: `python -m http.server --bind 127.0.0.1`, load the sample `.BIN` with `open_file(...)` (see CLAUDE.md).
   - Normal web mode: the three tabs work, Hardware Report and PID Review behave as before, `.param` still opens.
   - Simulated app: run `window.AndroidBridge = {}` before the page scripts (for example with a temporary edit or a devtools override that runs at document start) and reload. Expect no tab bar, `show_view('hardware')` lands on the viewer, a `.param` file shows the toast, and plots work.
3. `node build.cjs`, then from `android/` run `gradle assembleDebug` (see CLAUDE.md for the Gradle path and `ANDROID_HOME`).
4. Install the debug APK on a device, ideally one of the limited ones, and open a `.BIN`: only the Log Viewer should be available, with no tab bar and no Hardware/PID entry anywhere.
5. If it is going to users: bump `versionCode` in `android/app/build.gradle.kts` (currently `1`; `versionName` `"1.0"`), run `gradle assembleRelease`, and check it with `apksigner verify`. Never commit `keystore.properties` or the `.jks`, and never change the key.
6. Report what passed and what did not. Commit only if the user asks.

## Not in scope (ask first)
A separate Android build that leaves `hardware.js`, `pid.js` and `markup.js` out of the bundle would shrink the APK, but needs a second dist variant in `build.cjs`.
