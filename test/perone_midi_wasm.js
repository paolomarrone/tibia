// Wasm MIDI-only ABI and browser adapter tests. GPL-3.0-or-later.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
	const bundle = process.argv[2];
	assert(bundle, "Usage: node test/perone_midi_wasm.js bundle.perone");
	const { product } = JSON.parse(fs.readFileSync(path.join(bundle, "product.json")));
	assert(product.buses.every(b => b.type == "midi"));
	const binary = fs.readFileSync(path.join(bundle, "wasm32", product.bundleName + ".wasm"));
	const module_ = new WebAssembly.Module(binary);
	assert.deepEqual(WebAssembly.Module.imports(module_), []);
	const w = new WebAssembly.Instance(module_).exports;
	w.__wasm_call_ctors();
	for (const version of [0, 1, 2, 4]) assert.equal(w.perone_get_api(version), 0);
	const ptr = w.perone_get_api(3); assert(ptr);
	const names = ["alloc", "free", "init", "fini", "set_sample_rate", "mem_req", "mem_set", "reset", "process",
		"set_parameter", "get_parameter", "midi_msg_in", "set_transport", "msg_in", "state_save", "state_load"];
	const table = w.__indirect_function_table;
	const api = Object.fromEntries(Array.from(new Uint32Array(w.memory.buffer, ptr, names.length),
		(index, i) => [names[i], index ? table.get(index) : null]));
	for (const name of [...names.slice(0, 10), "midi_msg_in"]) assert.equal(typeof api[name], "function", name);
	for (const name of ["get_parameter", "set_transport", "msg_in", "state_save", "state_load"]) assert.equal(api[name], null);
	const owned = [];
	function alloc(size) { const p = w.malloc(size); assert(p); owned.push(p); return p; }
	function words(values) {
		const p = alloc(values.length * 4);
		new Uint32Array(w.memory.buffer, p, values.length).set(values); return p;
	}
	let frames = 0;
	const events = [];
	// Four i32 arguments: handle, global bus index, borrowed data pointer, frame offset.
	const bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1, 8, 1, 0x60, 4, 0x7f, 0x7f, 0x7f, 0x7f, 0,
		2, 7, 1, 1, 104, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0];
	const bridge = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), { h: { f: (handle, bus, data, offset) => {
		assert.equal(handle, 42);
		assert(frames > 0 && offset >= 0 && offset < frames);
		events.push({ bus, offset, data: Array.from(new Uint8Array(w.memory.buffer, data, 3)) });
	} } });
	const midi = table.grow(1); table.set(midi, bridge.exports.f);
	const callbacks = words([42, 0, 0, 0, 0]);
	let instance = api.alloc(); assert(instance);
	assert.notEqual(api.init(instance, callbacks), 0);
	api.free(instance);
	new Uint32Array(w.memory.buffer, callbacks, 5)[4] = midi;
	instance = api.alloc(); assert(instance);
	assert.equal(api.init(instance, callbacks), 0);
	api.set_sample_rate(instance, 48000);
	assert.equal(api.mem_req(instance), 0);
	api.mem_set(instance, 0); api.reset(instance);
	product.parameters.forEach((p, i) => api.set_parameter(instance, i, p.defaultValue));
	const input = alloc(3);
	function send(data) {
		new Uint8Array(w.memory.buffer, input, 3).set(data);
		api.midi_msg_in(instance, 0, input);
		new Uint8Array(w.memory.buffer, input, 3).fill(0);
	}
	function render(n) { frames = n; api.process(instance, 0, 0, n); frames = 0; }
	send([0x92, 60, 100]);
	api.set_parameter(instance, 1, 7);
	send([0x82, 60, 64]); send([0xb2, 1, 90]);
	assert.equal(events.length, 0);
	w.memory.grow(1); // Callbacks must read the current buffer.
	render(0); assert.equal(events.length, 0);
	render(8);
	assert.deepEqual(events, [
		{ bus: 1, offset: 0, data: [0x92, 72, 100] },
		{ bus: 1, offset: 7, data: [0x82, 72, 64] },
		{ bus: 1, offset: 7, data: [0xb2, 1, 90] }
	]);
	api.set_parameter(instance, 0, -12); api.set_parameter(instance, 1, 8);
	send([0x90, 72, 80]); render(8); render(0); assert.equal(events.length, 3);
	render(1); assert.deepEqual(events[3], { bus: 1, offset: 0, data: [0x90, 60, 80] });
	api.set_parameter(instance, 1, 0);
	send([0xc2, 5, 0]); send([0xf8, 0, 0]); render(1);
	assert.deepEqual(events.slice(4), [
		{ bus: 1, offset: 0, data: [0xc2, 5, 0] }, { bus: 1, offset: 0, data: [0xf8, 0, 0] }
	]);
	send([0x90, 60, 80]); api.reset(instance); render(64); assert.equal(events.length, 6);
	api.fini(instance); api.free(instance);
	for (const p of owned) w.free(p);

	const source = fs.readFileSync(path.join(__dirname, "../templates/perone-web/wasm.js"));
	const { WasmPlugin } = await import("data:text/javascript;base64," + source.toString("base64"));
	assert.throws(() => new WasmPlugin(binary, product, 48000, () => {}), /MIDI output callback is required/);
	const captured = [];
	const plugin = new WasmPlugin(binary, product, 48000, () => assert.fail("Unexpected DSP message"),
		(bus, data, offset) => captured.push({ bus, data, offset }));
	assert.equal(plugin.inputs.ptr, 0); assert.equal(plugin.outputs.ptr, 0);
	plugin.api.set_parameter(plugin.instance, 1, 129);
	plugin.midi_msg_in(0, [0x90, 60, 100]);
	plugin.process([], [], 0); assert.equal(captured.length, 0);
	plugin.process([], [], 300); // Three internal chunks; offset must include the chunk base.
	assert.deepEqual(captured, [{ bus: 1, offset: 129, data: new Uint8Array([0x90, 72, 100]) }]);
	plugin.wasm.memory.grow(1);
	plugin.api.set_parameter(plugin.instance, 0, -12); plugin.api.set_parameter(plugin.instance, 1, 0);
	plugin.midi_msg_in(0, [0x80, 72, 64]); plugin.process([], [], 1);
	assert.deepEqual(captured, [
		{ bus: 1, offset: 129, data: new Uint8Array([0x90, 72, 100]) },
		{ bus: 1, offset: 0, data: new Uint8Array([0x80, 60, 64]) }
	]);
	plugin.free();
	console.log("OK: Wasm MIDI-only ABI, parameters, borrowed bytes, offsets, zero frames, memory growth and browser adapter");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
