#!/bin/bash
# Starts a rootful Xwayland as a client of the headless mutter. XTEST works in it with no portal.
# $1: the X display number. $2: the runtime directory of the headless mutter.
exec timeout 7000 env -u DISPLAY WAYLAND_DISPLAY=xlcheck-0 XDG_RUNTIME_DIR="$2" \
  Xwayland ":$1" -geometry 1600x1000 -nolisten tcp -noreset
