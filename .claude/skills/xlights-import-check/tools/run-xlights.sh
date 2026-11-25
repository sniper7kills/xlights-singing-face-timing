#!/bin/bash
# Runs the xLights AppImage on the isolated display of the headless mutter, with a scratch home.
# $1: the scratch directory, with display7.env. Other arguments go to xLights.
S="$1"; shift
set -a
. "$S/display7.env"
unset XAUTHORITY
set +a
unset WAYLAND_DISPLAY
exec timeout 5400 env HOME="$S/home" XDG_CONFIG_HOME="$S/home/.config" XDG_STATE_HOME="$S/home/.local/state" \
  XDG_DATA_HOME="$S/home/.local/share" XDG_CACHE_HOME="$S/home/.cache" \
  GDK_BACKEND=x11 GIO_USE_VFS=local GVFS_DISABLE_FUSE=1 GTK_USE_PORTAL=0 NO_AT_BRIDGE=1 \
  "${XLIGHTS_APPIMAGE:?Set XLIGHTS_APPIMAGE to the path of the xLights AppImage}" "$@"
