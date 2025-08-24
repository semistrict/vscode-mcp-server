import { beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';

export interface TestContext {
    client: Client;
    transport: StreamableHTTPClientTransport;
}

let globalClient: Client;
let globalTransport: StreamableHTTPClientTransport;

/**
 * Sets up MCP client connection for integration tests
 * Call this in describe() block to share client across tests
 */
export function setupMcpClient() {
    beforeAll(async () => {
        console.log('Connecting to MCP server at http://localhost:11331/mcp');
        
        // Initialize client and transport
        globalClient = new Client({
            name: 'test-client',
            version: '1.0.0'
        });

        globalTransport = new StreamableHTTPClientTransport(
            new URL('http://localhost:11331/mcp')
        );

        // Connect to server
        await globalClient.connect(globalTransport);
        console.log('✅ Connected to MCP server');
    });

    afterAll(async () => {
        await globalClient.close();
        console.log('✅ Disconnected from MCP server');
    });
}

/**
 * Gets the current MCP client instance
 */
export function getClient(): Client {
    if (!globalClient) {
        throw new Error('MCP client not initialized. Call setupMcpClient() first.');
    }
    return globalClient;
}

/**
 * Helper to extract text content from MCP tool response
 */
export function extractTextContent(result: any): TextContent {
    const textContent = (result.content as TextContent[]).find(item => item.type === 'text');
    if (!textContent) {
        throw new Error('Response should contain text content');
    }
    return textContent;
}

/**
 * Helper to call MCP tool and extract text response
 */
export async function callToolForText(toolName: string, args: any): Promise<string> {
    const client = getClient();
    const result = await client.callTool({
        name: toolName,
        arguments: args
    });
    const textContent = extractTextContent(result);
    return textContent.text;
}

/**
 * Expected MCP tools that should be available
 */
export const EXPECTED_TOOLS = [
    'list_files_code', 
    'read_file_code', 
    'create_file_code',
    'replace_lines_code',
    'execute_shell_command_code',
    'get_diagnostics_code',
    'search_symbols_code',
    'get_symbol_definition_code',
    'get_document_symbols_code',
    'install_extension_code',
    'quickfixes_code'
].sort();

/**
 * Helper to safely call a tool that might throw errors
 */
export async function callToolSafely(toolName: string, args: any): Promise<{ success: boolean; result?: string; error?: Error }> {
    try {
        const result = await callToolForText(toolName, args);
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error as Error };
    }
}