#!/usr/bin/env bash
# Builds the EmberZNet NCP firmware for the TubesZB EFR32 MGM210 2022 with
# NabuCasa/silabs-firmware-builder in a temporary Docker container.
#
# Usage (Linux/WSL with Docker):
#   ./efr32/build.sh                 # output in ./efr32/out/
#
# Requires: git, docker. The builder image is several GB.
set -euo pipefail

BUILDER_REPO=https://github.com/NabuCasa/silabs-firmware-builder
BUILDER_COMMIT=${BUILDER_COMMIT:-dae84f45de27fdf02c3044ccd01223e46927569c}   # used for 9.1.1.1
IMAGE=${IMAGE:-ghcr.io/nabucasa/silabs-firmware-builder:latest}
SDK_NEEDED=simplicity_sdk_2026.6.1

HERE=$(cd "$(dirname "$0")" && pwd)
MANIFEST="$HERE/manifest/tubeszb_mgm210_zigbee_ncp.yaml"
WORK=$(mktemp -d)
OUT="$HERE/out"
trap 'rm -rf "$WORK"' EXIT

echo "== Fetching builder ($BUILDER_COMMIT)"
git clone -q "$BUILDER_REPO" "$WORK/sfb"
git -C "$WORK/sfb" checkout -q "$BUILDER_COMMIT"
mkdir -p "$WORK/sfb/manifests/tubeszb"
cp "$MANIFEST" "$WORK/sfb/manifests/tubeszb/"

echo "== Builder-image"
if docker pull -q "$IMAGE" && \
   docker run --rm --entrypoint /bin/sh "$IMAGE" -c "test -d /opt/silabs/sdks/$SDK_NEEDED"; then
  USE_IMAGE=$IMAGE
else
  echo "Image lacks $SDK_NEEDED: building it locally"
  USE_IMAGE=tubezb-sfb:local
  docker build -t "$USE_IMAGE" "$WORK/sfb"
fi

echo "== Building firmware"
docker run --rm -v "$WORK/sfb:/repo" "$USE_IMAGE" \
  --manifest manifests/tubeszb/tubeszb_mgm210_zigbee_ncp.yaml \
  --output gbl --output hex --output-dir artifacts

mkdir -p "$OUT"
cp "$WORK"/sfb/artifacts/* "$OUT/"
(cd "$OUT" && sha256sum ./*.gbl ./*.hex > SHA256SUMS)
echo "== Done: $OUT"
ls -la "$OUT"
