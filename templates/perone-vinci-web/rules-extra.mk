# Package the reusable browser adapter beside the Wasm UI. GPL-3.0-or-later.
ifeq ($(PERONE_PLATFORM), wasm32)
ui: $(BUILD_DATA_DIR)/ui/index.js $(BUILD_DATA_DIR)/ui/vinci-web.js
$(BUILD_DATA_DIR)/ui/index.js: $(COMMON_DIR)/src/ui/index.js
	mkdir -p $(dir $@)
	cp $< $@
$(BUILD_DATA_DIR)/ui/vinci-web.js: $(VINCI_DIR)/vinci-web.js
	mkdir -p $(dir $@)
	cp $< $@
endif
