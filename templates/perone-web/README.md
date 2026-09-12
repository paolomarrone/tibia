# Perone browser host

This optional template provides a small browser host for `.perone` bundles.
The DSP runs in an AudioWorklet. UI code runs in the page and communicates through
the host's parameter and message methods. No framework or Wasm UI renderer is required.

Generate the host beside the test bundles and serve the checkout over HTTP:

```sh
./test/run_perone.sh
python3 -m http.server 8000
```

Open `http://localhost:8000/out/perone/web/index.html`. Choose an audio file and
press Start to play it through the test plugin. For a different bundle, append
`?bundle=/path/to/example.perone/`. A synthesizer can receive MIDI through the
JavaScript host API. The demo page supplies file playback; microphone capture and
MIDI device selection belong to the embedding application.

For an independent host directory:

```sh
./tibia --common templates/perone-web out/my-host
```

Serve through localhost or HTTPS, as required by AudioWorklet. Instantiate from a
user gesture, and keep the audio context running while awaiting ready/disposal:

```js
import { PeroneNode } from "./perone.js";
const context = new AudioContext();
await context.resume();
const node = await PeroneNode.create(context, "/plugins/example.perone/");
node.connect(context.destination);
await node.ready;
const ui = await node.mount(document.querySelector("#controls"));
// Connect an audio source, or call node.midi_msg_in(busIndex, [0x90, 60, 100]).
// Later: ui.free(), or dispose the node and all its views:
await node.dispose();
await context.close();
```

Without `product.ui.web`, `mount` creates generic controls from the parameter
metadata: sliders, logarithmic mapping, integer values, toggles, lists and output
meters. It sends paired begin/end gestures and allows multiple UI views per DSP.
`mount(element, { generic: true })` explicitly selects the generic UI even when a
custom UI exists. A declared custom UI that fails to load reports its error.

A custom UI declares `"web": "ui/index.js"` inside the existing `product.ui`
object. This is an authored product field, not generated metadata. Put the module
and assets in a dedicated source directory and run:

```sh
make -C out/my-plugin ui-web UI_WEB_DIR=/path/to/my-web-ui
```

Its entry module exports `create(element, callbacks)`, which may be asynchronous.
The callback object contains `product` (the original metadata) and bound host
methods `set_parameter_begin(index, value)`, `set_parameter(index, value)`,
`set_parameter_end(index, value)` and `msg_write(data)`. Messages are `Uint8Array`
values bounded by the product's `messaging.uiToDspSize`.

`create` returns a UI object with:

| Method | Role |
| --- | --- |
| `set_parameter(index, value)` | Receive current values, host changes and output meters; optional. |
| `msg_in(data)` | Receive DSP bytes as `Uint8Array`; optional. |
| `free()` | Remove the UI and release its event handlers/resources; required. |

The host supplies current values after creation. A UI should update its display
without echoing received values back to the host. Resolve assets relative to
`import.meta.url`. `test/perone_web_ui.js` is a minimal custom UI example.

`PeroneNode` exposes the same four callback methods to an embedding application,
plus `midi_msg_in(bus, bytes)` and `set_transport(transport)`. Transport object keys
match `perone_transport`, including `changed`/`valid` bit masks and the `bar` BigInt.
The node emits `parameter` events with `{ index, value }`, `gesture` events with
`{ phase: "begin" | "end", index, value }`, `message` events with `{ data }`, and
`error` events with an Error as their `detail`.

Parameter changes are sent through the AudioWorklet port; this host does not
implement sample-accurate AudioParam automation or a state-save UI. Those can be
added by the embedding host without changing the Perone DSP or UI ABIs. Output
parameters are polled at approximately 30 Hz. DSP messages are copied before
delivery to the page. Prepare buffers and callback table entries during setup;
the Wasm adapter handles memory-view invalidation if the plugin grows memory.

Audio bus and channel order follows the JSON. An absent optional input is passed
as NULL; a required disconnected input receives silence. Mono inputs are downmixed,
and a mono connection to a stereo bus is duplicated. A DSP without audio outputs
gets a silent Web Audio output to keep its processing active. The native
`plugin_ui_*` graphics code is not compiled by this template.
