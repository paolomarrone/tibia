// Run test/run_perone_ui_web.sh first. GPL-3.0-or-later.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.PERONE_PLAYWRIGHT || "playwright");

async function main() {
	const root = path.resolve(__dirname, "..");
	const server = http.createServer((request, response) => {
		const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
		if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
		try {
			response.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".wasm": "application/wasm" })[path.extname(file)] || "application/octet-stream");
			response.end(fs.readFileSync(file));
		} catch { response.writeHead(404).end(); }
	});
	let browser;
	try {
		await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
		const origin = "http://127.0.0.1:" + server.address().port;
		browser = await chromium.launch({ headless: true, ...(process.env.PERONE_CHROMIUM ? { executablePath: process.env.PERONE_CHROMIUM } : {}) });
		for (const variant of ["c", "cxx"]) {
			const bundle = "/out/perone/ui/" + variant + "/build/tibia-test.perone/";
			const dsp = new WebAssembly.Module(fs.readFileSync(root + bundle + "wasm32/tibia-test.wasm"));
			const ui = new WebAssembly.Module(fs.readFileSync(root + bundle + "wasm32/tibia-test-ui.wasm"));
			assert.deepEqual(WebAssembly.Module.imports(dsp), []);
			assert(WebAssembly.Module.imports(ui).length && WebAssembly.Module.imports(ui).every(i => i.module == "vinci_web"));
			assert(!WebAssembly.Module.exports(dsp).some(e => e.name == "perone_ui_get_api"));
			assert(!WebAssembly.Module.exports(ui).some(e => e.name == "perone_get_api"));
			const page = await browser.newPage(), errors = [];
			page.on("pageerror", error => errors.push(error.message));
			await page.goto(origin + "/out/perone/web/index.html");
			await page.locator("h1").click();
			await page.evaluate(async bundle => {
				const { VinciWeb } = await import(bundle + "ui/vinci-web.js");
				const bind = VinciWeb.prototype.bind;
				window.adapters = [];
				VinciWeb.prototype.bind = function (instance) { bind.call(this, instance); adapters.push(this); return this; };
				const { PeroneNode } = await import("./perone.js");
				const context = new AudioContext(); await context.resume();
				const node = await PeroneNode.create(context, bundle);
				node.connect(context.destination); await node.ready;
				const source = new ConstantSourceNode(context, { offset: .1 }); source.connect(node); source.start();
				const gestures = [], messages = [], sent = [];
				node.addEventListener("gesture", e => gestures.push(e.detail.phase));
				node.addEventListener("message", e => messages.push(Number(new TextDecoder().decode(e.detail.data))));
				const write = node.msg_write.bind(node);
				node.msg_write = data => { sent.push(new TextDecoder().decode(data)); messages.length = 0; write(data); };
				for (const id of ["first", "second", "generic"]) {
					const element = document.createElement("div"); element.id = id; document.body.append(element);
				}
				const first = await node.mount(document.querySelector("#first"));
				const second = await node.mount(document.querySelector("#second"));
				await node.mount(document.querySelector("#generic"), { generic: true });
				window.host = { context, node, source, first, second, gestures, messages, sent };
				window.pixel = (id, x, y) => Array.from(document.querySelector("#" + id + " canvas").getContext("2d").getImageData(x, y, 1, 1).data);
			}, bundle);
			await page.waitForFunction(() => host.node.values[5] > .09 && pixel("first", 5, 5)[0] == 255);
			assert.equal(await page.locator("canvas").count(), 2);
			assert.deepEqual(await page.evaluate(() => pixel("first", 5, 5)), [255, 153, 153, 255]);
			assert.deepEqual(await page.evaluate(() => pixel("first", 400, 65)), [103, 137, 171, 255]);
			assert.deepEqual(await page.evaluate(() => pixel("first", 450, 65)), [18, 35, 188, 255]);
			assert(await page.evaluate(() => {
				const w = adapters[0].wasm, ptr = w.perone_ui_get_api(1);
				const create = w.__indirect_function_table.get(new Uint32Array(w.memory.buffer, ptr, 7)[1]);
				return ptr && !w.perone_ui_get_api(0) && !w.perone_ui_get_api(2) && !create(1, 0, 0, 0);
			}));
			const canvas = page.locator("#first canvas");
			await canvas.scrollIntoViewIfNeeded();
			const rect = await canvas.boundingBox();
			await page.mouse.move(rect.x + 120, rect.y + 65);
			await page.mouse.down();
			await page.mouse.move(rect.x + 480, rect.y + 65);
			await page.mouse.up();
			await page.waitForFunction(() => Math.abs(host.node.values[0] - 10) < .01 && host.node.values[5] > .29 && pixel("second", 450, 65)[0] == 103);
			assert.deepEqual(await page.evaluate(() => host.gestures), ["begin", "end"]);
			await canvas.click({ position: { x: 300, y: 438 } });
			await page.waitForFunction(() => host.node.values[4] == 1 && host.node.values[5] < .11);
			await page.waitForFunction(() => host.messages.at(-1) > .5 && pixel("first", 510, 438).slice(0, 3).some(x => x > 0));
			await canvas.click({ position: { x: 510, y: 438 } });
			await page.waitForFunction(() => host.sent.length && host.messages.length);
			assert.equal(await page.evaluate(() => host.sent[0]), "reset");
			assert(await page.evaluate(() => host.messages.some(value => value < .2)));
			await page.evaluate(() => {
				adapters[0].wasm.memory.grow(2);
				host.node.set_parameter(0, -20);
				const c = document.querySelector("#first canvas"); c.style.width = "720px"; c.style.height = "480px";
			});
			await page.waitForFunction(() => document.querySelector("#first canvas").width == 720 && document.querySelector("#first canvas").height == 480);
			assert.deepEqual(await page.evaluate(() => pixel("first", 5, 5)), [255, 153, 153, 255]);
			await page.evaluate(() => { const c = document.querySelector("#first canvas"); c.style.width = "600px"; c.style.height = "600px"; });
			await page.waitForFunction(() => document.querySelector("#first canvas").width == 600);
			// Closing from a begin listener must wait until the C event callback has returned.
			await page.evaluate(() => {
				host.node.addEventListener("gesture", function close(e) {
					if (e.detail.phase != "begin") return;
					host.node.removeEventListener("gesture", close); host.first.free(); host.first.free();
				});
			});
			await canvas.click({ position: { x: 180, y: 65 } });
			await page.waitForFunction(() => !document.querySelector("#first canvas"));
			assert.deepEqual(await page.evaluate(() => host.gestures), ["begin", "end", "begin", "end"]);
			assert(await page.evaluate(() => !adapters[0].contexts.size && !adapters[0].windows.size && !adapters[0].parents.size));
			await page.evaluate(() => host.node.set_parameter(0, 0));
			await page.waitForFunction(() => pixel("second", 400, 65)[0] == 103);
			// A failed module must clean up and allow a later successful mount.
			await page.route("**/wasm32/tibia-test-ui.wasm", route => route.fulfill({ contentType: "application/wasm", body: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]) }));
			assert(await page.evaluate(async () => {
				try { await host.node.mount(document.querySelector("#first")); return false; } catch { return !document.querySelector("#first canvas"); }
			}));
			await page.unroute("**/wasm32/tibia-test-ui.wasm");
			await page.evaluate(async () => {
				await host.node.mount(document.querySelector("#first"));
				host.source.stop();
				await Promise.all([host.node.dispose(), host.node.dispose()]); await host.context.close();
			});
			assert.equal(await page.locator("canvas, .perone-controls").count(), 0);
			assert(await page.evaluate(() => adapters.every(a => !a.contexts.size && !a.windows.size && !a.parents.size)));
			assert.deepEqual(errors, []);
			await page.close();
			console.log("OK: original Vinci UI pixels, audio, gestures, messages, resize, memory growth, multiple views and lifecycle", variant);
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
