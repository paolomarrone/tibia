#!/bin/sh

# Tibia's original UI and DSP on the web. GPL-3.0-or-later.
set -e
cd "$(dirname "$0")/.."
vinci_dir=$(cd "${VINCI_DIR:-../vinci}" && pwd)
./tibia test/product.json,test/company.json templates/api out/api
./tibia --common templates/perone-web out/perone/web
for variant in c cxx; do
	dir=out/perone/ui/$variant
	for template in perone perone-make; do
		./tibia test/product.json,test/company.json templates/$template "$dir" 'product.ui.web="ui/index.js"'
	done
	./tibia --common templates/perone-vinci-web "$dir"
	if test "$variant" = c; then
		cp test/plugin.h test/plugin_ui.h "$dir/src"
	else
		cp test/plugin_cxx.h "$dir/src"
		cp test/plugin_ui.h "$dir/src/plugin_ui_cxx.h"
	fi
	mkdir -p "$dir/src/test-wasm"
	cp test/perone_stdio.h "$dir/src/test-wasm/stdio.h"
	make -C "$dir" all ui PERONE_PLATFORM=wasm32 API_DIR=../../../api VINCI_DIR="$vinci_dir" CPPFLAGS=-Isrc/test-wasm CFLAGS="-O2 -Wall -Wextra -Werror -fno-builtin"
	cmp "$dir/product.json" "$dir/build/tibia-test.perone/product.json"
done
