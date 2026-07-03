#!/bin/sh
# Headless spec runner: one fresh Neovim per spec file so module-level
# lifecycle state never leaks between suites.
set -e
cd "$(dirname "$0")/.."
for spec in tests/*_spec.lua; do
  echo "== $spec"
  nvim --headless -u tests/minimal_init.lua \
    -c "lua require('plenary.busted').run('$spec')" \
    -c "qa!"
done
