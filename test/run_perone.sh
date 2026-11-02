#!/bin/sh

# Tibia Perone tests (ELF and WebAssembly). GPL-3.0-or-later.

set -e
cd "$(dirname "$0")/.."

./tibia test/product.json,test/company.json templates/api out/api

./tibia test/product.json,test/company.json templates/perone out/perone/c
./tibia test/product.json,test/company.json templates/perone-make out/perone/c
cp test/plugin.h out/perone/c/src
cp test/vars-pre.mk out/perone/c

./tibia test/product.json,test/company.json templates/perone out/perone/cxx
./tibia test/product.json,test/company.json templates/perone-make out/perone/cxx
cp test/plugin_cxx.h out/perone/cxx/src
cp test/vars-pre.mk out/perone/cxx

./tibia --common templates/perone-web out/perone/web

cc -std=c99 -Wall -Wextra -Werror -Itemplates/perone test/perone.c -ldl -lm -o out/perone/test
perone_platform="$(uname -m)-$(uname -s | tr A-Z a-z)"
for variant in c cxx; do
	make -C out/perone/$variant CFLAGS="-O2 -Wall -Wextra -Werror"
	cmp out/perone/$variant/product.json out/perone/$variant/build/tibia-test.perone/product.json
	out/perone/test out/perone/$variant/build/tibia-test.perone/$perone_platform/tibia-test.so 0 0 1000 0 0
	# WEB disables stdio in the shared test plugins, leaving some arguments and fields unused.
	make -C out/perone/$variant PERONE_PLATFORM=wasm32 CPPFLAGS=-DWEB CFLAGS="-O2 -Wall -Wextra -Werror -Wno-unused-parameter -Wno-unused-private-field"
	node test/perone_wasm.js out/perone/$variant/build/tibia-test.perone
done

# MIDI effects have parameters and MIDI buses but no audio channels or DSP memory.
cc -std=c99 -Wall -Wextra -Werror -Itemplates/perone test/perone_midi.c -ldl -o out/perone/test-midi
for variant in c cxx; do
	dir=out/perone/midi/$variant
	./tibia test/perone_midi.json,test/company.json templates/api "$dir/src"
	./tibia test/perone_midi.json,test/company.json templates/perone "$dir"
	./tibia test/perone_midi.json,test/company.json templates/perone-make "$dir"
	if test "$variant" = c; then
		cp test/plugin_midi.h "$dir/src/plugin.h"
	else
		cp test/plugin_midi.h "$dir/src/plugin_cxx.h"
	fi
	make -C "$dir" CFLAGS="-O2 -Wall -Wextra -Werror"
	cmp "$dir/product.json" "$dir/build/tibia-midi-test.perone/product.json"
	out/perone/test-midi "$dir/build/tibia-midi-test.perone/$perone_platform/tibia-midi-test.so"
	make -C "$dir" PERONE_PLATFORM=wasm32 CFLAGS="-O2 -Wall -Wextra -Werror"
	node test/perone_midi_wasm.js "$dir/build/tibia-midi-test.perone"
done
