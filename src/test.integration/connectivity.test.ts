import { describe, it, expect } from 'vitest';
import { setupMcpClient, getClient, EXPECTED_TOOLS } from './helpers/test-setup.js';

describe('MCP Server Connectivity', () => {
    setupMcpClient();

    it('should list all expected tools', async () => {
        const client = getClient();
        const result = await client.listTools();
        const toolNames = result.tools.map(tool => tool.name).sort();
        
        console.log('Available tools:', toolNames);
        
        // Check that all expected tools are present
        for (const expectedTool of EXPECTED_TOOLS) {
            expect(toolNames.includes(expectedTool), `Expected tool '${expectedTool}' not found. Available: ${toolNames.join(', ')}`).toBe(true);
        }
        
        expect(toolNames.length, `Expected ${EXPECTED_TOOLS.length} tools, got ${toolNames.length}`).toBe(EXPECTED_TOOLS.length);
    });
});