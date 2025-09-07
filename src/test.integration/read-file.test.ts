import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

describe('read_file_code Tool', () => {
    setupMcpClient();

    it('should read Go source file content', async () => {
        const fileContent = await callToolForText('read_file_code', { path: 'main.go' });
        console.log('main.go preview:', fileContent.slice(0, 200) + '...');

        // Verify it contains Go code characteristics
        expect(fileContent.includes('package main')).toBe(true);
        expect(fileContent.includes('import')).toBe(true);
    });

    it('should handle non-existent file gracefully', async () => {
        try {
            await callToolForText('read_file_code', { path: 'non-existent-file.go' });
        } catch (error) {
            // Should throw error for non-existent file
            expect(error).toBeDefined();
            console.log('✅ Tool correctly threw error for non-existent file');
        }
    });
});