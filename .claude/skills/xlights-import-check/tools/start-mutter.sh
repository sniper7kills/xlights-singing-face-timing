#!/bin/bash
# Starts a headless mutter with Xwayland on a private session bus. Nothing reaches the real display.
# $1: the scratch directory. $2: a short runtime directory (a socket path has 108 bytes at most).
S="$1"
RT="$2"
mkdir -p "$S/home/.config" "$S/home/.local/state" "$S/home/.local/share" "$S/home/.cache"
chmod 700 "$RT"
exec timeout 7200 dbus-run-session -- env -u DISPLAY -u WAYLAND_DISPLAY \
  HOME="$S/home" XDG_CONFIG_HOME="$S/home/.config" XDG_STATE_HOME="$S/home/.local/state" \
  XDG_DATA_HOME="$S/home/.local/share" XDG_CACHE_HOME="$S/home/.cache" XDG_RUNTIME_DIR="$RT" \
  GIO_USE_VFS=local GVFS_DISABLE_FUSE=1 GTK_USE_PORTAL=0 \
  mutter --headless --wayland --wayland-display=xlcheck-0 --virtual-monitor 1600x1000 -- bash "$(dirname "$0")/inner.sh" "$S"
