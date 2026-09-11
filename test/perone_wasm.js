// WebAssembly host for the Tibia test plugin. GPL-3.0-or-later.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bundle = process.argv[2];
assert(bundle, "Usage: node test/perone_wasm.js bundle.perone");
const { product } = JSON.parse(fs.readFileSync(path.join(bundle, "product.json"), "utf8"));
const module_ = new WebAssembly.Module(fs.readFileSync(path.join(bundle, "wasm32", product.bundleName + ".wasm")));
assert.deepEqual(WebAssembly.Module.imports(module_), []);
const wasm = new WebAssembly.Instance(module_).exports;
wasm.__wasm_call_ctors();
assert.equal(wasm.perone_get_api(1), 0);
assert.equal(wasm.perone_get_api(3), 0);
const api_ptr = wasm.perone_get_api(2);
assert(api_ptr);
const names = ["alloc", "free", "init", "fini", "set_sample_rate", "mem_req", "mem_set", "reset", "process",
	"set_parameter", "get_parameter", "midi_msg_in", "set_transport", "msg_in", "state_save", "state_load"];
const table = wasm.__indirect_function_table;
const api = Object.fromEntries(Array.from(new Uint32Array(wasm.memory.buffer, api_ptr, names.length),
	(index, i) => [names[i], index ? table.get(index) : null]));
for (const name of names) assert.equal(typeof api[name], "function", name);

// A typed Wasm import/export makes a JavaScript callback usable in the C function table.
function callback(params, result, fn) {
	const type = [1, 0x60, params.length, ...params, result ? 1 : 0, ...(result ? [result] : [])];
	const bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1, type.length, ...type,
		2, 7, 1, 1, 104, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0];
	const bridge = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), { h: { f: fn } });
	const index = table.grow(1);
	table.set(index, bridge.exports.f);
	return index;
}

const owned = [];
function alloc(size) {
	const p = wasm.malloc(size);
	assert(p);
	owned.push(p);
	return p;
}
function words(values) {
	const p = alloc(values.length * 4);
	new Uint32Array(wasm.memory.buffer, p, values.length).set(values);
	return p;
}
function bytes(p, size) { return new Uint8Array(wasm.memory.buffer, p, size); }
function sample(i) { return new Float32Array(wasm.memory.buffer, output, 480)[i]; }
function near(a, b) { assert(Math.abs(a - b) < .0001, `${a} != ${b}`); }

let messages = 0, locked = false, write_result = 0, saved, restored = {}, restore_instance = 0;
const msg_write = callback([0x7f, 0x7f, 0x7f], null, (handle, size, data) => {
	assert.equal(handle, 42);
	assert(size <= product.messaging.dspToUiSize);
	bytes(data, size).slice();
	messages++;
});
const lock = callback([0x7f], null, handle => { assert.equal(handle, 42); assert(!locked); locked = true; });
const unlock = callback([0x7f], null, handle => { assert.equal(handle, 42); assert(locked); locked = false; });
const write = callback([0x7f, 0x7f, 0x7f], 0x7f, (handle, data, size) => {
	assert.equal(handle, 42);
	assert(!locked);
	saved = bytes(data, size).slice();
	return write_result;
});
const restore = callback([0x7f, 0x7f, 0x7d], null, (handle, index, value) => {
	assert.equal(handle, 42);
	assert(locked && index < 5);
	restored[index] = value;
	if (restore_instance) api.set_parameter(restore_instance, index, value);
});
const callbacks = words([42, 0, 0, msg_write]);
const state_callbacks = words([42, lock, unlock, write, restore]);
const instance = api.alloc();
assert(instance && instance % 8 == 0);
assert.equal(api.init(instance, callbacks), 0);
product.parameters.forEach((p, i) => { if (p.direction == "input") api.set_parameter(instance, i, p.defaultValue); });
let mem = 0;
function configure(rate) {
	api.set_sample_rate(instance, rate);
	const next = wasm.malloc(api.mem_req(instance));
	assert(next);
	api.mem_set(instance, next);
	wasm.free(mem);
	mem = next;
	api.reset(instance);
}
configure(48000);
const input = alloc(480 * 4), output = alloc(480 * 4);
const inputs = words([input]), outputs = words([output]);
new Float32Array(wasm.memory.buffer, input, 480).fill(1);
api.process(instance, inputs, outputs, 480);
near(sample(479), 1);
assert.equal(api.get_parameter(instance, 5), sample(479));
const message = alloc(5);
bytes(message, 5).set(new TextEncoder().encode("reset"));
api.msg_in(instance, 5, message);
api.process(instance, inputs, outputs, 0);
assert.equal(messages, 0); // The shared plugins omit outgoing messages under WEB.

const transport = alloc(64);
bytes(transport, 64).fill(0);
function phase(valid, quarter, beat, bar_beat) {
	const t = new DataView(wasm.memory.buffer, transport, 64);
	t.setUint32(0, valid, true); t.setUint32(4, valid, true); t.setUint8(8, 1);
	t.setFloat32(12, 1, true); t.setFloat32(16, 120, true);
	t.setFloat64(24, quarter, true); t.setFloat64(32, beat, true);
	t.setFloat32(40, 4, true); t.setUint32(44, 8, true);
	t.setBigUint64(48, 2n, true); t.setFloat32(56, bar_beat, true);
	api.reset(instance); api.set_transport(instance, transport); api.process(instance, inputs, outputs, 1);
	return sample(0);
}
api.set_parameter(instance, 3, 100);
const first = phase(15, .25, 0, 0);
assert(first > 0 && phase(15, .75, 0, 0) > 2.9 * first);
near(phase(7 | 16 | 64, 0, .5, 0), first);
near(phase(7 | 32 | 64 | 128 | 256, 0, 0, .5), first);
api.set_parameter(instance, 3, 0);
api.reset(instance); api.process(instance, inputs, outputs, 1);
const base = sample(0), note = alloc(3);
bytes(note, 3).set([0x90, 72, 100]);
api.reset(instance); api.midi_msg_in(instance, 2, note); api.process(instance, inputs, outputs, 1);
assert(sample(0) > 1.5 * base);
configure(96000);
api.process(instance, inputs, outputs, 480);
near(sample(479), 1);

[3, 2, 800, 50, 1].forEach((v, i) => api.set_parameter(instance, i, v));
assert.equal(api.state_save(instance, state_callbacks, 96000), 0);
assert(saved.length && !locked);
const state = saved.slice(), state_ptr = alloc(state.length);
bytes(state_ptr, state.length).set(state);
write_result = -37;
assert.equal(api.state_save(instance, state_callbacks, 96000), -37);
write_result = 0;
assert.notEqual(api.state_load(state_callbacks, 96000, state_ptr, 0), 0);
assert.deepEqual(restored, {});
assert.equal(api.state_load(state_callbacks, 96000, state_ptr, state.length), 0);
assert.deepEqual([restored[0], restored[1], restored[2], restored[4]], [3, 2, 800, 1]);
assert(!locked);
restore_instance = instance;
api.set_parameter(instance, 0, 0); api.set_parameter(instance, 4, 0);
assert.equal(api.state_load(state_callbacks, 96000, state_ptr, state.length), 0);
assert.equal(api.state_save(instance, state_callbacks, 96000), 0);
assert.deepEqual(saved, state);

const old_buffer = wasm.memory.buffer, growth = alloc(old_buffer.byteLength + 65536);
assert.notEqual(wasm.memory.buffer, old_buffer);
bytes(growth, 16).fill(0x5a);
api.reset(instance); api.process(instance, inputs, outputs, 480);
assert.deepEqual(bytes(output, 480 * 4), bytes(input, 480 * 4));
api.fini(instance); api.free(instance); api.free(0); wasm.free(mem);
for (const p of owned) wasm.free(p);
console.log("OK: Wasm audio, MIDI, transport, state, callbacks and memory growth");
