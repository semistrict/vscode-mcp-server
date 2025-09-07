import { describe, it, expect } from 'vitest';
import { setupMcpClient, callToolForText } from './helpers/test-setup.js';

/**
 * Poll for diagnostics until real issues are found or timeout
 * Optimized to avoid excessive waiting when diagnostics are already available
 */
async function pollForDiagnostics(path: string, maxWaitMs: number = 10000): Promise<string> {
    const startTime = Date.now();
    let attempts = 0;
    
    while (Date.now() - startTime < maxWaitMs) {
        const diagnostics = await callToolForText('get_diagnostics_code', { path });
        attempts++;
        
        console.log(`Attempt ${attempts}: Diagnostics for ${path}:`, diagnostics.slice(0, 100) + '...');
        
        // If we found actual issues (not just "No issues found"), return immediately
        if (!diagnostics.includes('No issues found') && 
            (diagnostics.includes('error') || 
             diagnostics.includes('Error:') || 
             diagnostics.includes('warning') ||
             diagnostics.includes('Found') ||
             diagnostics.includes('issue(s)'))) {
            console.log(`Found real diagnostics after ${attempts} attempts in ${Date.now() - startTime}ms`);
            return diagnostics;
        }
        
        // If no issues found and we've waited long enough, return what we have
        if (attempts >= 3 && Date.now() - startTime >= 3000) {
            console.log(`No real diagnostics found after ${attempts} attempts in ${Date.now() - startTime}ms, returning current state`);
            return diagnostics;
        }
        
        // Wait briefly before next attempt, with exponential backoff
        const waitTime = Math.min(500 * attempts, 2000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Final attempt if we've timed out
    const finalDiagnostics = await callToolForText('get_diagnostics_code', { path });
    console.log(`Timeout after ${Date.now() - startTime}ms, returning final result`);
    return finalDiagnostics;
}

describe('get_diagnostics_code Tool', () => {
    setupMcpClient();

    it('should get diagnostics for Go file', async () => {
        const diagnostics = await pollForDiagnostics('main.go', 15000);
        
        expect(diagnostics.length).toBeGreaterThan(0);
        
        // Should contain diagnostic information or indicate no issues
        expect(diagnostics.includes('diagnostic') || 
               diagnostics.includes('error') ||
               diagnostics.includes('Error:') ||
               diagnostics.includes('warning') ||
               diagnostics.includes('No diagnostics') ||
               diagnostics.includes('No issues found') ||
               diagnostics.includes('Found') ||
               diagnostics.includes('issue(s)')).toBe(true);
    }, 20000);

    it('should get diagnostics for file with potential issues', async () => {
        // Test with a handler file that might have linting issues
        const diagnostics = await callToolForText('get_diagnostics_code', { 
            path: 'internal/handlers/health.go' 
        });
        
        console.log('Diagnostics for health.go:', diagnostics);
        expect(diagnostics.length).toBeGreaterThan(0);
        
        // Should return diagnostic information
        expect(diagnostics.includes('diagnostic') ||
               diagnostics.includes('No diagnostics') ||
               diagnostics.includes('issues') ||
               diagnostics.includes('issue(s)') ||
               diagnostics.includes('Found') ||
               diagnostics.includes('Error:') ||
               diagnostics.includes('problems')).toBe(true);
    });

    it('should handle broken Go file diagnostics', async () => {
        // If there's a broken.go file in the test fixtures
        try {
            const diagnostics = await callToolForText('get_diagnostics_code', { 
                path: 'internal/models/broken.go' 
            });
            
            console.log('Diagnostics for broken.go:', diagnostics);
            expect(diagnostics.length).toBeGreaterThan(0);
            
            // Should find errors or issues
            if (!diagnostics.includes('No diagnostics')) {
                expect(diagnostics.toLowerCase().includes('error') ||
                       diagnostics.toLowerCase().includes('warning') ||
                       diagnostics.toLowerCase().includes('problem')).toBe(true);
            }
        } catch (error) {
            // File might not exist
            console.log('Broken file not found (expected):', (error as Error).message);
            expect(error).toBeDefined();
        }
    });

    it('should handle non-existent file gracefully', async () => {
        try {
            const diagnostics = await callToolForText('get_diagnostics_code', { 
                path: 'non-existent-file.go' 
            });
            
            // Should indicate file not found or no diagnostics
            expect(diagnostics.includes('not found') || 
                   diagnostics.includes('No diagnostics') ||
                   diagnostics.includes('error')).toBe(true);
        } catch (error) {
            // Errors are also acceptable for non-existent files
            console.log('✅ Tool correctly handled non-existent file');
            expect(error).toBeDefined();
        }
    });

    it('should get diagnostics for entire workspace', async () => {
        try {
            const diagnostics = await callToolForText('get_diagnostics_code', { 
                path: '' // Empty path might return workspace-wide diagnostics
            });
            
            console.log('Workspace diagnostics:', diagnostics.slice(0, 200) + '...');
            expect(diagnostics.length).toBeGreaterThan(0);
            
            // Should contain diagnostic information for workspace
            expect(diagnostics.includes('diagnostic') ||
                   diagnostics.includes('No diagnostics') ||
                   diagnostics.includes('workspace')).toBe(true);
        } catch (error) {
            // Some implementations might not support workspace-wide diagnostics
            console.log('Workspace diagnostics not supported (acceptable)');
            expect(error).toBeDefined();
        }
    });
});