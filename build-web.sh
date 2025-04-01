#!/bin/sh -eux
npx webpack
rm -rf ~/greeter/static/devextensions
cp -rLv ~/devextensions-links ~/greeter/static/devextensions
