#!/usr/bin/env bash
# Checks everything needed to build Sunshine onto a physical iPhone
# with a free Apple ID (Personal Team). Safe to run repeatedly.

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n     → %s\n" "$1" "$2"; FAIL=1; }
warn() { printf "  \033[33m!\033[0m %s\n     → %s\n" "$1" "$2"; }

FAIL=0
echo
echo "Sunshine preflight"
echo "──────────────────"

# ---- Xcode ----
if [ -d /Applications/Xcode.app ]; then
  V=$(/usr/bin/plutil -extract CFBundleShortVersionString raw /Applications/Xcode.app/Contents/Info.plist 2>/dev/null)
  ok "Xcode installed (${V:-unknown version})"
else
  bad "Xcode not installed" "Install it from the App Store, then open it once."
fi

DEV_DIR=$(xcode-select -p 2>/dev/null)
case "$DEV_DIR" in
  */Xcode.app/*) ok "xcode-select → $DEV_DIR" ;;
  *) bad "xcode-select → ${DEV_DIR:-unset}" "sudo xcode-select -s /Applications/Xcode.app" ;;
esac

# `xcodebuild -version` succeeds even with the licence unaccepted, so probe something
# that actually requires it.
LIC=$(xcrun devicectl list devices 2>&1)
if echo "$LIC" | grep -q "license"; then
  bad "Xcode licence not accepted" "sudo xcodebuild -license accept"
elif xcodebuild -version >/dev/null 2>&1; then
  ok "Xcode licence accepted"
else
  bad "xcodebuild not usable" "Open Xcode once to install components."
fi

# ---- CocoaPods ----
if command -v pod >/dev/null 2>&1; then
  ok "CocoaPods $(pod --version 2>/dev/null)"
else
  bad "CocoaPods not installed" "brew install cocoapods   (see README for the no-Homebrew route)"
fi

# ---- Device ----
if command -v xcrun >/dev/null 2>&1 && xcrun xctrace list devices >/dev/null 2>&1; then
  DEVICES=$(xcrun xctrace list devices 2>/dev/null | sed -n '/^== Devices ==/,/^==/p' | grep -iE "iphone" | grep -v "Simulator")
  if [ -n "$DEVICES" ]; then
    ok "iPhone connected:"
    echo "$DEVICES" | sed 's/^/       /'
  else
    warn "No iPhone detected" "Plug it in, unlock it, and tap Trust This Computer."
  fi
else
  warn "Cannot list devices yet" "Needs a working Xcode install."
fi

# ---- Project config ----
[ -f server/.env ] && ok "server/.env exists" || bad "server/.env missing" "cp server/.env.example server/.env"
[ -f mobile/.env ] && ok "mobile/.env exists" || bad "mobile/.env missing" "cp mobile/.env.example mobile/.env"

if [ -f server/.env ]; then
  for KEY in ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID FAL_KEY; do
    if grep -qE "^${KEY}=.+" server/.env; then ok "$KEY set"; else bad "$KEY empty" "Fill it in server/.env"; fi
  done
  DRY=$(grep -E "^VISUAL_DRY_RUN=" server/.env | cut -d= -f2)
  [ "$DRY" = "true" ] && ok "VISUAL_DRY_RUN=true (no fal spend)" || warn "VISUAL_DRY_RUN=$DRY" "Live fal generations WILL be billed."
fi

# ---- Phone can reach the backend ----
if [ -f mobile/.env ]; then
  BASE=$(grep -E "^EXPO_PUBLIC_API_BASE_URL=" mobile/.env | cut -d= -f2-)
  case "$BASE" in
    *localhost*|*127.0.0.1*) bad "API base is $BASE" "A physical iPhone cannot reach localhost. Use this Mac's LAN IP." ;;
    "") bad "EXPO_PUBLIC_API_BASE_URL unset" "Set it to http://<mac-lan-ip>:8787" ;;
    *)
      IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
      case "$BASE" in
        *"$IP"*) ok "API base $BASE matches this Mac ($IP)" ;;
        *) warn "API base $BASE, but this Mac is at $IP" "Update mobile/.env if the network changed." ;;
      esac
      if curl -s --max-time 3 "$BASE/health" >/dev/null 2>&1; then
        ok "Backend responding at $BASE"
      else
        warn "Backend not responding at $BASE" "Start it with: npm run server"
      fi ;;
  esac
fi

echo
[ "$FAIL" = "1" ] && echo "  Not ready yet — fix the ✗ items above." || echo "  Ready to build."
echo
