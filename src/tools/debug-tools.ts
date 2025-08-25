import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TypedDebugSession, createTypedDebugSession, toMarkdown } from './debug-types.js';
import { DebugConsoleBuffer } from './debug-console-buffer.js';
import { defineTool } from '../utils/types.js';

// Common schemas
const fileLineSchema = z.string().describe('File and line in format "path:linenumber" where path is relative to workspace root (e.g., "main.go:25", "cmd/cli/main.go:30", "internal/handlers/users.go:15")');
const breakpointIndexSchema = z.number().describe('Breakpoint index from list (1-based)');
const allBreakpointsSchema = z.boolean().describe('Apply to all breakpoints if true');
const threadIdSchema = z.string().describe('Thread ID from debug_list_threads output');

// Common breakpoint targeting schema
const breakpointTargetSchema = {
    line: fileLineSchema.optional(),
    index: breakpointIndexSchema.optional(), 
    all: allBreakpointsSchema.optional()
};

// Common thread-based operation schema
const threadOperationSchema = {
    threadId: threadIdSchema
};

// Console output retrieval schema
const consoleOutputSchema = {
    sessionId: z.string().optional().describe('Debug session ID to get messages for (defaults to active session)'),
    category: z.enum(['stdout', 'stderr', 'console', 'all']).optional().default('all').describe('Filter by message category'),
    search: z.string().optional().describe('Search text to filter messages'),
    limit: z.number().optional().default(100).describe('Maximum number of messages to return'),
    offset: z.number().optional().default(0).describe('Number of messages to skip (for pagination)')
};

/**
 * Utility function to ensure there is an active debug session
 * Throws an error if no debug session is active
 */
function requireActiveDebugSession(): TypedDebugSession {
    const activeSession = vscode.debug.activeDebugSession;
    if (!activeSession) {
        throw new Error('No active debug session. Start a debug session first using debug_start_session.');
    }
    return createTypedDebugSession(activeSession);
}

/**
 * Helper to create a standardized CallToolResult response
 */
function createResponse(text: string): CallToolResult {
    return {
        content: [{
            type: 'text',
            text
        }]
    };
}

/**
 * Parse file:line format and validate
 */
function parseFileLine(line: string): { filename: string; lineNumber: number } {
    const match = line.match(/^(.+):(\d+)$/);
    if (!match) {
        throw new Error('Line format must be "filename:linenumber" (e.g., "main.go:25")');
    }
    
    const [, filename, lineStr] = match;
    const lineNumber = parseInt(lineStr, 10);
    
    if (lineNumber < 1) {
        throw new Error('Line number must be >= 1');
    }
    
    return { filename, lineNumber };
}

/**
 * Find breakpoints matching file:line criteria
 */
function findBreakpointsByLine(breakpoints: readonly vscode.Breakpoint[], filename: string, lineNumber: number): vscode.SourceBreakpoint[] {
    const targetLine = lineNumber - 1; // Convert to 0-based
    
    return breakpoints.filter(bp => {
        if (bp instanceof vscode.SourceBreakpoint) {
            const bpLocation = bp.location;
            const bpPath = vscode.workspace.asRelativePath(bpLocation.uri);
            const bpLine = bpLocation.range.start.line;
            
            return (bpPath.endsWith(filename) || bpPath === filename) && bpLine === targetLine;
        }
        return false;
    }) as vscode.SourceBreakpoint[];
}

/**
 * Validate breakpoint target parameters (exactly one must be provided)
 */
function validateBreakpointTarget(line?: string, index?: number, all?: boolean): void {
    const paramCount = [line, index, all].filter(p => p !== undefined).length;
    if (paramCount !== 1) {
        throw new Error('Must specify exactly one of "line", "index", or "all" parameters');
    }
}


// Tool definitions for typed testing
export const tools = {
    set_breakpoint: defineTool('debug_set_breakpoint', {
        line: z.string().optional().describe('File and line in format "path:linenumber" where path is relative to workspace root (e.g., "main.go:25", "cmd/cli/main.go:30", "internal/handlers/users.go:15")'),
        function: z.string().optional().describe('Function name to set breakpoint at (searches workspace for function)'),
        condition: z.string().optional().describe('Optional condition for conditional breakpoint (e.g., "x > 5")'),
        logMessage: z.string().optional().describe('Optional log message for logpoint instead of breakpoint')
    }),
    
    list_breakpoints: defineTool('debug_list_breakpoints', {}),
    
    remove_breakpoint: defineTool('debug_remove_breakpoint', breakpointTargetSchema),
    
    
    start_session: defineTool('debug_start_session', {
        name: z.string().describe('Name of the launch configuration to use'),
        folder: z.string().optional().describe('Workspace folder name (if multiple folders)')
    }),
    
    stop_session: defineTool('debug_stop_session', {}),
    
    continue_session: defineTool('debug_continue_session', threadOperationSchema),
    
    list_sessions: defineTool('debug_list_sessions', {}),
    
    list_threads: defineTool('debug_list_threads', {}),
    
    get_variables: defineTool('debug_get_variables', {
        ...threadOperationSchema,
        scope: z.string().optional().describe('Regular expression pattern to match scope names (e.g., "local" for any scope containing "local", "Local:.*addNumbers" for locals of addNumbers function, "global" for global scope). If not provided, returns all scopes.')
    }),
    
    get_callstack: defineTool('debug_get_callstack', threadOperationSchema),
    
    step_over: defineTool('debug_step_over', threadOperationSchema),
    
    step_into: defineTool('debug_step_into', threadOperationSchema),
    
    step_out: defineTool('debug_step_out', threadOperationSchema),
    
    get_console_output: defineTool('debug_get_console_output', consoleOutputSchema)
};


/**
 * Registers MCP debug-related tools with the server
 * @param server MCP server instance
 */
export function registerDebugTools(server: McpServer): void {
    // Add debug_set_breakpoint tool
    server.tool(
        tools.set_breakpoint.name,
        `Sets a breakpoint in VS Code using either line-based or function-based targeting.

        WHEN TO USE: Setting breakpoints for debugging sessions, preparing debug environments.
        
        Line mode: Use line="file.ext:123" format to set breakpoint at specific line
        Function mode: Use function="functionName" to set breakpoint at function entry
        
        The tool will search the workspace to locate the target and set an appropriate breakpoint.`,
        tools.set_breakpoint.inputSchema,
        async ({ line, function: functionName, condition, logMessage }): Promise<CallToolResult> => {
            try {
                // Validate input - exactly one of line or function must be provided
                if ((line && functionName) || (!line && !functionName)) {
                    throw new Error('Must specify exactly one of "line" or "function" parameters');
                }

                let targetUri: vscode.Uri | undefined;
                let targetLine: number | undefined;

                if (line) {
                    // Parse line format "file:line"
                    const match = line.match(/^(.+):(\d+)$/);
                    if (!match) {
                        throw new Error('Line format must be "filename:linenumber" (e.g., "main.go:25")');
                    }
                    
                    const [, filename, lineStr] = match;
                    const lineNumber = parseInt(lineStr, 10);
                    
                    if (lineNumber < 1) {
                        throw new Error('Line number must be >= 1');
                    }
                    
                    // Get workspace folders
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        throw new Error('No workspace folders are open');
                    }
                    
                    // Use first workspace folder as root
                    const workspaceRoot = workspaceFolders[0].uri;
                    
                    // Construct full path from workspace root
                    targetUri = vscode.Uri.joinPath(workspaceRoot, filename);
                    
                    // Verify file exists
                    try {
                        const stat = await vscode.workspace.fs.stat(targetUri);
                        if (stat.type !== vscode.FileType.File) {
                            throw new Error(`Path "${filename}" exists but is not a file`);
                        }
                    } catch (error) {
                        throw new Error(`File "${filename}" not found in workspace root`);
                    }
                    
                    targetLine = lineNumber - 1; // VS Code uses 0-based indexing
                    
                } else if (functionName) {
                    // Search for function in workspace
                    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        'vscode.executeWorkspaceSymbolProvider', 
                        functionName
                    );
                    
                    if (!symbols || symbols.length === 0) {
                        throw new Error(`Function "${functionName}" not found in workspace`);
                    }
                    
                    // Find exact function name match
                    const exactMatch = symbols.find(s => 
                        s.name === functionName && 
                        (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method)
                    );
                    
                    if (!exactMatch) {
                        const available = symbols
                            .filter(s => s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method)
                            .map(s => s.name)
                            .join(', ');
                        throw new Error(`Function "${functionName}" not found. Available functions: ${available}`);
                    }
                    
                    targetUri = exactMatch.location.uri;
                    targetLine = exactMatch.location.range.start.line;
                }

                // Validate that we have valid target
                if (!targetUri || targetLine === undefined) {
                    throw new Error('Failed to determine target location for breakpoint');
                }

                // Set the breakpoint
                const document = await vscode.workspace.openTextDocument(targetUri);
                
                // Create breakpoint object
                let breakpoint: vscode.Breakpoint;
                
                if (logMessage) {
                    // Create logpoint (use SourceBreakpoint with logMessage for now)
                    // Note: LogPoint class may not be available in all VS Code versions
                    breakpoint = new vscode.SourceBreakpoint(
                        new vscode.Location(targetUri, new vscode.Position(targetLine, 0)),
                        true, // enabled
                        condition,
                        undefined, // hitCondition
                        logMessage
                    );
                } else {
                    // Create regular or conditional breakpoint
                    breakpoint = new vscode.SourceBreakpoint(
                        new vscode.Location(targetUri, new vscode.Position(targetLine, 0)),
                        true, // enabled
                        condition
                    );
                }
                
                // Add breakpoint
                vscode.debug.addBreakpoints([breakpoint]);
                
                // Get the actual line content for confirmation
                const lineContent = document.lineAt(targetLine).text.trim();
                const relativePath = vscode.workspace.asRelativePath(targetUri);
                
                const breakpointType = logMessage ? 'logpoint' : (condition ? 'conditional breakpoint' : 'breakpoint');
                const conditionInfo = condition ? ` (condition: ${condition})` : '';
                const logInfo = logMessage ? ` (log: "${logMessage}")` : '';
                
                const result: CallToolResult = {
                    content: [{
                        type: 'text',
                        text: `Set ${breakpointType} in ${relativePath} at line ${targetLine + 1}${conditionInfo}${logInfo}\n\nLine content: ${lineContent}`
                    }]
                };
                
                return result;
                
            } catch (error) {
                console.error('[debug_set_breakpoint] Error:', error);
                throw new Error(`Failed to set breakpoint: ${error}`);
            }
        }
    );

    // Add debug_list_breakpoints tool
    server.tool(
        'debug_list_breakpoints',
        `Lists all breakpoints currently set in the workspace.
        
        WHEN TO USE: Getting an overview of all active breakpoints, debugging session preparation.
        
        Returns information about each breakpoint including location, condition, and status.`,
        {},
        async (): Promise<CallToolResult> => {
            try {
                const breakpoints = vscode.debug.breakpoints;
                
                if (breakpoints.length === 0) {
                    return createResponse('No breakpoints are currently set in the workspace.');
                }

                let result = `Found ${breakpoints.length} breakpoint(s):\n\n`;
                
                for (let i = 0; i < breakpoints.length; i++) {
                    const bp = breakpoints[i];
                    
                    if (bp instanceof vscode.SourceBreakpoint) {
                        const location = bp.location;
                        const relativePath = vscode.workspace.asRelativePath(location.uri);
                        const line = location.range.start.line + 1; // Convert to 1-based
                        
                        result += `${i + 1}. ${relativePath}:${line}`;
                        
                        if (!bp.enabled) {
                            result += ' (disabled)';
                        }
                        
                        if (bp.condition) {
                            result += ` - Condition: ${bp.condition}`;
                        }
                        
                        if (bp.logMessage) {
                            result += ` - Log: "${bp.logMessage}"`;
                        }
                        
                        result += '\n';
                        
                        // Add source context
                        try {
                            const document = await vscode.workspace.openTextDocument(location.uri);
                            const totalLines = document.lineCount;
                            const targetLine = location.range.start.line; // 0-based
                            
                            // Get 2 lines before and after current line for context
                            const contextLines = 2;
                            const startLine = Math.max(0, targetLine - contextLines);
                            const endLine = Math.min(totalLines, targetLine + contextLines + 1);
                            
                            for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
                                const lineText = document.lineAt(lineIdx).text;
                                const lineNum = lineIdx + 1;
                                const marker = lineIdx === targetLine ? '→' : ' ';
                                result += `   ${marker} ${lineNum.toString().padStart(3)}: ${lineText}\n`;
                            }
                            
                        } catch (fileError) {
                            result += `   (source context unavailable: ${fileError instanceof Error ? fileError.message : 'unknown error'})\n`;
                        }
                        
                        result += '\n';
                    } else {
                        result += `${i + 1}. ${bp.constructor.name} breakpoint\n\n`;
                    }
                }

                return createResponse(result.trim());
                
            } catch (error) {
                console.error('[debug_list_breakpoints] Error:', error);
                throw new Error(`Failed to list breakpoints: ${error}`);
            }
        }
    );

    // Add debug_remove_breakpoint tool
    server.tool(
        'debug_remove_breakpoint',
        `Removes a specific breakpoint from the workspace.
        
        WHEN TO USE: Cleaning up breakpoints, removing specific debugging points.
        
        Line mode: Use line="file.ext:123" format to remove breakpoint at specific line
        Index mode: Use index=1 to remove breakpoint by its position in the list (from debug_list_breakpoints)
        All mode: Use all=true to remove all breakpoints`,
        {
            line: z.string().optional().describe('File and line in format "path:linenumber" where path is relative to workspace root (e.g., "main.go:25", "cmd/cli/main.go:30", "internal/handlers/users.go:15")'),
            index: z.number().optional().describe('Breakpoint index from list (1-based)'),
            all: z.boolean().optional().describe('Remove all breakpoints if true')
        },
        async ({ line, index, all }): Promise<CallToolResult> => {
            try {
                // Validate input - exactly one parameter must be provided
                const paramCount = [line, index, all].filter(p => p !== undefined).length;
                if (paramCount !== 1) {
                    throw new Error('Must specify exactly one of "line", "index", or "all" parameters');
                }

                const breakpoints = vscode.debug.breakpoints;

                if (all) {
                    // Remove all breakpoints
                    if (breakpoints.length === 0) {
                        return createResponse('No breakpoints are currently set in the workspace.');
                    }
                    vscode.debug.removeBreakpoints(breakpoints);
                    return createResponse(`Removed all ${breakpoints.length} breakpoint(s) from the workspace.`);
                }

                if (index !== undefined) {
                    // Validate index first, then check if breakpoints exist
                    if (index < 1) {
                        throw new Error(`Invalid breakpoint index ${index}. Index must be >= 1.`);
                    }
                    
                    if (breakpoints.length === 0) {
                        throw new Error(`Invalid breakpoint index ${index}. No breakpoints are currently set in the workspace.`);
                    }
                    
                    if (index > breakpoints.length) {
                        throw new Error(`Invalid breakpoint index ${index}. Valid range is 1-${breakpoints.length}.`);
                    }
                    
                    const breakpointToRemove = breakpoints[index - 1]; // Convert to 0-based
                    vscode.debug.removeBreakpoints([breakpointToRemove]);
                    
                    let description = `Breakpoint #${index}`;
                    if (breakpointToRemove instanceof vscode.SourceBreakpoint) {
                        const location = breakpointToRemove.location;
                        const relativePath = vscode.workspace.asRelativePath(location.uri);
                        const lineNum = location.range.start.line + 1;
                        description += ` (${relativePath}:${lineNum})`;
                    }
                    
                    return createResponse(`Removed ${description}.`);
                }

                if (line) {
                    // Remove by file:line
                    const match = line.match(/^(.+):(\d+)$/);
                    if (!match) {
                        throw new Error('Line format must be "filename:linenumber" (e.g., "main.go:25")');
                    }
                    
                    const [, filename, lineStr] = match;
                    const lineNumber = parseInt(lineStr, 10) - 1; // Convert to 0-based
                    
                    if (lineNumber < 0) {
                        throw new Error('Line number must be >= 1');
                    }
                    
                    // Find matching breakpoint
                    const matchingBreakpoints = breakpoints.filter(bp => {
                        if (bp instanceof vscode.SourceBreakpoint) {
                            const bpLocation = bp.location;
                            const bpPath = vscode.workspace.asRelativePath(bpLocation.uri);
                            const bpLine = bpLocation.range.start.line;
                            
                            return (bpPath.endsWith(filename) || bpPath === filename) && 
                                   bpLine === lineNumber;
                        }
                        return false;
                    });
                    
                    if (matchingBreakpoints.length === 0) {
                        throw new Error(`No breakpoint found at ${filename}:${lineNumber + 1}`);
                    }
                    
                    vscode.debug.removeBreakpoints(matchingBreakpoints);
                    
                    return createResponse(`Removed ${matchingBreakpoints.length} breakpoint(s) at ${filename}:${lineNumber + 1}.`);
                }

                throw new Error('No valid removal criteria provided');
                
            } catch (error) {
                console.error('[debug_remove_breakpoint] Error:', error);
                throw new Error(`Failed to remove breakpoint: ${error}`);
            }
        }
    );


    // Add debug_start_session tool
    server.tool(
        'debug_start_session',
        `Starts a debug session using a specified launch configuration.
        
        WHEN TO USE: Beginning a debugging session, launching programs in debug mode.
        
        Requires a launch configuration to exist (use create_launch_config first if needed).`,
        {
            name: z.string().describe('Name of the launch configuration to use'),
            folder: z.string().optional().describe('Workspace folder name (if multiple folders)')
        },
        async ({ name, folder }): Promise<CallToolResult> => {
            // Check if there's already an active debug session
            if (vscode.debug.activeDebugSession) {
                throw new Error(`Debug session "${vscode.debug.activeDebugSession.name}" is already running. Stop it before starting a new one.`);
            }
            
            // Get workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folders are open');
            }
            
            // Select target folder
            let targetFolder = workspaceFolders[0];
            if (folder) {
                const foundFolder = workspaceFolders.find(f => f.name === folder);
                if (!foundFolder) {
                    const available = workspaceFolders.map(f => f.name).join(', ');
                    throw new Error(`Workspace folder "${folder}" not found. Available: ${available}`);
                }
                targetFolder = foundFolder;
            }

            // Start debug session
            const started = await vscode.debug.startDebugging(targetFolder, name);
            
            if (!started) {
                throw new Error(`Failed to start debug session with configuration "${name}"`);
            }

            return {
                content: [{
                    type: 'text',
                    text: `Started debug session "${name}" in workspace folder "${targetFolder.name}"`
                }]
            };
        }
    );

    // Add debug_stop_session tool
    server.tool(
        'debug_stop_session',
        `Stops the currently active debug session.
        
        WHEN TO USE: Terminating a debug session, stopping debugging.
        
        Stops the active debug session if one is running.`,
        {
            sessionId: z.string().optional().describe('Optional session ID to stop specific session (defaults to active session)')
        },
        async ({ sessionId }): Promise<CallToolResult> => {
            const activeSession = vscode.debug.activeDebugSession;
            
            if (!activeSession) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No active debug session to stop'
                    }]
                };
            }

            // If specific session ID provided, validate it matches
            if (sessionId && activeSession.id !== sessionId) {
                throw new Error(`Session ID "${sessionId}" does not match active session "${activeSession.id}"`);
            }

            await vscode.debug.stopDebugging(activeSession);

            return {
                content: [{
                    type: 'text',
                    text: `Stopped debug session "${activeSession.name}" (ID: ${activeSession.id})`
                }]
            };
        }
    );


    // Add debug_continue_session tool
    server.tool(
        'debug_continue_session',
        `Continues execution of a paused debug session.
        
        WHEN TO USE: Resuming program execution after hitting a breakpoint or pause.
        
        Sends a continue request to the active debug session. Returns current state if execution stops at a breakpoint.`,
        {
            threadId: z.string().describe('Thread ID from debug_list_threads output')
        },
        async ({ threadId }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);

            // Send continue request to the debug adapter
            await thread.continue();

            const debugStateResult = await thread.waitUntilPausedAndGetState();

            return {
                content: [{
                    type: 'text',
                    text: toMarkdown(debugStateResult)
                }]
            };
        }
    );

    // Add debug_list_sessions tool
    server.tool(
        'debug_list_sessions',
        `Lists all currently active debug sessions.
        
        WHEN TO USE: Getting overview of running debug sessions, session management.
        
        Returns information about each active debug session.`,
        {},
        async (): Promise<CallToolResult> => {
            const activeSession = vscode.debug.activeDebugSession;
            
            if (!activeSession) {
                return createResponse('No debug sessions are currently active');
            }

            const sessionInfo = `Active debug session:
- Name: ${activeSession.name}
- ID: ${activeSession.id}
- Type: ${activeSession.type}
- Workspace: ${activeSession.workspaceFolder?.name || 'N/A'}`;

            return createResponse(sessionInfo);
        }
    );

    // Add debug_list_threads tool
    server.tool(
        'debug_list_threads',
        `Lists all threads in the currently active debug session.
        
        WHEN TO USE: Before using any thread-specific debug operations, to identify available thread IDs.
        
        Returns information about each thread including ID, name, and state.`,
        {},
        async (): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();

            // Get list of threads as TypedThread instances
            const threads = await activeSession.getThreads();
            
            if (!threads || threads.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No threads found in the debug session'
                    }]
                };
            }

            let result = `Threads in debug session "${activeSession.name}":\n\n`;
            
            for (const thread of threads) {
                result += `Thread ID: ${thread.id} (${thread.name || 'unnamed'})`;
                
                // Check if thread is paused (immediate check)
                const isPaused = await thread.isPaused();
                if (isPaused) {
                    result += ' (stopped)';
                    try {
                        const debugStateResult = await thread.waitUntilPausedAndGetState();
                        result += `\n  ${debugStateResult.message.replace(/\n/g, '\n  ')}\n`;
                    } catch (error) {
                        result += `\n  Debug state unavailable: ${error}\n`;
                    }
                } else {
                    result += ' (running)\n';
                }
            }

            return {
                content: [{
                    type: 'text',
                    text: result.trim()
                }]
            };
        }
    );

    // Add debug_get_variables tool
    server.tool(
        'debug_get_variables',
        `Gets variables from the current debug session scope.
        
        WHEN TO USE: Inspecting variable values during debugging, examining local/global scope.
        
        Retrieves variables from the active debug session's current scope.`,
        {
            threadId: z.string().describe('Thread ID from debug_list_threads output'),
            scope: z.string().optional().describe('Regular expression pattern to match scope names (e.g., "local" for any scope containing "local", "Local:.*addNumbers" for locals of addNumbers function, "global" for global scope). If not provided, returns all scopes.')
        },
        async ({ threadId, scope }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);

            const variables = await thread.getVariables(scope);

            if (variables.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No variables found in ${scope} scope`
                    }]
                };
            }

            let result = `Variables in debug session "${activeSession.name}":\n\n`;
            
            for (const scopeGroup of variables) {
                result += `${scopeGroup.scope} Scope:\n`;
                for (const variable of scopeGroup.variables) {
                    result += `- ${variable.name}: ${variable.value} (${variable.type || 'unknown'})\n`;
                }
                result += '\n';
            }

            return {
                content: [{
                    type: 'text',
                    text: result.trim()
                }]
            };
        }
    );

    // Add debug_get_callstack tool
    server.tool(
        'debug_get_callstack',
        `Gets the current call stack from the active debug session.
        
        WHEN TO USE: Examining program flow, understanding execution context during debugging.
        
        Returns the call stack showing function calls and their locations.`,
        {
            threadId: z.string().describe('Thread ID from debug_list_threads output')
        },
        async ({ threadId }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);

            const stackTrace = await thread.getStackTrace();

            if (!stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No stack frames available'
                    }]
                };
            }

            let result = `Call stack for debug session "${activeSession.name}" (Thread ${thread.name}):\n\n`;
            
            stackTrace.stackFrames.forEach((frame: any, index: number) => {
                const location = frame.source 
                    ? `${frame.source.name}:${frame.line}:${frame.column}`
                    : 'unknown location';
                result += `${index + 1}. ${frame.name} at ${location}\n`;
            });

            return {
                content: [{
                    type: 'text',
                    text: result.trim()
                }]
            };
        }
    );

    // Add debug_step_over tool
    server.tool(
        'debug_step_over',
        `Steps over the current line in the debug session.
        
        WHEN TO USE: Debugging line by line, stepping through code without entering function calls.
        
        Executes the current line and stops at the next line in the same function. Returns current debugging state with code context.`,
        tools.step_over.inputSchema,
        async ({ threadId }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);
            await thread.stepOver();
            const debugStateResult = await thread.waitUntilPausedAndGetState();
            return createResponse(toMarkdown(debugStateResult));
        }
    );

    // Add debug_step_into tool
    server.tool(
        'debug_step_into',
        `Steps into the current function call in the debug session.
        
        WHEN TO USE: Debugging function internals, entering function calls for detailed inspection.
        
        Steps into the function call on the current line. Returns current debugging state with code context.`,
        tools.step_into.inputSchema,
        async ({ threadId }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);
            await thread.stepInto();
            const debugStateResult = await thread.waitUntilPausedAndGetState();
            return createResponse(toMarkdown(debugStateResult));
        }
    );

    // Add debug_step_out tool
    server.tool(
        'debug_step_out',
        `Steps out of the current function in the debug session.
        
        WHEN TO USE: Exiting current function to return to caller, debugging at higher level.
        
        Continues execution until the current function returns. Returns current debugging state with code context.`,
        tools.step_out.inputSchema,
        async ({ threadId }): Promise<CallToolResult> => {
            const activeSession = requireActiveDebugSession();
            const thread = activeSession.getThread(threadId);
            await thread.stepOut();
            const debugStateResult = await thread.waitUntilPausedAndGetState();
            return createResponse(toMarkdown(debugStateResult));
        }
    );

    // Add debug_get_console_output tool
    server.tool(
        'debug_get_console_output',
        `Retrieves console output messages from a debug session.
        
        WHEN TO USE: Getting debug console output, examining program stdout/stderr during debugging.
        
        Returns console messages with filtering and pagination options.`,
        consoleOutputSchema,
        async ({ sessionId, category, search, limit, offset }): Promise<CallToolResult> => {
            // Get the session ID
            let targetSessionId: string;
            if (sessionId) {
                targetSessionId = sessionId;
            } else {
                const activeSession = vscode.debug.activeDebugSession;
                if (!activeSession) {
                    return createResponse('No debug session is currently active');
                }
                targetSessionId = activeSession.id;
            }

            // Get messages with pagination
            const buffer = DebugConsoleBuffer.getInstance();
            const { 
                messages: allMessages, 
                totalCount: sessionTotalCount,
                hasLostMessages,
                oldestAvailableIndex
            } = buffer.getMessagesWithPagination(targetSessionId);
            
            // Apply category filter
            let messages = allMessages;
            if (category && category !== 'all') {
                messages = messages.filter(msg => msg.category === category);
            }

            // Apply search filter
            if (search) {
                const searchLower = search.toLowerCase();
                messages = messages.filter(msg => 
                    msg.output.toLowerCase().includes(searchLower)
                );
            }

            // Apply offset/limit pagination after filtering
            const filteredCount = messages.length;
            const paginatedMessages = messages.slice(offset, offset + limit);

            if (paginatedMessages.length === 0) {
                return createResponse(`No console output found (session total: ${sessionTotalCount}, filtered: ${filteredCount})`);
            }

            // Format the output
            let result = `Console output for debug session (showing ${paginatedMessages.length} of ${filteredCount} filtered messages, session total: ${sessionTotalCount}):\n\n`;
            
            // Add warning if messages were lost
            if (hasLostMessages) {
                result += `⚠️ WARNING: Some messages have been lost due to buffer overflow (buffer size: 1000 messages).\n`;
                if (oldestAvailableIndex !== undefined) {
                    result += `   Oldest available message index: ${oldestAvailableIndex} (earlier messages have been overwritten)\n\n`;
                }
            }
            
            for (const msg of paginatedMessages) {
                const timestamp = new Date(msg.timestamp).toISOString().slice(11, 23); // HH:mm:ss.SSS
                result += `[${timestamp}] ${msg.category}: ${msg.output}`;
                if (!msg.output.endsWith('\n')) {
                    result += '\n';
                }
            }

            // Add pagination info if there are more messages
            if (filteredCount > offset + limit) {
                result += `\n... ${filteredCount - (offset + limit)} more messages available (use offset: ${offset + limit})`;
            }

            return createResponse(result.trim());
        }
    );
}