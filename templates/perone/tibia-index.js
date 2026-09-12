// Tibia Perone target. GPL-3.0-or-later.
module.exports = function (data, api, outputCommon, outputData) {
	if (outputData && data.product.buses.some(b => b.type == "midi" && b.direction == "output"))
		throw new Error("perone: the source API has no MIDI output callback");
	api.copyFile("perone.h", "src/perone.h");
	api.copyFile("src/perone.c", "src/perone.c");
	api.copyFile("perone_ui.h", "src/perone_ui.h");
	api.copyFile("src/perone_ui.c", "src/perone_ui.c");
	for (const file of ["walloc.h", "walloc.c", "string.h", "string.c", "new", "new.cpp"])
		api.copyFile("../web/src/" + file, "src/wasm/" + file);
	api.generateFileFromTemplateFile("src/data.h", "src/data.h", data);
	api.generateFileFromTemplateFile("product.json", "product.json", data);
};
