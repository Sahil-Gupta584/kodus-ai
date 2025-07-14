#!/usr/bin/env bash
# Publica o pacote atual no Artifact Registry npm da Kodus

set -euo pipefail

REGISTRY="https://us-central1-npm.pkg.dev/kodus-infra-prod/kodus-common/"
PACKAGE_JSON="$(jq -r '.name' package.json)"
NEXT_VERSION="$(npm version patch --no-git-tag-version)"

echo "➡️  Nova versão: $PACKAGE_JSON@$NEXT_VERSION"

# 1) Gera token e grava em .npmrc (dura ~60 min)
npx --registry=https://registry.npmjs.org/ \
    google-artifactregistry-auth \
    --repo-config="$REGISTRY"

# 2) Publica
npm publish --registry="$REGISTRY"

echo "✅  Publicado em $REGISTRY"
