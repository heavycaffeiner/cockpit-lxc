PACKAGE_NAME := cockpit-lxc
# Cockpit addresses the package by its directory name, which is what appears in
# the URL (/cockpit/@localhost/lxc). It is deliberately shorter than the
# distribution package name.
COCKPIT_PACKAGE := lxc

PREFIX ?= /usr
DESTDIR ?=
SYSTEM_DIR := $(DESTDIR)$(PREFIX)/share/cockpit/$(COCKPIT_PACKAGE)
USER_DIR := $(HOME)/.local/share/cockpit/$(COCKPIT_PACKAGE)

.PHONY: all build watch check typecheck lint lint-js lint-css install devinstall devuninstall clean

all: build

node_modules: package.json
	npm install
	@touch node_modules

build: node_modules
	npm run build

watch: node_modules
	npm run watch

# The 4px grid gate (proposal 4.3.7) hangs off lint-css, and check depends on it,
# so an off-grid length fails the build rather than surviving to review.
check: typecheck lint

typecheck: node_modules
	npm run typecheck

lint: lint-js lint-css

lint-js: node_modules
	npm run lint:js

lint-css: node_modules
	npm run lint:css

install: build
	install -d $(SYSTEM_DIR)
	cp -r dist/. $(SYSTEM_DIR)/

# Symlink the build output into the user's Cockpit package path. Cockpit picks
# packages up from here without a restart, which is the fast development loop.
devinstall: build
	mkdir -p $(dir $(USER_DIR))
	ln -sfn $(CURDIR)/dist $(USER_DIR)

devuninstall:
	rm -f $(USER_DIR)

clean:
	rm -rf dist
