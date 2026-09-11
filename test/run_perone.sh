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
