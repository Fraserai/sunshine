#!/usr/bin/env bash
# Builds and installs Sunshine on a connected iPhone using a free Apple ID
# (Personal Team). -allowProvisioningUpdates lets xcodebuild create the
# development certificate and provisioning profile without the Xcode UI.
set -euo pipefail
cd "$(dirname "$0")/.."
export LANG=en_US.UTF-8
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"

TEAM="${APPLE_TEAM_ID:-$(grep -E '^APPLE_TEAM_ID=' .env 2>/dev/null | cut -d= -f2)}"
[ -n "$TEAM" ] || { echo "APPLE_TEAM_ID not set in mobile/.env"; exit 1; }

DEVICE_ID="${1:-}"
if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID=$(xcrun xctrace list devices 2>/dev/null | sed -n '/^== Devices ==/,/^== Simulators/p' \
    | grep -i iphone | grep -v Simulator | head -1 | sed 's/.*(\([0-9A-Fa-f-]\{8,\}\)).*/\1/')
fi
[ -n "$DEVICE_ID" ] || { echo "No iPhone found. Plug it in, unlock, Trust This Computer."; exit 1; }

echo "  team:   $TEAM"
echo "  device: $DEVICE_ID"
xcodebuild -workspace ios/Sunshine.xcworkspace -scheme Sunshine \
  -configuration Debug -destination "id=$DEVICE_ID" \
  -derivedDataPath ios/build -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
  -quiet build
