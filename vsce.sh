#!/bin/sh -eux
build=linux-x64-glibc-217
version=v22.14.0
tarball_sha256=835e9acb99f0a6dd935c084f83e5cb97c073a7e94134fb43b0667050935a2eb2
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
PATH="/tmp/node-$version-$build/bin:$PATH" exec npx --cache "/tmp/npm-cache/${version#v}" @vscode/vsce "$@"
