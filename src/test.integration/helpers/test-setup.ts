import { beforeAll, afterAll, expect as vitestExpect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TextContent, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
 * Helper to check if MCP tool response is an error
 */
export function isErrorResponse(result: CallToolResult): boolean {
    return result.isError === true;
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
    'quickfixes_code',
    'debug_set_breakpoint',
    'debug_list_breakpoints',
    'debug_remove_breakpoint',
    'debug_toggle_breakpoint',
    'debug_start_session',
    'debug_stop_session',
    'debug_continue_session',
    'debug_list_sessions',
    'debug_list_threads',
    'debug_get_variables',
    'debug_get_callstack',
    'debug_step_over',
    'debug_step_into',
    'debug_step_out',
    'create_launch_config',
    'list_launch_configs',
    'get_launch_config',
    'update_launch_config',
    'delete_launch_config'
].sort();

/**
 * Helper to safely call a tool that might throw errors
 */
export async function callToolSafely(toolName: string, args: any): Promise<{ success: boolean; result?: string; error?: Error }> {
    try {
        console.log(`Calling tool ${toolName} with args:`, args);
        const result = await callToolForText(toolName, args);
        console.log(`Tool ${toolName} returned success:`, result);
        return { success: true, result };
    } catch (error) {
        console.log(`Tool ${toolName} threw error:`, error);
        return { success: false, error: error as Error };
    }
}

/**
 * Custom matchers for MCP-specific assertions
 */
vitestExpect.extend({
    toBeErrorMatching(received: CallToolResult, pattern: RegExp | string) {
        const isError = received.isError === true;
        
        if (!isError) {
            return {
                pass: false,
                message: () => `Expected result to be an error response (isError: true), but got isError: ${received.isError}`
            };
        }

        const textContent = received.content?.find(c => c.type === 'text') as TextContent;
        if (!textContent) {
            return {
                pass: false,
                message: () => `Expected error response to contain text content, but found none`
            };
        }

        const matches = typeof pattern === 'string' 
            ? textContent.text.includes(pattern)
            : pattern.test(textContent.text);

        return {
            pass: matches,
            message: () => `Expected error message "${textContent.text}" to match pattern ${pattern instanceof RegExp ? pattern.toString() : `"${pattern}"`}`
        };
    },
    
    toBeError(received: CallToolResult) {
        const isError = received.isError === true;
        
        return {
            pass: isError,
            message: () => `Expected result to ${isError ? 'not ' : ''}be an error response, but got isError: ${received.isError}`
        };
    },
    
    toBeSuccess(received: CallToolResult) {
        const isError = received.isError === true;
        
        return {
            pass: !isError,
            message: () => `Expected result to ${!isError ? 'not ' : ''}be a success response, but got isError: ${received.isError}`
        };
    },
    
    toBeSuccessWithText(received: CallToolResult, expected: string | RegExp) {
        const isError = received.isError === true;
        
        if (isError) {
            const errorContent = received.content?.find(c => c.type === 'text') as TextContent;
            const errorText = errorContent?.text || 'no error message';
            return {
                pass: false,
                message: () => `Expected success response but got error: ${errorText}`
            };
        }
        
        const textContent = received.content?.find(c => c.type === 'text') as TextContent;
        if (!textContent) {
            return {
                pass: false,
                message: () => `Expected success response to contain text content, but found none`
            };
        }
        
        const matches = expected instanceof RegExp
            ? expected.test(textContent.text)
            : textContent.text === expected;
        
        const expectedDesc = expected instanceof RegExp ? expected.toString() : `"${expected}"`;
        
        return {
            pass: matches,
            message: () => `Expected success response text to match ${expectedDesc}, but got "${textContent.text}"`
        };
    }
});

export const expect = vitestExpect;

/**
 * Poll for a single thread to become available in the debug session
 */
async function pollForSingleThread(maxAttempts: number = 10, intervalMs: number = 200): Promise<string> {
    const client = getClient();
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const threadsResult = await client.callTool({
                name: 'debug_list_threads',
                arguments: {}
            });
            
            const threadsText = (threadsResult as any).content[0].text;
            const threadMatches = threadsText.match(/Thread ID: ([^\s]+)/g);
            
            if (threadMatches && threadMatches.length === 1) {
                const threadMatch = threadsText.match(/Thread ID: ([^\s]+)/);
                if (threadMatch) {
                    return threadMatch[1];
                }
            }
            
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        } catch (error) {
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            } else {
                throw error;
            }
        }
    }
    
    throw new Error(`Expected exactly 1 thread after ${maxAttempts} attempts, but polling failed`);
}

/**
 * Creates a debug session with automatic cleanup
 * Use with `using` keyword for automatic disposal
 */
export async function startDebugSession(stopOnEntry: boolean = true) {
    const client = getClient();
    
    // Use a unique config name to avoid conflicts
    const configName = `Test Config ${Date.now()}`;
    
    // Stop any existing sessions first
    await client.callTool({
        name: 'debug_stop_session',
        arguments: {}
    });
    
    // First, create a launch config
    await client.callTool({
        name: 'create_launch_config',
        arguments: {
            name: configName,
            template: 'node',
            overwrite: true,
            stopOnEntry: stopOnEntry
        }
    });
    
    // Now start the debug session using the created config
    const result = await client.callTool({
        name: 'debug_start_session',
        arguments: {
            name: configName
        }
    });
    
    // Ensure debug session started successfully
    expect(result).toBeSuccessWithText(/Started debug session/);
    
    // If stopOnEntry is true, poll for threads to become available
    const threadId = stopOnEntry ? await pollForSingleThread() : undefined;
    
    return {
        result,
        threadId,
        configName,
        async [Symbol.asyncDispose]() {
            await client.callTool({
                name: 'debug_stop_session',
                arguments: {}
            });
        }
    };
}

/**
 * Gets a single thread ID from the debug session
 */
export async function getSingleThreadId() {
    const client = getClient();
    const threadsResult = await client.callTool({
        name: 'debug_list_threads',
        arguments: {}
    });
    
    const threadsText = (threadsResult as any).content[0].text;
    
    // Assert exactly one thread is available
    const threadMatches = threadsText.match(/Thread ID: ([^\s]+)/g);
    if (!threadMatches || threadMatches.length !== 1) {
        throw new Error(`Expected exactly 1 thread, found ${threadMatches?.length || 0}`);
    }
    
    // Extract and return the thread ID
    const threadMatch = threadsText.match(/Thread ID: ([^\s]+)/);
    if (!threadMatch) {
        throw new Error('Could not extract thread ID');
    }
    
    return threadMatch[1];
}

