/* Tibia Perone wrapper. GPL-3.0-or-later. */
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200112L
#endif
#ifdef __wasm__
#include "wasm/walloc.h"
#else
#include <stdlib.h>
#include <math.h>
#endif
#include "perone.h"
#include "data.h"
#include "plugin_api.h"
#if !PERONE_HAS_STATE
#undef PLUGIN_HAS_STATE
#endif
#ifdef HAS_PLUGIN_CXX_H
#include "plugin_cxx.h"
#else
#include "plugin.h"
#endif

static void *alloc(void) {
	size_t align = __alignof__(plugin);
	if (align < sizeof(void *)) align = sizeof(void *);
#ifdef __wasm__
	if (sizeof(plugin) > SIZE_MAX - sizeof(void *) - (align - 1)) return NULL;
	void *mem = malloc(sizeof(plugin) + sizeof(void *) + align - 1);
	if (!mem) return NULL;
	void *p = (void *)(((uintptr_t)mem + sizeof(void *) + align - 1) & ~(uintptr_t)(align - 1));
	((void **)p)[-1] = mem;
	return p;
#else
	void *p;
	return posix_memalign(&p, align, sizeof(plugin)) ? NULL : p;
#endif
}

static void release(void *p) {
#ifdef __wasm__
	if (p) free(((void **)p)[-1]);
#else
	free(p);
#endif
}

static int init(void *p, const perone_callbacks *callbacks) {
	plugin_callbacks cbs = {
		callbacks->handle, "perone", callbacks->get_bindir, callbacks->get_datadir,
#if PERONE_HAS_MSG_OUT
		callbacks->msg_write
#endif
	};
	return plugin_init((plugin *)p, &cbs);
}

static void fini(void *p) { plugin_fini((plugin *)p); }
static void set_sample_rate(void *p, float rate) { plugin_set_sample_rate((plugin *)p, rate); }
static size_t mem_req(void *p) { return plugin_mem_req((plugin *)p); }
static void mem_set(void *p, void *mem) { plugin_mem_set((plugin *)p, mem); }
static void reset(void *p) { plugin_reset((plugin *)p); }
static void process(void *p, const float **in, float **out, size_t n) { plugin_process((plugin *)p, in, out, n); }
#if PERONE_HAS_INPUT
static void set_parameter(void *p, size_t index, float value) { plugin_set_parameter((plugin *)p, index, value); }
#endif
#if PERONE_HAS_OUTPUT
static float get_parameter(void *p, size_t index) { return plugin_get_parameter((plugin *)p, index); }
#endif
#if PERONE_HAS_MIDI
static void midi_msg_in(void *p, size_t bus, const uint8_t *data) { plugin_midi_msg_in((plugin *)p, bus, data); }
#endif
#if PERONE_HAS_MSG_IN
static void msg_in(void *p, size_t size, const void *data) { plugin_msg_in((plugin *)p, size, data); }
#endif

#if PERONE_HAS_TRANSPORT
static void set_transport(void *p, const perone_transport *transport) {
	plugin_transport t = {
		transport->changed, transport->valid, transport->playing, transport->speed,
		transport->bpm, transport->quarter, transport->beat, transport->time_sig_num,
		transport->time_sig_denom, transport->bar, transport->bar_beat
	};
	plugin_set_transport((plugin *)p, &t);
}
#endif

#if PERONE_HAS_STATE
static plugin_state_callbacks state_callbacks(const perone_state_callbacks *callbacks) {
	plugin_state_callbacks cbs = {
		callbacks->handle, callbacks->lock, callbacks->unlock, callbacks->write,
#if PERONE_HAS_INPUT
		callbacks->set_parameter
#endif
	};
	return cbs;
}

static int state_save(void *p, const perone_state_callbacks *callbacks, float rate) {
	plugin_state_callbacks cbs = state_callbacks(callbacks);
	return plugin_state_save((plugin *)p, &cbs, rate);
}

static int state_load(const perone_state_callbacks *callbacks, float rate, const char *data, size_t length) {
	plugin_state_callbacks cbs = state_callbacks(callbacks);
	return plugin_state_load(&cbs, rate, data, length);
}
#endif

#ifdef __cplusplus
extern "C"
#endif
__attribute__((visibility("default")))
const perone_api *perone_get_api(uint32_t version) {
	(void)plugin_set_parameter;
	(void)plugin_get_parameter;
	static const perone_api api = {
		alloc, release, init, fini, set_sample_rate, mem_req, mem_set, reset, process,
#if PERONE_HAS_INPUT
		set_parameter,
#else
		NULL,
#endif
#if PERONE_HAS_OUTPUT
		get_parameter,
#else
		NULL,
#endif
#if PERONE_HAS_MIDI
		midi_msg_in,
#else
		NULL,
#endif
#if PERONE_HAS_TRANSPORT
		set_transport,
#else
		NULL,
#endif
#if PERONE_HAS_MSG_IN
		msg_in,
#else
		NULL,
#endif
#if PERONE_HAS_STATE
		state_save, state_load
#else
		NULL, NULL
#endif
	};
	return version == PERONE_ABI_VERSION ? &api : NULL;
}
