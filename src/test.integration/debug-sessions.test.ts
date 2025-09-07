import { describe, it } from 'vitest';
import { setupMcpClient, getClient, expect, startDebugSession, getSingleThreadId } from './helpers/test-setup.js';

describe('Debug Session Control Tools', () => {
    setupMcpClient();

    describe('debug_start_session', () => {
        it('should fail when launch configuration does not exist', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'debug_start_session',
                arguments: { name: 'NonExistentConfig' }
            });
            
            expect(result).toBeErrorMatching("Configuration 'NonExistentConfig' is missing in 'launch.json'.");
        });

        it('should fail when specified workspace folder does not exist', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'debug_start_session',
                arguments: { 
                    name: 'Launch Program',
                    folder: 'NonExistentFolder'
                }
            });
            
            expect(result).toBeErrorMatching('Workspace folder "NonExistentFolder" not found');
        });
    });

    describe('debug_stop_session', () => {
        it('should handle no active debug session', async () => {
            const client = getClient();
            
            // Stop any existing sessions first
            await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
            
            // Now test stopping when no session exists
            const result = await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
            
            expect(result).toBeSuccessWithText('No active debug session to stop');
        });
    });


    describe('debug_continue_session', () => {
        it('should continue debug session', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_continue_session',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccess();
        });
    });

    describe('debug_list_sessions', () => {
        it('should show no sessions when none are active', async () => {
            const client = getClient();
            
            // Stop any existing sessions first
            await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
            
            const result = await client.callTool({
                name: 'debug_list_sessions',
                arguments: {}
            });
            
            expect(result).toBeSuccessWithText('No debug sessions are currently active');
        });
    });

    describe('debug_list_threads', () => {
        it('should fail when no active debug session', async () => {
            const client = getClient();
            
            // Stop any existing sessions first
            await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
            
            const result = await client.callTool({
                name: 'debug_list_threads',
                arguments: {}
            });
            
            expect(result).toBeErrorMatching('No active debug session. Start a debug session first using debug_start_session.');
        });
    });

    describe('debug_get_variables', () => {
        it('should get debug variables', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_get_variables',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccessWithText(/^Variables in debug session/);
        });
    });

    describe('debug_get_callstack', () => {
        it('should get debug callstack', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_get_callstack',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccessWithText(/^Call stack for debug session/);
        });
    });

    describe('debug_step_over', () => {
        it('should step over debug session', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_step_over',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccessWithText(/^## Debug State/);
        });
    });

    describe('debug_step_into', () => {
        it('should step into debug session', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_step_into',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccessWithText(/^## Debug State/);
        });
    });

    describe('debug_step_out', () => {
        it('should step out debug session', async () => {
            await using session = await startDebugSession(true);
            
            const result = await getClient().callTool({
                name: 'debug_step_out',
                arguments: { threadId: session.threadId }
            });
            
            expect(result).toBeSuccessWithText(/^## Debug State/);
        });
    });
});