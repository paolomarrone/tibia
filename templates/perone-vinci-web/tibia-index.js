// Optional Vinci browser UI for Perone. GPL-3.0-or-later.
module.exports = function (data, api) {
	api.copyFile("index.js", "src/ui/index.js");
	api.copyFile("vars-extra.mk", "vars-extra.mk");
	api.copyFile("rules-extra.mk", "rules-extra.mk");
};
