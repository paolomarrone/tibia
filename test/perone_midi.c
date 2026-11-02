/* Native MIDI-only Perone host. GPL-3.0-or-later. */
#include "perone.h"
#include <assert.h>
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>

typedef struct {
	size_t bus, offset;
	uint8_t data[3];
} event;
typedef struct {
	size_t frames, count;
	event events[8];
} host;

static void midi_out(void *handle, size_t bus, const uint8_t *data, size_t offset) {
	host *h = (host *)handle;
	assert(h->frames && offset < h->frames && h->count < 8);
	event *e = &h->events[h->count++];
	e->bus = bus; e->offset = offset;
	memcpy(e->data, data, 3);
}
static void process(host *h, const perone_api *api, void *p, size_t frames) {
	h->frames = frames;
	api->process(p, NULL, NULL, frames);
	h->frames = 0;
}
static void check(host *h, size_t i, size_t offset, uint8_t status, uint8_t a, uint8_t b) {
	assert(i < h->count);
	const event *e = &h->events[i];
	assert(e->bus == 1 && e->offset == offset);
	assert(e->data[0] == status && e->data[1] == a && e->data[2] == b);
}
int main(int argc, char **argv) {
	assert(argc == 2);
	void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
	if (!library) fprintf(stderr, "%s\n", dlerror());
	assert(library);
	const perone_api *(*get)(uint32_t) = dlsym(library, "perone_get_api");
	assert(get && !get(1) && !get(2) && !get(4));
	const perone_api *a = get(PERONE_ABI_VERSION);
	assert(a && a->midi_msg_in && a->set_parameter);
	assert(!a->get_parameter && !a->set_transport && !a->msg_in && !a->state_save && !a->state_load);
	host h = {0};
	perone_callbacks cbs = {&h, NULL, NULL, NULL, NULL};
	void *p = a->alloc(); assert(p);
	assert(a->init(p, &cbs) != 0); /* MIDI outputs require an accepting host. */
	a->free(p);
	p = a->alloc(); assert(p);
	cbs.midi_msg_out = midi_out;
	assert(!a->init(p, &cbs));
	a->set_sample_rate(p, 48000);
	assert(a->mem_req(p) == 0);
	a->mem_set(p, NULL); a->reset(p);
	a->set_parameter(p, 0, 12); a->set_parameter(p, 1, 0);
	uint8_t note[] = {0x92, 60, 100};
	a->midi_msg_in(p, 0, note);
	memset(note, 0, sizeof(note)); /* Input and output data must be copied. */
	a->set_parameter(p, 1, 7);
	const uint8_t off[] = {0x82, 60, 64}, cc[] = {0xb2, 1, 90};
	a->midi_msg_in(p, 0, off); a->midi_msg_in(p, 0, cc);
	assert(h.count == 0);
	process(&h, a, p, 0); assert(h.count == 0);
	process(&h, a, p, 8); assert(h.count == 3);
	check(&h, 0, 0, 0x92, 72, 100); check(&h, 1, 7, 0x82, 72, 64); check(&h, 2, 7, 0xb2, 1, 90);
	/* offset == frames belongs to the next process call, at offset zero. */
	a->set_parameter(p, 0, -12); a->set_parameter(p, 1, 8);
	const uint8_t next[] = {0x90, 72, 80};
	a->midi_msg_in(p, 0, next);
	process(&h, a, p, 8); process(&h, a, p, 0); assert(h.count == 3);
	process(&h, a, p, 1); assert(h.count == 4); check(&h, 3, 0, 0x90, 60, 80);
	a->set_parameter(p, 1, 0);
	const uint8_t program[] = {0xc2, 5, 0}, clock[] = {0xf8, 0, 0};
	a->midi_msg_in(p, 0, program); a->midi_msg_in(p, 0, clock);
	process(&h, a, p, 1); assert(h.count == 6);
	check(&h, 4, 0, 0xc2, 5, 0); check(&h, 5, 0, 0xf8, 0, 0);
	a->midi_msg_in(p, 0, next); a->reset(p);
	process(&h, a, p, 64); assert(h.count == 6);
	a->fini(p); a->free(p); dlclose(library);
	puts("OK: native MIDI-only effect, parameters, borrowed bytes, offsets, zero frames and reset");
}
