// Browser integration tests. Run test/run_perone.sh first. GPL-3.0-or-later.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require(process.env.PERONE_PLAYWRIGHT || "playwright");

async function main() {
	const root = path.resolve(__dirname, ".."), work = fs.mkdtempSync(path.join(os.tmpdir(), "perone-ui-"));
	let browser, server;
	try {
		const product = path.join(root, "test/product.json") + "," + path.join(root, "test/company.json");
		for (const template of ["api", "perone", "perone-make"])
			execFileSync(path.join(root, "tibia"), [product, path.join(root, "templates", template), template == "api" ? path.join(work, "src") : work, 'product.ui.web="ui/index.js"']);
		// WEB omits the shared plugin's stdio messages; echo explicitly to exercise the browser return path.
		const plugin = fs.readFileSync(path.join(root, "test/plugin.h"), "utf8").replace(
			"static void plugin_msg_in(plugin *instance, size_t size, const void * data) {",
			"static void plugin_msg_in(plugin *instance, size_t size, const void * data) {\n\tinstance->msg_write(instance->handle, size, data);");
		fs.writeFileSync(path.join(work, "src/plugin.h"), plugin);
		fs.mkdirSync(path.join(work, "custom"));
		fs.copyFileSync(path.join(root, "test/perone_web_ui.js"), path.join(work, "custom/index.js"));
		execFileSync("make", ["-s", "-C", work, "all", "ui-web", "PERONE_PLATFORM=wasm32", "CPPFLAGS=-DWEB",
			"CFLAGS=-O2 -Wall -Wextra -Werror -Wno-unused-parameter", "UI_WEB_DIR=" + path.join(work, "custom")]);
		const bundle = path.join(work, "build/tibia-test.perone");
		server = http.createServer((request, response) => {
			let name = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
			if (name == "/favicon.ico") { response.writeHead(204).end(); return; }
			const base = name.startsWith("/custom/") ? bundle : root;
			if (base == bundle) name = name.slice(7);
			const file = path.resolve(base, "." + name);
			if (!file.startsWith(base + path.sep)) { response.writeHead(403).end(); return; }
			try {
				const data = fs.readFileSync(file);
				response.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".wasm": "application/wasm" })[path.extname(file)] || "application/octet-stream");
				response.end(data);
			} catch { response.writeHead(404).end(); }
		});
		await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
		const origin = "http://127.0.0.1:" + server.address().port;
		browser = await chromium.launch({ headless: true, ...(process.env.PERONE_CHROMIUM ? { executablePath: process.env.PERONE_CHROMIUM } : {}) });
		const wave = Buffer.alloc(44 + 48000 * 2);
		wave.write("RIFF"); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8); wave.writeUInt32LE(16, 16);
		wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(48000, 24); wave.writeUInt32LE(96000, 28);
		wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write("data", 36); wave.writeUInt32LE(96000, 40);
		for (let i = 44; i < wave.length; i += 2) wave.writeInt16LE(3277, i);
		for (const variant of ["c", "cxx"]) {
			const page = await browser.newPage(), errors = [];
			page.on("pageerror", error => errors.push(error.message));
			await page.goto(origin + "/out/perone/web/index.html?bundle=../" + variant + "/build/tibia-test.perone/");
			await page.evaluate(async () => {
				const { PeroneNode } = await import("./perone.js");
				const dispatch = PeroneNode.prototype.dispatchEvent;
				window.gestures = [];
				PeroneNode.prototype.dispatchEvent = function (event) {
					if (event.type == "gesture") window.gestures.push(event.detail.phase);
					return dispatch.call(this, event);
				};
			});
			await page.locator("#audio").setInputFiles({ name: "constant.wav", mimeType: "audio/wav", buffer: wave });
			await page.locator("#start").click();
			await page.waitForFunction(() => document.querySelector("#status").textContent == "Playing.");
			assert.equal(await page.locator("#controls label").count(), 6);
			await page.waitForFunction(() => document.querySelector("#controls meter").value > .09);
			await page.locator('#controls input[type="range"]').first().evaluate(control => {
				control.value = .875;
				control.dispatchEvent(new Event("input", { bubbles: true }));
				control.dispatchEvent(new Event("change", { bubbles: true }));
			});
			await page.waitForFunction(() => document.querySelector("#controls meter").value > .29);
			await page.locator("#controls select").selectOption("1");
			await page.waitForFunction(() => document.querySelector("#controls meter").value < .11);
			// Closing during a gesture must send its end and still dispose the DSP.
			await page.locator('#controls input[type="range"]').first().dispatchEvent("pointerdown");
			await page.evaluate(() => document.querySelector("#stop").click());
			await page.waitForFunction(() => document.querySelector("#status").textContent == "Stopped.");
			assert.equal(await page.locator("#controls label").count(), 0);
			assert.deepEqual(await page.evaluate(() => window.gestures), ["begin", "end", "begin", "end", "begin", "end"]);
			assert.deepEqual(errors, []);
			await page.close();
			console.log("OK: browser generic UI, gain/bypass, meters and gesture lifecycle", variant);
		}
		const page = await browser.newPage(), errors = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.goto(origin + "/out/perone/web/index.html");
		await page.locator("h1").click();
		await page.evaluate(async () => {
			const { PeroneNode } = await import("./perone.js");
			const context = new AudioContext(); await context.resume();
			const node = await PeroneNode.create(context, "/custom/");
			node.connect(context.destination); await node.ready;
			const custom = document.createElement("section"), generic = document.createElement("section");
			document.body.append(custom, generic);
			const view = await node.mount(custom);
			await node.mount(generic, { generic: true });
			node.set_parameter(0, 7);
			window.testHost = { context, node, view };
		});
		await page.waitForFunction(() => document.querySelector(".custom-ui").dataset.gain == "7");
		await page.getByRole("button", { name: "Zero gain" }).click();
		await page.waitForFunction(() => document.querySelector(".custom-ui").dataset.gain == "0");
		await page.getByRole("button", { name: "Reset counter" }).click();
		await page.waitForFunction(() => document.querySelector(".custom-ui output").textContent == "reset");
		await page.evaluate(async () => {
			testHost.view.free(); testHost.node.set_parameter(0, 3);
			await Promise.all([testHost.node.dispose(), testHost.node.dispose()]); await testHost.context.close();
		});
		assert.equal(await page.locator(".custom-ui, .perone-controls").count(), 0);
		fs.writeFileSync(path.join(bundle, "wasm32/tibia-test.wasm"), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
		assert(await page.evaluate(async () => {
			const { PeroneNode } = await import("./perone.js");
			const context = new AudioContext(); await context.resume();
			const node = await PeroneNode.create(context, "/custom/"); node.connect(context.destination);
			let rejected = false;
			try { await node.ready; } catch { rejected = true; }
			await node.dispose(); await context.close();
			return rejected;
		}));
		assert.deepEqual(errors, []);
		await page.close();
		console.log("OK: bundled custom UI, forced generic UI, bidirectional messages, independent views and failed DSP cleanup");
	} finally {
		if (browser) await browser.close();
		if (server) await new Promise(resolve => server.close(resolve));
		fs.rmSync(work, { recursive: true, force: true });
	}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
