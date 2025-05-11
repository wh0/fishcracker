#!/bin/sh -eux
build=linux-x64-glibc-217
version=v22.15.0
tarball_sha256=0cc56e95e896c9946c615a4cfcee9f63704166fe48a88636242f9911ebdaa847
if [ ! -e "/tmp/node-$version-$build" ]; then
  if [ ! -e "/tmp/node-$version-$build.tar.gz" ]; then
    rm -f "/tmp/node-$version-$build.tar.gz.tmp"
    # wget -O "/tmp/node-$version-$build.tar.gz.tmp" "https://unofficial-builds.nodejs.org/download/release/$version/node-$version-$build.tar.gz"
    wget -O "/tmp/node-$version-$build.tar.gz.tmp" "https://cdn.glitch.me/b949e952-067e-4aea-97c9-f482f9ccd052/node-$version-$build.tar.gz"
    echo "$tarball_sha256  /tmp/node-$version-$build.tar.gz.tmp" | sha256sum -c
    mv "/tmp/node-$version-$build.tar.gz.tmp" "/tmp/node-$version-$build.tar.gz"
  fi
  (cd /tmp && tar -xf "node-$version-$build.tar.gz")
fi
PATH="/tmp/node-$version-$build/bin:$PATH" npm_config_cache="/tmp/npm-cache/${version#v}" exec npx @vscode/vsce "$@"
