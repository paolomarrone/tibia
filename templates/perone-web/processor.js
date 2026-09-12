// Perone AudioWorklet adapter. GPL-3.0-or-later.
import { WasmPlugin } from "./wasm.js";

class PeroneProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();
		this.port.onmessage = event => {
			try { this.receive(event.data); } catch (error) { this.error(error); }
		};
		try {
			const { binary, product } = options.processorOptions;
			this.plugin = new WasmPlugin(binary, product, sampleRate, data => this.port.postMessage({ type: "message", data }));
			this.outputs = product.parameters.flatMap((p, index) => p.direction == "output" ? [{ index, value: NaN }] : []);
			this.elapsed = 0;
			this.port.postMessage({ type: "ready" });
		} catch (error) { this.error(error); }
	}
	error(error) { this.port.postMessage({ type: "error", message: error.message }); }
	receive(data) {
		const p = this.plugin;
		if (data.type == "free") {
			p?.free(); this.plugin = null;
			this.port.postMessage({ type: "free" }); this.port.close();
			return;
		}
		if (!p) return;
		switch (data.type) {
		case "parameter":
			if (p.product.parameters[data.index]?.direction != "input" || !Number.isFinite(data.value)) throw Error("Invalid input parameter");
			p.api.set_parameter(p.instance, data.index, data.value);
			break;
		case "message": p.msg_in(data.data); break;
		case "midi": p.midi_msg_in(data.bus, data.data); break;
		case "transport": p.set_transport(data.transport); break;
		}
	}
	process(inputs, outputs) {
		if (!this.plugin) return false;
		try {
			const frames = outputs[0]?.[0]?.length || inputs[0]?.[0]?.length || 128;
			this.plugin.process(inputs, outputs, frames);
			this.elapsed += frames;
			if (this.elapsed >= sampleRate / 30) {
				this.elapsed = 0;
				for (const p of this.outputs) {
					const value = this.plugin.api.get_parameter(this.plugin.instance, p.index);
					if (!Object.is(value, p.value)) {
						p.value = value;
						this.port.postMessage({ type: "parameter", index: p.index, value });
					}
				}
			}
			return true;
		} catch (error) {
			this.error(error); this.plugin.free(); this.plugin = null;
			return false;
		}
	}
}
registerProcessor("perone", PeroneProcessor);
