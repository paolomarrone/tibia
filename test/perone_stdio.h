/* Test-only Wasm stdio: silent diagnostics and the counter's %.2f/%f formats.
 * Not a libc implementation for production plugins. GPL-3.0-or-later. */
#ifndef PERONE_TEST_STDIO_H
#define PERONE_TEST_STDIO_H
#include <stdarg.h>
#include <stdint.h>
#define alloca __builtin_alloca
#define stdout ((void *)0)

static inline int printf(const char *format, ...) { (void)format; return 0; }
static inline int fflush(void *stream) { (void)stream; return 0; }

static inline int sprintf(char *s, const char *format, ...) {
	if (format[0] != '%' || format[1] != '.' || format[2] != '2' || format[3] != 'f' || format[4]) __builtin_trap();
	va_list args;
	va_start(args, format);
	double value = va_arg(args, double);
	va_end(args);
	if (!(value >= 0 && value < 1e12)) __builtin_trap();
	uint64_t n = (uint64_t)(value * 100 + .5), integer = n / 100;
	char digits[20];
	int count = 0, length = 0;
	do { digits[count++] = '0' + integer % 10; integer /= 10; } while (integer);
	while (count) s[length++] = digits[--count];
	s[length++] = '.'; s[length++] = '0' + n / 10 % 10; s[length++] = '0' + n % 10; s[length] = 0;
	return length;
}

static inline int sscanf(const char *s, const char *format, ...) {
	if (format[0] != '%' || format[1] != 'f' || format[2]) __builtin_trap();
	while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
	int negative = *s == '-', digits = 0;
	if (*s == '-' || *s == '+') s++;
	double value = 0, scale = .1;
	while (*s >= '0' && *s <= '9') { value = value * 10 + *s++ - '0'; digits++; }
	if (*s == '.') {
		s++;
		while (*s >= '0' && *s <= '9') { value += (*s++ - '0') * scale; scale *= .1; digits++; }
	}
	if (!digits) return 0;
	va_list args;
	va_start(args, format);
	*va_arg(args, float *) = (float)(negative ? -value : value);
	va_end(args);
	return 1;
}
#endif
