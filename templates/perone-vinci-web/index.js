// Perone UI ABI v1 over Vinci's browser backend. GPL-3.0-or-later.
import { VinciWeb } from "./vinci-web.js";
const entries = ["get_default_size", "create", "free", "idle", "set_parameter", "msg_in", "get_widget"];

export async function create(element, callbacks) {
	const owned = [], pending = [], gestures = new Map();
	const { product } = callbacks;
	let adapter = new VinciWeb(element), w, api, ui = 0, frame = null, closed = false, flushing = false;
	function alloc(size) {
		if (!size) return 0;
		const p = w.malloc(size);
		if (!p) throw Error("Cannot allocate UI memory");
		owned.push(p);
		return p;
	}
	function string(value) {
		const bytes = new TextEncoder().encode(value + "\0"), p = alloc(bytes.length);
		new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
		return p;
	}
	function callback(params, results, fn) {
		const type = [1, 0x60, params.length, ...params, results.length, ...results];
		const bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1, type.length, ...type,
			2, 7, 1, 1, 104, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0];
		const bridge = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), { h: { f: fn } });
		const table = w.__indirect_function_table, index = table.grow(1);
		table.set(index, bridge.exports.f);
		return index;
	}
	// Deliver host callbacks only after C returns: host listeners may close this UI.
	function flush() {
		if (flushing) return;
		flushing = true;
		try {
			while (!closed && pending.length) {
				const [name, ...args] = pending.shift(), [index, value] = args;
				if (name == "set_parameter_end") gestures.delete(index);
				else if (name == "set_parameter_begin" || (name == "set_parameter" && gestures.has(index))) gestures.set(index, value);
				callbacks[name](...args);
			}
		} finally { flushing = false; }
	}
	function call(fn, ...args) {
		const result = fn(...args);
		flush();
		return result;
	}
	function free() {
		if (closed) return;
		closed = true;
		if (frame !== null) cancelAnimationFrame(frame);
		pending.length = 0;
		try {
			for (const [index, value] of gestures) callbacks.set_parameter_end(index, value);
		} finally {
			gestures.clear();
			try { if (ui) api.free(ui); }
			finally {
				ui = 0;
				try {
					adapter.dispose();
					for (const p of owned) w.free(p);
				} finally { owned.length = 0; adapter = w = api = null; }
			}
		}
	}
	try {
		const binary = await fetch(new URL("../wasm32/" + product.bundleName + "-ui.wasm", import.meta.url));
		if (!binary.ok) throw Error("Cannot load Wasm UI: " + binary.status);
		const { instance } = await WebAssembly.instantiate(await binary.arrayBuffer(), adapter.imports);
		adapter.bind(instance);
		w = instance.exports;
		w.__wasm_call_ctors();
		const ptr = w.perone_ui_get_api(1);
		if (!ptr) throw Error("Unsupported Perone UI ABI");
		api = Object.fromEntries(Array.from(new Uint32Array(w.memory.buffer, ptr, entries.length),
			(index, i) => [entries[i], index ? w.__indirect_function_table.get(index) : null]));
		const bindir = string(new URL("../wasm32/", import.meta.url).href);
		const datadir = string(new URL("../", import.meta.url).href);
		const cbs = alloc(28), input = alloc(product.messaging?.dspToUiSize || 0);
		const pointers = [0, callback([0x7f], [0x7f], () => bindir), callback([0x7f], [0x7f], () => datadir)];
		for (const name of ["set_parameter_begin", "set_parameter", "set_parameter_end"])
			pointers.push(callback([0x7f, 0x7f, 0x7d], [], (handle, index, value) => pending.push([name, index >>> 0, value])));
		pointers.push(callback([0x7f, 0x7f, 0x7f], [], (handle, size, data) => {
			if ((size >>> 0) > (product.messaging?.uiToDspSize || 0)) throw Error("UI message exceeds product limit");
			pending.push(["msg_write", new Uint8Array(w.memory.buffer, data >>> 0, size >>> 0).slice()]);
		}));
		new Uint32Array(w.memory.buffer, cbs, pointers.length).set(pointers);
		ui = api.create(2, 1, adapter.registerParent(element), cbs);
		if (!ui) throw Error("Cannot create Perone UI");
		const canvas = adapter.getCanvas(api.get_widget(ui));
		if (!canvas) throw Error("Perone UI did not create a Vinci canvas");
		canvas.setAttribute("aria-label", product.name);
		function tick() {
			if (closed) return;
			try { call(api.idle, ui); }
			catch (error) { free(); throw error; }
			if (!closed) frame = requestAnimationFrame(tick);
		}
		frame = requestAnimationFrame(tick);
		return {
			set_parameter(index, value) {
				if (closed || !api.set_parameter) return;
				const p = product.parameters[index];
				if (!p || !Number.isFinite(value)) throw Error("Invalid UI parameter");
				call(api.set_parameter, ui, index, Math.max(p.minimum, Math.min(p.maximum, value)));
			},
			msg_in(data) {
				if (closed || !api.msg_in) return;
				if (!(data instanceof Uint8Array) || data.length > (product.messaging?.dspToUiSize || 0)) throw Error("Invalid DSP message");
				new Uint8Array(w.memory.buffer, input, data.length).set(data);
				call(api.msg_in, ui, data.length, input);
			},
			free
		};
	} catch (error) { free(); throw error; }
}
