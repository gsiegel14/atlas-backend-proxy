#!/bin/bash

echo "=== Pre-build Environment Check ==="
echo "Date: $(date)"
echo "PWD: $(pwd)"
echo ""

echo "Checking FOUNDRY_TOKEN:"
if [ -n "$FOUNDRY_TOKEN" ]; then
    echo "✅ FOUNDRY_TOKEN is set (length: ${#FOUNDRY_TOKEN})"
else
    echo "❌ FOUNDRY_TOKEN is NOT set"
fi
echo ""

echo "Checking .npmrc:"
if [ -f .npmrc ]; then
    echo "✅ .npmrc exists"
    echo "Contents:"
    cat .npmrc
else
    echo "❌ .npmrc not found"
fi
echo ""

echo "Checking npm registry config:"
npm config get @atlas-dev:registry || echo "No registry set for @atlas-dev"
echo ""

echo "Environment variables starting with FOUNDRY:"
env | grep ^FOUNDRY | sed 's/=.*/=***/' | sort
echo ""

echo "=== End Pre-build Check ==="
