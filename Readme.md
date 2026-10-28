# Speed Log

A lean, offline viewer for ArduPilot DataFlash (`.bin`) logs. There is no 3D view and nothing is plotted until you pick it: tick fields in the sidebar and they appear in a panel.

Everything runs in the browser. Nothing is uploaded and nothing is loaded from the network.

## Using it

- Open a log with **Open log**, or drop a `.bin` anywhere on the page.
- The sidebar lists every message type in the log (instances such as `IMU[0]` and `IMU[1]` are listed separately). Expand a type, or search (press `/`), and tick a field to plot it in the **active** panel (the one with the blue outline).
- **+ Panel** adds a panel. Each panel has one Y axis, so put signals with different units in different panels. A panel holds up to 8 traces. Click a chip to remove its trace.
- Zoom by dragging on a plot. The time axis is shared by all panels, the Y axis is per panel. Double click, or **Reset zoom**, to go back to the full view.
- **Flight modes** shades the background by `MODE` and labels each stretch.
- **Parameters** lists the `PARM` values from the log and marks the ones that changed during it.
- **Messages** lists `MSG`, `ERR` and `EV`. Click a row to drop a marker at that time on all plots.
- The camera button in each panel header ("Save PNG") saves it as a PNG with a solid background. On touch screens the Plotly toolbar is hidden: drag pans and pinch zooms.
- **Presets** builds ready-made panels (attitude, altitude, battery, vibration, motors, GPS, RC) from the fields the log actually has.
- **Focus mode** hides the top bars so the plots use the whole screen.
- The cursor is synced across panels, with the values of every trace read out at that instant.
- Tapping the file chip opens the log details (name, size, firmware, board, duration, message counts).
- Keyboard shortcuts (desktop): `S` sidebar, `M` flight modes, `R` reset zoom, `P` new panel, `F` focus mode, `/` search, `?` list of shortcuts.
- The layout adapts to the screen: `desktop`, `tablet`, `compact` (low landscape, such as Android radios) and `phone`. On narrow screens the field sidebar is an overlay drawer. See `UI_PLAN.md` for the design plan and the decisions taken.
- Under each field, and next to each message type, the sidebar shows what it means (from the ArduPilot documentation). Search also looks in these descriptions, so typing `altitude` finds the altitude fields.
- **Parameters** shows each parameter's description, range and units, and what its current value means (the option name, or the active bits of a bitmask). The descriptions follow the vehicle the log came from.
- In **Messages**, `ERR` and `EV` rows are decoded: subsystem and error code, or the event name, instead of bare numbers.
- The **EN / PT** button in the top bar switches the whole app between English and Brazilian Portuguese. The choice is remembered, and the first run follows the browser language. Message and field descriptions are translated; parameter descriptions are in English only.

### Hardware Report and PID Review

The tabs in the top bar switch between three views of the file you opened:

- **Log**: the plotter described above.
- **Hardware Report**: the hardware detected in the log (firmware, board, IMUs, compasses, barometers, GPS, DroneCAN, watchdog and internal errors) plus temperature, board voltage, CPU, data rates, stack and clock drift. A `.param` file can be opened too: only this view applies to it.
- **PID Review**: flight data, frequency analysis (FFT) and step response of the rate controller from the `RATE` / `PID` messages.

Both were standalone tools, ported into this page (`hardware.js`, `pid.js`) and restyled; they are now maintained here. They share the one open file and are set up the first time their tab is opened. Their static labels are translated to Portuguese; the details they generate (device names, values, warnings) stay as the tools write them. Downloads (parameter files, missions) go through the system file picker in the Android app. The GitHub release lookup of the original Hardware Report is left out so the app stays offline.

### Updating the descriptions

`descriptions.js` and `tools/translations_pt.json` are generated/maintained data. To refresh the ArduPilot texts (needs network): `node tools/build_descriptions.cjs`.

## Running it

### From a single file (works from `file://`, no server)

```
node build.cjs
```

Open `dist/SpeedLog.html` in a browser. The file has the parser, Plotly and the styles inlined (about 5 MB), so it can be copied anywhere and used with no network. `dist/` is git-ignored.

### From the repo (development)

Serve the repo root and open `http://127.0.0.1:8000/`:

```
python3 -m http.server --bind 127.0.0.1
```

The parser is an ES module, which browsers refuse to load from `file://`. That is the only reason the built file exists.

## Android app

`android/` is a small Android project that bundles the single-file build in a WebView, so the app is the same UI and works offline. It asks for no permissions at all (not even `INTERNET`; the only entry in the manifest is the internal signature-level one AndroidX adds itself): the page is served from the APK itself and logs are picked with the system file picker. Saved images go through the system "create document" dialog.

Requirements: Android Studio (it brings JDK 17 and Gradle), or JDK 17, Gradle 8.7+ and the Android SDK (platform 34) for the command line. Android 8.0 (API 26) or newer.

```
node build.cjs        # the APK bundles dist/SpeedLog.html
```

Then either open `android/` in Android Studio and press Run, or from that folder:

```
gradle assembleDebug                # first run: gradle wrapper --gradle-version 8.9 to create ./gradlew
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The Gradle build copies `dist/SpeedLog.html` into the APK assets and fails with a clear message if you forgot to run `build.cjs`. Rebuild the web app, then the APK, after changing any web file. The application id is `aero.speedbird.speedlog` (the Kotlin package is still `app.logviewerlite`, which is independent of it). Changing the id later makes an installed copy impossible to update: the user would have to uninstall it first.

### Release APK (for end users)

`gradle assembleRelease` produces `app/build/outputs/apk/release/app-release.apk`, signed with the release key. Android refuses unsigned APKs, and every update must be signed with the same key, so keep the keystore and its password safe (a backup outside the machine): if they are lost, users have to uninstall before they can install a new version.

The signing data is read from `android/keystore.properties` (git-ignored, like `*.jks`): `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. The key used so far is `~/.speedlog-signing/speedlog-release.jks` (alias `speedlog`, valid for 10000 days). Without that file the release build is left unsigned. Raise `versionCode` (and `versionName`) in `app/build.gradle.kts` for each version you hand out, otherwise Android will not accept it as an update. The APK is copied to `dist/SpeedLog-<versionName>.apk` by hand; `dist/` is git-ignored.

Not yet verified on a device or emulator: pinch zoom, touch panning and scrolling past a plot with a finger.

## Notes

- Only the message offsets are indexed on load. A field is read from the log the first time it is plotted, so opening a big log is quick and unplotted data costs nothing.
- Each trace is reduced to the min and max of a few thousand buckets for the visible window and is recomputed when you zoom, so large logs stay responsive and short spikes are kept.
- Latitude and longitude (`L` fields) are shown in degrees. All other fields are shown as the parser returns them, with units taken from the log's `FMTU` messages.
- Message types with no `TimeUS` / `TimeMS` field are listed greyed out because they cannot be placed on a time axis.
- Series colors are the validated categorical palette in fixed order, in both light and dark themes. The theme follows the OS and can be toggled.
- `.tlog` files are not supported.

## Development

Setup is only `npm ci` (Node 22.13 or newer), and only for the linter: `npm run lint`. There is no bundler and there are no automated tests; the app is plain `<script>` files served as they are.

## Files

- `index.html`, `SpeedLog.css`, `SpeedLog.js` (plotter, panels, tables, loading), `chrome.js` (preferences, menus, sheets, sidebar drawer, focus mode, presets, cursor readout, shortcuts).
- `views.js`, `hardware.js`, `pid.js`, `markup.js`, `board_types.js`: the tab views, Hardware Report and PID Review. `markup.js` is their static markup, edited by hand; `board_types.js` is the bootloader board-ID list used to name the board.
- `i18n.js`, `i18n_tools.js`, `tools/translations_pt.json`: English and Portuguese texts.
- `docs.js`, `descriptions.js`, `tools/`: message/parameter descriptions (`descriptions.js` is generated by `tools/build_descriptions.cjs`).
- `UI_PLAN.md`: UI/UX plan (findings, specs per task, execution order).
- `android/`: the Android app (Gradle project, one Kotlin activity).
- `build.cjs`: produces the single-file build. It needs `parser.js` to end with `export default DataflashParser` and fails with a clear message if that changes.
- `Libraries/`: shared helpers (`LogHelpers.js` for vehicle/board info and message types, math, FFT and Plotly helpers, device-ID decoding, parameter helpers).
- `modules/`: the third-party libraries, vendored as the single built file the app loads (Plotly, fft.js, Popper, tippy.js, the DataFlash parser). See `modules/Readme.md`.
- `images/`: the one icon the tool views use.
