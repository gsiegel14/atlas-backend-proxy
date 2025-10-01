#!/bin/bash
# This script sets up NPM authentication for the Foundry registry
# It should be run before npm install to properly authenticate

echo "=== NPM Auth Setup Script Started ==="
echo "Current directory: $(pwd)"
echo "Script location: $0"
echo "Setting up NPM authentication for Foundry registry..."

if [ -z "$FOUNDRY_TOKEN" ]; then
    echo "❌ FOUNDRY_TOKEN environment variable is not set!"
    echo "   NPM will not be able to authenticate with Foundry registry."
    exit 1
fi

echo "✅ FOUNDRY_TOKEN is available (length: ${#FOUNDRY_TOKEN})"

# Create .npmrc with the actual token value (not the environment variable)
cat > .npmrc << EOF
# Foundry NPM Registry Authentication
//atlasengine.palantirfoundry.com/artifacts/api/repositories/ri.artifacts.main.repository.da5e46da-8a31-4c62-bccc-b3d5af0c8355/contents/release/npm/:_authToken=${FOUNDRY_TOKEN}

# Scope configuration for @atlas-dev packages
@atlas-dev:registry=https://atlasengine.palantirfoundry.com/artifacts/api/repositories/ri.artifacts.main.repository.da5e46da-8a31-4c62-bccc-b3d5af0c8355/contents/release/npm
EOF

echo "✅ Created .npmrc with authentication token"
echo "   Registry: $(grep '@atlas-dev:registry' .npmrc | cut -d= -f2)"

# Verify the token works by trying to get package info
echo ""
echo "Testing registry access..."
npm view @atlas-dev/sdk name 2>/dev/null && echo "✅ Successfully authenticated with Foundry NPM registry!" || echo "⚠️  Could not verify registry access"
