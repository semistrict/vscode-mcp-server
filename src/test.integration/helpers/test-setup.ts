import { beforeAll, afterAll, expect as vitestExpect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TextContent, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Awaitable, ToolDef, ToolArgs } from '../../utils/types.js';
import { spawn } from 'child_process';
import * as path from 'path';

export interface TestContext {
    client: Client;
    transport: StdioClientTransport;
}

let globalClient: Client;
let globalTransport: StdioClientTransport;

/**
 * Sets up MCP client connection for integration tests using Unix domain socket
 * Call this in describe() block to share client across tests
 */
export function setupMcpClient() {
    beforeAll(async () => {
        const socketPath = path.resolve(process.cwd(), '.tmp/mcp-server.sock');
        console.log(`Connecting to MCP server via Unix socket at ${socketPath}`);
        
        // Initialize client and transport using nc (netcat) to connect to Unix domain socket
        globalClient = new Client({
            name: 'test-client',
            version: '1.0.0'
        });

        // Use nc (netcat) to connect to the Unix domain socket
        globalTransport = new StdioClientTransport({
            command: 'nc',
            args: ['-U', socketPath]
        });

        // Connect to server
        await globalClient.connect(globalTransport);
        console.log('✅ Connected to MCP server via Unix socket');
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
 * Helper to call MCP tool directly
 */
export async function callTool(toolName: string, args: any): Promise<CallToolResult> {
    const client = getClient();
    return await client.callTool({
        name: toolName,
        arguments: args
    }) as CallToolResult;
}

/**
 * Helper to create a tool call promise for use with custom matchers
 * Only accepts typed ToolDef for full type safety
 */
export function toolCall<T extends ToolDef<any>>(
    tool: T, 
    args: ToolArgs<T> = {} as ToolArgs<T>
): Promise<CallToolResult> {
    return callTool(tool.name, args);
}

/**
 * Helper to call MCP tool and extract text response
 */
export async function callToolForText(toolName: string, args: any): Promise<string> {
    const result = await callTool(toolName, args);
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
            const textContent = received.content?.find(c => c.type === 'text') as TextContent;
            const successText = textContent?.text || 'no text content';
            return {
                pass: false,
                message: () => `Expected result to be an error response (isError: true), but got isError: ${received.isError}. Actual success response text: "${successText}"`
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
    
    async toBeError(received: Awaitable<CallToolResult>) {
        const result = await received;
        const isError = result.isError === true;
        
        return {
            pass: isError,
            message: () => `Expected result to ${isError ? 'not ' : ''}be an error response, but got isError: ${result.isError}`
        };
    },
    
    async toBeSuccess(received: Awaitable<CallToolResult>) {
        const result = await received;
        const isError = result.isError === true;
        
        return {
            pass: !isError,
            message: () => `Expected result to ${!isError ? 'not ' : ''}be a success response, but got isError: ${result.isError}`
        };
    },
    
    async toBeSuccessWithText(received: Awaitable<CallToolResult>, expected: string | RegExp) {
        const result = await received;
        const isError = result.isError === true;
        
        if (isError) {
            const errorContent = result.content?.find(c => c.type === 'text') as TextContent;
            const errorText = errorContent?.text || 'no error message';
            return {
                pass: false,
                message: () => `Expected success response but got error: ${errorText}`
            };
        }
        
        const textContent = result.content?.find(c => c.type === 'text') as TextContent;
        if (!textContent) {
            return {
                pass: false,
                message: () => `Expected success response to contain text content, but found none`
            };
        }
        
        if (expected instanceof RegExp) {
            const matches = expected.test(textContent.text);
            return {
                pass: matches,
                message: () => `Expected success response text to match ${expected.toString()}, but got "${textContent.text}"`
            };
        } else {
            // Use Vitest's built-in string comparison for better diff
            try {
                vitestExpect(textContent.text.trim()).toContain(expected.trim());
                return { pass: true, message: () => '' };
            } catch (error: any) {
                return { 
                    pass: false, 
                    message: () => `Expected success response text to match, but:\nActual text:\n"${textContent.text}"\nExpected to contain:\n"${expected}"\nError: ${error.message}`
                };
            }
        }
    }
});

export const expect = vitestExpect;

/**
 * Wait for debug session to start and get the first available thread ID
 * Uses the same approach as the working e2e test
 */
async function waitForThreadAndGetId(waitTimeMs: number = 2000): Promise<string> {
    const client = getClient();
    
    // Wait for program to pause at entry (same as e2e test)
    await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    
    // Get list of threads to find threadId (same as e2e test)
    const listThreadsResult = await client.callTool({
        name: 'debug_list_threads',
        arguments: {}
    });
    
    expect(listThreadsResult).toBeSuccessWithText(/Thread ID:/);
    
    const threadsText = ((listThreadsResult as any).content?.[0] as { text: string })?.text || '';
    
    // Extract thread ID from the response (same as e2e test)
    const threadMatch = threadsText.match(/Thread ID: ([^\s]+)/);
    if (!threadMatch) {
        throw new Error(`Could not extract thread ID from response. Actual response: ${threadsText}`);
    }
    
    return threadMatch[1];
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
    
    // If stopOnEntry is true, wait for threads to become available
    const threadId = stopOnEntry ? await waitForThreadAndGetId() : undefined;
    
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

