import { describe, it } from 'vitest';
import { setupMcpClient, toolCall, getClient, expect } from './helpers/test-setup.js';
import { tools as debugTools } from '../tools/debug-tools.js';

describe('End-to-End Debug Session Tests', () => {
    setupMcpClient();

    describe('full debugging workflow', () => {

        it('comprehensive debug workflow with variables, callstack, and stepping', async () => {
            const client = getClient();

            // Step 0: Clear any existing breakpoints from previous tests
            await toolCall(debugTools.remove_breakpoint, { all: true });

            // Step 1: Create launch config for comprehensive testing
            const createConfigResult = await client.callTool({
                name: 'create_launch_config',
                arguments: {
                    name: 'Comprehensive Debug Test',
                    template: 'node',
                    overwrite: true
                }
            });
            expect(createConfigResult).toBeSuccessWithText(/(Created|Updated) launch configuration 'Comprehensive Debug Test'/);

            // Step 2: Set multiple breakpoints at different locations
            await expect(toolCall(debugTools.set_breakpoint, {
                line: 'index.js:39' // requestCount++ in root handler
            })).toBeSuccessWithText(/Set breakpoint/);

            await expect(toolCall(debugTools.set_breakpoint, {
                line: 'index.js:49' // validation step in users handler  
            })).toBeSuccessWithText(/Set breakpoint/);

            await expect(toolCall(debugTools.set_breakpoint, {
                line: 'index.js:82' // for loop in debug-test handler
            })).toBeSuccessWithText(/Set breakpoint/);

            // Step 3: Set conditional breakpoint
            await expect(toolCall(debugTools.set_breakpoint, {
                line: 'index.js:83',
                condition: 'i === 2'
            })).toBeSuccessWithText(/conditional breakpoint/);

            // Step 3.5: Set a logpoint to generate predictable console output
            await expect(toolCall(debugTools.set_breakpoint, {
                line: 'index.js:99',
                logMessage: 'TEST LOGPOINT: Request count is now {requestCount}'
            })).toBeSuccessWithText(/Set logpoint/);

            // Step 4: Verify all breakpoints are set
            await expect(toolCall(debugTools.list_breakpoints))
                .toBeSuccessWithText(/Found 5 breakpoint/);

            // Step 5: Start debug session
            await expect(toolCall(debugTools.start_session, {
                name: 'Comprehensive Debug Test'
            })).toBeSuccessWithText(/Started debug session "Comprehensive Debug Test"/);

            // Step 6: Wait for program to pause at entry
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Step 7: Get threads to extract threadId for stepping operations
            const listThreadsResult = await toolCall(debugTools.list_threads);
            const threadsText = (listThreadsResult.content?.[0] as { text: string })?.text || '';


            expect(listThreadsResult).toBeSuccessWithText(/Thread ID:/);

            const threadMatch = threadsText.match(/Thread ID: ([^\s]+)/);
            if (!threadMatch) {
                throw new Error(`Could not extract thread ID from response. Actual response: ${threadsText}`);
            }
            const threadId = threadMatch[1];

            // Step 7: Test variable inspection
            await expect(toolCall(debugTools.get_variables, {
                threadId,
                scope: 'local'
            })).toBeSuccessWithText(/Variables|No variables found/);

            // Step 8: Test callstack inspection  
            const callstackResult = await toolCall(debugTools.get_callstack, { threadId });
            const callstackText = (callstackResult.content?.[0] as { text: string })?.text || '';
            expect(callstackText).toContain('1. <anonymous> at index.js:2:20');

            // Step 9: Test stepping operations
            await expect(toolCall(debugTools.step_over, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:3 in function "<anonymous>"

    1: // Global variables for debugging
    2: let requestCount = 0;
→   3: const users = [
    4:     { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
    5:     { id: 2, name: 'Bob', email: 'bob@example.com', active: false },
    6:     { id: 3, name: 'Charlie', email: 'charlie@example.com', active: true }

**Console Output**: No messages

**Stack Frames** (1 total):
1. <anonymous> at index.js:3:15

`);

            await expect(toolCall(debugTools.step_into, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:149 in function "<anonymous>"

  146: }
  147: 
  148: // Main execution that will hit breakpoints
→ 149: console.log('Starting program...');
  150: 
  151: const result1 = handleRequest();
  152: console.log('Result 1:', result1);

**Console Output**: No messages

**Stack Frames** (1 total):
1. <anonymous> at index.js:149:1

`);

            await expect(toolCall(debugTools.step_out, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:50 in function "global.findUserById"

   47: }
   48: 
   49: function findUserById(id) {
→  50:     const targetId = parseInt(id);
   51:     const userCount = users.length;
   52:     let foundUser = null;
   53:

**Console Output**: 3 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.findUserById at index.js:50:22

`);

            // Step 9.4: Get console output to see what messages are available
            const consoleResult = await toolCall(debugTools.get_console_output, {
                category: 'all',
                limit: 100,
                offset: 0
            });
            const consoleText = (consoleResult.content?.[0] as { text: string })?.text || '';
            
            // Check the structure and content without exact timestamps
            // At this point we have 3 messages: startup, logpoint, and result
            expect(consoleText).toMatch(/Console output for debug session \(showing 3 of 3 filtered messages, session total: 3\):/);
            expect(consoleText).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] stdout: Starting program\.\.\./);
            expect(consoleText).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] stdout: TEST LOGPOINT: Request count is now 0/);
            expect(consoleText).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] stdout: Result 1: \{message: 'Hello, debugging world!', requestCount: 1\}/);

            // Step 9.5: List breakpoints to see enhanced output
            const breakpointsList = await toolCall(debugTools.list_breakpoints);
            const breakpointsText = (breakpointsList.content?.[0] as { text: string })?.text || '';
            expect(breakpointsText).toBe(`Found 5 breakpoint(s):

1. index.js:39
      37:         };
      38:         return errorResult;
   →  39:     }
      40:     
      41:     const successResult = { 

2. index.js:49
      47: }
      48: 
   →  49: function findUserById(id) {
      50:     const targetId = parseInt(id);
      51:     const userCount = users.length;

3. index.js:82
      80:     let total = 0;
      81:     
   →  82:     for (let index = 0; index < arrayLength; index++) {
      83:         const currentValue = arr[index];
      84:         total = addNumbers(total, currentValue);

4. index.js:83 - Condition: i === 2
      81:     
      82:     for (let index = 0; index < arrayLength; index++) {
   →  83:         const currentValue = arr[index];
      84:         total = addNumbers(total, currentValue);
      85:     }

5. index.js:99 - Log: "TEST LOGPOINT: Request count is now {requestCount}"
      97: // Main function that will be called
      98: function handleRequest() {
   →  99:     requestCount++;
     100:     const message = 'Hello, debugging world!';
     101:     return { message, requestCount };`);

            // Step 10: Continue execution
            await expect(toolCall(debugTools.continue_session, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:41 in function "global.validateUser"

   38:         return errorResult;
   39:     }
   40:     
→  41:     const successResult = { 
   42:         valid: true, 
   43:         user: user,
   44:         searchDuration: searchDuration

**Console Output**: 3 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.validateUser at index.js:41:27

`);

            // Continue to hit the deep nested function call breakpoint
            await expect(toolCall(debugTools.continue_session, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:82 in function "global.sumArray"

   79:     const arrayLength = arr.length;
   80:     let total = 0;
   81:     
→  82:     for (let index = 0; index < arrayLength; index++) {
   83:         const currentValue = arr[index];
   84:         total = addNumbers(total, currentValue);
   85:     }

**Console Output**: 4 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.sumArray at index.js:82:22`);

            // Step over (stays at line 82 but advances in the for loop)
            await expect(toolCall(debugTools.step_over, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:82 in function "global.sumArray"

   79:     const arrayLength = arr.length;
   80:     let total = 0;
   81:     
→  82:     for (let index = 0; index < arrayLength; index++) {
   83:         const currentValue = arr[index];
   84:         total = addNumbers(total, currentValue);
   85:     }

**Console Output**: 4 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.sumArray at index.js:82:31`);
            
            await expect(toolCall(debugTools.step_over, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:83 in function "global.sumArray"

   80:     let total = 0;
   81:     
   82:     for (let index = 0; index < arrayLength; index++) {
→  83:         const currentValue = arr[index];
   84:         total = addNumbers(total, currentValue);
   85:     }
   86:

**Console Output**: 5 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.sumArray at index.js:83:30`);

            // Step over to line 84 (the addNumbers call)
            await expect(toolCall(debugTools.step_over, { threadId }))
                .toBeSuccessWithText(/Stopped at index\.js:84/);

            // Step into the addNumbers function call
            await expect(toolCall(debugTools.step_into, { threadId }))
                .toBeSuccessWithText(`## Debug State

**Status**: paused (paused)

**Message**:
Stopped at index.js:91 in function "global.addNumbers"

   88: }
   89: 
   90: function addNumbers(a, b) {
→  91:     const firstNum = a;
   92:     const secondNum = b;
   93:     const result = firstNum + secondNum;
   94:     return result;

**Console Output**: 5 messages available (use debug_get_console_output to retrieve)

**Stack Frames** (1 total):
1. global.addNumbers at index.js:91:22`);

            // Get the deep call stack from nested function calls
            const deepStackResult = await toolCall(debugTools.get_callstack, { threadId });
            const deepStackText = (deepStackResult.content?.[0] as { text: string })?.text || '';
            
            // Remove variable parts (process ID and thread ID) for comparison
            const normalizedStackText = deepStackText.replace(/\[(\d+)\]/, '[PID]').replace(/(Thread Thread )\d+/, '$1X');
            const expectedStackText = `Call stack for debug session "index.js [PID] « Comprehensive Debug Test" (Thread Thread X):

1. global.addNumbers at index.js:91:22
2. global.sumArray at index.js:84:17
3. global.calculateStats at index.js:68:17
4. global.debugTest at index.js:138:19
5. <anonymous> at index.js:157:17
6. Module._compile at <node_internals>/internal/modules/cjs/loader:1529:14
7. Module._extensions..js at <node_internals>/internal/modules/cjs/loader:1613:10
8. Module.load at <node_internals>/internal/modules/cjs/loader:1275:32
9. Module._load at <node_internals>/internal/modules/cjs/loader:1096:12
10. function Module(id = '', parent) {.executeUserEntryPoint at <node_internals>/internal/modules/run_main:164:12
11. <anonymous> at <node_internals>/internal/main/run_main_module:28:49`;
            
            expect(normalizedStackText).toBe(expectedStackText);
            
            // Step over to execute the firstNum declaration
            await expect(toolCall(debugTools.step_over, { threadId }))
                .toBeSuccessWithText(/Stopped at index\.js:92/);

            // Get only Local scope variables using regex pattern
            await expect(toolCall(debugTools.get_variables, {
                threadId,
                scope: 'Local'
            })).toBeSuccessWithText(`Local: addNumbers Scope:
- a: 0 (number)
- b: 1 (number)
- firstNum: 0 (number)
- result: undefined (undefined)
- secondNum: undefined (undefined)
- this: global (global)`);
            
            await expect(toolCall(debugTools.remove_breakpoint, { line: 'index.js:39' }))
                .toBeSuccessWithText(/Removed.*breakpoint/);

            await expect(toolCall(debugTools.list_breakpoints))
                .toBeSuccessWithText(`Found 4 breakpoint(s):

1. index.js:49
      47: }
      48: 
   →  49: function findUserById(id) {
      50:     const targetId = parseInt(id);
      51:     const userCount = users.length;

2. index.js:82
      80:     let total = 0;
      81:     
   →  82:     for (let index = 0; index < arrayLength; index++) {
      83:         const currentValue = arr[index];
      84:         total = addNumbers(total, currentValue);

3. index.js:83 - Condition: i === 2
      81:     
      82:     for (let index = 0; index < arrayLength; index++) {
   →  83:         const currentValue = arr[index];
      84:         total = addNumbers(total, currentValue);
      85:     }

4. index.js:99 - Log: "TEST LOGPOINT: Request count is now {requestCount}"
      97: // Main function that will be called
      98: function handleRequest() {
   →  99:     requestCount++;
     100:     const message = 'Hello, debugging world!';
     101:     return { message, requestCount };`);

            await expect(toolCall(debugTools.stop_session))
                .toBeSuccessWithText(/Stopped debug session.*Comprehensive Debug Test/);

            await expect(toolCall(debugTools.list_sessions))
                .toBeSuccessWithText('No debug sessions are currently active');

            await expect(toolCall(debugTools.remove_breakpoint, { all: true }))
                .toBeSuccessWithText(/Removed all.*breakpoint/);

        }, 60000); // 60 second timeout for comprehensive test
    });
});