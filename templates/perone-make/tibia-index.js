// Tibia Perone build. GPL-3.0-or-later.
module.exports = function (data, api) {
	api.copyFile("Makefile", "Makefile");
	api.copyFile("ui.mk", "ui.mk");
	api.generateFileFromTemplateFile("vars.mk", "vars.mk", data);
};
