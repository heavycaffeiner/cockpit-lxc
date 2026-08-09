PACKAGE_NAME := cockpit-lxc
VERSION := 0.1.6
# Cockpit addresses the package by its directory name, which is what appears in
# the URL (/cockpit/@localhost/lxc). It is deliberately shorter than the
# distribution package name.
COCKPIT_PACKAGE := lxc

PREFIX ?= /usr
DESTDIR ?=
SYSTEM_DIR := $(DESTDIR)$(PREFIX)/share/cockpit/$(COCKPIT_PACKAGE)
USER_DIR := $(HOME)/.local/share/cockpit/$(COCKPIT_PACKAGE)

TARBALL := $(PACKAGE_NAME)-$(VERSION).tar.xz

# makepkg unpacks into src/ and stages into pkg/ relative to its working
# directory, and this project's own sources are in src/. It gets its own
# directory so it cannot overwrite them.
ARCH_BUILD_DIR := build-arch
DEB_BUILD_DIR := build-deb

# The browser the layout audit measures in, pinned by digest so the fonts and
# the renderer are the same bytes here as on a CI runner. Recursive rather than
# immediate: `make clean` on a machine with no node should not have to read it.
LAYOUT_IMAGE = $(shell node -p "const i=require('./test/layout/image.json'); i.image + '@' + i.digest")

.PHONY: all build watch check typecheck lint lint-js lint-css install devinstall \
        devuninstall dist rpm deb arch clean

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

# The runtime layout audit, in the pinned browser image.
#
# `check` deliberately does not depend on this. `dist` depends on `check`, and
# `dist` is what the rpm, deb and Arch builds run, so a dependency here would
# make the plugin unbuildable on any machine without a container runtime. CI
# runs both targets, which is where a layout regression should be caught.
#
# --user and HOME=/tmp keep the report and the screenshots owned by the invoking
# user. Without them a local run leaves root-owned files that npm cannot remove.
.PHONY: check-layout
check-layout: build
	docker run --rm \
	    --user $$(id -u):$$(id -g) \
	    -e HOME=/tmp \
	    -v $(CURDIR):/work -w /work \
	    $(LAYOUT_IMAGE) \
	    sh -c "npm run build:harness && npm run check:layout"

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

# The source tarball, which is what all three packages are built from.
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
	    README.md README.ko.md CONTRIBUTING.md LICENSE
	@echo "wrote $(TARBALL)"

rpm: dist
	rpmbuild -ta $(TARBALL)

# Built in its own directory, because dpkg-buildpackage writes the .deb and its
# metadata to the parent of the source tree it is given.
deb: dist
	rm -rf $(DEB_BUILD_DIR)
	mkdir -p $(DEB_BUILD_DIR)
	tar -x -C $(DEB_BUILD_DIR) -f $(TARBALL)
	cp -r packaging/debian $(DEB_BUILD_DIR)/$(PACKAGE_NAME)-$(VERSION)/debian
	cd $(DEB_BUILD_DIR)/$(PACKAGE_NAME)-$(VERSION) && dpkg-buildpackage -us -uc -b
	@echo "wrote $(DEB_BUILD_DIR)/$(PACKAGE_NAME)_$(VERSION)-1_all.deb"

# makepkg wants the PKGBUILD beside the tarball it names as its source, and it
# unpacks into `src/` and stages into `pkg/` relative to wherever it runs.
#
# It therefore must not run in the repository root: this project's own sources
# live in src/, and makepkg would extract the tarball straight over them. That
# is what ARCH_BUILD_DIR is for, and why `clean` removes that directory rather
# than the two names makepkg would otherwise have used.
#
# makepkg also refuses to run as root, because a PKGBUILD is arbitrary code.
arch: dist
	rm -rf $(ARCH_BUILD_DIR)
	mkdir -p $(ARCH_BUILD_DIR)
	cp packaging/arch/PKGBUILD $(TARBALL) $(ARCH_BUILD_DIR)/
	cd $(ARCH_BUILD_DIR) && makepkg --noconfirm --nodeps
	@echo "wrote $(ARCH_BUILD_DIR)/$(PACKAGE_NAME)-$(VERSION)-*.pkg.tar.*"

# Message ids are stable keys, so there is nothing for xgettext to extract from
# the source: po/en.po is the English catalogue, not a by-product. This checks
# that the keys used in src and the keys in the catalogues agree, which is what
# catches a typo that would otherwise render as a key in the UI.
.PHONY: check-po check-version
check-po: node_modules
	npm run check:po

# The version is declared in package.json, this Makefile, and one file per
# supported distribution: the rpm spec, the debian changelog and the PKGBUILD.
# This is what stops a release naming itself one thing and installing as
# another.
check-version:
	npm run check:version

clean:
	rm -rf dist $(ARCH_BUILD_DIR) $(DEB_BUILD_DIR) $(PACKAGE_NAME)-*.tar.xz
