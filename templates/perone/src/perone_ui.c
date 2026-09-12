/* Tibia Perone UI wrapper (X11). GPL-3.0-or-later. */
#include <stdlib.h>
#include "perone_ui.h"
#include "data.h"
#include "plugin_api.h"
#ifdef HAS_PLUGIN_UI_CXX_H
#include "plugin_ui_cxx.h"
#else
#include "plugin_ui.h"
#endif

static void *create(uint32_t window_api, char has_parent, void *parent, const perone_ui_callbacks *callbacks) {
	if (window_api != PERONE_UI_X11) return NULL;
	plugin_ui_callbacks cbs = {
		callbacks->handle, "perone", callbacks->get_bindir, callbacks->get_datadir,
#if PERONE_HAS_INPUT
		callbacks->set_parameter_begin, callbacks->set_parameter, callbacks->set_parameter_end,
#endif
#if PERONE_HAS_MSG_IN
		callbacks->msg_write
#endif
	};
	return plugin_ui_create(has_parent, parent, &cbs);
}

static void release(void *p) { plugin_ui_free((plugin_ui *)p); }
static void idle(void *p) { plugin_ui_idle((plugin_ui *)p); }
static void *get_widget(void *p) { return ((plugin_ui *)p)->widget; }
#if PERONE_HAS_INPUT || PERONE_HAS_OUTPUT
static void set_parameter(void *p, size_t index, float value) { plugin_ui_set_parameter((plugin_ui *)p, index, value); }
#endif
#if PERONE_HAS_MSG_OUT
static void msg_in(void *p, size_t size, const void *data) { plugin_ui_msg_in((plugin_ui *)p, size, data); }
#endif

#ifdef __cplusplus
extern "C"
#endif
__attribute__((visibility("default")))
const perone_ui_api *perone_ui_get_api(uint32_t version) {
	static const perone_ui_api api = {
		plugin_ui_get_default_size, create, release, idle,
#if PERONE_HAS_INPUT || PERONE_HAS_OUTPUT
		set_parameter,
#else
		NULL,
#endif
#if PERONE_HAS_MSG_OUT
		msg_in,
#else
		NULL,
#endif
		get_widget
	};
	return version == PERONE_UI_ABI_VERSION ? &api : NULL;
}
