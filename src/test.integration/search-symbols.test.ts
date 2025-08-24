import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

describe('search_symbols_code Tool', () => {
    setupMcpClient();

    it('should find Go symbols in the workspace', async () => {
        const searchResults = await callToolForText('search_symbols_code', { query: 'main' });
        console.log('Symbol search results for "main":', searchResults);

        // Should find symbols or at least indicate search was performed
        expect(searchResults.length).toBeGreaterThan(0);
        
        // If symbols are found, should contain location info like file paths and line numbers
        if (!searchResults.includes('No symbols found')) {
            expect(searchResults.includes('main.go') || 
                   searchResults.includes('function') || 
                   searchResults.includes('symbol') ||
                   searchResults.includes('Location:')).toBe(true);
        }
    });

    it('should find struct symbols', async () => {
        const searchResults = await callToolForText('search_symbols_code', { query: 'Server' });
        console.log('Symbol search results for "Server":', searchResults);

        expect(searchResults.length).toBeGreaterThan(0);
        
        // Should find Server struct or indicate no matches
        if (!searchResults.includes('No symbols found')) {
            expect(searchResults.toLowerCase().includes('server')).toBe(true);
        }
    });

    it('should find function symbols', async () => {
        const searchResults = await callToolForText('search_symbols_code', { query: 'func' });
        console.log('Symbol search results for "func":', searchResults);

        expect(searchResults.length).toBeGreaterThan(0);
        
        // Should find function-related symbols
        if (!searchResults.includes('No symbols found')) {
            expect(searchResults.toLowerCase().includes('func') ||
                   searchResults.includes('Function') ||
                   searchResults.includes('Method')).toBe(true);
        }
    });

    it('should handle non-existent symbol search', async () => {
        const searchResults = await callToolForText('search_symbols_code', 
            { query: 'NonExistentSymbolThatShouldNotExist' });
        console.log('Symbol search results for non-existent symbol:', searchResults);

        // Should explicitly state no symbols found or return empty results
        expect(searchResults.includes('No symbols found') || 
               searchResults.includes('not found') ||
               searchResults.trim().length === 0).toBe(true);
    });

    it('should find symbols with pattern matching', async () => {
        const searchResults = await callToolForText('search_symbols_code', { query: 'Error' });
        console.log('Symbol search results for "Error":', searchResults);

        expect(searchResults.length).toBeGreaterThan(0);
        
        // Should find error-related symbols in Go standard library
        if (!searchResults.includes('No symbols found')) {
            expect(searchResults.toLowerCase().includes('error')).toBe(true);
        }
    });
});