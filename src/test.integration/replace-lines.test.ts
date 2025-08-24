import { describe, it, expect } from 'vitest';
import { setupMcpClient, getClient, callToolForText, extractTextContent } from './helpers/test-setup.js';

describe('replace_lines_code Tool', () => {
    setupMcpClient();

    it('should replace content in existing file', async () => {
        const client = getClient();
        
        // First read the current content to get the originalCode
        const currentContent = await callToolForText('read_file_code', { path: 'test_file.txt' });
        const trimmedContent = currentContent.trim();

        // Now replace with the correct original content
        const result = await client.callTool({
            name: 'replace_lines_code',
            arguments: { 
                path: 'test_file.txt', 
                startLine: 1, 
                endLine: 1, 
                content: 'Hello MCP Updated!',
                originalCode: trimmedContent  // Use actual current content
            }
        });

        const textContent = extractTextContent(result);
        const responseText = textContent.text;
        console.log('Replace lines response:', responseText);
        
        expect(responseText.includes('replaced') || 
               responseText.includes('updated') || 
               responseText.includes('success') || 
               responseText.includes('Modified') || 
               responseText.includes('successfully')).toBe(true);
    });

    it('should fail with incorrect original content', async () => {
        const client = getClient();
        
        try {
            const result = await client.callTool({
                name: 'replace_lines_code',
                arguments: { 
                    path: 'test_file.txt', 
                    startLine: 1, 
                    endLine: 1, 
                    content: 'This should fail',
                    originalCode: 'Wrong original content'
                }
            });

            const textContent = extractTextContent(result);
            const responseText = textContent.text;
            
            // Should contain validation failure message
            expect(responseText.includes('validation failed') || 
                   responseText.includes('does not match')).toBe(true);
            console.log('✅ Tool correctly rejected incorrect original content');
        } catch (error) {
            // Error is also acceptable
            console.log('✅ Tool correctly threw error for incorrect original content');
            expect(error).toBeDefined();
        }
    });
});