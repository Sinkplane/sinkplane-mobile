#!/usr/bin/env bash
# Installs a demo-mode copy of the app on iOS simulators: an existing Release simulator build
# (it has every native module) with its JS swapped for a production bundle of store/demo/entry.ts,
# shown as "Sinkplane". No Metro needed, and the debug-vs-release Pods dance is avoided.
# See store/README.md.
#
#   store/demo/ios-sim-app.sh <simulator udid>...
#
# Needs a Release build for the simulator in DerivedData:
#   xcodebuild -workspace ios/sinkplanemobile.xcworkspace -scheme sinkplanemobile \
#     -configuration Release -sdk iphonesimulator build
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

release_app="$(ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/sinkplanemobile-*/Build/Products/Release-iphonesimulator/sinkplanemobile.app 2>/dev/null | head -1)"
[[ -d "$release_app" ]] || { echo "No Release simulator build found (see the header of this script)" >&2; exit 1; }
hermesc="$(ls "$root"/node_modules/.pnpm/hermes-compiler@*/node_modules/hermes-compiler/hermesc/osx-bin/hermesc | tail -1)"

cd "$root"
SINKPLANE_DEMO=1 pnpm exec expo export:embed --platform ios --entry-file store/demo/entry.ts \
  --bundle-output "$work/main.js" --assets-dest "$work/assets" --dev false --minify true >/dev/null
"$hermesc" -emit-binary -O -w -out "$work/main.jsbundle" "$work/main.js"

app="$work/sinkplanemobile.app"
cp -R "$release_app" "$app"
cp "$work/main.jsbundle" "$app/main.jsbundle"
rsync -a "$work/assets/" "$app/assets/"
plutil -replace CFBundleDisplayName -string Sinkplane "$app/Info.plist"

for udid in "$@"; do
  xcrun simctl install "$udid" "$app"
  echo "Installed the demo app on $udid (from $release_app)"
done
