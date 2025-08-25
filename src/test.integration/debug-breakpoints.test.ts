import { describe, it } from 'vitest';
import { setupMcpClient, toolCall, expect } from './helpers/test-setup.js';
import { tools as debugTools } from '../tools/debug-tools.js';

describe('debug_set_breakpoint Tool', () => {
    setupMcpClient();

    it('should set breakpoint at specific line', async () => {
        await expect(toolCall(debugTools.set_breakpoint, { line: 'main.go:10' }))
            .toBeSuccessWithText(/Set.*breakpoint.*main\.go.*line 10/);
    });


    it('should set conditional breakpoint', async () => {
        await expect(toolCall(debugTools.set_breakpoint, {
            line: 'main.go:15',
            condition: 'port == "8080"'
        })).toBeSuccessWithText(/conditional breakpoint.*condition: port == "8080"/);
    });

    it('should set logpoint', async () => {
        await expect(toolCall(debugTools.set_breakpoint, {
            line: 'main.go:20',
            logMessage: 'Server starting on port {port}'
        })).toBeSuccessWithText(/logpoint.*Server starting on port \{port\}/);
    });


    describe('debug_list_breakpoints', () => {
        it('should list all breakpoints in workspace', async () => {
            await expect(toolCall(debugTools.list_breakpoints))
                .toBeSuccessWithText(/Found|No breakpoints are currently set/);
        });
    });

    describe('debug_remove_breakpoint', () => {
        it('should handle no breakpoints gracefully', async () => {
            await expect(toolCall(debugTools.remove_breakpoint, { all: true }))
                .toBeSuccessWithText(/Removed all|No breakpoints are currently set/);
        });

    });

});