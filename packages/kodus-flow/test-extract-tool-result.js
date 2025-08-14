// Teste do método extractToolResult agnóstico

// Simula o método extractToolResult
function extractToolResult(result) {
    try {
        // Handle MCP tool result structure
        if (result.type === 'tool_result' && result.content) {
            const content = result.content;

            // Extract from result.content
            if (content.result) {
                const toolResult = content.result;

                // Parse content array (this is what's actually used)
                if (toolResult.content && Array.isArray(toolResult.content)) {
                    const contentArray = toolResult.content;
                    if (contentArray.length > 0) {
                        const firstContent = contentArray[0];
                        if (firstContent && firstContent.type === 'text' && firstContent.text) {
                            try {
                                const parsedText = JSON.parse(firstContent.text);
                                
                                // Handle success/failure
                                if (parsedText.successful === false) {
                                    return `❌ Error: ${parsedText.error || 'Unknown error'}`;
                                }
                                
                                if (parsedText.successful === true) {
                                    // Extract any data field (agnostic)
                                    if (parsedText.data) {
                                        const dataStr = JSON.stringify(parsedText.data);
                                        if (dataStr.length > 100) {
                                            return `✅ Data extracted (${dataStr.length} chars)`;
                                        }
                                        return `✅ Data: ${dataStr}`;
                                    }
                                    return '✅ Success';
                                }
                            } catch {
                                // If JSON parsing fails, return the raw text
                                const text = firstContent.text;
                                if (text.length > 100) {
                                    return `✅ Raw data (${text.length} chars)`;
                                }
                                return `✅ Raw: ${text}`;
                            }
                        }
                    }
                }
            }
        }

        // Handle direct success/failure
        if (result.success === true) {
            return '✅ Success';
        }
        if (result.success === false) {
            return '❌ Failed';
        }

        // Fallback: try to extract any result field
        if (result.result) {
            const resultStr = JSON.stringify(result.result);
            if (resultStr.length > 100) {
                return `✅ Result (${resultStr.length} chars)`;
            }
            return `✅ Result: ${resultStr}`;
        }

        if (result.results) {
            const resultsStr = JSON.stringify(result.results);
            if (resultsStr.length > 100) {
                return `✅ Results (${resultsStr.length} chars)`;
            }
            return `✅ Results: ${resultsStr}`;
        }

        return null;
    } catch {
        return '❓ Unknown result format';
    }
}

// Teste 1: Diff result (como no seu exemplo)
const mockDiffResult = {
    type: 'tool_result',
    content: {
        result: {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    successful: true,
                    data: '@@ -0,0 +1,44 @@\n+#!/bin/bash\n+# Script para limpar dados...'
                })
            }]
        }
    }
};

// Teste 2: Jira projects result
const mockJiraResult = {
    type: 'tool_result',
    content: {
        result: {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    successful: true,
                    data: {
                        data: {
                            values: [
                                { key: 'KC', name: 'Kody Copilot' },
                                { key: 'GE', name: 'Gestão Escolar' }
                            ]
                        }
                    }
                })
            }]
        }
    }
};

// Teste 3: Discord error result
const mockDiscordResult = {
    type: 'tool_result',
    content: {
        result: {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    successful: false,
                    error: 'Unknown Guild'
                })
            }]
        }
    }
};

// Teste 4: Resultado simples
const mockSimpleResult = {
    success: true,
    result: { message: 'Operation completed' }
};

console.log('🧪 TESTE DO MÉTODO AGNÓSTICO');
console.log('=============================\n');

console.log('1️⃣ Diff Result:');
console.log(extractToolResult(mockDiffResult));
console.log();

console.log('2️⃣ Jira Projects Result:');
console.log(extractToolResult(mockJiraResult));
console.log();

console.log('3️⃣ Discord Error Result:');
console.log(extractToolResult(mockDiscordResult));
console.log();

console.log('4️⃣ Simple Result:');
console.log(extractToolResult(mockSimpleResult));
console.log();
