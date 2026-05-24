# shmakk desktop

Desktop client for `shmakk`, with release builds for Ubuntu/Linux.

## Install

### Desktop app

Download the latest GitHub Release asset:

- `shmakk-<version>-x86_64.AppImage`
- `shmakk-<version>-amd64.deb`

On Ubuntu, the `.deb` is the cleanest install:

```bash
sudo apt install ./shmakk-<version>-amd64.deb
```

That single package gives you both:

- `shmakk-desktop` for the Electron app
- `shmakk` for the terminal CLI

If you want a portable build, use the AppImage:

```bash
chmod +x shmakk-<version>-x86_64.AppImage
./shmakk-<version>-x86_64.AppImage
```

### Terminal CLI

If you prefer not to install the desktop package, the terminal version is still available as the `shmakk` npm package:

```bash
npm i -g shmakk
```

That gives you the CLI workflow you already use, while the desktop app stays installed separately.

## Build

```bash
npm ci
npm run package:linux
```

The release workflow also runs this on GitHub and uploads the Linux packages as build artifacts and release assets.
