#!/bin/bash
# Generates audio using ElevenLabs API (much better quality than macOS Ioana).
# Outputs .m4a files so the app works unchanged.
#
# Setup:
#   export ELEVENLABS_API_KEY=sk_...your_key_here...
#   export ELEVENLABS_VOICE_ID=your_voice_id   # optional, see below
#
# Recommended Romanian voices (copy/paste the ID you want):
#   Ioana (Romanian native) — check ElevenLabs voice library → search "Romanian"
#   Charlotte               — cJO3tE0bHLNkFaInCfZU  (warm, multilingual)
#   Aria                    — 9BWtsMINqrJLrRacOk9x  (clear, multilingual)
#   Default if not set      — Aria
#
# Usage:
#   bash scripts/generate-audio-elevenlabs.sh           # generate missing files only
#   bash scripts/generate-audio-elevenlabs.sh --force   # regenerate everything

set -euo pipefail

cd "$(dirname "$0")/.."
PHRASES="src/data/phrases.json"
DIALOGUES="src/data/dialogues.json"
OUT="public/audio"
FORCE=${1:-}
MODEL="eleven_multilingual_v2"
VOICE_ID="${ELEVENLABS_VOICE_ID:-9BWtsMINqrJLrRacOk9x}"  # Aria by default

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "Error: ELEVENLABS_API_KEY is not set."
  echo "Run: export ELEVENLABS_API_KEY=sk_..."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found. Install: brew install jq"
  exit 1
fi

mkdir -p "$OUT"

eleven_to_m4a() {
  local text="$1"
  local outfile="$2"
  if [[ -f "$outfile" && "$FORCE" != "--force" ]]; then
    return
  fi
  local mp3
  mp3=$(mktemp -t romaneste).mp3
  local payload
  payload=$(jq -n --arg t "$text" --arg m "$MODEL" \
    '{text: $t, model_id: $m, voice_settings: {stability: 0.5, similarity_boost: 0.75}}')

  http_code=$(curl -s -o "$mp3" -w "%{http_code}" \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: audio/mpeg" \
    --data "$payload")

  if [[ "$http_code" != "200" ]]; then
    echo "  ✗ HTTP $http_code for: $text"
    rm -f "$mp3"
    return 1
  fi

  afconvert -f m4af -d aac "$mp3" "$outfile" >/dev/null
  rm -f "$mp3"
  echo "  ✓ $outfile"
  sleep 0.25  # stay within rate limits
}

echo "── Phrases ──"
jq -c '.[]' "$PHRASES" | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  ro=$(echo "$row" | jq -r '.ro')
  eleven_to_m4a "$ro" "$OUT/$id.m4a"
done

echo "── Dialogues ──"
jq -c '.[]' "$DIALOGUES" | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  prompt=$(echo "$row" | jq -r '.prompt')
  eleven_to_m4a "$prompt" "$OUT/$id-prompt.m4a"
  count=$(echo "$row" | jq '.responses | length')
  for i in $(seq 0 $((count - 1))); do
    rro=$(echo "$row" | jq -r ".responses[$i].ro")
    eleven_to_m4a "$rro" "$OUT/$id-r$i.m4a"
  done
done

echo ""
echo "Done. Voice: $VOICE_ID, Model: $MODEL"
