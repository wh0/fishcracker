#!/bin/sh -eux
npx webpack-cli
rm -rf ~/greeter/static/devextensions
cp -rLv ~/devextensions-links ~/greeter/static/devextensions
