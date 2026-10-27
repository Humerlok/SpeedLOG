# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Speed Log (formerly "Log Viewer Lite"): an offline, client-side ArduPilot log plotter and reviewer (no server, no upload). It started inside a fork of the ArduPilot WebTools collection and now lives in its own repo (`Humerlok/SpeedLOG`), with everything at the repo root (no `SpeedLog/` subfolder; ignore older references to one). There is no bundler for development: `index.html` plus plain `<script>` files, served statically.

## Commands

- Setup: `npm ci` (Node >= 22.13; only for lint). The libraries in `modules/` are vendored, there are no submodules.
- Run locally: `python3 -m http.server --bind 127.0.0.1` from the repo root, then open `http://127.0.0.1:8000/`.
- Single-file build (works from `file://`): `node build.cjs` writes `dist/SpeedLog.html` (git-ignored; inlines the scripts, CSS and `modules/JsDataflashParser/parser.js`). The Android app in `android/` bundles that file; see `Readme.md`.
- Android debug APK (Windows): `node build.cjs`, then from `android/` run Gradle 8.14 (the copy in `~/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle.bat`) with `ANDROID_HOME=~/AppData/Local/Android/Sdk`: `gradle assembleDebug`. Output: `app/build/outputs/apk/debug/app-debug.apk`. Rebuild `dist/SpeedLog.html` first, the APK bundles it.
- Testing in a browser: load the sample log from the console with `open_file(new File([await (await fetch(url)).blob()], 'x.BIN'))` (the `.BIN` in the repo root is git-ignored, never commit it). `python -m http.server` sends cacheable files: after editing, reload with `fetch(file, {cache:'reload'})` or you test stale code.
- Lint: `npm run lint`. There are no automated tests.

## Architecture

- **Classic scripts, shared global scope.** Pages load scripts with `<script src>`, not ES modules. Top-level functions/vars in one file are used by other files, inline scripts and `on…=""` handlers. Don't convert to modules without reason.
- **Repo root:** `index.html`, `SpeedLog.js` (plotter, panels, tables, loading, `setup()`), `chrome.js` (the chrome around the plots: preferences, menus, sheets, sidebar drawer, focus mode, presets, cursor readout, shortcuts, `on_key`), `SpeedLog.css`, `views.js` (tab views, tool loading, status icons, PID setup/Calculate state), `hardware.js` and `pid.js` (former Hardware Report / PID Review tools, now maintained here; both are ignored by lint), `i18n.js` / `i18n_tools.js` (translations), `docs.js`, `descriptions.js` (generated data), `board_types.js` (board-ID data), `markup.js` (markup of the two tool views: an editable source file, its generator no longer exists), `UI_PLAN.md` (the UI/UX plan and what was decided), `images/` (one icon), `tools/` (`build_descriptions.cjs`, `supplement.json`, `translations_pt.json`), `android/` (Android wrapper).
- **`Libraries/`:** helpers loaded via `Libraries/*.js`: `LogHelpers.js`, `Array_Math.js`, `fft.js`, `Plotly_helpers.js`, `DecodeDevID.js`, `Param_Helpers.js`.
- **`modules/`:** third-party libs vendored as the single built file the app loads (`plotly.js/dist/plotly.min.js`, `fft.js/dist/fft.js`, `build/floating-ui/.../popper.min.js`, `build/tippyjs/.../tippy-bundle.umd.min.js`, `JsDataflashParser/parser.js`). Not submodules: update by replacing the file with an upstream build; don't edit them. `index.html` and `build.cjs` reference them by path, so keep those files where they are. Paths in `index.html`, `markup.js` and `build.cjs` are relative to the repo root; the dynamic `import()` of the parser needs the `./` prefix.
- **Log parsing** uses `JsDataflashParser` (DataFlash `.bin`) in the browser.

## UI conventions

- **Screen formats:** JS puts one of `html.mode-desktop|compact|phone|tablet` (`screen_mode()`) on `<html>`, plus `html.side-drawer` when the field sidebar is an overlay (`is_drawer()`: phone, tablet, and compact narrower than 800 px). CSS layout keys off these classes, not media queries; `@media (pointer: coarse)` is only for target sizes. `--topbar-h` / `--chrome-h` are kept by `update_chrome_vars()` (zero in focus mode, `body.focus`).
- **Sidebar state:** only through `set_side()` / `apply_side_state()` (`side_pref` docked, `drawer_open` as a drawer). Hardware/PID list their sections as a chip strip above the content in every format but desktop.
- **Text:** nothing fixed in HTML without `data-i18n*`; new keys go in PT and EN in `i18n.js`. Tool views translate by exact match in `i18n_tools.js`. Static English markup is in `markup.js`; the PID form uses `data-i18n`.
- **Persistence:** `pref_get` / `pref_set` (`logviewerlite-*` keys, wrapped in try/catch).
- **Tool views:** `hardware.js` / `pid.js` get their wiring from `data-on-*` attributes (`wire()`); the PID setup form lives outside `#pidRoot` and is wired separately in `PID.init`. `app_loading_call(fn, i18nKey)` shows what is being done.
- **Board names:** `board_types.js` defines `window.HW_BOARD_TYPES` (bootloader board-ID list, from the old `HardwareReport/board_types.txt`); `hardware.js` reads it to name the board. It is loaded by `index.html` before `hardware.js` (and inlined by `build.cjs`).

## Linting specifics (`eslint.config.mjs`)

- Correctness rules only; match the surrounding file's style.
- The config parses every HTML page, finds the scripts it loads, and gives each script the globals declared by its page's other scripts. Scripts that publish globals at run time go in `RUNTIME_GLOBALS`; new CDN/minified libraries in `LIBRARY_GLOBALS`.
- `eslint-suppressions.json` is empty; don't add suppressions for new code.
- `modules/**`, `backup/**`, `dist/**`, Android build output and the generated data files (`descriptions.js`, `markup.js`, `hardware.js`, `pid.js`) are ignored; the HTML page scan skips `modules`, `dist` and `android` (linting `dist/SpeedLog.html` runs out of memory).

## Equipe e fluxo de trabalho

O gerente (a sessão principal do Claude) planeja, divide tarefas e integra. Agentes (definições em `.claude/agents/`, que não existe neste repositório novo: recrie ou copie do repositório antigo se precisar):

- `backend`: parsing, processamento de dados, `Libraries/`, build, Android.
- `frontend`: comportamento da UI, views, i18n, integração HTML/JS.
- `designer`: CSS, layout, especificações visuais.

Regras: um único escritor por arquivo por vez (`SpeedLog.js` é compartilhado: serialize as tarefas que o tocam); cada tarefa define arquivos, critério de pronto e quem a verifica; todo agente roda `npm run lint` antes de reportar; o gerente revisa o resultado antes de dizer que está pronto; commits só quando o usuário pedir.
