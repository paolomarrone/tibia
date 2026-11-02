/* MIDI-only DSP fixture, compiled as both C and C++. GPL-3.0-or-later. */
typedef struct {
	void *handle;
	void (*midi_msg_out)(void *, size_t, const uint8_t *, size_t);
	int transpose;
	size_t delay, count;
	struct { uint8_t data[3]; size_t remaining; } pending[8];
} plugin;

static int plugin_init(plugin *p, const plugin_callbacks *cbs) {
	p->handle = cbs->handle;
	p->midi_msg_out = cbs->midi_msg_out;
	p->transpose = 0; p->delay = 0; p->count = 0;
	return p->midi_msg_out ? 0 : -1;
}
static void plugin_fini(plugin *p) { (void)p; }
static void plugin_set_sample_rate(plugin *p, float rate) { (void)p; (void)rate; }
static size_t plugin_mem_req(plugin *p) { (void)p; return 0; }
static void plugin_mem_set(plugin *p, void *mem) { (void)p; (void)mem; }
static void plugin_reset(plugin *p) { p->count = 0; }
static void plugin_set_parameter(plugin *p, size_t index, float value) {
	if (index == plugin_parameter_transpose) p->transpose = (int)value;
	else if (index == plugin_parameter_delay) p->delay = (size_t)value;
}
static float plugin_get_parameter(plugin *p, size_t index) { (void)p; (void)index; return 0; }
static void plugin_midi_msg_in(plugin *p, size_t bus, const uint8_t *data) {
	if (bus != 0 || p->count == 8) return;
	size_t i = p->count++;
	for (size_t j = 0; j < 3; j++) p->pending[i].data[j] = data[j];
	if ((data[0] & 0xf0) == 0x80 || (data[0] & 0xf0) == 0x90) {
		int note = data[1] + p->transpose;
		p->pending[i].data[1] = (uint8_t)(note < 0 ? 0 : note > 127 ? 127 : note);
	}
	p->pending[i].remaining = p->delay;
}
static void plugin_process(plugin *p, const float **inputs, float **outputs, size_t frames) {
	(void)inputs; (void)outputs;
	if (!frames) return;
	size_t kept = 0;
	for (size_t i = 0; i < p->count; i++) {
		if (p->pending[i].remaining < frames) {
			uint8_t data[3];
			for (size_t j = 0; j < 3; j++) data[j] = p->pending[i].data[j];
			p->midi_msg_out(p->handle, 1, data, p->pending[i].remaining);
			/* The callback cannot retain this borrowed storage. */
			for (size_t j = 0; j < 3; j++) data[j] = 0;
		} else {
			p->pending[i].remaining -= frames;
			p->pending[kept++] = p->pending[i];
		}
	}
	p->count = kept;
}
