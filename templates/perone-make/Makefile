# Tibia Perone build (ELF platforms). GPL-3.0-or-later.
include vars.mk
TEMPLATE := perone
COMMON_DIR ?= .
DATA_DIR ?= .
PLUGIN_DIR ?= src
API_DIR ?= $(PLUGIN_DIR)
MKINC_DIR ?= $(COMMON_DIR)
-include $(MKINC_DIR)/vars-pre.mk
CC = cc
CXX = c++
CFLAGS ?= -O2 -Wall -Wextra
CXXFLAGS ?= $(CFLAGS)
PLUGIN := $(firstword $(wildcard $(PLUGIN_DIR)/plugin_cxx.h $(PLUGIN_DIR)/plugin.h))
PERONE_PLATFORM ?= $(shell uname -m)-$(shell uname -s | tr A-Z a-z)
OUTPUT ?= build/$(BUNDLE_NAME).perone
BUNDLE_DIR := $(patsubst %/,%,$(OUTPUT))
BUILD_BIN_DIR := $(BUNDLE_DIR)/$(PERONE_PLATFORM)
BUILD_DATA_DIR := $(BUNDLE_DIR)
BUILD_OBJ_DIR := $(dir $(BUNDLE_DIR))obj/$(notdir $(BUNDLE_DIR))
BINARY := $(BUILD_BIN_DIR)/$(BUNDLE_NAME).so
DEPFILE := $(BUILD_OBJ_DIR)/$(PERONE_PLATFORM).d
INCLUDES = -I$(COMMON_DIR)/src -I$(DATA_DIR)/src -I$(PLUGIN_DIR) -I$(API_DIR)
.DEFAULT_GOAL := all
.PHONY: all clean
all: $(BINARY) $(BUILD_DATA_DIR)/product.json
$(BINARY): $(COMMON_DIR)/src/perone.c $(COMMON_DIR)/src/perone.h $(DATA_DIR)/src/data.h $(API_DIR)/plugin_api.h $(PLUGIN) $(MAKEFILE_LIST)
	mkdir -p $(dir $@) $(dir $(DEPFILE))
ifneq ($(filter %/plugin_cxx.h,$(PLUGIN)),)
	$(CXX) -x c++ $(CPPFLAGS) $(CXXFLAGS) $(CXXFLAGS_EXTRA) $(INCLUDES) -DHAS_PLUGIN_CXX_H -fPIC -fvisibility=hidden -MMD -MP -MF $(DEPFILE) -MT $@ -shared $< $(LDFLAGS) $(LDLIBS) -lm -o $@
else
	$(CC) $(CPPFLAGS) $(CFLAGS) $(CFLAGS_EXTRA) $(INCLUDES) -fPIC -fvisibility=hidden -MMD -MP -MF $(DEPFILE) -MT $@ -shared $< $(LDFLAGS) $(LDLIBS) -lm -o $@
endif
$(BUILD_DATA_DIR)/product.json: $(DATA_DIR)/product.json
	mkdir -p $(dir $@)
	cp $< $@
-include $(DEPFILE)
clean:
	rm -fr $(BUNDLE_DIR) $(BUILD_OBJ_DIR)
