import * as vscode from 'vscode';
import { DebugProtocol } from '@vscode/debugprotocol';

export interface ConsoleMessage {
    timestamp: number;
    sessionId: string;
    sessionLocalIndex: number;  // Index within the session (0, 1, 2, ...)
    category: string;
    output: string;
    source?: {
        name?: string;
        path?: string;
        line?: number;
        column?: number;
    };
}

export class DebugConsoleBuffer {
    private static instance: DebugConsoleBuffer | null = null;
    private readonly buffer: ConsoleMessage[] = [];
    private readonly maxSize: number;
    private writeIndex = 0;
    private totalMessages = 0;
    // Track the next local index for each session (acts as a counter of total messages)
    private readonly sessionMessageCounts = new Map<string, number>();
    // Track the oldest message index still in buffer for each session
    private readonly sessionOldestInBuffer = new Map<string, number>();
    private listenerInitialized = false;

    constructor(maxSize: number = 1000, skipListener: boolean = false) {
        this.maxSize = maxSize;
        if (!skipListener) {
            console.log('[DebugConsoleBuffer] Creating instance');
            this.initializeListener();
        }
    }

    public static getInstance(): DebugConsoleBuffer {
        if (!DebugConsoleBuffer.instance) {
            console.log('[DebugConsoleBuffer] Initializing new instance');
            DebugConsoleBuffer.instance = new DebugConsoleBuffer(1000, false);
        }
        return DebugConsoleBuffer.instance;
    }

    private initializeListener(): void {
        if (this.listenerInitialized) return;
        this.listenerInitialized = true;

        // Register a DebugAdapterTracker to capture DAP output events
        vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker: (session: vscode.DebugSession) => {
                console.log(`[DebugConsoleBuffer] Creating tracker for session: ${session.id}`);
                return {
                    onDidSendMessage: (message: DebugProtocol.ProtocolMessage) => {
                        // Log all events to see what's coming through
                        if (message.type === 'event') {
                            const event = message as DebugProtocol.Event;
                            console.log(`[DebugConsoleBuffer] Event received: ${event.event}`);
                            
                            if (event.event === 'output') {
                                const outputEvent = event as DebugProtocol.OutputEvent;
                                console.log(`[DebugConsoleBuffer] Output event:`, JSON.stringify(outputEvent.body));
                                
                                if (!outputEvent.body) return;
                                
                                // Add the message to our buffer
                                const msg = {
                                    timestamp: Date.now(),
                                    sessionId: session.id,
                                    sessionLocalIndex: -1, // Will be set in addMessage
                                    category: outputEvent.body.category || 'stdout',
                                    output: outputEvent.body.output || '',
                                    source: outputEvent.body.source && outputEvent.body.line ? {
                                        name: outputEvent.body.source.name,
                                        path: outputEvent.body.source.path,
                                        line: outputEvent.body.line,
                                        column: outputEvent.body.column
                                    } : undefined
                                };
                                console.log(`[DebugConsoleBuffer] Adding message to buffer:`, JSON.stringify(msg));
                                this.addMessage(msg);
                            }
                        }
                    }
                };
            }
        });

        // Clean up session tracking when debug sessions terminate
        vscode.debug.onDidTerminateDebugSession((session) => {
            this.sessionMessageCounts.delete(session.id);
            this.sessionOldestInBuffer.delete(session.id);
        });
    }

    public addMessage(message: ConsoleMessage): void {
        // If sessionLocalIndex is -1, assign the next index for this session
        if (message.sessionLocalIndex === -1) {
            const sessionIndex = this.sessionMessageCounts.get(message.sessionId) || 0;
            message.sessionLocalIndex = sessionIndex;
            this.sessionMessageCounts.set(message.sessionId, sessionIndex + 1);
        } else {
            // If sessionLocalIndex is provided (for testing), update the count if needed
            const currentCount = this.sessionMessageCounts.get(message.sessionId) || 0;
            if (message.sessionLocalIndex >= currentCount) {
                this.sessionMessageCounts.set(message.sessionId, message.sessionLocalIndex + 1);
            }
        }
        
        // Check if we're overwriting an existing message
        const oldMessage = this.buffer[this.writeIndex];
        if (oldMessage) {
            // If we're overwriting a message from the same session, update the oldest tracker
            if (oldMessage.sessionId === message.sessionId) {
                const currentOldest = this.sessionOldestInBuffer.get(message.sessionId);
                if (currentOldest === undefined || oldMessage.sessionLocalIndex === currentOldest) {
                    // We're overwriting the oldest message, need to find the new oldest
                    // This will be recalculated in getAllMessages
                    this.sessionOldestInBuffer.delete(message.sessionId);
                }
            }
        }
        
        this.buffer[this.writeIndex] = message;
        this.writeIndex = (this.writeIndex + 1) % this.maxSize;
        this.totalMessages++;
        
        // Update oldest tracker for this session if needed
        const currentOldest = this.sessionOldestInBuffer.get(message.sessionId);
        if (currentOldest === undefined || message.sessionLocalIndex < currentOldest) {
            this.sessionOldestInBuffer.set(message.sessionId, message.sessionLocalIndex);
        }
    }

    public getNewMessages(sessionId: string): ConsoleMessage[] {
        // For now, just return all messages for this session
        return this.getAllMessages(sessionId);
    }

    public getAllMessages(sessionId: string): ConsoleMessage[] {
        const allMessages: ConsoleMessage[] = [];
        
        // Determine the range of messages to check
        const bufferSize = Math.min(this.totalMessages, this.maxSize);
        const startIndex = this.totalMessages > this.maxSize ? this.writeIndex : 0;

        // Collect all messages for this session
        for (let i = 0; i < bufferSize; i++) {
            const bufferIndex = (startIndex + i) % this.maxSize;
            const message = this.buffer[bufferIndex];
            
            if (message && message.sessionId === sessionId) {
                allMessages.push(message);
            }
        }

        return allMessages;
    }

    /**
     * Get messages for a session with pagination based on session-local indices
     * @param sessionId The session ID
     * @param startIndex Optional start index (inclusive) in session-local indexing
     * @param endIndex Optional end index (exclusive) in session-local indexing
     * @returns Messages, total count, and warning if messages were lost
     */
    public getMessagesWithPagination(sessionId: string, startIndex?: number, endIndex?: number): {
        messages: ConsoleMessage[];
        totalCount: number;
        hasLostMessages: boolean;
        oldestAvailableIndex?: number;
    } {
        const allMessages = this.getAllMessages(sessionId);
        const totalCount = this.sessionMessageCounts.get(sessionId) || 0;
        
        // Calculate the oldest available message index
        let oldestAvailableIndex: number | undefined;
        let hasLostMessages = false;
        
        if (allMessages.length > 0) {
            // Find the minimum session-local index in our buffer
            oldestAvailableIndex = Math.min(...allMessages.map(m => m.sessionLocalIndex));
            
            // Check if we've lost messages - if the oldest message isn't index 0,
            // then earlier messages have been lost
            if (oldestAvailableIndex > 0) {
                hasLostMessages = true;
            }
        } else if (totalCount > 0) {
            // If we have a total count but no messages, they've all been lost
            hasLostMessages = true;
        }
        
        // If no pagination, return all available messages
        if (startIndex === undefined && endIndex === undefined) {
            return { messages: allMessages, totalCount, hasLostMessages, oldestAvailableIndex };
        }
        
        // Filter messages based on session-local index range
        const start = startIndex ?? 0;
        const end = endIndex ?? totalCount;
        
        const filteredMessages = allMessages.filter(msg => 
            msg.sessionLocalIndex >= start && msg.sessionLocalIndex < end
        );
        
        // Check if requested range includes lost messages
        const requestedRangeHasLostMessages = oldestAvailableIndex !== undefined && start < oldestAvailableIndex;
        
        return { 
            messages: filteredMessages, 
            totalCount, 
            hasLostMessages: hasLostMessages || requestedRangeHasLostMessages,
            oldestAvailableIndex 
        };
    }
    
    /**
     * Get the total number of messages ever sent for a session
     * (including those that may have been overwritten in the circular buffer)
     */
    public getSessionTotalCount(sessionId: string): number {
        return this.sessionMessageCounts.get(sessionId) || 0;
    }
}