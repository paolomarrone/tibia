/* X11 host for the shared Tibia UI and DSP. GPL-3.0-or-later. */
#define _POSIX_C_SOURCE 200809L
#include "perone.h"
#include "perone_ui.h"
#include <X11/Xlib.h>
#include <assert.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
	const perone_api *dsp;
	const perone_ui_api *api;
	void *instance, *ui;
	unsigned begin, change, end, to_dsp, to_ui;
} host;

static const char *directory(void *handle) { (void)handle; return "."; }
static void parameter(void *handle, size_t index, float value) {
	host *h = (host *)handle;
	h->change++;
	h->dsp->set_parameter(h->instance, index, value);
}
static void begin(void *handle, size_t index, float value) { ((host *)handle)->begin++; parameter(handle, index, value); }
static void end(void *handle, size_t index, float value) { ((host *)handle)->end++; parameter(handle, index, value); }
static void to_dsp(void *handle, size_t size, const void *data) {
	host *h = (host *)handle;
	assert(size == 5 && !memcmp(data, "reset", 5));
	h->to_dsp++;
	h->dsp->msg_in(h->instance, size, data);
}
static void to_ui(void *handle, size_t size, const void *data) {
	host *h = (host *)handle;
	h->to_ui++;
	h->api->msg_in(h->ui, size, data);
}
static void pump(host *h) {
	const struct timespec delay = {0, 1000000};
	for (int i = 0; i < 20; i++) { h->api->idle(h->ui); nanosleep(&delay, NULL); }
}
static void mouse(Display *display, Window window, int type, int x, int y) {
	XEvent event = {0};
	event.xbutton.type = type;
	event.xbutton.display = display;
	event.xbutton.window = window;
	event.xbutton.root = DefaultRootWindow(display);
	event.xbutton.x = x; event.xbutton.y = y;
	event.xbutton.button = Button1;
	event.xbutton.same_screen = True;
	assert(XSendEvent(display, window, False, type == ButtonPress ? ButtonPressMask : ButtonReleaseMask, &event));
	XSync(display, False);
}

int main(int argc, char **argv) {
	if (argc != 3) { fprintf(stderr, "Usage: %s dsp.so ui.so\n", argv[0]); return 1; }
	void *dsp_library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
	if (!dsp_library) fprintf(stderr, "%s\n", dlerror());
	assert(dsp_library);
	void *ui_library = dlopen(argv[2], RTLD_NOW | RTLD_LOCAL);
	if (!ui_library) fprintf(stderr, "%s\n", dlerror());
	assert(ui_library);
	const perone_api *(*get_dsp)(uint32_t) = dlsym(dsp_library, "perone_get_api");
	const perone_ui_api *(*get_ui)(uint32_t) = dlsym(ui_library, "perone_ui_get_api");
	assert(get_dsp && get_ui && !get_ui(0) && !get_ui(2));
	assert(!dlsym(dsp_library, "perone_ui_get_api") && !dlsym(ui_library, "perone_get_api"));
	host h = {0}; h.dsp = get_dsp(PERONE_ABI_VERSION); h.api = get_ui(PERONE_UI_ABI_VERSION);
	assert(h.dsp && h.api);
	h.instance = h.dsp->alloc(); assert(h.instance);
	perone_callbacks dsp_cbs = {&h, directory, directory, to_ui};
	assert(!h.dsp->init(h.instance, &dsp_cbs));
	h.dsp->set_sample_rate(h.instance, 48000);
	void *mem = malloc(h.dsp->mem_req(h.instance)); assert(mem);
	h.dsp->mem_set(h.instance, mem);
	const float defaults[] = {0, 0, 1000, 0, 0};
	for (size_t i = 0; i < 5; i++) h.dsp->set_parameter(h.instance, i, defaults[i]);
	h.dsp->reset(h.instance);
	uint32_t width, height; h.api->get_default_size(&width, &height);
	assert(width == 600 && height == 600);
	Display *display = XOpenDisplay(NULL); assert(display);
	/* An unmapped parent exercises embedding without opening a desktop window. */
	Window parent = XCreateSimpleWindow(display, DefaultRootWindow(display), 0, 0, width, height, 0, 0, 0);
	XSync(display, False);
	perone_ui_callbacks ui_cbs = {&h, directory, directory, begin, parameter, end, to_dsp};
	assert(!h.api->create(0, 1, (void *)(uintptr_t)parent, &ui_cbs));
	h.ui = h.api->create(PERONE_UI_X11, 1, (void *)(uintptr_t)parent, &ui_cbs); assert(h.ui);
	Window widget = (Window)(uintptr_t)h.api->get_widget(h.ui); assert(widget);
	pump(&h);
	Window root, actual_parent, *children; unsigned count;
	assert(XQueryTree(display, widget, &root, &actual_parent, &children, &count));
	if (children) XFree(children);
	assert(actual_parent == parent);
	XResizeWindow(display, widget, 720, 480); XSync(display, False); pump(&h);
	XWindowAttributes attr; assert(XGetWindowAttributes(display, widget, &attr));
	assert(attr.width == 720 && attr.height == 480);
	XResizeWindow(display, widget, width, height); XSync(display, False); pump(&h);
	for (size_t i = 0; i < 5; i++) h.api->set_parameter(h.ui, i, defaults[i]);
	assert(!h.change);
	mouse(display, widget, ButtonPress, 120, 65); pump(&h);
	mouse(display, widget, ButtonRelease, 480, 65); pump(&h);
	assert(h.begin == 1 && h.end == 1 && h.change == 2);
	float input[480], output[480]; const float *inputs[] = {input}; float *outputs[] = {output};
	for (size_t i = 0; i < 480; i++) input[i] = .1f;
	h.dsp->process(h.instance, inputs, outputs, 480);
	assert(output[479] > .29f && output[479] < 1.f && h.to_ui == 1);
	h.api->set_parameter(h.ui, 5, h.dsp->get_parameter(h.instance, 5));
	mouse(display, widget, ButtonPress, 510, 438); pump(&h);
	mouse(display, widget, ButtonRelease, 510, 438); pump(&h);
	assert(h.to_dsp == 1);
	h.api->free(h.ui);
	h.dsp->fini(h.instance); h.dsp->free(h.instance); free(mem);
	XDestroyWindow(display, parent); XCloseDisplay(display);
	dlclose(ui_library); dlclose(dsp_library);
	puts("OK: native UI embedding, resize, gestures, parameters, bidirectional messages and lifecycle");
}
