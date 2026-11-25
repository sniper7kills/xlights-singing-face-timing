#!/bin/bash
# Runs inside the headless mutter session: records the display variables, then waits.
env | grep -E '^(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR)=' > "$1/display.env"
sleep 7000
