/* Perone host for the Tibia test plugin. GPL-3.0-or-later. */
#include "perone.h"
#include <assert.h>
#include <dlfcn.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { GAIN, DELAY, CUTOFF, TREMOLO, BYPASS, METER };
typedef struct {
	const perone_api *api;
	void *instance, *mem;
	char message[1025], state[1024];
	size_t messages, state_size;
	int locked, write_result;
	unsigned restored;
	float values[5];
} host;

static void message(void *handle, size_t size, const void *data) {
	host *h = (host *)handle;
	assert(size < sizeof(h->message));
	memcpy(h->message, data, size); h->message[size] = 0; ++h->messages;
}
static void lock(void *handle) { host *h = (host *)handle; assert(!h->locked); h->locked = 1; }
static void unlock(void *handle) { host *h = (host *)handle; assert(h->locked); h->locked = 0; }
static int write_state(void *handle, const char *data, size_t size) {
	host *h = (host *)handle;
	assert(!h->locked && size <= sizeof(h->state));
	memcpy(h->state, data, size); h->state_size = size;
	return h->write_result;
}
static void restore(void *handle, size_t index, float value) {
	host *h = (host *)handle;
	assert(h->locked && index < 5);
	h->values[index] = value; h->restored |= 1u << index;
	if (h->instance) h->api->set_parameter(h->instance, index, value);
}
static void configure(host *h, float rate) {
	h->api->set_sample_rate(h->instance, rate);
	void *mem = malloc(h->api->mem_req(h->instance)); assert(mem);
	h->api->mem_set(h->instance, mem);
	free(h->mem); h->mem = mem;
	h->api->reset(h->instance);
}

int main(int argc, char **argv) {
	if (argc != 7) {
		fprintf(stderr, "Usage: %s library gain delay cutoff tremolo bypass\n", argv[0]);
		return 1;
	}
	void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
	if (!library) fprintf(stderr, "%s\n", dlerror());
	assert(library);
	const perone_api *(*get)(uint32_t) = dlsym(library, "perone_get_api"); assert(get);
	const perone_api *a = get(PERONE_ABI_VERSION);
	assert(a && a->set_transport && a->msg_in && a->state_save && a->state_load);
	host h = {0}; h.api = a; h.instance = a->alloc(); assert(h.instance);
	perone_callbacks cbs = {&h, NULL, NULL, message};
	assert(!a->init(h.instance, &cbs));
	for (size_t i = 0; i < 5; ++i) a->set_parameter(h.instance, i, strtof(argv[i + 2], NULL));
	configure(&h, 48000);
	float in[480], out[480]; const float *inputs[] = {in}; float *outputs[] = {out};
	for (size_t i = 0; i < 480; ++i) in[i] = 1;
	a->process(h.instance, inputs, outputs, 480);
	assert(fabsf(out[479] - 1) < .0001f && a->get_parameter(h.instance, METER) == out[479]);
	assert(h.messages == 1 && !strcmp(h.message, "0.01"));
	a->msg_in(h.instance, 5, "reset");
	a->process(h.instance, inputs, outputs, 0);
	assert(h.messages == 2 && !strcmp(h.message, "0.00"));

	/* Quarter, beat and bar positions must drive the same tremolo phase. */
	a->set_parameter(h.instance, TREMOLO, 100);
	perone_transport t = {0};
	t.playing = 1; t.speed = 1; t.bpm = 120; t.quarter = .25;
	t.valid = PERONE_TRANSPORT_PLAYING | PERONE_TRANSPORT_SPEED | PERONE_TRANSPORT_BPM | PERONE_TRANSPORT_QUARTER;
	t.changed = t.valid;
	a->reset(h.instance); a->set_transport(h.instance, &t); a->process(h.instance, inputs, outputs, 1);
	float first = out[0];
	t.quarter = .75;
	a->reset(h.instance); a->set_transport(h.instance, &t); a->process(h.instance, inputs, outputs, 1);
	assert(first > 0 && out[0] > 2.9f * first);
	t.valid &= ~PERONE_TRANSPORT_QUARTER;
	t.valid |= PERONE_TRANSPORT_BEAT | PERONE_TRANSPORT_TIME_SIG_DENOM;
	t.beat = .5; t.time_sig_denom = 8; t.changed = t.valid;
	a->reset(h.instance); a->set_transport(h.instance, &t); a->process(h.instance, inputs, outputs, 1);
	assert(fabsf(out[0] - first) < .0001f);
	t.valid &= ~PERONE_TRANSPORT_BEAT;
	t.valid |= PERONE_TRANSPORT_TIME_SIG_NUM | PERONE_TRANSPORT_BAR | PERONE_TRANSPORT_BAR_BEAT;
	t.time_sig_num = 4; t.bar = 2; t.bar_beat = .5f; t.changed = t.valid;
	a->reset(h.instance); a->set_transport(h.instance, &t); a->process(h.instance, inputs, outputs, 1);
	assert(fabsf(out[0] - first) < .0001f);

	a->set_parameter(h.instance, TREMOLO, 0);
	a->reset(h.instance); a->process(h.instance, inputs, outputs, 1); first = out[0];
	const uint8_t note[] = {0x90, 72, 100};
	a->reset(h.instance); a->midi_msg_in(h.instance, 2, note); a->process(h.instance, inputs, outputs, 1);
	assert(out[0] > first * 1.5f);
	configure(&h, 96000); /* Reuse the instance with a new rate and DSP allocation. */
	a->process(h.instance, inputs, outputs, 480);
	assert(fabsf(out[479] - 1) < .0001f);

	a->set_parameter(h.instance, GAIN, 3);
	a->set_parameter(h.instance, DELAY, 2);
	a->set_parameter(h.instance, CUTOFF, 800);
	a->set_parameter(h.instance, TREMOLO, 50);
	a->set_parameter(h.instance, BYPASS, 1);
	perone_state_callbacks state_cbs = {&h, lock, unlock, write_state, restore};
	assert(!a->state_save(h.instance, &state_cbs, 96000) && h.state_size && !h.locked);
	char saved[1024]; size_t size = h.state_size; memcpy(saved, h.state, size);
	h.write_result = -37;
	assert(a->state_save(h.instance, &state_cbs, 96000) == -37 && !h.locked);
	h.write_result = 0;
	/* Loading can restore host parameter values without any DSP instance. */
	host detached = {0};
	perone_state_callbacks detached_cbs = {&detached, lock, unlock, write_state, restore};
	assert(a->state_load(&detached_cbs, 96000, saved, 0) != 0 && !detached.restored);
	assert(!a->state_load(&detached_cbs, 96000, saved, size) && !detached.locked);
	unsigned required = (1u << GAIN) | (1u << DELAY) | (1u << CUTOFF) | (1u << BYPASS);
	assert((detached.restored & required) == required);
	assert(detached.values[GAIN] == 3 && detached.values[DELAY] == 2);
	assert(detached.values[CUTOFF] == 800 && detached.values[BYPASS] == 1);
	a->set_parameter(h.instance, GAIN, 0); a->set_parameter(h.instance, BYPASS, 0);
	assert(!a->state_load(&state_cbs, 96000, saved, size));
	assert(!a->state_save(h.instance, &state_cbs, 96000));
	assert(h.state_size == size && !memcmp(saved, h.state, size));
	a->reset(h.instance); a->process(h.instance, inputs, outputs, 480);
	assert(!memcmp(in, out, sizeof(in))); /* Restored bypass. */
	a->fini(h.instance); a->free(h.instance); free(h.mem);
	dlclose(library);
	puts("OK: general plugin audio, MIDI, transport, messaging, reconfiguration and state");
}
