#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/.agents/skills"
codex_home="${CODEX_HOME:-$HOME/.codex}"
dest_dir="$codex_home/skills"

if [[ ! -d "$source_dir" ]]; then
  echo "Shared skills directory not found: $source_dir" >&2
  exit 1
fi

mkdir -p "$dest_dir"

linked=0

for skill_path in "$source_dir"/*; do
  [[ -d "$skill_path" ]] || continue

  skill_name="$(basename "$skill_path")"
  dest_path="$dest_dir/$skill_name"

  if [[ -L "$dest_path" ]]; then
    current_target="$(readlink "$dest_path")"
    if [[ "$current_target" == "$skill_path" ]]; then
      continue
    fi

    rm "$dest_path"
    ln -s "$skill_path" "$dest_path"
    echo "Updated $dest_path -> $skill_path"
    linked=1
    continue
  fi

  if [[ -e "$dest_path" ]]; then
    echo "Refusing to replace existing path: $dest_path" >&2
    exit 1
  fi

  ln -s "$skill_path" "$dest_path"
  echo "Linked $dest_path -> $skill_path"
  linked=1
done

if [[ "$linked" -eq 0 ]]; then
  echo "No new Codex skill links were needed."
else
  echo "Restart Codex to pick up the linked skills."
fi
