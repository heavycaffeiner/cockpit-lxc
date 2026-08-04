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

# node_modules goes into the tarball so the package build works on a builder
# with no network, which is what most build systems provide.
dist: check build
	tar --create --xz --file $(TARBALL) \
	    --transform 's,^,$(PACKAGE_NAME)-$(VERSION)/,' \
	    --exclude='.git' --exclude='dist' --exclude='*.tar.xz' \
	    Makefile package.json package-lock.json tsconfig.json build.js \
	    eslint.config.js .stylelintrc.json build src test docs packaging \
	    README.md LICENSE
	@echo "wrote $(TARBALL)"

rpm: dist
	rpmbuild -ta $(TARBALL)

deb: dist
	@echo "Unpack $(TARBALL), copy packaging/debian to debian/, then run dpkg-buildpackage -us -uc"

# Rebuild the template from the source strings. Run after adding or changing
# any user-facing text; the catalogues below are merged against it.
po/$(PACKAGE_NAME).pot: $(shell find src -name '*.ts' -o -name '*.tsx')
	mkdir -p po
	xgettext --default-domain=$(PACKAGE_NAME) --output=$@ \
	    --language=JavaScript --from-code=UTF-8 \
	    --keyword=_ --keyword=N_:1,2 \
	    --package-name=$(PACKAGE_NAME) --package-version=$(VERSION) \
	    --copyright-holder='heavycaffeiner' \
	    $(shell find src -name '*.ts' -o -name '*.tsx' | sort)

.PHONY: po
po: po/$(PACKAGE_NAME).pot
	for f in po/*.po; do \
	    [ -e "$$f" ] || continue; \
	    msgmerge --update --backup=none "$$f" po/$(PACKAGE_NAME).pot; \
	done

clean:
	rm -rf dist $(PACKAGE_NAME)-*.tar.xz
