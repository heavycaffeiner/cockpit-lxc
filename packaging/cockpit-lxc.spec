Name:           cockpit-lxc
Version:        0.1.3
Release:        1%{?dist}
Summary:        Cockpit user interface for LXC system containers managed by Incus

License:        LGPL-2.1-or-later
URL:            https://github.com/heavycaffeiner/cockpit-lxc
Source0:        %{name}-%{version}.tar.xz

BuildArch:      noarch
BuildRequires:  make
BuildRequires:  nodejs
BuildRequires:  npm

Requires:       cockpit-bridge >= 300
Requires:       cockpit-ws >= 300
# The CLI is not optional. Incus's exec and events endpoints are websockets and
# cockpit.http cannot upgrade to one, so the terminal and the live event stream
# are both carried by the incus binary.
Requires:       incus
Requires:       incus-client

%description
Manage LXC system containers from the Cockpit web console: lifecycle, resource
limits, network and disk devices, profiles, snapshots, images, and an
interactive terminal.

The plugin reaches incusd over its local REST socket through cockpit-bridge, so
it inherits Cockpit's authentication rather than introducing a second
credential. It requires administrative access, because the Incus socket is owned
by root:incus-admin.

%prep
%autosetup -n %{name}-%{version}

%build
# The tarball ships node_modules so the build is offline and reproducible on a
# builder with no network, which is what most build systems give you.
make build

%install
%make_install PREFIX=%{_prefix}

%files
%license LICENSE
%doc README.md README.ko.md
%{_datadir}/cockpit/lxc

%changelog
* Thu Aug 06 2026 heavycaffeiner <146043537+heavycaffeiner@users.noreply.github.com> - 0.1.3-1
- Documentation only. The plugin itself is unchanged from 0.1.2
- Rewrite the README for a first-time reader and move the development
  material to CONTRIBUTING.md
- Add a Korean README, and ship both READMEs in the package

* Thu Aug 06 2026 heavycaffeiner <146043537+heavycaffeiner@users.noreply.github.com> - 0.1.2-1
- Find the Incus socket where the distribution put it. Arch uses
  /var/lib/incus/unix.socket and has no /run/incus, so the Arch package in
  0.1.1 could not reach Incus at all
- Name every install command, not only the dnf one

* Thu Aug 06 2026 heavycaffeiner <146043537+heavycaffeiner@users.noreply.github.com> - 0.1.1-1
- Add an Arch package, so the three supported distributions each have one
- Every instance option Incus advertises is editable, not only the 25 that
  were typed out by hand
- Show the container metrics the overview had never been able to fetch

* Tue Aug 04 2026 heavycaffeiner <146043537+heavycaffeiner@users.noreply.github.com> - 0.1.0-1
- Initial release: container lifecycle, configuration, devices, snapshots,
  images and terminal access
