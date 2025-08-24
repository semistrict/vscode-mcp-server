# Tool Migration Procedure

## Overview
This document describes the process for migrating MCP tools from the old `server.tool()` format to the new typed `ToolDef` format using `server.registerTool()`.

## Background
We've implemented a fully typed tool system that provides:
- **Type safety**: Arguments are validated at compile time using Zod schemas
- **Better testing**: `toolCall(toolDef, args)` with full TypeScript validation
- **Cleaner API**: `registerTool(name, config, handler)` vs multiple `tool()` overloads

## Key Types Created

### Core Types (`src/utils/types.ts`)
```typescript
export type ToolDef = Parameters<McpServer['registerTool']>;
export type ToolArgs<T extends ToolDef> = ZodInput<ToolSchema<T>>;
export type Awaitable<T> = T | Promise<T>;
```

### Test Helpers (`src/test.integration/helpers/test-setup.ts`)
```typescript
export function toolCall<T extends ToolDef>(tool: T, args: ToolArgs<T>): Promise<CallToolResult>

// Updated matchers to handle promises
async toBeSuccess(received: Awaitable<CallToolResult>)
async toBeError(received: Awaitable<CallToolResult>) 
async toBeSuccessWithText(received: Awaitable<CallToolResult>, expected: string | RegExp)
```

## Migration Process

### Step 1: Extract Tool Definition
Use sed to extract existing tool from source file:
```bash
sed -n 'START_LINE,END_LINEp' src/tools/original-file.ts > src/tools/new-tool-file.ts
```

### Step 2: Convert to ToolDef Format
Replace the `server.tool()` call with typed export:
```typescript
// Before
server.tool('tool_name', 'description', schema, handler)

// After  
export const toolNameTool: ToolDef = [
    'tool_name',
    {
        description: 'description',
        inputSchema: schema
    },
    handler
];
```

Key changes:
- Wrap description in config object: `{ description: '...', inputSchema: {...} }`
- Move handler to third array position
- Close with `];` instead of `);`

### Step 3: Add Imports
Add required imports to the new tool file:
```typescript
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolDef } from '../utils/types.js';
```

### Step 4: Update Registration
In the main registration function, replace `server.tool()` with `server.registerTool()`:
```typescript
// Before
server.tool('tool_name', ...)

// After
import { toolNameTool } from './tool-name.js';
server.registerTool(...toolNameTool);
```

### Step 5: Update Tests
Replace `callToolForText()` calls with new `toolCall()` pattern:
```typescript
// Before
const result = await callToolForText('tool_name', { arg: 'value' });
expect(result).toContain('expected');

// After  
import { toolNameTool } from '../tools/tool-name.js';
await expect(toolCall(toolNameTool, { arg: 'value' }))
    .toBeSuccessWithText(/expected/);
```

## Example Migration

### Original Tool (file-tools.ts)
```typescript
server.tool(
    'list_files_code',
    'Description here',
    {
        path: z.string().describe('Path to list'),
        recursive: z.boolean().optional()
    },
    async ({ path, recursive }) => {
        // handler implementation
        return { content: [{ type: 'text', text: 'result' }] };
    }
);
```

### Migrated Tool (list-files.ts)
```typescript
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolDef } from '../utils/types.js';

export const listFilesTool: ToolDef = [
    'list_files_code',
    {
        description: 'Description here',
        inputSchema: {
            path: z.string().describe('Path to list'),
            recursive: z.boolean().optional()
        }
    },
    async ({ path, recursive }) => {
        // handler implementation  
        return { content: [{ type: 'text', text: 'result' }] };
    }
];
```

### Updated Test
```typescript
import { listFilesTool } from '../tools/list-files.js';

await expect(toolCall(listFilesTool, { path: '.' }))
    .toBeSuccessWithText(/result/);
```

## Benefits

1. **Compile-time type safety**: `toolCall(listFilesTool, { invalidArg: 'bad' })` → TypeScript error
2. **Auto-completion**: IDE provides argument hints based on Zod schema
3. **Refactoring safety**: Tool schema changes automatically update test types
4. **Cleaner tests**: `await expect(toolCall(...)).matcher()` pattern
5. **No duplication**: Single source of truth for tool definitions

## Status

- ✅ Core infrastructure implemented
- ✅ `debugSetBreakpointTool` migrated as example
- ⏳ Remaining tools need migration
- ⏳ All tests need updating to new pattern