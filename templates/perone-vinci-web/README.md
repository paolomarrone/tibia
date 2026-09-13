# Perone Vinci web UI

This optional template compiles an existing Vinci `plugin_ui.h` or
`plugin_ui_cxx.h` into `wasm32/<bundleName>-ui.wasm`. The same UI source draws
and handles input on desktop and in the browser. Its separate Wasm instance runs
on the page thread; the DSP stays in the AudioWorklet with its own memory.

Use a Vinci checkout with `vinci-web.c` and `vinci-web.js`. Declare
`"web": "ui/index.js"` inside `product.ui` in the source JSON, then generate:

```sh
./tibia /path/to/product.json templates/api out/my-plugin/src
./tibia /path/to/product.json templates/perone out/my-plugin
./tibia /path/to/product.json templates/perone-make out/my-plugin
./tibia --common templates/perone-vinci-web out/my-plugin
make -C out/my-plugin all ui PERONE_PLATFORM=wasm32 \
    PLUGIN_DIR=/path/to/plugin VINCI_DIR=/path/to/vinci API_DIR=src
```

The template supplies `vars-extra.mk` and `rules-extra.mk`, which Perone includes
like other Tibia targets. If a project already supplies these files, combine their
contents. Toolkit flags, sources and exports apply only to the Wasm UI build.
Other UI sources and libraries can be supplied with the usual `UI_*` variables.

`make ui` compiles the UI and copies the two reusable JavaScript modules into the
bundle. It needs the web-capable Vinci checkout at build time; distribution needs
only the bundle, with no external Vinci installation:

```text
<bundleName>.perone/
  product.json
  wasm32/
    <bundleName>.wasm
    <bundleName>-ui.wasm
  ui/
    index.js
    vinci-web.js
```

Existing native platform directories are preserved. `make` without `ui` builds
only the DSP and metadata. The JSON is copied as authored, including `product.ui.web`;
the build adds no C metadata. Neither Wasm module needs WASI or Emscripten.

The browser host loads `ui/index.js` through its existing `node.mount(element)`
contract. The adapter loads the Wasm UI, binds Vinci, calls `__wasm_call_ctors`
once, obtains `perone_ui_get_api(1)` and passes `PERONE_UI_WEB` to `create`.
It installs typed host callbacks in the UI's table. Directory callbacks return
bundle URLs encoded as UTF-8 strings in UI memory; these are not filesystem paths.
Vinci parent/widget tokens belong to that instance's adapter.

Each mounted view owns a Wasm instance, canvas, buffers and animation loop.
`requestAnimationFrame` calls the source UI's `idle`, which normally calls
`vinci_idle`. UI callbacks are copied and delivered after C returns, allowing host
listeners to close a view without freeing it during a C callback. Parameters use
the original JSON indices and units; display values are clamped to the declared
ranges. Messages retain their bytes and are bounded by the JSON limits.
`free` ends active gestures, cancels scheduling and releases the UI, Vinci and
host allocations. Other views and the DSP remain usable.

Canvas pixels and initial dimensions come from the source UI. Where
`product.ui.userResizable` allows it, the host may change the canvas CSS width and
height; Vinci observes the change and delivers the source resize callback. The
adapter does not prescribe a responsive layout or apply automatic DPI scaling.

The build provides allocation, memory operations and basic C++ `new`/`delete`.
Other libc or C++ facilities must be supplied by the plugin, as for the DSP Wasm
target. Unresolved dependencies fail at link time. The adapter itself imports
only Vinci's browser functions; OS or file APIs are not emulated.

From the Tibia checkout, build the original test UI and DSP in C and C++ with:

```sh
VINCI_DIR=../vinci ./test/run_perone_ui_web.sh
```

This produces `out/perone/ui/c` and `out/perone/ui/cxx`, independently of the
existing tests. `test/perone_stdio.h` is copied into a test-only include directory:
it suppresses diagnostic printing and implements only the counter's `%.2f` and
`%f` formats. It is not a production libc. The shared plugin/UI source files are
copied unchanged, and both directions of messaging stay enabled in this test.

Serve the checkout, then open
`/out/perone/web/index.html?bundle=../ui/c/build/tibia-test.perone/`.
Choose an audio file and press Start. The UI has gain, delay, cutoff and tremolo
sliders, bypass, an output meter and a coloured counter/reset control,
as in the native test. For automated Chromium tests, provide Playwright and run:

```sh
PERONE_PLAYWRIGHT=/path/to/playwright PERONE_CHROMIUM=/path/to/chromium \
    node test/perone_ui_web.js
```
