#!/usr/bin/env bash
set -euo pipefail
sdk="${FLUTTER_SDK:-/workspace/.toolchains/flutter-3.44.0}"
if [[ ! -x "$sdk/bin/flutter" ]]; then
  echo 'Flutter SDK missing. Run node tools/install-flutter.mjs from repository root.' >&2
  exit 1
fi
exec "$sdk/bin/flutter" "$@"
