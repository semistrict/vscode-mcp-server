// Global variables for debugging
let requestCount = 0;
const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
    { id: 2, name: 'Bob', email: 'bob@example.com', active: false },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', active: true }
];

// Helper function for debugging with local variables
function processUser(userData) {
    const timestamp = new Date().toISOString();
    const userId = userData.id;
    const userName = userData.name;
    
    const processed = {
        ...userData,
        displayName: `${userName} (${userId})`,
        timestamp: timestamp
    };
    return processed;
}

// Nested helper function with multiple levels
function validateUser(id) {
    const inputId = id;
    const startTime = Date.now();
    
    const user = findUserById(inputId);
    const endTime = Date.now();
    const searchDuration = endTime - startTime;
    
    if (!user) {
        const errorResult = { 
            valid: false, 
            reason: 'User not found',
            searchDuration: searchDuration 
        };
        return errorResult;
    }
    
    const successResult = { 
        valid: true, 
        user: user,
        searchDuration: searchDuration 
    };
    return successResult;
}

function findUserById(id) {
    const targetId = parseInt(id);
    const userCount = users.length;
    let foundUser = null;
    
    for (let i = 0; i < userCount; i++) {
        const currentUser = users[i];
        if (currentUser.id === targetId) {
            foundUser = currentUser;
            break;
        }
    }
    
    return foundUser;
}

// Deep nested function for stack testing
function calculateStats(numbers) {
    const count = numbers.length;
    const sum = sumArray(numbers);
    const average = sum / count;
    
    return {
        count: count,
        sum: sum,
        average: average
    };
}

function sumArray(arr) {
    const arrayLength = arr.length;
    let total = 0;
    
    for (let index = 0; index < arrayLength; index++) {
        const currentValue = arr[index];
        total = addNumbers(total, currentValue);
    }
    
    return total;
}

function addNumbers(a, b) {
    const firstNum = a;
    const secondNum = b;
    const result = firstNum + secondNum;
    return result;
}

// Main function that will be called
function handleRequest() {
    requestCount++;
    const message = 'Hello, debugging world!';
    return { message, requestCount };
}

function handleUserRequest(id) {
    requestCount++;
    
    // Validation step
    const validation = validateUser(id);
    if (!validation.valid) {
        return { error: validation.reason };
    }
    
    // Processing step  
    const user = validation.user;
    const processedUser = processUser(user);
    
    // Additional logic for testing
    if (id > 100) {
        return { error: 'User ID too high' };
    }
    
    return processedUser;
}

function debugTest() {
    requestCount++;
    
    // Local variables for inspection
    const localVar = 'test value';
    const numbers = [1, 2, 3, 4, 5];
    const config = {
        debug: true,
        version: '1.0.0',
        features: ['auth', 'logging', 'metrics']
    };
    
    // Use the nested calculation functions
    const stats = calculateStats(numbers);
    
    return {
        localVar,
        stats,
        config,
        requestCount
    };
}

// Main execution that will hit breakpoints
console.log('Starting program...');

const result1 = handleRequest();
console.log('Result 1:', result1);

const result2 = handleUserRequest(1);
console.log('Result 2:', result2);

const result3 = debugTest();
console.log('Result 3:', result3);

// Additional calls to exercise the nested functions
const testNumbers = [10, 20, 30, 40, 50];
const finalStats = calculateStats(testNumbers);
console.log('Final stats:', finalStats);

console.log('Program finished.');