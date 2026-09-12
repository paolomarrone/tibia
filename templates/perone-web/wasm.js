// Perone Wasm instance for a browser host. GPL-3.0-or-later.
const entries = ["alloc", "free", "init", "fini", "set_sample_rate", "mem_req", "mem_set", "reset", "process",
	"set_parameter", "get_parameter", "midi_msg_in", "set_transport", "msg_in", "state_save", "state_load"];

export class WasmPlugin {
	constructor(binary, product, rate, message) {
		this.product = product;
		this.owned = [];
		this.wasm = new WebAssembly.Instance(new WebAssembly.Module(binary)).exports;
		const w = this.wasm;
		w.__wasm_call_ctors();
		const ptr = w.perone_get_api(2);
		if (!ptr) throw Error("Unsupported Perone DSP ABI");
		this.api = Object.fromEntries(Array.from(new Uint32Array(w.memory.buffer, ptr, entries.length),
			(index, i) => [entries[i], index ? w.__indirect_function_table.get(index) : null]));
		try {
			const callbacks = this.alloc(16);
			const msg = this.callback([0x7f, 0x7f, 0x7f], (handle, size, data) => {
				if (size > (product.messaging?.dspToUiSize || 0)) throw Error("DSP message exceeds product limit");
				message(new Uint8Array(w.memory.buffer, data, size).slice());
			});
			new Uint32Array(w.memory.buffer, callbacks, 4).set([0, 0, 0, msg]);
			this.instance = this.api.alloc();
			if (!this.instance) throw Error("Cannot allocate DSP instance");
			if (this.api.init(this.instance, callbacks)) throw Error("Cannot initialize DSP");
			this.initialized = true;
			product.parameters.forEach((p, i) => { if (p.direction == "input") this.api.set_parameter(this.instance, i, p.defaultValue); });
			this.api.set_sample_rate(this.instance, rate);
			this.api.mem_set(this.instance, this.alloc(this.api.mem_req(this.instance)));
			this.api.reset(this.instance);
			this.inputBuses = product.buses.filter(b => b.type == "audio" && b.direction == "input");
			this.outputBuses = product.buses.filter(b => b.type == "audio" && b.direction == "output");
			this.inputs = this.buffers(this.inputBuses);
			this.outputs = this.buffers(this.outputBuses);
			this.message = this.alloc(product.messaging?.uiToDspSize || 0);
			this.midi = this.alloc(3);
			this.transport = this.alloc(64);
			this.refresh();
		} catch (error) { this.free(); throw error; }
	}
	alloc(size) {
		if (!size) return 0;
		const p = this.wasm.malloc(size);
		if (!p) throw Error("Cannot allocate Wasm memory");
		this.owned.push(p);
		return p;
	}
	callback(params, fn) {
		const type = [1, 0x60, params.length, ...params, 0];
		const bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1, type.length, ...type,
			2, 7, 1, 1, 104, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0];
		const bridge = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes)), { h: { f: fn } });
		const table = this.wasm.__indirect_function_table, index = table.grow(1);
		table.set(index, bridge.exports.f);
		return index;
	}
	buffers(buses) {
		const count = buses.reduce((n, b) => n + (b.channels == "mono" ? 1 : 2), 0);
		return { ptr: this.alloc(count * 4), data: Array.from({ length: count }, () => this.alloc(128 * 4)) };
	}
	refresh() {
		if (this.memory == this.wasm.memory.buffer) return;
		this.memory = this.wasm.memory.buffer;
		for (const b of [this.inputs, this.outputs]) {
			b.pointers = new Uint32Array(this.memory, b.ptr, b.data.length);
			b.views = b.data.map(p => new Float32Array(this.memory, p, 128));
			b.pointers.set(b.data);
		}
	}
	process(inputs, outputs, frames) {
		for (let offset = 0; offset < frames; offset += 128) {
			const count = Math.min(128, frames - offset);
			this.refresh();
			let channel = 0;
			for (let bus = 0; bus < this.inputBuses.length; bus++) {
				const b = this.inputBuses[bus], input = inputs[bus] || [];
				for (let c = 0; c < (b.channels == "mono" ? 1 : 2); c++, channel++) {
					const source = input[c] || input[0], view = this.inputs.views[channel];
					this.inputs.pointers[channel] = !source && b.optional ? 0 : this.inputs.data[channel];
					if (b.channels == "mono" && input.length > 1) {
						for (let i = 0; i < count; i++) {
							let value = 0;
							for (const samples of input) value += samples[offset + i];
							view[i] = value / input.length;
						}
					} else if (source) {
						for (let i = 0; i < count; i++) view[i] = source[offset + i];
					} else view.fill(0);
				}
			}
			this.api.process(this.instance, this.inputs.ptr, this.outputs.ptr, count);
			this.refresh();
			channel = 0;
			for (let bus = 0; bus < this.outputBuses.length; bus++)
				for (let c = 0; c < (this.outputBuses[bus].channels == "mono" ? 1 : 2); c++, channel++)
					for (let i = 0; i < count; i++) outputs[bus][c][offset + i] = this.outputs.views[channel][i];
		}
	}
	msg_in(data) {
		if (!this.api.msg_in || data.byteLength > (this.product.messaging?.uiToDspSize || 0)) throw Error("Unsupported UI message");
		new Uint8Array(this.wasm.memory.buffer, this.message, data.byteLength).set(data);
		this.api.msg_in(this.instance, data.byteLength, this.message);
	}
	midi_msg_in(bus, data) {
		if (!this.api.midi_msg_in || data.length != 3) throw Error("Unsupported MIDI message");
		new Uint8Array(this.wasm.memory.buffer, this.midi, 3).set(data);
		this.api.midi_msg_in(this.instance, bus, this.midi);
	}
	set_transport(t) {
		if (!this.api.set_transport) throw Error("Transport is not supported");
		const view = new DataView(this.wasm.memory.buffer, this.transport, 64);
		view.setUint32(0, t.changed || 0, true); view.setUint32(4, t.valid || 0, true);
		view.setUint8(8, t.playing || 0); view.setFloat32(12, t.speed || 0, true); view.setFloat32(16, t.bpm || 0, true);
		view.setFloat64(24, t.quarter || 0, true); view.setFloat64(32, t.beat || 0, true);
		view.setFloat32(40, t.time_sig_num || 0, true); view.setUint32(44, t.time_sig_denom || 0, true);
		view.setBigUint64(48, BigInt(t.bar || 0), true); view.setFloat32(56, t.bar_beat || 0, true);
		this.api.set_transport(this.instance, this.transport);
	}
	free() {
		if (this.initialized) this.api.fini(this.instance);
		if (this.instance) this.api.free(this.instance);
		for (const p of this.owned) this.wasm.free(p);
		this.owned = []; this.instance = 0; this.initialized = false;
	}
}
