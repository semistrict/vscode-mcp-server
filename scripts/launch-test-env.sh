#!/bin/bash

# Launch VS Code with the test fixtures workspace and extension in development mode
# This allows for manual testing of the MCP server integration

set -e

# Get the directory of this script and the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_TEST_FIXTURES_DIR="$PROJECT_ROOT/test-fixtures/go-workspace"
TEST_FIXTURES_DIR="$PROJECT_ROOT/.tmp/go-workspace"
EXTENSION_DIR="$PROJECT_ROOT"

echo "🚀 Launching VS Code test environment..."
echo "📁 Workspace: $TEST_FIXTURES_DIR"
echo "🔧 Extension: $EXTENSION_DIR"

# Check if source test fixtures exist
if [ ! -d "$SOURCE_TEST_FIXTURES_DIR" ]; then
    echo "❌ Error: Source test fixtures directory not found at $SOURCE_TEST_FIXTURES_DIR"
    exit 1
fi

echo "🎯 Starting VS Code with extension in development mode..."
echo "   - The MCP server extension will be loaded"
echo "   - Test fixtures workspace will be opened"  
echo "   - Use Cmd+Shift+P -> 'MCP Server: Toggle Server' to enable"
echo "   - Check status bar for MCP server status"
echo ""

# Create .tmp directory and copy test fixtures
echo "📋 Creating test workspace copy..."
mkdir -p "$PROJECT_ROOT/.tmp"
rm -rf "$TEST_FIXTURES_DIR"
cp -r "$SOURCE_TEST_FIXTURES_DIR" "$TEST_FIXTURES_DIR"

# Move dotgit to .git if it exists (for proper git repo setup)
if [ -d "$TEST_FIXTURES_DIR/dotgit" ]; then
    echo "🔧 Setting up git repository (.git from dotgit)..."
    mv "$TEST_FIXTURES_DIR/dotgit" "$TEST_FIXTURES_DIR/.git"
fi

# Create unique user data directory for isolated VS Code instance (absolute path)
TIMESTAMP=$(date +%s)
USER_DATA_DIR="$(cd "$PROJECT_ROOT" && pwd)/.tmp/vscode-user-data-$TIMESTAMP"
PID_FILE="$(cd "$PROJECT_ROOT" && pwd)/.tmp/vscode.pid"

# Kill any existing VS Code instance using our test user data directory pattern
echo "🔄 Killing any existing test VS Code instance..."
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "   Killing VS Code with PID $OLD_PID"
        kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
fi
/usr/bin/pkill -9 -f "$USER_DATA_DIR" 2>/dev/null || true

# Clean old user data directories to ensure fresh state
echo "🧹 Cleaning old user data directories..."
rm -rf "$PROJECT_ROOT/.tmp/vscode-user-data"*

mkdir -p "$USER_DATA_DIR"

# Pre-install Go extension
echo "📦 Installing Go extension..."
code --user-data-dir="$USER_DATA_DIR" --install-extension golang.go

# Launch VS Code with the extension in development mode and capture PID
code \
    --extensionDevelopmentPath="$EXTENSION_DIR" \
    --disable-workspace-trust \
    --user-data-dir="$USER_DATA_DIR" \
    "$TEST_FIXTURES_DIR" &

# Get the PID of the launched VS Code process
VSCODE_PID=$!
echo "$VSCODE_PID" > "$PID_FILE"
echo "   VS Code launched with PID $VSCODE_PID"

# Wait for the process to actually start
sleep 2

# Find the actual VS Code process (code launches a wrapper)
ACTUAL_PID=$(/usr/bin/pgrep -f "$USER_DATA_DIR" | head -1)
if [ -n "$ACTUAL_PID" ]; then
    echo "$ACTUAL_PID" > "$PID_FILE"
    echo "   Actual VS Code PID: $ACTUAL_PID"
else
    echo "❌ Error: Could not determine VS Code process PID"
    echo "   VS Code may have failed to start or crashed immediately"
    exit 1
fi

echo "✅ VS Code launched! The extension is now running in development mode."
echo ""
echo "🔄 Waiting for MCP server to start (should be automatic)..."

# Wait longer for the server to start (extension installation can be slow)
for i in {1..15}; do
    sleep 3
    echo "   Attempt $i/15: Testing connection to http://localhost:11331/mcp"
    
    if curl -s -X POST http://localhost:11331/mcp \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
        --connect-timeout 3 > /dev/null 2>&1; then
        echo "   ✅ Server is responding!"
        break
    fi
    
    if [ $i -eq 15 ]; then
        echo "   ❌ Server not responding after 45 seconds"
        echo "   💡 Check VS Code status bar or manually enable the server"
        exit 1
    fi
done

echo ""
echo "🧪 Testing MCP server with tools/list request:"
curl -X POST http://localhost:11331/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
    2>/dev/null | python3 -m json.tool || echo "Server not responding or invalid JSON response"

echo ""
echo "📋 Manual testing commands:"
echo "   List tools: curl -X POST http://localhost:11331/mcp -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}'"
echo "   Test list_files: curl -X POST http://localhost:11331/mcp -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_files_code\",\"arguments\":{\"path\":\"\"}},\"id\":1}'"