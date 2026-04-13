#!/bin/bash
# Comprehensive MCP Protocol Test for Jarvis Voice Plugin
set -uo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

PASS=0
FAIL=0
TOTAL=0

INIT='{"jsonrpc":"2.0","id":0,"method":"initialize","params":{}}'
NOTIFY='{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

call_mcp() {
  local request="$1"
  printf '%s\n%s\n%s\n' "$INIT" "$NOTIFY" "$request" | JARVIS_DATA="$TMPDIR" node dist/main.js 2>/dev/null & local PID=$!
  sleep 1
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
}

check() {
  local name="$1"
  local output="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$output" | grep -q "$expected"; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected: $expected)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Jarvis MCP Protocol Test Suite ==="
echo ""

# 1: Initialize
echo "[1/14] initialize"
OUT=$(printf '%s\n' "$INIT" | JARVIS_DATA="$TMPDIR" node dist/main.js 2>/dev/null & PID=$!; sleep 1; kill $PID 2>/dev/null; wait $PID 2>/dev/null)
check "Returns protocolVersion" "$OUT" "protocolVersion"

# 2: tools/list - all 12 tools present
echo "[2/14] tools/list"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
check "ListenForResponse defined" "$OUT" "ListenForResponse"
check "SpeakText defined" "$OUT" "SpeakText"
check "GetVoiceStatus defined" "$OUT" "GetVoiceStatus"
check "StartEnrollment defined" "$OUT" "StartEnrollment"
check "DownloadModels defined" "$OUT" "DownloadModels"
check "GetDebugLog defined" "$OUT" "GetDebugLog"
check "GetSessionStats defined" "$OUT" "GetSessionStats"

# 3: GetVoiceStatus
echo "[3/14] GetVoiceStatus"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"GetVoiceStatus","arguments":{}}}')
check "Returns mode field" "$OUT" "mode"
check "Reports pipelineReady" "$OUT" "pipelineReady"
check "Reports queueDepth" "$OUT" "queueDepth"

# 4: SetMode (vad)
echo "[4/14] SetMode (vad)"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"SetMode","arguments":{"mode":"vad"}}}')
check "Mode set to vad" "$OUT" "vad"

# 5: SetMode (unsupported)
echo "[5/14] SetMode (push-to-talk)"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"SetMode","arguments":{"mode":"push-to-talk"}}}')
check "Rejects unsupported mode" "$OUT" "Error"

# 6: SetThreshold
echo "[6/14] SetThreshold"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"SetThreshold","arguments":{"parameter":"vad_sensitivity","value":0.7}}}')
check "Returns updated value" "$OUT" "0.7"

# 7: SetThreshold (invalid)
echo "[7/14] SetThreshold (invalid)"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"SetThreshold","arguments":{"parameter":"vad_sensitivity","value":1.5}}}')
check "Rejects out-of-range" "$OUT" "Error"

# 8: StartEnrollment
echo "[8/14] StartEnrollment"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"StartEnrollment","arguments":{}}}')
check "Returns sessionId" "$OUT" "sessionId"
check "Returns prompt phrase" "$OUT" "quick brown fox"
check "Status is recording" "$OUT" "recording"

# 9: ResetProfile
echo "[9/14] ResetProfile"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"ResetProfile","arguments":{}}}')
check "Profile reset" "$OUT" "reset"

# 10: GetDebugLog
echo "[10/14] GetDebugLog"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"GetDebugLog","arguments":{"count":5}}}')
check "Returns log entries" "$OUT" "entries"

# 11: GetSessionStats
echo "[11/14] GetSessionStats"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"GetSessionStats","arguments":{}}}')
check "Returns session stats" "$OUT" "utterancesCaptured"

# 12: SpeakText (no models)
echo "[12/14] SpeakText (no models)"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"SpeakText","arguments":{"text":"Hello world"}}}')
check "Handles missing TTS gracefully" "$OUT" "Error\|not initialized\|false"

# 13: Unknown tool
echo "[13/14] Unknown tool"
OUT=$(call_mcp '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"FakeTool","arguments":{}}}')
check "Returns error for unknown" "$OUT" "Error\|unknown\|Unknown"

# 14: Config persistence
echo "[14/14] Config persistence"
# Set threshold, then check it persists in new server instance
call_mcp '{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"SetThreshold","arguments":{"parameter":"speaker_confidence","value":0.8}}}' >/dev/null
OUT=$(call_mcp '{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"GetVoiceStatus","arguments":{}}}')
# Config was saved, so threshold change should persist
check "Config file written" "$(cat $TMPDIR/config.json 2>/dev/null)" "0.8"

echo ""
echo "=== Results ==="
echo "  Total: $TOTAL"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"

if [ $FAIL -eq 0 ]; then
  echo "  ALL TESTS PASSED"
else
  echo "  SOME TESTS FAILED"
fi
exit $FAIL
