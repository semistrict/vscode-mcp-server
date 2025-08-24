import * as vscode from 'vscode';
import { DebugProtocol } from '@vscode/debugprotocol';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Utility type to extract the body type from DAP response types
 */
type BodyOf<T extends { body: any }> = T['body'];

/**
 * Thread state types
 */
export type ThreadState = 'paused' | 'running' | 'error';

/**
 * Result of attempting to get debug state from a thread
 */
export interface DebugStateResult {
    isPaused: boolean;
    state: ThreadState;
    message: string;
    waitTime: number;
    stackTrace?: BodyOf<DebugProtocol.StackTraceResponse>;
    error?: string;
}

/**
 * Convert a DebugStateResult to markdown format
 */
export function toMarkdown(result: DebugStateResult): string {
    let markdown = `## Debug State\n\n`;
    markdown += `**Status**: ${result.state} (${result.isPaused ? 'paused' : 'running'})\n\n`;
    
    if (result.error) {
        markdown += `**Error**: ${result.error}\n\n`;
    }
    
    markdown += `**Message**:\n${result.message}\n\n`;
    
    if (result.stackTrace && result.stackTrace.stackFrames?.length > 0) {
        markdown += `**Stack Frames** (${result.stackTrace.stackFrames.length} total):\n`;
        const framesToShow = Math.min(4, result.stackTrace.stackFrames.length);
        for (let i = 0; i < framesToShow; i++) {
            const frame = result.stackTrace.stackFrames[i];
            const location = frame.source 
                ? `${frame.source.name}:${frame.line}:${frame.column}`
                : 'unknown location';
            markdown += `${i + 1}. ${frame.name} at ${location}\n`;
        }
        if (result.stackTrace.stackFrames.length > 4) {
            markdown += `... and ${result.stackTrace.stackFrames.length - 4} more frames\n`;
        }
        markdown += '\n';
    }
    
    return markdown;
}

/**
 * Generate a random encryption key for threadId obfuscation
 */
const THREAD_ID_KEY = randomBytes(32); // 256-bit key
const THREAD_ID_IV_LENGTH = 16; // 128-bit IV

/**
 * Encrypt a numeric threadId into an obfuscated string
 */
function encryptThreadId(threadId: number): string {
    const iv = randomBytes(THREAD_ID_IV_LENGTH);
    const cipher = createCipheriv('aes-256-cbc', THREAD_ID_KEY, iv);
    
    let encrypted = cipher.update(threadId.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data as base64
    return Buffer.concat([iv, Buffer.from(encrypted, 'hex')]).toString('base64');
}

/**
 * Decrypt an obfuscated threadId string back to a number
 */
function decryptThreadId(encryptedThreadId: string): number {
    const combined = Buffer.from(encryptedThreadId, 'base64');
    const iv = combined.slice(0, THREAD_ID_IV_LENGTH);
    const encrypted = combined.slice(THREAD_ID_IV_LENGTH).toString('hex');
    
    const decipher = createDecipheriv('aes-256-cbc', THREAD_ID_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    const threadId = parseInt(decrypted, 10);
    if (isNaN(threadId)) {
        throw new Error('Invalid encrypted threadId');
    }
    
    return threadId;
}

/**
 * Typed wrapper for a debug thread that handles ID encryption/decryption internally
 */
export class TypedThread {
    private readonly numericId: number;
    private readonly session: TypedDebugSession;
    public readonly name: string;

    constructor(thread: DebugProtocol.Thread, session: TypedDebugSession) {
        this.numericId = thread.id;
        this.session = session;
        this.name = thread.name;
    }

    /**
     * Get the encrypted thread ID (safe to expose externally)
     */
    get id(): string {
        return encryptThreadId(this.numericId);
    }

    /**
     * Get the internal numeric thread ID (for DAP requests)
     */
    get internalId(): number {
        return this.numericId;
    }

    /**
     * Create a TypedThread from an encrypted thread ID string
     */
    static fromEncryptedId(encryptedId: string, session: TypedDebugSession): TypedThread {
        const numericId = decryptThreadId(encryptedId);
        // Create a minimal thread object - we don't have name/stopped info from just the ID
        const thread: DebugProtocol.Thread = { id: numericId, name: `Thread ${numericId}` };
        return new TypedThread(thread, session);
    }

    /**
     * Continue execution of this thread
     */
    async continue(): Promise<BodyOf<DebugProtocol.ContinueResponse>> {
        return await this.session.continueExecution(this.numericId);
    }

    /**
     * Step over current line in this thread
     */
    async stepOver(): Promise<void> {
        await this.session.stepOver(this.numericId);
    }

    /**
     * Step into function call in this thread
     */
    async stepInto(): Promise<void> {
        await this.session.stepInto(this.numericId);
    }

    /**
     * Step out of current function in this thread
     */
    async stepOut(): Promise<void> {
        await this.session.stepOut(this.numericId);
    }

    /**
     * Get stack trace for this thread
     */
    async getStackTrace(startFrame?: number, levels?: number): Promise<BodyOf<DebugProtocol.StackTraceResponse>> {
        return await this.session.getStackTrace(this.numericId, startFrame, levels);
    }

    /**
     * Get variables for this thread (from top stack frame)
     */
    async getVariables(scopePattern?: string): Promise<Array<{ scope: string; variables: DebugProtocol.Variable[] }>> {
        // Compile and validate regex early if pattern is provided
        let scopeRegex: RegExp | undefined;
        if (scopePattern) {
            try {
                scopeRegex = new RegExp(scopePattern, 'i'); // Case insensitive
            } catch (error) {
                throw new Error(`Invalid scope pattern regex: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        const stackTrace = await this.getStackTrace(0, 1);
        if (!stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
            throw new Error('No stack frames available');
        }

        const topFrame = stackTrace.stackFrames[0];
        const scopes = await this.session.getScopes(topFrame.id);
        
        const variables: Array<{ scope: string; variables: DebugProtocol.Variable[] }> = [];
        
        for (const scopeInfo of scopes.scopes) {
            // Filter by scope pattern if provided
            if (scopeRegex && !scopeRegex.test(scopeInfo.name)) {
                continue;
            }

            const scopeVars = await this.session.getVariables(scopeInfo.variablesReference);
            variables.push({
                scope: scopeInfo.name,
                variables: scopeVars.variables
            });
        }

        return variables;
    }

    /**
     * Check if this thread is currently paused (immediate check, no waiting)
     */
    async isPaused(): Promise<boolean> {
        return await this.session.isThreadPaused(this.numericId);
    }

    /**
     * Wait until thread is paused and get debugging state with code context
     */
    async waitUntilPausedAndGetState(): Promise<DebugStateResult> {
        return await this.session.waitUntilPausedAndGetDebugState(this.numericId);
    }
}

// Forward declaration
export class TypedDebugSession {
    constructor(private session: vscode.DebugSession) {}

    get name(): string {
        return this.session.name;
    }

    get id(): string {
        return this.session.id;
    }

    get type(): string {
        return this.session.type;
    }

    get workspaceFolder(): vscode.WorkspaceFolder | undefined {
        return this.session.workspaceFolder;
    }

    /**
     * Get list of threads in the debug session (raw DAP response)
     */
    async getThreadsRaw(): Promise<BodyOf<DebugProtocol.ThreadsResponse>> {
        return await this.session.customRequest('threads');
    }

    /**
     * Get list of threads as TypedThread instances
     * Polls for up to 5 seconds if no threads are initially found
     */
    async getThreads(): Promise<TypedThread[]> {
        const maxPollTime = 5000; // 5 seconds
        const pollInterval = 200; // 200ms
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxPollTime) {
            try {
                const response = await this.getThreadsRaw();
                if (response.threads && response.threads.length > 0) {
                    return response.threads.map(thread => new TypedThread(thread, this));
                }
            } catch (error) {
                // Debug adapter might not be ready yet, continue polling
            }
            
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        
        // Final attempt after polling timeout
        const response = await this.getThreadsRaw();
        return response.threads.map(thread => new TypedThread(thread, this));
    }

    /**
     * Get a specific thread by encrypted ID
     */
    getThread(encryptedThreadId: string): TypedThread {
        return TypedThread.fromEncryptedId(encryptedThreadId, this);
    }

    /**
     * Get stack trace for a specific thread
     */
    async getStackTrace(threadId: number, startFrame?: number, levels?: number): Promise<BodyOf<DebugProtocol.StackTraceResponse>> {
        return await this.session.customRequest('stackTrace', {
            threadId,
            startFrame: startFrame ?? 0,
            levels: levels ?? 20
        });
    }

    /**
     * Get scopes for a specific stack frame
     */
    async getScopes(frameId: number): Promise<BodyOf<DebugProtocol.ScopesResponse>> {
        return await this.session.customRequest('scopes', {
            frameId
        });
    }

    /**
     * Get variables for a specific scope
     */
    async getVariables(variablesReference: number): Promise<BodyOf<DebugProtocol.VariablesResponse>> {
        return await this.session.customRequest('variables', {
            variablesReference
        });
    }

    /**
     * Continue execution of a specific thread
     */
    async continueExecution(threadId: number): Promise<BodyOf<DebugProtocol.ContinueResponse>> {
        return await this.session.customRequest('continue', {
            threadId
        });
    }

    /**
     * Step over current line in a specific thread
     */
    async stepOver(threadId: number): Promise<void> {
        await this.session.customRequest('next', {
            threadId
        });
    }

    /**
     * Step into function call in a specific thread
     */
    async stepInto(threadId: number): Promise<void> {
        await this.session.customRequest('stepIn', {
            threadId
        });
    }

    /**
     * Step out of current function in a specific thread
     */
    async stepOut(threadId: number): Promise<void> {
        await this.session.customRequest('stepOut', {
            threadId
        });
    }

    /**
     * Pause execution of a specific thread
     */
    async pause(threadId: number): Promise<void> {
        await this.session.customRequest('pause', {
            threadId
        });
    }

    /**
     * Check if thread is currently paused (immediate check, no waiting)
     */
    async isThreadPaused(threadId: number): Promise<boolean> {
        try {
            const stackTrace = await this.getStackTrace(threadId, 0, 1);
            return stackTrace.stackFrames?.length > 0;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'unknown error';
            return !errorMsg.includes('not paused');
        }
    }

    /**
     * Wait until thread is paused and get debugging state including file location and code context
     * Polls for up to 2 seconds waiting for the thread to be paused
     */
    async waitUntilPausedAndGetDebugState(threadId: number): Promise<DebugStateResult> {
        const maxWaitTime = 2000; // 2 seconds
        const pollInterval = 50; // 50ms
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                // Get current stack trace
                const stackTrace = await this.getStackTrace(threadId, 0, 1);

                if (!stackTrace.stackFrames?.length) {
                    // Thread might still be running, wait and retry
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }

                const topFrame = stackTrace.stackFrames[0];
                const source = topFrame.source;
                const line = topFrame.line;
                
                if (!source?.path || !line) {
                    return {
                        isPaused: true,
                        state: 'paused',
                        message: `Debug session "${this.name}" stopped at ${topFrame.name || 'unknown location'}`,
                        waitTime: Date.now() - startTime,
                        stackTrace
                    };
                }

                // Read file content around the current line
                try {
                    const fileUri = vscode.Uri.file(source.path);
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    const totalLines = document.lineCount;
                    
                    // Get 3 lines before and after current line for context
                    const contextLines = 3;
                    const startLine = Math.max(0, line - 1 - contextLines);
                    const endLine = Math.min(totalLines, line + contextLines);
                    
                    let result = `\nStopped at ${source.name}:${line} in function "${topFrame.name}"\n\n`;
                    
                    for (let i = startLine; i < endLine; i++) {
                        const lineText = document.lineAt(i).text;
                        const lineNum = i + 1;
                        const marker = lineNum === line ? '→' : ' ';
                        result += `${marker} ${lineNum.toString().padStart(3)}: ${lineText}\n`;
                    }
                    
                    return {
                        isPaused: true,
                        state: 'paused',
                        message: result.trim(),
                        waitTime: Date.now() - startTime,
                        stackTrace
                    };
                    
                } catch (fileError) {
                    return {
                        isPaused: true,
                        state: 'paused',
                        message: `Stopped at ${source.name}:${line} in function "${topFrame.name}" (source not accessible)`,
                        waitTime: Date.now() - startTime,
                        stackTrace,
                        error: fileError instanceof Error ? fileError.message : 'unknown file error'
                    };
                }
                
            } catch (error) {
                // If we get "Thread is not paused" error, wait and retry
                const errorMsg = error instanceof Error ? error.message : 'unknown error';
                if (errorMsg.includes('not paused')) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                
                // For other errors, return immediately
                return {
                    isPaused: false,
                    state: 'error',
                    message: `Debug session "${this.name}" state unavailable`,
                    waitTime: Date.now() - startTime,
                    error: errorMsg
                };
            }
        }
        
        // Timeout reached - thread is running
        return {
            isPaused: false,
            state: 'running',
            message: `Debug session "${this.name}" is running (thread not paused after ${maxWaitTime}ms)`,
            waitTime: maxWaitTime
        };
    }

    /**
     * Get the underlying VS Code debug session
     */
    getVSCodeSession(): vscode.DebugSession {
        return this.session;
    }
}

/**
 * Create a typed wrapper for a VS Code debug session
 */
export function createTypedDebugSession(session: vscode.DebugSession): TypedDebugSession {
    return new TypedDebugSession(session);
}