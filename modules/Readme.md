Third-party libraries used by Speed Log, vendored (only the file the app loads, plus the license where the project ships one) so it works offline:

- `plotly.js/dist/plotly.min.js` (plotly.js v2.32.0)
- `fft.js/dist/fft.js` (indutny/fft.js)
- `build/floating-ui/dist/umd/popper.min.js` and `build/tippyjs/dist/tippy-bundle.umd.min.js` (prebuilt Popper and tippy.js)
- `JsDataflashParser/parser.js` (Williangalvani/JsDataflashParser, DataFlash `.bin` parser)

They are not submodules any more: to update one, replace the file with a new build from its upstream project. Do not edit them in place.
