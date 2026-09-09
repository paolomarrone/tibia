# Perone

`perone` and `perone-make` generate a `.perone` bundle with an ELF shared library
exposing the Tibia DSP source API through a versioned C ABI.
They include the original `plugin.h` or `plugin_cxx.h`
and export one symbol: `perone_get_api(uint32_t version)`.
The public contract is [perone.h](perone.h), independent of the generated,
per-product `plugin_api.h`.

From the Tibia checkout, for a source plugin in `/path/to/plugin`:

```sh
./tibia /path/to/plugin/product.json templates/api out/perone/src
./tibia /path/to/plugin/product.json templates/perone out/perone
./tibia /path/to/plugin/product.json templates/perone-make out/perone
make -C out/perone PLUGIN_DIR=/path/to/plugin API_DIR=src
```

The build produces a bundle:

```text
build/<bundleName>.perone/
  product.json
  x86_64-linux/
    <bundleName>.so
```

Distribute the entire `.perone` directory. The host reads `product.json` from its
root and loads the binary from the matching `<architecture>-<os>` directory.
The platform defaults to `uname -m` followed by the lowercase `uname -s`.
For cross-compilation, set `PERONE_PLATFORM` to the target, e.g. `aarch64-linux`,
along with the appropriate compiler and flags. The build currently targets ELF
platforms; the directory layout can hold binaries for multiple platforms.
Building one platform preserves the other platform directories.

`OUTPUT` overrides the bundle directory, e.g. `OUTPUT=dist/example.perone`.
Compiler dependency files stay outside the bundle, in the sibling
`obj/<bundle-directory-name>/<platform>.d`. `make clean` removes the selected
bundle and its dependency directory.

The JSON contains the original `product` object after input merging and overrides,
without generated fields or build configuration. All product metadata, including
bus layouts, parameter defaults and messaging limits, stays in this file.
The library contains no metadata descriptors, default tables or index maps.

ABI version 2 replaces the earlier `create`/`destroy` interface. Unsupported
versions, including version 1, return NULL. The function table and callback types
have a fixed layout across products. Keep the library loaded while using its
table or instances.

Each function-table entry forwards the corresponding `plugin_*` call with the
same arguments and return value, replacing the instance type with `void *`:

| Perone entry | Source function |
| --- | --- |
| `init`, `fini` | `plugin_init`, `plugin_fini` |
| `set_sample_rate` | `plugin_set_sample_rate` |
| `mem_req`, `mem_set` | `plugin_mem_req`, `plugin_mem_set` |
| `reset`, `process` | `plugin_reset`, `plugin_process` |
| `set_parameter`, `get_parameter` | `plugin_set_parameter`, `plugin_get_parameter` |
| `midi_msg_in` | `plugin_midi_msg_in` |
| `set_transport` | `plugin_set_transport` |
| `msg_in` | `plugin_msg_in` |
| `state_save`, `state_load` | `plugin_state_save`, `plugin_state_load` |

`alloc()` and `free()` are the only additional operations. They allocate and
release storage aligned for the private `plugin` type, using `posix_memalign`
and `free`. They do not initialize the DSP or run C++ constructors/destructors.
C++ members are constructed by `plugin_init` and destroyed by `plugin_fini`,
following the source API. `alloc` returns NULL on failure; `free(NULL)` is valid.
No DSP exception may cross the C ABI.

The host controls the lifecycle:

1. Allocate instance storage, then call `init` with a valid callback structure.
   On init failure, handle the returned source error and release the storage.
2. Apply input defaults from `product.json` and set the sample rate.
3. Call `mem_req`, allocate any requested DSP memory and provide it with `mem_set`.
4. Call `reset`, then process audio and deliver parameters, MIDI and other events.
5. To change the sample rate, update it, requery memory requirements, supply the
   required memory and reset before processing again.
6. Call `fini`, release host-owned DSP memory and free the instance storage.

If host setup fails after successful init, call `fini` before freeing the storage.
Perone applies no defaults or argument filtering, and forwards zero-frame process
calls. Parameter and MIDI bus indices retain their original JSON array positions.
Audio channels are flattened in JSON bus order, separately for each direction.
Values use product units. The host supplies valid arguments and serializes DSP
calls, including incoming messages and transport updates.

`perone_callbacks` forwards `handle`, directory callbacks and `msg_write`.
The wrapper supplies the source callback's `format` as `"perone"`.
Transport fields, including `changed` and `valid`, are copied into the source
transport structure. Messaging is synchronous: `msg_in` delivers host data to the
DSP, and `msg_write` returns DSP data to the host on the calling thread.
The host supplies callbacks used by the DSP, respects declared message limits and
handles queues or thread handoff. Message data must be copied during the callback
if it is needed later. Callback functions and handles must outlive their use.

State callbacks forward `lock`, `unlock`, `write` and `set_parameter` with the
host's handle. `state_load` intentionally has no instance argument, matching the
source API: a host may restore parameter values without a DSP instance.
State bytes and callback return values pass through unchanged.

Optional function pointers are NULL when the product does not declare the
corresponding capability: input/output parameters, MIDI input, transport sync,
UI-to-DSP messaging or custom DSP state (`state.dspCustom`). Callback fields remain
present in the public types regardless of these capabilities. Parameter function
stubs are still expected by the source API. UI embedding is outside the DSP ABI;
MIDI output is rejected because the source API has no corresponding callback.

Brickworks needs its original common header and DSP includes. With `../brickworks`,
use an example's `src` as `PLUGIN_DIR` and pass absolute paths to
`examples/common/src` and `include` through `CPPFLAGS`. No DSP source adaptation
is needed. The current source API returns an error from `plugin_init`; the old
void-returning API is unsupported.

The build accepts `CC`, `CXX`, `CFLAGS`, `CXXFLAGS`, `CPPFLAGS`, `LDFLAGS`, `LDLIBS`,
`COMMON_DIR`, `DATA_DIR`, `PLUGIN_DIR`, `API_DIR`, `MKINC_DIR`, `PERONE_PLATFORM`, `OUTPUT` and
`make`/`perone_make` configuration, following the other targets' directory layout.
Header dependencies are tracked by the compiler.

`test/run_perone.sh` generates, builds and tests Perone independently of
`test/run.sh`, using the shared `test/product.json`, `test/plugin.h` and
`test/plugin_cxx.h`. It compiles the host in `test/perone.c` to exercise audio,
MIDI, transport, messaging, rate changes and state round trips, and checks the
bundled JSON. From the Tibia checkout, run both variants with:

```sh
sh test/run_perone.sh
```

Generated projects and bundles stay in `out/perone/c` and `out/perone/cxx`;
the host executable is `out/perone/test`. The five values passed to the host
are the input parameter defaults from `test/product.json`, in their original
order.
