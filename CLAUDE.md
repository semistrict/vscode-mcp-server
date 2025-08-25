# Claude Development Guide

## MCP Server Configuration

### Transport Modes

The MCP server supports two transport modes:

**Unix Domain Socket (Default):**
- Set `vscode-mcp-server.useUnixSocket` to `true` (default)
- Socket path is automatically computed as: `$HOME/.vscode-mcp/projects/{workspace-dir-with-slashes-replaced}/vscode-mcp.sock`
- Status bar shows "MCP Server: UDS" when active
- Better performance and security for local connections

**HTTP Mode (Legacy):**
- Set `vscode-mcp-server.useUnixSocket` to `false`
- Uses port configured in `vscode-mcp-server.port` (default: 11331)
- Status bar shows "MCP Server: {port}" when active

### Launch Script

The `scripts/vscode-mcp-stdio` script launches VS Code with the MCP extension for command-line MCP usage:
- Compiles the extension
- Launches VS Code with custom user data directory
- Waits for Unix socket to be ready
- Connects stdin/stdout to the MCP server socket

## Testing

**Note: This project currently uses integration tests only. No unit tests are implemented.**

### Integration Tests

Integration tests automatically compile TypeScript before running. Do not run `npm run compile` separately.

**Run all integration tests:**
```bash
npm test:integration
```

**Run specific test file:**
```bash
npm run test:integration:test-only -- src/test.integration/debug-breakpoints.test.ts
```

**Run specific test case:**
```bash
npm run test:integration:test-only -- src/test.integration/debug-breakpoints.test.ts -t "should handle invalid input"
```

**Run debug end-to-end tests:**
```bash
npm run test:debug-e2e
```

### Test Environment

- Tests automatically launch VS Code with the extension
- MCP server starts automatically (Unix socket at `.tmp/mcp-server.sock` or HTTP on port 11331)
- Test workspace is created at `.tmp/workspace` with Go test fixtures
- VS Code instance is killed and restarted for each test run
- Environment variable `VSCODE_MCP_SOCKET` can override the socket path

### Test Retry

If VS Code crashes during launch (common on macOS), the test script will automatically retry up to 3 times.

## Error Handling

### MCP Tools Error Handling

MCP tools should let errors propagate naturally instead of catching and re-throwing them. The MCP SDK automatically converts thrown errors to `{ isError: true }` responses.

**Good:**
```typescript
async ({ param }): Promise<CallToolResult> => {
    if (!param) {
        throw new Error('Parameter is required');
    }
    
    const result = await someAsyncOperation();
    
    return {
        content: [{ type: 'text', text: result }]
    };
}
```

**Bad:**
```typescript
async ({ param }): Promise<CallToolResult> => {
    try {
        // ... implementation
        return { content: [{ type: 'text', text: result }] };
    } catch (error) {
        console.error('Error:', error);
        throw new Error(`Failed: ${error}`);
    }
}
```

Do not wrap tool implementations in try-catch blocks unless you need to perform specific cleanup or error transformation.

## Integration Test Template

Use this template for creating new integration tests:

```typescript
import { describe, it } from 'vitest';
import { setupMcpClient, callToolSafely, callToolForText, getClient, expect } from './helpers/test-setup.js';

describe('Your Tool Tests', () => {
    setupMcpClient();

    describe('your_tool_name', () => {
        it('should handle success case', async () => {
            const result = await callToolForText('your_tool_name', {
                param: 'value'
            });
            
            expect(result.length).toBeGreaterThan(0);
            expect(result).toContain('expected text');
        });

        it('should handle error case', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'your_tool_name',
                arguments: { invalid: 'params' }
            });
            
            expect(result).toBeErrorMatching('Expected error pattern');
        });

        it('should handle specific behavior', async () => {
            const result = await callToolForText('your_tool_name', {
                specificParam: 'testValue'
            });
            
            expect(result).toContain('expected specific output');
        });
    });
});
```

### Available Test Helpers

- `setupMcpClient()`: Sets up MCP client connection (call in describe block)
- `getClient()`: Gets the MCP client instance for direct tool calls
- `callToolForText(name, args)`: Calls tool and returns text content
- `callToolSafely(name, args)`: Calls tool with error handling, returns `{ success, result?, error? }`
- `expect(value).toBeErrorMatching(pattern)`: Custom matcher for MCP error responses

## CRITICAL: Test Assertion Rules

**BANNED PATTERNS - DO NOT USE:**

```typescript
// ❌ NEVER use conditional expects
if (success) {
    expect(result).toBeDefined();
} else {
    expect(error).toBeDefined();
}

// ❌ NEVER use || in expects  
expect(result === 'foo' || result === 'bar').toBe(true);

// ❌ NEVER use vague assertions that hide what you actually expect
expect(result).toBeDefined();
expect(result.length).toBeGreaterThan(0);
```

**CORRECT APPROACH:**

```typescript
// ✅ Be specific about what you expect, even if you're guessing
expect(result).toContain('Set breakpoint in main.go at line 10');

// ✅ If you don't know the exact value, make your best guess
expect(result).toBe('Expected specific output here');

// ✅ When test fails, the error message tells you what the actual value was
// Then you can update the test with the correct expectation
```

**PHILOSOPHY: FAILING TESTS ARE GOOD!** They tell you exactly what the actual behavior is. Don't try to write tests that "might pass" - write tests that assert exactly what should happen, then fix them when they fail and show you the real behavior.

## Debug Console Messages

The debug system now tracks console output messages from debug sessions:

### Architecture

**DebugConsoleBuffer Class (`src/tools/debug-console-buffer.ts`):**
- Singleton class managing a circular buffer of 1000 console messages
- Listens to VS Code's `onDidReceiveDebugSessionCustomEvent` for DAP output events
- Tracks messages per session ID with timestamps and categories (stdout, stderr, console)
- Provides `getNewMessages(sessionId)` to retrieve unread messages since last call
- Automatically cleans up tracking when debug sessions terminate

### Integration with Debug Tools

Debug state results now include console messages:
- The `waitUntilPausedAndGetDebugState` method returns `consoleMessages` field
- Contains all new console output since the last state check
- Messages include timestamp, category, output text, and optional source location
- Formatted in markdown output with timestamps and categories

### Usage in Tests

Debug tests can now verify console output:
```typescript
const state = await thread.waitUntilPausedAndGetState();
if (state.consoleMessages) {
    // Check console output
    const outputs = state.consoleMessages.map(m => m.output);
    expect(outputs).toContain('Expected console message');
}
```

## Package Management

- Use npm NOT pnpm
- NEVER run test:integration:test-only it does not do what you think it does