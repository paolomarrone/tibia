# Optional Perone UI builds. GPL-3.0-or-later.
UI_PLUGIN_DIR ?= $(PLUGIN_DIR)
UI_PLUGIN := $(firstword $(wildcard $(UI_PLUGIN_DIR)/plugin_ui_cxx.h $(UI_PLUGIN_DIR)/plugin_ui.h))
UI_BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME)-ui.so
UI_OBJ_DIR := $(BUILD_OBJ_DIR)/$(PERONE_PLATFORM)-ui
UI_OBJS := $(addprefix $(UI_OBJ_DIR)/,$(notdir $(UI_C_SRCS_EXTRA:.c=.o) $(UI_CXX_SRCS_EXTRA:.cpp=.o)))
UI_INCLUDES = -I$(UI_PLUGIN_DIR) $(INCLUDES)
.PHONY: ui ui-web
ifneq ($(filter %-linux,$(PERONE_PLATFORM)),)
ifneq ($(UI_PLUGIN),)
ui: $(UI_BINARY) $(BUILD_DATA_DIR)/product.json
$(UI_BINARY): $(COMMON_DIR)/src/perone_ui.c $(COMMON_DIR)/src/perone_ui.h $(DATA_DIR)/src/data.h $(API_DIR)/plugin_api.h $(UI_PLUGIN) $(UI_OBJS) $(MAKEFILE_LIST)
	mkdir -p $(dir $@) $(UI_OBJ_DIR)
ifneq ($(filter %/plugin_ui_cxx.h,$(UI_PLUGIN)),)
	$(CXX) -x c++ $(CPPFLAGS) $(CXXFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) -DHAS_PLUGIN_UI_CXX_H -fPIC -fvisibility=hidden -MMD -MP -MF $(UI_OBJ_DIR)/ui.d -MT $@ $< -x none $(UI_OBJS) -shared -Wl,-z,defs $(UI_LDFLAGS) $(UI_LDLIBS) -lm -o $@
else
	$(if $(UI_CXX_SRCS_EXTRA),$(CXX) -x c,$(CC)) $(CPPFLAGS) $(CFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) -fPIC -fvisibility=hidden -MMD -MP -MF $(UI_OBJ_DIR)/ui.d -MT $@ $< -x none $(UI_OBJS) -shared -Wl,-z,defs $(UI_LDFLAGS) $(UI_LDLIBS) -lm -o $@
endif
else
ui:
	$(error No plugin_ui.h or plugin_ui_cxx.h in UI_PLUGIN_DIR)
endif
else
ui:
	$(error Native Perone UI currently supports X11 on Linux; use ui-web for browser assets)
endif
define UI_C_RULE
$(UI_OBJ_DIR)/$(notdir $(1:.c=.o)): $(1) $(MAKEFILE_LIST)
	mkdir -p $$(dir $$@)
	$(CC) $(CPPFLAGS) $(CFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) -fPIC -fvisibility=hidden -MMD -MP -c $$< -o $$@
endef
define UI_CXX_RULE
$(UI_OBJ_DIR)/$(notdir $(1:.cpp=.o)): $(1) $(MAKEFILE_LIST)
	mkdir -p $$(dir $$@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(UI_CPPFLAGS) $(UI_INCLUDES) -fPIC -fvisibility=hidden -MMD -MP -c $$< -o $$@
endef
$(foreach src,$(UI_C_SRCS_EXTRA),$(eval $(call UI_C_RULE,$(src))))
$(foreach src,$(UI_CXX_SRCS_EXTRA),$(eval $(call UI_CXX_RULE,$(src))))
-include $(UI_OBJ_DIR)/ui.d $(UI_OBJS:.o=.d)

# UI_WEB_DIR is a dedicated source directory, copied to the bundle's ui/.
ui-web: $(BUILD_DATA_DIR)/product.json
	test -n "$(UI_WEB_DIR)" && test -d "$(UI_WEB_DIR)"
	mkdir -p $(BUILD_DATA_DIR)/ui
	cp -R $(UI_WEB_DIR)/. $(BUILD_DATA_DIR)/ui/
