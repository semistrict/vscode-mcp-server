# Claude Development Guide

## Testing

**Note: This project currently uses integration tests only. No unit tests are implemented.**

### Integration Tests

Integration tests automatically compile TypeScript before running. Do not run `pnpm run compile` separately.

**Run all integration tests:**
```bash
pnpm test:integration
```

**Run specific test file:**
```bash
pnpm run test:integration:test-only -- src/test.integration/debug-breakpoints.test.ts
```

**Run specific test case:**
```bash
pnpm run test:integration:test-only -- src/test.integration/debug-breakpoints.test.ts -t "should handle invalid input"
```

### Test Environment

- Tests automatically launch VS Code with the extension
- MCP server starts automatically on port 11331
- Test workspace is created at `.tmp/go-workspace`
- VS Code instance is killed and restarted for each test run

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
- Use pnpm NOT npm