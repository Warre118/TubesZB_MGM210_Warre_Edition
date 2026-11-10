#!/usr/bin/env bash
# Bouwt de EmberZNet NCP-firmware voor de TubesZB EFR32 MGM210 2022 met
# NabuCasa/silabs-firmware-builder in een tijdelijke Docker-container.
#
# Gebruik (Linux/WSL met Docker):
#   ./efr32/build.sh                 # resultaat in ./efr32/out/
#
# Vereist: git, docker. De builder-image is enkele GB groot.
set -euo pipefail

BUILDER_REPO=https://github.com/NabuCasa/silabs-firmware-builder
BUILDER_COMMIT=${BUILDER_COMMIT:-dae84f45de27fdf02c3044ccd01223e46927569c}   # gebruikt voor 9.1.1.1
IMAGE=${IMAGE:-ghcr.io/nabucasa/silabs-firmware-builder:latest}
SDK_NEEDED=simplicity_sdk_2026.6.1

HERE=$(cd "$(dirname "$0")" && pwd)
MANIFEST="$HERE/manifest/tubeszb_mgm210_zigbee_ncp.yaml"
WORK=$(mktemp -d)
OUT="$HERE/out"
trap 'rm -rf "$WORK"' EXIT

echo "== Builder ophalen ($BUILDER_COMMIT)"
git clone -q "$BUILDER_REPO" "$WORK/sfb"
git -C "$WORK/sfb" checkout -q "$BUILDER_COMMIT"
mkdir -p "$WORK/sfb/manifests/tubeszb"
cp "$MANIFEST" "$WORK/sfb/manifests/tubeszb/"

echo "== Builder-image"
if docker pull -q "$IMAGE" && \
   docker run --rm --entrypoint /bin/sh "$IMAGE" -c "test -d /opt/silabs/sdks/$SDK_NEEDED"; then
  USE_IMAGE=$IMAGE
else
  echo "Image zonder $SDK_NEEDED: zelf bouwen"
  USE_IMAGE=tubezb-sfb:local
  docker build -t "$USE_IMAGE" "$WORK/sfb"
fi

echo "== Firmware bouwen"
docker run --rm -v "$WORK/sfb:/repo" "$USE_IMAGE" \
  --manifest manifests/tubeszb/tubeszb_mgm210_zigbee_ncp.yaml \
  --output gbl --output hex --output-dir artifacts

mkdir -p "$OUT"
cp "$WORK"/sfb/artifacts/* "$OUT/"
(cd "$OUT" && sha256sum ./*.gbl ./*.hex > SHA256SUMS)
echo "== Klaar: $OUT"
ls -la "$OUT"
