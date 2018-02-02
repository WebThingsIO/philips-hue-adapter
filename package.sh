#!/bin/bash

rm -f SHA256SUMS
sha256sum package.json ./*.js LICENSE > SHA256SUMS
npm pack
tar xzf ./philips-hue-adapter-*.tgz
cp -r node_modules ./package
tar czf philips-hue-adapter.tgz package
