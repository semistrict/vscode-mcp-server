import { describe, it, expect, beforeEach } from 'vitest';
import { DebugConsoleBuffer, ConsoleMessage } from '../tools/debug-console-buffer.js';

describe('DebugConsoleBuffer', () => {
    let buffer: DebugConsoleBuffer;
    const SMALL_BUFFER_SIZE = 5; // Small buffer for easy testing
    let nextTimestamp: number;

    beforeEach(() => {
        // Create a new buffer instance for each test with skipListener=true
        buffer = new DebugConsoleBuffer(SMALL_BUFFER_SIZE, true);
        nextTimestamp = 1000000; // Start with a fixed timestamp
    });

    function createMessage(sessionId: string, output: string): ConsoleMessage {
        const timestamp = nextTimestamp;
        nextTimestamp += 1; // Increment by 1ms for each message
        return {
            timestamp,
            sessionId,
            sessionLocalIndex: -1, // Will be assigned by addMessage
            category: 'stdout',
            output
        };
    }

    describe('basic message storage', () => {
        it('should store and retrieve messages for a session', () => {
            buffer.addMessage(createMessage('session1', 'First message'));
            buffer.addMessage(createMessage('session1', 'Second message'));
            
            const messages = buffer.getAllMessages('session1');
            expect(messages).toHaveLength(2);
            expect(messages[0].output).toBe('First message');
            expect(messages[1].output).toBe('Second message');
        });

        it('should separate messages by session', () => {
            buffer.addMessage(createMessage('session1', 'Message from session1'));
            buffer.addMessage(createMessage('session2', 'Message from session2'));
            buffer.addMessage(createMessage('session1', 'Another from session1'));
            
            const session1Messages = buffer.getAllMessages('session1');
            const session2Messages = buffer.getAllMessages('session2');
            
            expect(session1Messages).toHaveLength(2);
            expect(session2Messages).toHaveLength(1);
        });

        it('should track session message counts correctly', () => {
            buffer.addMessage(createMessage('session1', 'Message 1'));
            buffer.addMessage(createMessage('session1', 'Message 2'));
            buffer.addMessage(createMessage('session1', 'Message 3'));
            
            expect(buffer.getSessionTotalCount('session1')).toBe(3);
            expect(buffer.getSessionTotalCount('nonexistent')).toBe(0);
        });
    });

    describe('circular buffer overflow', () => {
        it('should overwrite oldest messages when buffer is full', () => {
            // Fill buffer beyond capacity (5 slots)
            for (let i = 0; i < 8; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            const messages = buffer.getAllMessages('session1');
            // Should only have the last 5 messages (3, 4, 5, 6, 7)
            expect(messages).toHaveLength(5);
            expect(messages[0].sessionLocalIndex).toBe(3);
            expect(messages[0].output).toBe('Message 3');
            expect(messages[4].sessionLocalIndex).toBe(7);
            expect(messages[4].output).toBe('Message 7');
        });

        it('should maintain correct order after overflow', () => {
            // Add 7 messages to a buffer of size 5
            for (let i = 0; i < 7; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            const messages = buffer.getAllMessages('session1');
            // Messages should be in order: 2, 3, 4, 5, 6
            for (let i = 0; i < messages.length - 1; i++) {
                expect(messages[i].sessionLocalIndex).toBeLessThan(messages[i + 1].sessionLocalIndex);
            }
        });

        it('should handle multiple sessions with overflow', () => {
            // Interleave messages from two sessions
            buffer.addMessage(createMessage('session1', 'S1 Message 0'));
            buffer.addMessage(createMessage('session2', 'S2 Message 0'));
            buffer.addMessage(createMessage('session1', 'S1 Message 1'));
            buffer.addMessage(createMessage('session2', 'S2 Message 1'));
            buffer.addMessage(createMessage('session1', 'S1 Message 2'));
            buffer.addMessage(createMessage('session2', 'S2 Message 2')); // This overwrites session1's message 0
            buffer.addMessage(createMessage('session1', 'S1 Message 3')); // This overwrites session2's message 0
            
            const session1Messages = buffer.getAllMessages('session1');
            const session2Messages = buffer.getAllMessages('session2');
            
            // Session1 should have messages 1, 2, 3 (0 was overwritten)
            expect(session1Messages).toHaveLength(3);
            expect(session1Messages[0].sessionLocalIndex).toBe(1);
            
            // Session2 should have messages 1, 2 (0 was overwritten)
            expect(session2Messages).toHaveLength(2);
            expect(session2Messages[0].sessionLocalIndex).toBe(1);
        });
    });

    describe('pagination with session-local indices', () => {
        it('should return correct page of messages when all are available', () => {
            // Add 5 messages - exactly fills buffer without overflow
            for (let i = 0; i < 5; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            // Request messages 1-4 (indices are 0-based, end is exclusive)
            const result = buffer.getMessagesWithPagination('session1', 1, 4);
            
            expect(result.messages).toHaveLength(3);
            expect(result.messages[0].sessionLocalIndex).toBe(1);
            expect(result.messages[0].output).toBe('Message 1');
            expect(result.messages[1].sessionLocalIndex).toBe(2);
            expect(result.messages[2].sessionLocalIndex).toBe(3);
            expect(result.totalCount).toBe(5);
            expect(result.hasLostMessages).toBe(false);
        });

        it('should return partial page when some messages are lost', () => {
            // Add 10 messages to buffer of size 5 - causes overflow
            for (let i = 0; i < 10; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            // Request messages 3-6 (but 3 and 4 are lost)
            const result = buffer.getMessagesWithPagination('session1', 3, 6);
            
            // Should only get message 5 (the only one in both the range and buffer)
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].sessionLocalIndex).toBe(5);
            expect(result.messages[0].output).toBe('Message 5');
            expect(result.totalCount).toBe(10);
            expect(result.hasLostMessages).toBe(true);
            expect(result.oldestAvailableIndex).toBe(5);
        });

        it('should detect when messages have been lost', () => {
            // Add 10 messages to buffer of size 5
            for (let i = 0; i < 10; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            const result = buffer.getMessagesWithPagination('session1');
            
            expect(result.hasLostMessages).toBe(true);
            expect(result.oldestAvailableIndex).toBe(5); // Messages 0-4 were overwritten
            expect(result.totalCount).toBe(10);
            expect(result.messages).toHaveLength(5); // Only 5 messages in buffer
        });

        it('should warn when requested range includes lost messages', () => {
            // Add 10 messages to buffer of size 5
            for (let i = 0; i < 10; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            // Request messages 0-7 (but 0-4 are lost)
            const result = buffer.getMessagesWithPagination('session1', 0, 7);
            
            expect(result.hasLostMessages).toBe(true);
            expect(result.oldestAvailableIndex).toBe(5);
            // Should only return messages 5 and 6 (7 is not in the range anymore due to overflow)
            expect(result.messages).toHaveLength(2);
            expect(result.messages[0].sessionLocalIndex).toBe(5);
            expect(result.messages[1].sessionLocalIndex).toBe(6);
        });

        it('should not warn when requested range is fully available', () => {
            // Add 3 messages to buffer of size 5 (no overflow)
            for (let i = 0; i < 3; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            const result = buffer.getMessagesWithPagination('session1', 0, 3);
            
            expect(result.hasLostMessages).toBe(false);
            expect(result.messages).toHaveLength(3);
            expect(result.totalCount).toBe(3);
        });

        it('should handle empty pagination parameters', () => {
            for (let i = 0; i < 3; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            // No pagination params should return all messages
            const result = buffer.getMessagesWithPagination('session1');
            
            expect(result.messages).toHaveLength(3);
            expect(result.totalCount).toBe(3);
            expect(result.hasLostMessages).toBe(false);
        });
    });

    describe('session cleanup', () => {
        it('should maintain correct counts after messages are overwritten', () => {
            // Fill buffer with session1 messages
            for (let i = 0; i < 5; i++) {
                buffer.addMessage(createMessage('session1', `S1 Message ${i}`));
            }
            
            // Add session2 messages that overwrite session1
            for (let i = 0; i < 5; i++) {
                buffer.addMessage(createMessage('session2', `S2 Message ${i}`));
            }
            
            // Session1 should have no messages left
            const session1Messages = buffer.getAllMessages('session1');
            expect(session1Messages).toHaveLength(0);
            
            // But total count should still be tracked
            expect(buffer.getSessionTotalCount('session1')).toBe(5);
            expect(buffer.getSessionTotalCount('session2')).toBe(5);
        });
    });

    describe('multiple sessions with buffer overflow', () => {
        it('should track lost messages per session correctly', () => {
            // Add messages from three sessions to exceed buffer
            // Buffer size is 5, we'll add 9 messages total
            buffer.addMessage(createMessage('session1', 'S1-0'));
            buffer.addMessage(createMessage('session2', 'S2-0'));
            buffer.addMessage(createMessage('session3', 'S3-0'));
            buffer.addMessage(createMessage('session1', 'S1-1'));
            buffer.addMessage(createMessage('session2', 'S2-1'));
            buffer.addMessage(createMessage('session3', 'S3-1'));
            buffer.addMessage(createMessage('session1', 'S1-2'));
            buffer.addMessage(createMessage('session2', 'S2-2'));
            buffer.addMessage(createMessage('session3', 'S3-2'));
            
            // Check each session
            const s1 = buffer.getMessagesWithPagination('session1');
            const s2 = buffer.getMessagesWithPagination('session2');
            const s3 = buffer.getMessagesWithPagination('session3');
            
            // Total counts should be tracked
            expect(s1.totalCount).toBe(3);
            expect(s2.totalCount).toBe(3);
            expect(s3.totalCount).toBe(3);
            
            // Should have lost messages
            expect(s1.hasLostMessages).toBe(true);
            expect(s2.hasLostMessages).toBe(true);
            expect(s3.hasLostMessages).toBe(true);
            
            // Only last 5 messages total should be in buffer
            // That's S2-1, S3-1, S1-2, S2-2, S3-2
            expect(s1.messages).toHaveLength(1); // Only S1-2
            expect(s1.messages[0].output).toBe('S1-2');
            expect(s2.messages).toHaveLength(2); // S2-1 and S2-2
            expect(s3.messages).toHaveLength(2); // S3-1 and S3-2
        });

        it('should handle interleaved session messages with overflow correctly', () => {
            // Simulate a realistic scenario with two debug sessions running concurrently
            // Each generating messages at different rates
            buffer.addMessage(createMessage('sessionA', 'A: Starting debug'));
            buffer.addMessage(createMessage('sessionB', 'B: Starting debug'));
            buffer.addMessage(createMessage('sessionA', 'A: Breakpoint hit'));
            buffer.addMessage(createMessage('sessionA', 'A: Variable x = 5'));
            buffer.addMessage(createMessage('sessionB', 'B: Breakpoint hit'));
            buffer.addMessage(createMessage('sessionA', 'A: Stepping over'));
            buffer.addMessage(createMessage('sessionB', 'B: Variable y = 10'));
            buffer.addMessage(createMessage('sessionA', 'A: Function called'));
            
            // 8 messages total, buffer size 5
            const sessionA = buffer.getMessagesWithPagination('sessionA');
            const sessionB = buffer.getMessagesWithPagination('sessionB');
            
            expect(sessionA.totalCount).toBe(5);
            expect(sessionB.totalCount).toBe(3);
            
            // Last 5 messages in buffer should be:
            // A: Variable x = 5, B: Breakpoint hit, A: Stepping over, B: Variable y = 10, A: Function called
            expect(sessionA.messages).toHaveLength(3);
            expect(sessionA.messages[0].output).toBe('A: Variable x = 5');
            expect(sessionA.messages[1].output).toBe('A: Stepping over');
            expect(sessionA.messages[2].output).toBe('A: Function called');
            
            expect(sessionB.messages).toHaveLength(2);
            expect(sessionB.messages[0].output).toBe('B: Breakpoint hit');
            expect(sessionB.messages[1].output).toBe('B: Variable y = 10');
        });
    });

    describe('edge cases', () => {
        it('should handle single message in buffer', () => {
            buffer.addMessage(createMessage('session1', 'Only message'));
            
            const messages = buffer.getAllMessages('session1');
            expect(messages).toHaveLength(1);
            expect(messages[0].output).toBe('Only message');
        });

        it('should handle exactly full buffer', () => {
            // Add exactly 5 messages to buffer of size 5
            for (let i = 0; i < 5; i++) {
                buffer.addMessage(createMessage('session1', `Message ${i}`));
            }
            
            const result = buffer.getMessagesWithPagination('session1');
            expect(result.messages).toHaveLength(5);
            expect(result.hasLostMessages).toBe(false);
            expect(result.totalCount).toBe(5);
        });

        it('should handle requesting messages for non-existent session', () => {
            const messages = buffer.getAllMessages('nonexistent');
            expect(messages).toHaveLength(0);
            
            const result = buffer.getMessagesWithPagination('nonexistent');
            expect(result.messages).toHaveLength(0);
            expect(result.totalCount).toBe(0);
            expect(result.hasLostMessages).toBe(false);
        });

        it('should handle pagination beyond available messages', () => {
            buffer.addMessage(createMessage('session1', 'Message 0'));
            buffer.addMessage(createMessage('session1', 'Message 1'));
            
            // Request messages 10-20 (way beyond what exists)
            const result = buffer.getMessagesWithPagination('session1', 10, 20);
            
            expect(result.messages).toHaveLength(0);
            expect(result.totalCount).toBe(2);
            expect(result.hasLostMessages).toBe(false);
        });
    });
});