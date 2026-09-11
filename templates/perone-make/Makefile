# Tibia Perone build (ELF and WebAssembly). GPL-3.0-or-later.
include vars.mk
TEMPLATE := perone
COMMON_DIR ?= .
DATA_DIR ?= .
PLUGIN_DIR ?= src
API_DIR ?= $(PLUGIN_DIR)
MKINC_DIR ?= $(COMMON_DIR)
-include $(MKINC_DIR)/vars-pre.mk
CFLAGS ?= -O2 -Wall -Wextra
CXXFLAGS ?= $(CFLAGS)
PLUGIN := $(firstword $(wildcard $(PLUGIN_DIR)/plugin_cxx.h $(PLUGIN_DIR)/plugin.h))
PERONE_PLATFORM ?= $(shell uname -m)-$(shell uname -s | tr A-Z a-z)
OUTPUT ?= build/$(BUNDLE_NAME).perone
BUNDLE_DIR := $(patsubst %/,%,$(OUTPUT))
BUILD_BIN_DIR := $(BUNDLE_DIR)/$(PERONE_PLATFORM)
BUILD_DATA_DIR := $(BUNDLE_DIR)
BUILD_OBJ_DIR := $(dir $(BUNDLE_DIR))obj/$(notdir $(BUNDLE_DIR))
DEPFILE := $(BUILD_OBJ_DIR)/$(PERONE_PLATFORM).d
INCLUDES = -I$(COMMON_DIR)/src -I$(DATA_DIR)/src -I$(PLUGIN_DIR) -I$(API_DIR)
ifeq ($(PERONE_PLATFORM), wasm32)
CC = clang
CXX = clang++
BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME).wasm
TARGET_FLAGS := --target=wasm32 -DWASM -I$(COMMON_DIR)/src/wasm
TARGET_CXXFLAGS := -fno-exceptions -fno-rtti
TARGET_LDFLAGS := --target=wasm32 -nostdlib -Wl,--no-entry,--fatal-warnings,--export-memory,--export-table,--growable-table \
	-Wl,--export=perone_get_api,--export=__wasm_call_ctors,--export=malloc,--export=realloc,--export=calloc,--export=free \
	-Wl,-z,stack-size=8388608
WASM_OBJ_DIR := $(BUILD_OBJ_DIR)/wasm32
WASM_OBJS := $(WASM_OBJ_DIR)/walloc.o $(WASM_OBJ_DIR)/string.o
ifneq ($(filter %/plugin_cxx.h,$(PLUGIN)),)
WASM_OBJS += $(WASM_OBJ_DIR)/new.o
endif
else
CC = cc
CXX = c++
BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME).so
TARGET_FLAGS := -fPIC
TARGET_LDFLAGS := -shared
TARGET_LIBS := -lm
endif
.DEFAULT_GOAL := all
.PHONY: all clean
.DELETE_ON_ERROR:
all: $(BINARY) $(BUILD_DATA_DIR)/product.json
$(BINARY): $(COMMON_DIR)/src/perone.c $(COMMON_DIR)/src/perone.h $(DATA_DIR)/src/data.h $(API_DIR)/plugin_api.h $(PLUGIN) $(WASM_OBJS) $(MAKEFILE_LIST)
	mkdir -p $(dir $@) $(dir $(DEPFILE))
ifneq ($(filter %/plugin_cxx.h,$(PLUGIN)),)
	$(CXX) -x c++ $(CPPFLAGS) $(CXXFLAGS) $(CXXFLAGS_EXTRA) $(INCLUDES) -DHAS_PLUGIN_CXX_H $(TARGET_FLAGS) $(TARGET_CXXFLAGS) -fvisibility=hidden -MMD -MP -MF $(DEPFILE) -MT $@ $< -x none $(WASM_OBJS) $(TARGET_LDFLAGS) $(LDFLAGS) $(LDLIBS) $(TARGET_LIBS) -o $@
else
	$(CC) $(CPPFLAGS) $(CFLAGS) $(CFLAGS_EXTRA) $(INCLUDES) $(TARGET_FLAGS) -fvisibility=hidden -MMD -MP -MF $(DEPFILE) -MT $@ $< $(WASM_OBJS) $(TARGET_LDFLAGS) $(LDFLAGS) $(LDLIBS) $(TARGET_LIBS) -o $@
endif
ifeq ($(PERONE_PLATFORM), wasm32)
$(WASM_OBJ_DIR)/%.o: $(COMMON_DIR)/src/wasm/%.c $(MAKEFILE_LIST)
	mkdir -p $(dir $@)
	$(CC) $(CPPFLAGS) $(CFLAGS) $(CFLAGS_EXTRA) $(TARGET_FLAGS) -fvisibility=hidden -MMD -MP -c $< -o $@
$(WASM_OBJ_DIR)/new.o: $(COMMON_DIR)/src/wasm/new.cpp $(MAKEFILE_LIST)
	mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(CXXFLAGS_EXTRA) $(TARGET_FLAGS) $(TARGET_CXXFLAGS) -fvisibility=hidden -MMD -MP -c $< -o $@
$(COMMON_DIR)/src/wasm/new: ;
endif
$(BUILD_DATA_DIR)/product.json: $(DATA_DIR)/product.json
	mkdir -p $(dir $@)
	cp $< $@
-include $(DEPFILE) $(WASM_OBJS:.o=.d)
clean:
	rm -fr $(BUNDLE_DIR) $(BUILD_OBJ_DIR)
