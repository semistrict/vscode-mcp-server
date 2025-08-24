import { describe, it } from 'vitest';
import { setupMcpClient, callToolForText, isErrorResponse, getClient, expect } from './helpers/test-setup.js';

describe('Launch Configuration Tools', () => {
    setupMcpClient();

    describe('create_launch_config', () => {
        it('should create Go launch configuration using template', async () => {
            try {
                const result = await callToolForText('create_launch_config', {
                    name: 'Debug Go App',
                    template: 'go',
                    overwrite: true
                });
                
                console.log('Create Go config result:', result);
                expect(result.length).toBeGreaterThan(0);
                expect(result).toContain('launch configuration');
                expect(result).toContain('Debug Go App');
                expect(result).toContain('"type": "go"');
            } catch (error) {
                console.log('Create launch config failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toContain('No workspace folder found');
            }
        });

        it('should create custom launch configuration', async () => {
            try {
                const result = await callToolForText('create_launch_config', {
                    name: 'Custom Config',
                    config: {
                        type: 'node',
                        request: 'launch',
                        program: '${workspaceFolder}/app.js',
                        env: { NODE_ENV: 'development' }
                    },
                    overwrite: true
                });
                
                console.log('Create custom config result:', result);
                expect(result.length).toBeGreaterThan(0);
                expect(result).toContain('launch configuration');
                expect(result).toContain('Custom Config');
                expect(result).toContain('NODE_ENV');
            } catch (error) {
                console.log('Create custom config failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toContain('No workspace folder found');
            }
        });

        it('should reject duplicate names without overwrite flag', async () => {
            const client = getClient();
            
            try {
                // Try to create the same config twice
                await callToolForText('create_launch_config', {
                    name: 'Duplicate Test',
                    template: 'go'
                });
                
                const result = await client.callTool({
                    name: 'create_launch_config',
                    arguments: {
                        name: 'Duplicate Test',
                        template: 'node'
                    }
                });
                
                expect(result).toBeErrorMatching(/already exists|No workspace folder found/);
            } catch (error) {
                console.log('Tool correctly rejected duplicate name (acceptable if no workspace)');
                expect((error as Error).message).toMatch(/already exists|No workspace folder found/);
            }
        });

        it('should handle invalid template gracefully', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'create_launch_config',
                arguments: {
                    name: 'Invalid Template Test',
                    template: 'nonexistent'
                }
            });
            
            expect(result).toBeErrorMatching(/Must provide either|Available templates|No workspace folder found/);
        });
    });

    describe('list_launch_configs', () => {
        it('should list launch configurations', async () => {
            try {
                const result = await callToolForText('list_launch_configs', {});
                
                console.log('List configs result:', result);
                expect(result.length).toBeGreaterThan(0);
                
                // Should either show configs or indicate none found
                expect(
                    result.includes('Found') || 
                    result.includes('No launch configurations found')
                ).toBe(true);
            } catch (error) {
                console.log('List configs failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toContain('No workspace folder found');
            }
        });
    });

    describe('get_launch_config', () => {
        it('should get specific launch configuration', async () => {
            try {
                // First create a config to retrieve
                await callToolForText('create_launch_config', {
                    name: 'Get Test Config',
                    template: 'go'
                });
                
                const result = await callToolForText('get_launch_config', {
                    name: 'Get Test Config'
                });
                
                console.log('Get config result:', result);
                expect(result.length).toBeGreaterThan(0);
                expect(result).toContain('Get Test Config');
                expect(result).toContain('"type": "go"');
            } catch (error) {
                console.log('Get config failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toMatch(/not found|No workspace folder found/);
            }
        });

        it('should handle non-existent config gracefully', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'get_launch_config',
                arguments: { name: 'Non-existent Config' }
            });
            
            expect(result).toBeErrorMatching(/not found|No workspace folder found/);
        });
    });

    describe('update_launch_config', () => {
        it('should update existing launch configuration', async () => {
            try {
                // First create a config to update
                await callToolForText('create_launch_config', {
                    name: 'Update Test Config',
                    template: 'go'
                });
                
                const result = await callToolForText('update_launch_config', {
                    name: 'Update Test Config',
                    updates: {
                        env: { DEBUG: 'true' },
                        args: ['--verbose']
                    }
                });
                
                console.log('Update config result:', result);
                expect(result.length).toBeGreaterThan(0);
                expect(result).toContain('Updated launch configuration');
                expect(result).toContain('Update Test Config');
                expect(result).toContain('DEBUG');
                expect(result).toContain('--verbose');
            } catch (error) {
                console.log('Update config failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toMatch(/not found|No workspace folder found/);
            }
        });
    });

    describe('delete_launch_config', () => {
        it('should delete launch configuration', async () => {
            try {
                // First create a config to delete
                await callToolForText('create_launch_config', {
                    name: 'Delete Test Config',
                    template: 'go'
                });
                
                const result = await callToolForText('delete_launch_config', {
                    name: 'Delete Test Config'
                });
                
                console.log('Delete config result:', result);
                expect(result.length).toBeGreaterThan(0);
                expect(result).toContain('Deleted launch configuration');
                expect(result).toContain('Delete Test Config');
            } catch (error) {
                console.log('Delete config failed (acceptable if no workspace):', (error as Error).message);
                expect((error as Error).message).toMatch(/not found|No workspace folder found/);
            }
        });

        it('should handle non-existent config gracefully', async () => {
            const client = getClient();
            const result = await client.callTool({
                name: 'delete_launch_config',
                arguments: { name: 'Non-existent Delete Config' }
            });
            
            expect(result).toBeErrorMatching(/not found|No workspace folder found/);
        });
    });
});