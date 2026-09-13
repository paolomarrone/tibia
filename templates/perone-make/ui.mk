# Optional Perone UI builds. GPL-3.0-or-later.
UI_PLUGIN_DIR ?= $(PLUGIN_DIR)
UI_PLUGIN := $(firstword $(wildcard $(UI_PLUGIN_DIR)/plugin_ui_cxx.h $(UI_PLUGIN_DIR)/plugin_ui.h))
UI_OBJ_DIR := $(BUILD_OBJ_DIR)/$(PERONE_PLATFORM)-ui
UI_OBJS := $(addprefix $(UI_OBJ_DIR)/,$(notdir $(UI_C_SRCS_EXTRA:.c=.o) $(UI_CXX_SRCS_EXTRA:.cpp=.o)))
UI_INCLUDES = -I$(UI_PLUGIN_DIR) $(INCLUDES)
ifeq ($(PERONE_PLATFORM), wasm32)
UI_BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME)-ui.wasm
UI_TARGET_LDFLAGS = $(subst perone_get_api,perone_ui_get_api,$(TARGET_LDFLAGS))
UI_WASM_OBJS := $(UI_OBJ_DIR)/walloc.o $(UI_OBJ_DIR)/string.o
ifneq ($(filter %/plugin_ui_cxx.h,$(UI_PLUGIN))$(UI_CXX_SRCS_EXTRA),)
UI_WASM_OBJS += $(UI_OBJ_DIR)/new.o
endif
else
UI_BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME)-ui.so
UI_TARGET_LDFLAGS := -shared -Wl,-z,defs
endif
.PHONY: ui ui-web
ifneq ($(filter %-linux wasm32,$(PERONE_PLATFORM)),)
ifneq ($(UI_PLUGIN),)
ui: $(UI_BINARY) $(BUILD_DATA_DIR)/product.json
$(UI_BINARY): $(COMMON_DIR)/src/perone_ui.c $(COMMON_DIR)/src/perone_ui.h $(DATA_DIR)/src/data.h $(API_DIR)/plugin_api.h $(UI_PLUGIN) $(UI_OBJS) $(UI_WASM_OBJS) $(MAKEFILE_LIST)
	mkdir -p $(dir $@) $(UI_OBJ_DIR)
ifneq ($(filter %/plugin_ui_cxx.h,$(UI_PLUGIN)),)
	$(CXX) -x c++ $(CPPFLAGS) $(CXXFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) -DHAS_PLUGIN_UI_CXX_H $(TARGET_FLAGS) $(TARGET_CXXFLAGS) -fvisibility=hidden -MMD -MP -MF $(UI_OBJ_DIR)/ui.d -MT $@ $< -x none $(UI_OBJS) $(UI_WASM_OBJS) $(UI_TARGET_LDFLAGS) $(UI_LDFLAGS) $(UI_LDLIBS) $(TARGET_LIBS) -o $@
else
	$(if $(UI_CXX_SRCS_EXTRA),$(CXX) -x c,$(CC)) $(CPPFLAGS) $(CFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) $(TARGET_FLAGS) -fvisibility=hidden -MMD -MP -MF $(UI_OBJ_DIR)/ui.d -MT $@ $< -x none $(UI_OBJS) $(UI_WASM_OBJS) $(UI_TARGET_LDFLAGS) $(UI_LDFLAGS) $(UI_LDLIBS) $(TARGET_LIBS) -o $@
endif
else
ui:
	$(error No plugin_ui.h or plugin_ui_cxx.h in UI_PLUGIN_DIR)
endif
else
ui:
	$(error Perone UI currently supports X11 on Linux and wasm32)
endif
define UI_C_RULE
$(UI_OBJ_DIR)/$(notdir $(1:.c=.o)): $(1) $(MAKEFILE_LIST)
	mkdir -p $$(dir $$@)
	$(CC) $(CPPFLAGS) $(CFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) $(TARGET_FLAGS) -fvisibility=hidden -MMD -MP -c $$< -o $$@
endef
define UI_CXX_RULE
$(UI_OBJ_DIR)/$(notdir $(1:.cpp=.o)): $(1) $(MAKEFILE_LIST)
	mkdir -p $$(dir $$@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) $(TARGET_FLAGS) $(TARGET_CXXFLAGS) -fvisibility=hidden -MMD -MP -c $$< -o $$@
endef
$(foreach src,$(UI_C_SRCS_EXTRA),$(eval $(call UI_C_RULE,$(src))))
$(foreach src,$(UI_CXX_SRCS_EXTRA),$(eval $(call UI_CXX_RULE,$(src))))
ifeq ($(PERONE_PLATFORM), wasm32)
$(UI_OBJ_DIR)/%.o: $(COMMON_DIR)/src/wasm/%.c $(MAKEFILE_LIST)
	mkdir -p $(dir $@)
	$(CC) $(CPPFLAGS) $(CFLAGS) $(TARGET_FLAGS) -fvisibility=hidden -MMD -MP -c $< -o $@
$(UI_OBJ_DIR)/new.o: $(COMMON_DIR)/src/wasm/new.cpp $(MAKEFILE_LIST)
	mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(TARGET_FLAGS) $(TARGET_CXXFLAGS) -fvisibility=hidden -MMD -MP -c $< -o $@
endif
-include $(UI_OBJ_DIR)/ui.d $(UI_OBJS:.o=.d) $(UI_WASM_OBJS:.o=.d)

# UI_WEB_DIR is a dedicated source directory, copied to the bundle's ui/.
ui-web: $(BUILD_DATA_DIR)/product.json
	test -n "$(UI_WEB_DIR)" && test -d "$(UI_WEB_DIR)"
	mkdir -p $(BUILD_DATA_DIR)/ui
	cp -R $(UI_WEB_DIR)/. $(BUILD_DATA_DIR)/ui/
