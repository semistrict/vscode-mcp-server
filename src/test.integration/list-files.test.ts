import { describe, it, expect } from 'vitest';
import { setupMcpClient, getClient, extractTextContent } from './helpers/test-setup.js';

describe('list_files_code Tool', () => {
    setupMcpClient();

    it('should list test fixture files in root directory', async () => {
        const client = getClient();
        const result = await client.callTool({
            name: 'list_files_code',
            arguments: { path: '' }
        });

        const textContent = extractTextContent(result);
        const fileList = JSON.parse(textContent.text);
        console.log('Root directory listing:', JSON.stringify(fileList, null, 2));

        // Check for expected test fixture files
        const expectedPaths = ['go.mod', 'main.go'];
        for (const expectedPath of expectedPaths) {
            const found = fileList.some((item: any) => item.path === expectedPath);
            expect(found, `Expected file/directory '${expectedPath}' not found in root directory`).toBe(true);
        }
    });

    it('should list Go source files in internal/handlers directory', async () => {
        const client = getClient();
        const result = await client.callTool({
            name: 'list_files_code',
            arguments: { path: 'internal/handlers' }
        });

        const textContent = extractTextContent(result);
        const fileList = textContent.text;
        console.log('Handlers directory:', fileList);

        // Verify Go handler files
        const expectedFiles = ['health.go', 'users.go'];
        for (const expectedFile of expectedFiles) {
            expect(fileList.includes(expectedFile), `Expected Go file '${expectedFile}' not found in: ${fileList}`).toBe(true);
        }
    });

    it('should handle non-existent directory gracefully', async () => {
        const client = getClient();
        
        try {
            const result = await client.callTool({
                name: 'list_files_code',
                arguments: { path: 'non/existent/path' }
            });

            // If no error thrown, check if response indicates the issue
            if (result.isError) {
                console.log('✅ Tool correctly returned error response');
            } else {
                const textContent = extractTextContent(result);
                const response = textContent.text;
                // Should contain some indication of the error
                expect(response.toLowerCase().includes('not found') || 
                       response.toLowerCase().includes('error') ||
                       response.toLowerCase().includes('does not exist')).toBe(true);
            }
        } catch (error) {
            // Errors are also acceptable for non-existent paths
            console.log('✅ Tool correctly threw error for non-existent path:', (error as Error).message);
            expect(error).toBeDefined();
        }
    });
});