#!/bin/sh

# Tibia native UI tests (X11 and Vinci). GPL-3.0-or-later.
set -e
cd "$(dirname "$0")/.."
vinci_dir=$(cd "${VINCI_DIR:-../vinci}" && pwd)
./test/run_perone.sh
cp test/plugin_ui.h out/perone/c/src/plugin_ui.h
cp test/plugin_ui.h out/perone/cxx/src/plugin_ui_cxx.h
cc -std=c99 -Wall -Wextra -Werror -Itemplates/perone test/perone_ui.c -ldl -lX11 -o out/perone/test-ui
perone_platform="$(uname -m)-$(uname -s | tr A-Z a-z)"
for variant in c cxx; do
	make -C out/perone/$variant ui UI_CPPFLAGS="-I$vinci_dir" UI_C_SRCS_EXTRA="$vinci_dir/vinci-xcb.c" UI_LDLIBS=-lxcb
	out/perone/test-ui out/perone/$variant/build/tibia-test.perone/$perone_platform/tibia-test.so out/perone/$variant/build/tibia-test.perone/$perone_platform/tibia-test-ui.so
done
