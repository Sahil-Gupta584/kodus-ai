/**
 * Example demonstrating AJV validation in Kodus Flow
 * 
 * This example shows how the response-validator module uses AJV
 * to validate LLM responses with robust error handling.
 */

import { 
    validatePlanningResponse, 
    validateRoutingResponse,
    validateLLMResponse,
    getValidationErrors 
} from '../src/core/llm/response-validator.js';

// Example 1: Valid planning response
console.log('=== Example 1: Valid Planning Response ===');
const validPlanningResponse = {
    content: JSON.stringify({
        strategy: 'plan-execute',
        goal: 'Create a user authentication system',
        steps: [
            {
                id: 'fetch-requirements',
                description: 'Gather authentication requirements',
                type: 'action',
                tool: 'requirements_tool',
                arguments: { scope: 'authentication' }
            },
            {
                id: 'design-schema',
                description: 'Design database schema for users',
                type: 'action',
                tool: 'schema_designer',
                arguments: { 
                    tables: ['users', 'sessions'],
                    relationships: true
                }
            }
        ],
        reasoning: 'Breaking down authentication into manageable steps',
        complexity: 'medium'
    })
};

const validResult = validatePlanningResponse(validPlanningResponse);
console.log('Valid result:', validResult);
console.log('');

// Example 2: Invalid planning response with placeholders
console.log('=== Example 2: Invalid Response with Placeholders ===');
const invalidPlanningResponse = {
    content: JSON.stringify({
        strategy: 'plan-execute',
        goal: 'Create repository',
        steps: [
            {
                id: 'create-repo',
                description: 'Create new repository',
                type: 'action',
                tool: 'github.create_repository',
                arguments: {
                    name: 'REPOSITORY_NAME_HERE',
                    owner: 'USER_ID',
                    private: true
                }
            }
        ],
        reasoning: 'Need to create repository'
    })
};

const invalidResult = validatePlanningResponse(invalidPlanningResponse);
console.log('Invalid result:', invalidResult);
console.log('');

// Example 3: Malformed response recovery
console.log('=== Example 3: Malformed Response Recovery ===');
const malformedResponse = {
    content: 'Just a string response, not valid JSON'
};

const recoveredResult = validatePlanningResponse(malformedResponse);
console.log('Recovered result:', recoveredResult);
console.log('');

// Example 4: Valid routing response
console.log('=== Example 4: Valid Routing Response ===');
const validRoutingResponse = {
    content: JSON.stringify({
        strategy: 'llm_decision',
        selectedTool: 'database_query',
        confidence: 0.95,
        reasoning: 'User wants to query database for user information',
        alternatives: [
            {
                tool: 'user_search',
                confidence: 0.8,
                reason: 'Could also use dedicated user search'
            }
        ]
    })
};

const routingResult = validateRoutingResponse(validRoutingResponse);
console.log('Routing result:', routingResult);
console.log('');

// Example 5: Response with extra fields (handled gracefully)
console.log('=== Example 5: Response with Extra Fields ===');
const responseWithExtras = {
    content: JSON.stringify({
        strategy: 'plan-execute',
        goal: 'Process data',
        steps: [
            {
                id: 'load-data',
                description: 'Load data from source',
                type: 'action',
                tool: 'data_loader',
                arguments: { source: 'database' },
                // Extra fields that aren't in schema
                customMetadata: { priority: 'high' },
                internalNotes: 'This is for internal use'
            }
        ],
        reasoning: 'Simple data processing',
        complexity: 'simple',
        // Extra field at root level
        debugInfo: { timestamp: Date.now() }
    })
};

const extraFieldsResult = validatePlanningResponse(responseWithExtras);
console.log('Result with extra fields:', extraFieldsResult);
console.log('');

// Example 6: Array shorthand (just steps)
console.log('=== Example 6: Array Shorthand Response ===');
const arrayResponse = {
    content: JSON.stringify([
        {
            id: 'step-1',
            description: 'First step',
            type: 'action'
        },
        {
            id: 'step-2',
            description: 'Second step',
            type: 'decision'
        }
    ])
};

const arrayResult = validatePlanningResponse(arrayResponse);
console.log('Array result:', arrayResult);

// Summary
console.log('\n=== Summary ===');
console.log('AJV validation provides:');
console.log('1. Type safety for LLM responses');
console.log('2. Automatic recovery for common response formats');
console.log('3. Detailed error reporting');
console.log('4. Flexible parsing (handles JSON in markdown, arrays, etc)');
console.log('5. Graceful handling of extra fields');
console.log('6. Performance through compiled validators');