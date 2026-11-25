#!/bin/bash
# Imports one .xtiming file through the row heading menu: right-click "New Timing", "Import Timing Track".
# $1: the full path of the file. $2: the screenshot file. XT: the path of the built xt driver.
export DISPLAY=:7
"$XT" rclick "xLights" 500 381 || exit 1
sleep 1
# The menu is a separate window, so the click must not move the focus.
XT_NOFOCUS=1 "$XT" click "xLights" 605 480 || exit 1
"$XT" wait "Choose Timing" || exit 1
"$XT" key "Choose Timing" ctrl+l
"$XT" type "Choose Timing" "$1"
sleep 1
"$XT" key "Choose Timing" Return
sleep 3
"$XT" names | grep -v hidden
"$XT" rootshot "$2"
