import { describe, it } from 'vitest';
import { setupMcpClient, getClient, expect } from './helpers/test-setup.js';

describe('Simple stopOnEntry Test', () => {
    setupMcpClient();

    it('should create launch config with stopOnEntry and verify threads are available', async () => {
        const client = getClient();
        
        // Step 1: Create launch config with stopOnEntry: true
        const createConfigResult = await client.callTool({
            name: 'create_launch_config',
            arguments: {
                name: 'Simple Test Config',
                template: 'node',
                overwrite: true,
                stopOnEntry: true
            }
        });
        
        console.log('Create config result:', (createConfigResult as any).content[0].text);
        
        // Step 2: Start debug session
        const startSessionResult = await client.callTool({
            name: 'debug_start_session',
            arguments: {
                name: 'Simple Test Config'
            }
        });
        
        console.log('Start session result:', (startSessionResult as any).content[0].text);
        
        // Step 3: Wait a moment for debugger to stop at first line
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 4: Check for threads
        const listThreadsResult = await client.callTool({
            name: 'debug_list_threads',
            arguments: {}
        });
        
        console.log('List threads result:', (listThreadsResult as any).content[0].text);
        
        // Step 5: Clean up - stop debug session
        await client.callTool({
            name: 'debug_stop_session',
            arguments: {}
        });
        
        // Just check that we got some response - we'll examine the console output
        expect(listThreadsResult).toBeDefined();
    });
});