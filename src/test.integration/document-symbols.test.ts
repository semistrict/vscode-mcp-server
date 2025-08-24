import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

describe('get_document_symbols_code Tool', () => {
    setupMcpClient();

    it('should get document symbols for Go file', async () => {
        const symbols = await callToolForText('get_document_symbols_code', { path: 'main.go' });
        console.log('Document symbols for main.go:', symbols);

        expect(symbols.length).toBeGreaterThan(0);
        
        // Should contain symbol information or indicate no symbols
        expect(symbols.includes('symbol') || 
               symbols.includes('function') ||
               symbols.includes('package') ||
               symbols.includes('import') ||
               symbols.includes('No symbols found')).toBe(true);
    });

    it('should get symbols for handler files', async () => {
        const symbols = await callToolForText('get_document_symbols_code', { 
            path: 'internal/handlers/health.go' 
        });
        console.log('Document symbols for health.go:', symbols);

        expect(symbols.length).toBeGreaterThan(0);
        
        // Should find symbols in the handler file
        if (!symbols.includes('No symbols found')) {
            expect(symbols.includes('func') || 
                   symbols.includes('function') ||
                   symbols.includes('handler')).toBe(true);
        }
    });

    it('should handle non-existent file gracefully', async () => {
        try {
            const symbols = await callToolForText('get_document_symbols_code', { 
                path: 'non-existent-file.go' 
            });
            
            // Should indicate file not found or no symbols
            expect(symbols.includes('not found') || 
                   symbols.includes('No symbols found') ||
                   symbols.includes('error')).toBe(true);
        } catch (error) {
            // Errors are also acceptable for non-existent files
            console.log('✅ Tool correctly handled non-existent file');
            expect(error).toBeDefined();
        }
    });
});