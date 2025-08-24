import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

describe('create_file_code Tool', () => {
    setupMcpClient();

    it('should create a new file', async () => {
        const responseText = await callToolForText('create_file_code', {
            path: 'test_file.txt',
            content: 'Hello World'
        });

        console.log('Create file response:', responseText);
        expect(responseText.includes('test_file.txt') || 
               responseText.includes('created') || 
               responseText.includes('success')).toBe(true);
    });

    it('should create file with different content', async () => {
        const responseText = await callToolForText('create_file_code', {
            path: 'test_file2.txt',
            content: 'Different content'
        });

        expect(responseText.includes('test_file2.txt') || 
               responseText.includes('created') || 
               responseText.includes('success')).toBe(true);
    });
});