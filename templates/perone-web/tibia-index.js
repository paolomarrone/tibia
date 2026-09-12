// Optional Perone browser host. GPL-3.0-or-later.
module.exports = function (data, api) {
	for (const file of ["index.html", "perone.js", "processor.js", "wasm.js", "ui.js"])
		api.copyFile(file, file);
};
