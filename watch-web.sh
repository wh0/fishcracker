#!/bin/sh -eux
rm -rf ~/greeter/static/devextensions
ln -s ../../devextensions-links ~/greeter/static/devextensions
exec npx webpack watch
