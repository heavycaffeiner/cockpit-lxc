PACKAGE_NAME := cockpit-lxc
VERSION := 0.1.0
# Cockpit addresses the package by its directory name, which is what appears in
# the URL (/cockpit/@localhost/lxc). It is deliberately shorter than the
# distribution package name.
COCKPIT_PACKAGE := lxc

PREFIX ?= /usr
DESTDIR ?=
SYSTEM_DIR := $(DESTDIR)$(PREFIX)/share/cockpit/$(COCKPIT_PACKAGE)
USER_DIR := $(HOME)/.local/share/cockpit/$(COCKPIT_PACKAGE)

TARBALL := $(PACKAGE_NAME)-$(VERSION).tar.xz

.PHONY: all build watch check typecheck lint lint-js lint-css install devinstall \
        devuninstall dist rpm deb clean

all: build

# `npm ci` when there is a lockfile, because a package build has to install the
# versions that were tested rather than whatever satisfies the ranges today.
# `npm install` is the fallback for a working tree with no lockfile yet.
node_modules: package.json
	@if [ -f package-lock.json ]; then npm ci; else npm install; fi
	@touch node_modules

build: node_modules
	npm run build

watch: node_modules
	npm run watch

# The 4px grid gate (proposal 4.3.7) hangs off lint-css, and check depends on it,
# so an off-grid length fails the build rather than surviving to review.
check: check-version typecheck lint check-po

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

# The source tarball, which is what both packages are built from.
#
# node_modules is deliberately not in it. Vendoring a few hundred megabytes of
# dependencies into a release asset to save an `npm ci` is a poor trade, and the
# lockfile is included, so the builder installs the versions that were tested
# rather than whatever satisfies the ranges on the day. A builder with no
# network cannot build this; that is a known limit, not an accident.
dist: check build
	tar --create --xz --file $(TARBALL) \
	    --transform 's,^,$(PACKAGE_NAME)-$(VERSION)/,' \
	    --exclude='.git' --exclude='dist' --exclude='*.tar.xz' \
	    Makefile package.json package-lock.json tsconfig.json build.js \
	    eslint.config.js .stylelintrc.json build src po test docs packaging \
	    README.md LICENSE
	@echo "wrote $(TARBALL)"

rpm: dist
	rpmbuild -ta $(TARBALL)

deb: dist
	@echo "Unpack $(TARBALL), copy packaging/debian to debian/, then run dpkg-buildpackage -us -uc"

# Message ids are stable keys, so there is nothing for xgettext to extract from
# the source: po/en.po is the English catalogue, not a by-product. This checks
# that the keys used in src and the keys in the catalogues agree, which is what
# catches a typo that would otherwise render as a key in the UI.
.PHONY: check-po check-version
check-po: node_modules
	npm run check:po

# The version is declared in package.json, this Makefile, the rpm spec and the
# debian changelog. This is what stops a release naming itself one thing and
# installing as another.
check-version:
	npm run check:version

clean:
	rm -rf dist $(PACKAGE_NAME)-*.tar.xz
