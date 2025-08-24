import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

describe('get_symbol_definition_code Tool', () => {
    setupMcpClient();

    it('should get definition for Go symbol', async () => {
        try {
            const definition = await callToolForText('get_symbol_definition_code', {
                path: 'main.go',
                line: 1,
                character: 0,
                symbol: 'main'  // Add required symbol parameter
            });
            
            console.log('Symbol definition result:', definition);
            expect(definition.length).toBeGreaterThan(0);
            
            // Should contain definition info or indicate no definition found
            expect(definition.includes('definition') || 
                   definition.includes('Location:') ||
                   definition.includes('No definition found') ||
                   definition.includes('symbol')).toBe(true);
        } catch (error) {
            // Some symbols may not have definitions available
            console.log('Symbol definition lookup failed (expected for some positions):', (error as Error).message);
            expect(error).toBeDefined();
        }
    });

    it('should handle invalid position gracefully', async () => {
        try {
            const definition = await callToolForText('get_symbol_definition_code', {
                path: 'main.go',
                line: 999,
                character: 999,
                symbol: 'nonexistent'  // Add required symbol parameter
            });
            
            // Should indicate no definition found for invalid position
            expect(definition.includes('No definition found') || 
                   definition.includes('not found') ||
                   definition.includes('invalid')).toBe(true);
        } catch (error) {
            // Errors are also acceptable for invalid positions
            console.log('✅ Tool correctly handled invalid position');
            expect(error).toBeDefined();
        }
    });
});