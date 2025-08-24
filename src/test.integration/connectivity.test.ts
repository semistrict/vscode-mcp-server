import { describe, it, expect } from 'vitest';
import { setupMcpClient, getClient, EXPECTED_TOOLS } from './helpers/test-setup.js';

describe('MCP Server Connectivity', () => {
    setupMcpClient();

    it('should include all expected tools', async () => {
        const client = getClient();
        const result = await client.listTools();
        const toolNames = result.tools.map(tool => tool.name).sort();
        
        console.log('Available tools:', toolNames);
        
        // Check that all expected tools are present
        for (const expectedTool of EXPECTED_TOOLS) {
            expect(toolNames.includes(expectedTool), `Expected tool '${expectedTool}' not found. Available: ${toolNames.join(', ')}`).toBe(true);
        }
        
        // Server should have at least the expected tools (may have more)
        expect(toolNames.length).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
    });
});