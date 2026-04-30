#!/bin/bash
# Generates m4a audio using macOS Ioana (ro_RO) voice.
# Covers both phrases.json and dialogues.json.
# Output: public/audio/{id}.m4a for phrases, {id}-prompt.m4a + {id}-r{N}.m4a for dialogues.
# Skips files that already exist. Pass --force to regenerate all.

set -euo pipefail

cd "$(dirname "$0")/.."
PHRASES="src/data/phrases.json"
DIALOGUES="src/data/dialogues.json"
OUT="public/audio"
FORCE=${1:-}
mkdir -p "$OUT"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found. Install with: brew install jq"
  exit 1
fi

say_to_m4a() {
  local text="$1"
  local outfile="$2"
  if [[ -f "$outfile" && "$FORCE" != "--force" ]]; then
    return
  fi
  local aiff
  aiff=$(mktemp -t romaneste).aiff
  say -v Ioana -o "$aiff" "$text"
  afconvert -f m4af -d aac "$aiff" "$outfile" >/dev/null
  rm -f "$aiff"
  echo "  ✓ $outfile"
}

echo "── Phrases ──"
jq -c '.[]' "$PHRASES" | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  ro=$(echo "$row" | jq -r '.ro')
  say_to_m4a "$ro" "$OUT/$id.m4a"
done

echo "── Dialogues ──"
jq -c '.[]' "$DIALOGUES" | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  prompt=$(echo "$row" | jq -r '.prompt')
  say_to_m4a "$prompt" "$OUT/$id-prompt.m4a"
  # Responses
  count=$(echo "$row" | jq '.responses | length')
  for i in $(seq 0 $((count - 1))); do
    rro=$(echo "$row" | jq -r ".responses[$i].ro")
    say_to_m4a "$rro" "$OUT/$id-r$i.m4a"
  done
done

echo ""
echo "Done. Pass --force to regenerate existing files."
