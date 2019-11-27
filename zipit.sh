#!/bin/sh

rm ezroller.zip
cd .. && zip -x\*.git\* -r ezroller/ezroller.zip ezroller -x \*.git\* \*zipit.sh
