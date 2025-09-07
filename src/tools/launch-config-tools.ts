import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Launch configuration templates for different languages/frameworks
 */
const LAUNCH_CONFIG_TEMPLATES = {
    go: {
        name: "Launch Go Program",
        type: "go",
        request: "launch",
        mode: "debug",
        program: "${workspaceFolder}",
        env: {},
        args: []
    },
    "go-test": {
        name: "Go Test",
        type: "go", 
        request: "launch",
        mode: "test",
        program: "${workspaceFolder}",
        env: {},
        args: []
    },
    node: {
        name: "Launch Node.js Program",
        type: "node",
        request: "launch",
        program: "${workspaceFolder}/index.js",
        skipFiles: ["<node_internals>/**"],
        env: {}
    },
    "node-attach": {
        name: "Attach to Node.js",
        type: "node",
        request: "attach",
        port: 9229,
        skipFiles: ["<node_internals>/**"]
    },
    python: {
        name: "Launch Python Program",
        type: "python",
        request: "launch",
        program: "${file}",
        console: "integratedTerminal",
        env: {}
    }
};

/**
 * Get the launch.json file path for the current workspace
 */
function getLaunchJsonPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return null;
    }
    return path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
}

/**
 * Read existing launch.json or create empty structure
 */
async function readLaunchJson(): Promise<{ version: string; configurations: any[] }> {
    const launchPath = getLaunchJsonPath();
    if (!launchPath) {
        throw new Error('No workspace folder found');
    }

    try {
        const content = await fs.readFile(launchPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        // File doesn't exist, return empty structure
        return {
            version: "0.2.0",
            configurations: []
        };
    }
}

/**
 * Write launch.json file
 */
async function writeLaunchJson(config: { version: string; configurations: any[] }): Promise<void> {
    const launchPath = getLaunchJsonPath();
    if (!launchPath) {
        throw new Error('No workspace folder found');
    }

    // Ensure .vscode directory exists
    const vscodeDirPath = path.dirname(launchPath);
    await fs.mkdir(vscodeDirPath, { recursive: true });

    // Write with proper formatting
    await fs.writeFile(launchPath, JSON.stringify(config, null, 4));
}

/**
 * Registers MCP launch configuration tools with the server
 * @param server MCP server instance
 */
export function registerLaunchConfigTools(server: McpServer): void {
    // Create launch configuration
    server.tool(
        'create_launch_config',
        `Creates a new launch configuration in .vscode/launch.json.

        WHEN TO USE: Setting up debugging, running tasks, or configuring program execution for the workspace.
        
        Templates available: go, go-test, node, node-attach, python
        Custom configs can be provided via the config parameter.
        
        The tool will create .vscode/launch.json if it doesn't exist.`,
        {
            name: z.string().describe('Name for the launch configuration'),
            template: z.string().optional().describe('Template to use: go, go-test, node, node-attach, python'),
            config: z.record(z.any()).optional().describe('Custom configuration object (overrides template)'),
            overwrite: z.boolean().optional().default(false).describe('Whether to overwrite existing config with same name'),
            stopOnEntry: z.boolean().optional().default(true).describe('Stop execution at the first line (equivalent to --inspect-brk for Node.js)')
        },
        async ({ name, template, config, overwrite = false, stopOnEntry }): Promise<CallToolResult> => {
            try {
                let newConfig: any;

                if (config) {
                    // Use custom configuration
                    newConfig = { name, ...config };
                } else if (template && template in LAUNCH_CONFIG_TEMPLATES) {
                    // Use template
                    newConfig = { ...LAUNCH_CONFIG_TEMPLATES[template as keyof typeof LAUNCH_CONFIG_TEMPLATES], name };
                } else {
                    throw new Error(`Must provide either 'config' or valid 'template'. Available templates: ${Object.keys(LAUNCH_CONFIG_TEMPLATES).join(', ')}`);
                }

                // Add stopOnEntry if specified and this is a Node.js config
                if (stopOnEntry !== undefined && (newConfig.type === 'node' || template === 'node' || template === 'node-attach')) {
                    newConfig.stopOnEntry = stopOnEntry;
                }

                // Read existing launch.json
                const launchData = await readLaunchJson();

                // Check for duplicate names
                const existingIndex = launchData.configurations.findIndex((c: any) => c.name === name);
                if (existingIndex !== -1) {
                    if (!overwrite) {
                        throw new Error(`Configuration '${name}' already exists. Use overwrite=true to replace it.`);
                    }
                    launchData.configurations[existingIndex] = newConfig;
                } else {
                    launchData.configurations.push(newConfig);
                }

                // Write back to file
                await writeLaunchJson(launchData);

                const action = existingIndex !== -1 ? 'Updated' : 'Created';
                const templateInfo = template ? ` (using ${template} template)` : '';
                
                return {
                    content: [{
                        type: 'text',
                        text: `${action} launch configuration '${name}'${templateInfo}\n\nConfiguration:\n${JSON.stringify(newConfig, null, 2)}`
                    }]
                };

            } catch (error) {
                console.error('[create_launch_config] Error:', error);
                throw new Error(`Failed to create launch configuration: ${error}`);
            }
        }
    );

    // List launch configurations
    server.tool(
        'list_launch_configs',
        `Lists all launch configurations in .vscode/launch.json.

        WHEN TO USE: Viewing available debug/run configurations, checking current workspace setup.
        
        Shows configuration names, types, and basic details.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const launchData = await readLaunchJson();
                
                if (launchData.configurations.length === 0) {
                    return {
                        content: [{
                            type: 'text', 
                            text: 'No launch configurations found.\n\nCreate configurations using create_launch_config tool.'
                        }]
                    };
                }

                const configList = launchData.configurations.map((config: any, index: number) => {
                    const type = config.type || 'unknown';
                    const request = config.request || 'unknown';
                    const program = config.program || config.script || 'not specified';
                    
                    return `${index + 1}. ${config.name}\n   Type: ${type} (${request})\n   Program: ${program}`;
                }).join('\n\n');

                return {
                    content: [{
                        type: 'text',
                        text: `Found ${launchData.configurations.length} launch configuration(s):\n\n${configList}`
                    }]
                };

            } catch (error) {
                console.error('[list_launch_configs] Error:', error);
                throw new Error(`Failed to list launch configurations: ${error}`);
            }
        }
    );

    // Get specific launch configuration
    server.tool(
        'get_launch_config',
        `Gets details of a specific launch configuration by name.

        WHEN TO USE: Inspecting configuration details, debugging setup issues.
        
        Returns the full configuration object for the specified configuration.`,
        {
            name: z.string().describe('Name of the launch configuration to retrieve')
        },
        async ({ name }): Promise<CallToolResult> => {
            try {
                const launchData = await readLaunchJson();
                const config = launchData.configurations.find((c: any) => c.name === name);
                
                if (!config) {
                    const available = launchData.configurations.map((c: any) => c.name).join(', ');
                    throw new Error(`Configuration '${name}' not found. Available: ${available}`);
                }

                return {
                    content: [{
                        type: 'text',
                        text: `Launch configuration '${name}':\n\n${JSON.stringify(config, null, 2)}`
                    }]
                };

            } catch (error) {
                console.error('[get_launch_config] Error:', error);
                throw new Error(`Failed to get launch configuration: ${error}`);
            }
        }
    );

    // Update launch configuration
    server.tool(
        'update_launch_config',
        `Updates an existing launch configuration.

        WHEN TO USE: Modifying debug settings, changing program paths, updating environment variables.
        
        Updates specific fields in the configuration while preserving others.`,
        {
            name: z.string().describe('Name of the launch configuration to update'),
            updates: z.record(z.any()).describe('Fields to update in the configuration')
        },
        async ({ name, updates }): Promise<CallToolResult> => {
            try {
                const launchData = await readLaunchJson();
                const configIndex = launchData.configurations.findIndex((c: any) => c.name === name);
                
                if (configIndex === -1) {
                    const available = launchData.configurations.map((c: any) => c.name).join(', ');
                    throw new Error(`Configuration '${name}' not found. Available: ${available}`);
                }

                // Update configuration
                const oldConfig = { ...launchData.configurations[configIndex] };
                launchData.configurations[configIndex] = { ...oldConfig, ...updates };

                // Write back to file
                await writeLaunchJson(launchData);

                return {
                    content: [{
                        type: 'text',
                        text: `Updated launch configuration '${name}'\n\nUpdated fields: ${Object.keys(updates).join(', ')}\n\nNew configuration:\n${JSON.stringify(launchData.configurations[configIndex], null, 2)}`
                    }]
                };

            } catch (error) {
                console.error('[update_launch_config] Error:', error);
                throw new Error(`Failed to update launch configuration: ${error}`);
            }
        }
    );

    // Delete launch configuration
    server.tool(
        'delete_launch_config',
        `Deletes a launch configuration from .vscode/launch.json.

        WHEN TO USE: Cleaning up unused configurations, removing outdated setups.
        
        Permanently removes the specified configuration.`,
        {
            name: z.string().describe('Name of the launch configuration to delete')
        },
        async ({ name }): Promise<CallToolResult> => {
            try {
                const launchData = await readLaunchJson();
                const configIndex = launchData.configurations.findIndex((c: any) => c.name === name);
                
                if (configIndex === -1) {
                    const available = launchData.configurations.map((c: any) => c.name).join(', ');
                    throw new Error(`Configuration '${name}' not found. Available: ${available}`);
                }

                // Remove configuration
                const removedConfig = launchData.configurations.splice(configIndex, 1)[0];

                // Write back to file
                await writeLaunchJson(launchData);

                return {
                    content: [{
                        type: 'text',
                        text: `Deleted launch configuration '${name}'\n\nRemaining configurations: ${launchData.configurations.length}\n\nDeleted configuration was:\n${JSON.stringify(removedConfig, null, 2)}`
                    }]
                };

            } catch (error) {
                console.error('[delete_launch_config] Error:', error);
                throw new Error(`Failed to delete launch configuration: ${error}`);
            }
        }
    );
}