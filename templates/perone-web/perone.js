// Perone browser host and optional UI loading. GPL-3.0-or-later.
import { create as createGeneric } from "./ui.js";
const worklets = new WeakMap();

export class PeroneNode extends AudioWorkletNode {
	static async create(context, bundle) {
		const url = new URL(bundle.endsWith("/") ? bundle : bundle + "/", location.href);
		const json = await fetch(new URL("product.json", url));
		if (!json.ok) throw Error("Cannot load product.json: " + json.status);
		const { product } = await json.json();
		const binary = await fetch(new URL("wasm32/" + product.bundleName + ".wasm", url));
		if (!binary.ok) throw Error("Cannot load Wasm: " + binary.status);
		if (!worklets.has(context)) {
			const loading = context.audioWorklet.addModule(new URL("./processor.js", import.meta.url));
			worklets.set(context, loading);
			loading.catch(() => worklets.delete(context));
		}
		await worklets.get(context);
		return new PeroneNode(context, product, await binary.arrayBuffer(), url);
	}
	constructor(context, product, binary, bundle) {
		const inputs = product.buses.filter(b => b.type == "audio" && b.direction == "input");
		const outputs = product.buses.filter(b => b.type == "audio" && b.direction == "output");
		super(context, "perone", {
			numberOfInputs: inputs.length, numberOfOutputs: outputs.length || 1,
			outputChannelCount: outputs.length ? outputs.map(b => b.channels == "mono" ? 1 : 2) : [1],
			processorOptions: { product, binary }
		});
		this.product = product; this.bundle = bundle;
		this.values = product.parameters.map(p => p.defaultValue);
		this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
		this.port.onmessage = ({ data }) => {
			if (data.type == "ready") this.resolveReady();
			else if (data.type == "free") { this.disconnect(); this.resolveFree?.(); this.port.close(); }
			else if (data.type == "error") this.fail(Error(data.message));
			else {
				if (data.type == "parameter") this.values[data.index] = data.value;
				this.dispatchEvent(new CustomEvent(data.type, { detail: data }));
			}
		};
		this.addEventListener("processorerror", () => this.fail(Error("Audio processor failed")));
	}
	fail(error) {
		this.failure = error;
		this.rejectReady(error); this.rejectFree?.(error);
		this.dispatchEvent(new CustomEvent("error", { detail: error }));
	}
	set_parameter(index, value) {
		if (this.disposed) throw Error("Plugin is disposed");
		if (this.product.parameters[index]?.direction != "input" || !Number.isFinite(value)) throw Error("Invalid input parameter");
		this.values[index] = value;
		this.port.postMessage({ type: "parameter", index, value });
		this.dispatchEvent(new CustomEvent("parameter", { detail: { index, value } }));
	}
	set_parameter_begin(index, value) {
		this.set_parameter(index, value);
		this.dispatchEvent(new CustomEvent("gesture", { detail: { phase: "begin", index, value } }));
	}
	set_parameter_end(index, value) {
		this.set_parameter(index, value);
		this.dispatchEvent(new CustomEvent("gesture", { detail: { phase: "end", index, value } }));
	}
	msg_write(data) {
		if (this.disposed) throw Error("Plugin is disposed");
		if (!(data instanceof Uint8Array) || !this.product.messaging?.uiToDspSize || data.byteLength > this.product.messaging.uiToDspSize) throw Error("Invalid UI message");
		this.port.postMessage({ type: "message", data });
	}
	midi_msg_in(bus, data) {
		if (this.disposed) throw Error("Plugin is disposed");
		if (this.product.buses[bus]?.type != "midi" || this.product.buses[bus]?.direction != "input" || data.length != 3) throw Error("Invalid MIDI input");
		this.port.postMessage({ type: "midi", bus, data });
	}
	set_transport(transport) {
		if (this.disposed) throw Error("Plugin is disposed");
		this.port.postMessage({ type: "transport", transport });
	}
	async mount(element, { generic = false } = {}) {
		if (this.disposed) throw Error("Plugin is disposed");
		let create = createGeneric;
		if (!generic && this.product.ui?.web)
			({ create } = await import(new URL(this.product.ui.web, this.bundle)));
		const callbacks = { product: this.product };
		for (const key of ["set_parameter_begin", "set_parameter", "set_parameter_end", "msg_write"])
			callbacks[key] = this[key].bind(this);
		const ui = await create(element, callbacks);
		if (!ui || typeof ui.free != "function") throw Error("UI create must return an object with free()");
		if (this.disposed) { ui.free(); throw Error("Plugin is disposed"); }
		const parameter = e => ui.set_parameter?.(e.detail.index, e.detail.value);
		const message = e => ui.msg_in?.(e.detail.data);
		this.addEventListener("parameter", parameter); this.addEventListener("message", message);
		const free = () => {
			this.removeEventListener("parameter", parameter); this.removeEventListener("message", message);
			if (this.views.delete(free)) ui.free();
		};
		this.views.add(free);
		try { this.values.forEach((value, index) => ui.set_parameter?.(index, value)); }
		catch (error) { free(); throw error; }
		return { free };
	}
	views = new Set();
	dispose() {
		if (this.disposed) return this.disposed;
		for (const free of this.views) free();
		if (this.failure) {
			this.disconnect(); this.port.close();
			return this.disposed = Promise.resolve();
		}
		this.disposed = new Promise((resolve, reject) => { this.resolveFree = resolve; this.rejectFree = reject; });
		this.port.postMessage({ type: "free" });
		return this.disposed;
	}
}
