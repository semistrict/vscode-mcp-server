import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Registers MCP extension-related tools with the server
 * @param server MCP server instance
 */
export function registerExtensionTools(server: McpServer): void {
    // Add install_extension tool
    server.tool(
        'install_extension_code',
        `Installs a VS Code extension by extension ID.

        WHEN TO USE: Installing VS Code extensions programmatically.
        
        Extension ID format: Use the format 'publisher.name' (e.g., 'ms-python.python').
        You can also specify a version with '@version' (e.g., 'ms-python.python@2023.1.0').
        
        The extension will be installed and enabled automatically.`,
        {
            extensionId: z.string().describe('The extension ID in format publisher.name or publisher.name@version'),
            preRelease: z.boolean().optional().default(false).describe('Install the pre-release version if available')
        },
        async ({ extensionId, preRelease = false }): Promise<CallToolResult> => {
            try {
                // Install the extension using VS Code API
                await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId, {
                    installPreReleaseVersion: preRelease
                });
                
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Extension '${extensionId}' installed successfully${preRelease ? ' (pre-release)' : ''}`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error('[install_extension] Error in tool:', error);
                throw new Error(`Failed to install extension '${extensionId}': ${error}`);
            }
        }
    );
}