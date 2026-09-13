# Vinci is an optional UI dependency. GPL-3.0-or-later.
ifeq ($(PERONE_PLATFORM), wasm32)
UI_CPPFLAGS += -I$(VINCI_DIR)
UI_C_SRCS_EXTRA += $(VINCI_DIR)/vinci-web.c
UI_LDFLAGS += $(foreach name,vinci_idle vinci_destroy window_free window_resize window_move,-Wl,--export=$(name))
endif
