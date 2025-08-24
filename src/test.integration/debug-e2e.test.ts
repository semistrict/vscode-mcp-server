import { describe, it } from 'vitest';
import { setupMcpClient, getClient, expect } from './helpers/test-setup.js';

describe('End-to-End Debug Session Tests', () => {
    setupMcpClient();

    describe('full debugging workflow', () => {
        it('should create launch config, start debug session, set breakpoint, and debug Node.js program', async () => {
            const client = getClient();
            
            // Step 1: Create a Node.js launch configuration
            const createConfigResult = await client.callTool({
                name: 'create_launch_config',
                arguments: {
                    name: 'Debug E2E Test',
                    template: 'node',
                    overwrite: true
                }
            });
            
            expect(createConfigResult).toBeSuccessWithText(/(Created|Updated) launch configuration 'Debug E2E Test'/);
            
            // Step 2: Set a breakpoint at a specific line using workspace root relative path
            const setBreakpointResult = await client.callTool({
                name: 'debug_set_breakpoint',
                arguments: {
                    line: 'index.js:15' // Target line 15 in index.js (user handler function)
                }
            });
            
            expect(setBreakpointResult).toBeSuccessWithText(/Set breakpoint in.*index.js at line 15/);
            
            // Step 3: Verify breakpoint was set
            const listBreakpointsResult = await client.callTool({
                name: 'debug_list_breakpoints',
                arguments: {}
            });
            
            expect(listBreakpointsResult).toBeSuccessWithText(/Found \d+ breakpoint/);
            
            // Step 4: Start debug session
            const startSessionResult = await client.callTool({
                name: 'debug_start_session',
                arguments: {
                    name: 'Debug E2E Test'
                }
            });
            
            expect(startSessionResult).toBeSuccessWithText(/Started debug session "Debug E2E Test"/);
            
            // Step 5: Verify debug session is active
            const listSessionsResult = await client.callTool({
                name: 'debug_list_sessions',
                arguments: {}
            });
            
            expect(listSessionsResult).toBeSuccessWithText(/Active debug session:/);
            
            // Step 6: Get list of threads to find threadId
            const listThreadsResult = await client.callTool({
                name: 'debug_list_threads',
                arguments: {}
            });
            
            // Handle both cases: threads found or no threads (debug session running but no pause)
            const threadsText = (listThreadsResult as any).content[0].text;
            if (threadsText.includes('No threads found')) {
                expect(listThreadsResult).toBeSuccessWithText(/No threads found in the debug session/);
                // Skip thread-specific operations since no threads are available
            } else {
                expect(listThreadsResult).toBeSuccessWithText(/Thread ID:/);
                
                // Extract thread ID from the response (now it's an encrypted string)
                const threadMatch = threadsText.match(/Thread ID: ([^\s]+)/);
                if (!threadMatch) {
                    throw new Error('Could not extract thread ID from response');
                }
                const threadId = threadMatch[1];
                
                // Step 7: Continue execution (this will show running state)
                const continueResult = await client.callTool({
                    name: 'debug_continue_session',
                    arguments: { threadId }
                });
                
                expect(continueResult).toBeSuccessWithText(/Debug session.*is running/);
            }
            
            // Step 8: Stop debug session
            const stopResult = await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
            
            expect(stopResult).toBeSuccessWithText(/Stopped debug session/);
            
            // Step 9: Verify session is no longer active
            const listSessionsAfterResult = await client.callTool({
                name: 'debug_list_sessions',
                arguments: {}
            });
            
            expect(listSessionsAfterResult).toBeSuccessWithText('No debug sessions are currently active');
            
            // Step 10: Clean up breakpoints
            const removeAllBreakpointsResult = await client.callTool({
                name: 'debug_remove_breakpoint',
                arguments: {
                    all: true
                }
            });
            
            expect(removeAllBreakpointsResult).toBeSuccessWithText(/Removed all.*breakpoint/);
            
        }); // 30 second timeout for this complex test
    });
});