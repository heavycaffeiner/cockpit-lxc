# cockpit-lxc

**한국어 문서: [README.ko.md](README.ko.md)**

Manage Linux system containers from your browser, as a page inside the
[Cockpit](https://cockpit-project.org/) web console.

![The container list](docs/screenshot-containers.png)

## What this is, in plain terms

If any of these are new, here is the short version:

- **Cockpit** is a web interface for administering a Linux server. You open it in a browser
  at `https://your-server:9090` and log in with a normal server account.
- **A system container** is a whole Linux userspace, with its own init, services, users and
  network, sharing the host's kernel. It behaves much more like a small virtual machine
  than a Docker container does, and it is meant to be long-lived.
- **[Incus](https://linuxcontainers.org/incus/)** is the manager that creates and runs those
  containers. It is the tool you would otherwise drive from a terminal with `incus launch`,
  `incus config` and so on.

`cockpit-lxc` puts Incus into Cockpit, so the things you would normally type at a shell
become a page you can click through. It adds no new login: it uses the Cockpit session you
already have.

## Before you install

You need a Linux host with:

| Requirement | Why |
|---|---|
| `cockpit` 300 or newer | This plugin is a page inside it |
| `incus` 6.0 LTS or newer | The container manager itself |
| the `incus` command line tool | Used for the terminal and for live updates |
| an account that can use `sudo` | The Incus socket is owned by root |

Install Incus first if you do not have it:

```sh
sudo dnf install incus incus-tools     # RHEL
sudo apt install incus incus-client    # Debian and Ubuntu
sudo pacman -S incus                   # Arch

sudo systemctl enable --now incus.socket
sudo incus admin init --auto           # first-time Incus setup
```

## Install

Download the package for your distribution from the
[latest release](https://github.com/heavycaffeiner/cockpit-lxc/releases/latest), then:

```sh
sudo dnf install ./cockpit-lxc-*.rpm          # RHEL
sudo apt install ./cockpit-lxc_*_all.deb      # Debian and Ubuntu
sudo pacman -U ./cockpit-lxc-*.pkg.tar.zst    # Arch
```

Each release also publishes a `SHA256SUMS` file. To check what you downloaded:

```sh
sha256sum -c SHA256SUMS
```

There is nothing to restart. Cockpit picks the page up on the next page load.

## First run

1. Open `https://your-server:9090` and log in.
2. Choose **LXC Containers** in the left sidebar.
3. The page will ask for administrative access, because the Incus socket is owned by root.
   Click **Limited access** at the top right and authenticate. The page loads your
   containers by itself once you do.
4. No containers yet? Go to the **Images** page, open the **Pull image** tab, and download
   one. Then use **Create container** on the Containers page.

## What you can do

- **Run containers**: create, start, stop, restart, freeze, rename, copy and delete. You can
  select several rows and act on all of them at once. Only actions that make sense for a
  container's current state are offered.
- **Change any setting**: the settings you touch often come first as labelled fields. Every
  other setting your Incus version supports is listed below them, straight from Incus's own
  documentation, including what each one defaults to and whether it needs a restart.
- **Attach networks and disks**: add network interfaces and mount host paths. Anything a
  profile already provides is shown as inherited so you can see where it came from.
- **Take snapshots**: create, restore, rename and delete them, or set a schedule and an
  expiry so Incus takes them for you.
- **Manage images**: browse a remote image server, download what you need, and name or
  delete what you already have.
- **Manage profiles, networks and storage pools**: each has its own page, with create, edit
  and delete.
- **Open a shell**: a real terminal inside a running container, plus its console.
- **Read logs**: the log files Incus keeps for a container.

The list updates itself as containers start and stop, and tells you plainly if that live
connection is lost rather than showing stale information as if it were current.

### A container in detail

Its identity, the profiles it uses, and what it is consuming right now.

![The container overview](docs/screenshot-overview.png)

### Every setting your server supports

The common settings are at the top with proper labels and help. Below them, every remaining
option your Incus version knows about, grouped the way Incus groups them. The number beside
each heading is how many settings that group holds on your server.

![The configuration tab](docs/screenshot-configuration.png)

### Images you can browse

Pick from a remote's catalogue instead of typing an image name and hoping. Downloading is
its own tab, so creating a container never quietly turns into a long download.

![Pulling an image](docs/screenshot-images.png)

### A shell in the container

A real terminal, with resize and colour, without leaving the browser.

![The terminal](docs/screenshot-terminal.png)

## Supported distributions

Three, each with a package built and published automatically from the same source:

| Distribution      | Package          |
|-------------------|------------------|
| RHEL and rebuilds | `.rpm`           |
| Debian and Ubuntu | `.deb`           |
| Arch              | `.pkg.tar.zst`   |

The plugin is only static files, with nothing compiled, so these packages work on any
version of those distributions that has a new enough Cockpit and Incus. Other
distributions will very likely work from a source install; they are simply not something
this project builds or tests.

## If something is wrong

**"Incus is not installed"** means no Incus socket was found. Install Incus and start it:

```sh
sudo systemctl enable --now incus.socket
```

**"Administrative access is required"** is normal on first use. Click **Limited access** at
the top right of Cockpit and authenticate. The Incus socket is readable only by root, so
the page cannot show anything until you do.

**The page says live updates are unavailable.** The list is still correct as of its last
refresh, it just will not update on its own. Check that the `incus` command line tool is
installed, since that is what carries the event stream.

**Containers have no IPv4 address.** This is usually the host firewall rather than this
plugin. On a host running firewalld, the Incus bridge needs to be in a zone that allows
DHCP:

```sh
sudo firewall-cmd --permanent --zone=trusted --add-interface=incusbr0
sudo firewall-cmd --reload
```

**Something else.** Please [open an issue](https://github.com/heavycaffeiner/cockpit-lxc/issues)
with your distribution, your Cockpit and Incus versions, and what you saw.

## Building it yourself

```sh
npm install
make build
sudo make install     # into /usr/share/cockpit/lxc
```

Or build a package: `make rpm`, `make deb`, or `make arch`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the project is put together, how to run the
checks, and the rules the build enforces.

## License

LGPL-2.1-or-later, matching Cockpit. `LICENSE` carries the full text.
