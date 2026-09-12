// Example custom UI using the same callbacks as a native Perone UI. GPL-3.0-or-later.
export function create(element, callbacks) {
	const root = document.createElement("div");
	root.className = "custom-ui";
	const gain = document.createElement("button"), reset = document.createElement("button"), message = document.createElement("output");
	gain.textContent = "Zero gain"; reset.textContent = "Reset counter";
	const index = callbacks.product.parameters.findIndex(p => p.id == "gain");
	gain.onclick = () => {
		callbacks.set_parameter_begin(index, 0);
		callbacks.set_parameter(index, 0);
		callbacks.set_parameter_end(index, 0);
	};
	reset.onclick = () => callbacks.msg_write(new TextEncoder().encode("reset"));
	root.append(gain, reset, message); element.append(root);
	return {
		set_parameter(i, value) { if (i == index) root.dataset.gain = value; },
		msg_in(data) { message.textContent = new TextDecoder().decode(data); },
		free() { root.remove(); }
	};
}
