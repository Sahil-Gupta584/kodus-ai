// Teste do método extractToolResult totalmente agnóstico

// Simula o método extractToolResult totalmente agnóstico
function extractToolResult(result) {
    try {
        // Handle MCP tool result structure
        if (result.type === 'tool_result' && result.content) {
            const content = result.content;

            // Try different possible field names
            const possibleResultFields = [
                'result',
                'results',
                'data',
                'response',
            ];

            for (const fieldName of possibleResultFields) {
                if (content[fieldName]) {
                    const toolResult = content[fieldName];

                    // Try different content structures
                    const possibleContentFields = [
                        'content',
                        'data',
                        'text',
                        'message',
                    ];

                    for (const contentField of possibleContentFields) {
                        if (toolResult[contentField]) {
                            const contentData = toolResult[contentField];

                            // Handle array content
                            if (Array.isArray(contentData)) {
                                for (const item of contentData) {
                                    if (item && typeof item === 'object') {
                                        const itemObj = item;

                                        // Try to extract text from different possible fields
                                        const possibleTextFields = [
                                            'text',
                                            'content',
                                            'data',
                                            'message',
                                        ];

                                        for (const textField of possibleTextFields) {
                                            if (
                                                itemObj[textField] &&
                                                typeof itemObj[textField] ===
                                                    'string'
                                            ) {
                                                const text = itemObj[textField];

                                                // Try to parse as JSON
                                                try {
                                                    const parsedText =
                                                        JSON.parse(text);

                                                    // Handle success/failure
                                                    if (
                                                        parsedText.successful ===
                                                        false
                                                    ) {
                                                        return `❌ Error: ${parsedText.error || 'Unknown error'}`;
                                                    }

                                                    if (
                                                        parsedText.successful ===
                                                        true
                                                    ) {
                                                        // Extract any data field (agnostic)
                                                        if (parsedText.data) {
                                                            const dataStr =
                                                                JSON.stringify(
                                                                    parsedText.data,
                                                                );
                                                            if (
                                                                dataStr.length >
                                                                100
                                                            ) {
                                                                return `✅ Data extracted (${dataStr.length} chars)`;
                                                            }
                                                            return `✅ Data: ${dataStr}`;
                                                        }
                                                        return '✅ Success';
                                                    }
                                                } catch {
                                                    // If JSON parsing fails, return the raw text
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

                            // Handle direct string content
                            if (typeof contentData === 'string') {
                                try {
                                    const parsedData = JSON.parse(contentData);
                                    if (parsedData.successful === false) {
                                        return `❌ Error: ${parsedData.error || 'Unknown error'}`;
                                    }
                                    if (parsedData.successful === true) {
                                        if (parsedData.data) {
                                            const dataStr = JSON.stringify(
                                                parsedData.data,
                                            );
                                            if (dataStr.length > 100) {
                                                return `✅ Data extracted (${dataStr.length} chars)`;
                                            }
                                            return `✅ Data: ${dataStr}`;
                                        }
                                        return '✅ Success';
                                    }
                                } catch {
                                    if (contentData.length > 100) {
                                        return `✅ Raw data (${contentData.length} chars)`;
                                    }
                                    return `✅ Raw: ${contentData}`;
                                }
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
        const possibleFields = [
            'result',
            'results',
            'data',
            'response',
            'content',
        ];

        for (const field of possibleFields) {
            if (result[field]) {
                const fieldData = result[field];
                const fieldStr = JSON.stringify(fieldData);
                if (fieldStr.length > 100) {
                    return `✅ ${field} (${fieldStr.length} chars)`;
                }
                return `✅ ${field}: ${fieldStr}`;
            }
        }

        return null;
    } catch {
        return '❓ Unknown result format';
    }
}

// Teste 1: Estrutura padrão (result + content[0])
const standardResult = {
    type: 'tool_result',
    content: {
        result: {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        successful: true,
                        data: '@@ -0,0 +1,44 @@\n+#!/bin/bash\n+# Script...',
                    }),
                },
            ],
        },
    },
};

// Teste 2: Estrutura com 'results' em vez de 'result'
const resultsStructure = {
    type: 'tool_result',
    content: {
        results: {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        successful: true,
                        data: { message: 'Operation completed' },
                    }),
                },
            ],
        },
    },
};

// Teste 3: Estrutura com 'data' em vez de 'content'
const dataStructure = {
    type: 'tool_result',
    content: {
        result: {
            data: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        successful: false,
                        error: 'Permission denied',
                    }),
                },
            ],
        },
    },
};

// Teste 4: Estrutura com múltiplos itens no array
const multipleItemsStructure = {
    type: 'tool_result',
    content: {
        result: {
            content: [
                { type: 'text', text: 'First message' },
                {
                    type: 'text',
                    text: JSON.stringify({
                        successful: true,
                        data: { items: ['a', 'b', 'c'] },
                    }),
                },
            ],
        },
    },
};

// Teste 5: Estrutura simples sem tool_result
const simpleStructure = {
    success: true,
    result: { message: 'Simple operation' },
};

console.log('🧪 TESTE DO MÉTODO TOTALMENTE AGNÓSTICO');
console.log('========================================\n');

console.log('1️⃣ Estrutura Padrão (result + content[0]):');
console.log(extractToolResult(standardResult));
console.log();

console.log('2️⃣ Estrutura com "results":');
console.log(extractToolResult(resultsStructure));
console.log();

console.log('3️⃣ Estrutura com "data":');
console.log(extractToolResult(dataStructure));
console.log();

console.log('4️⃣ Estrutura com múltiplos itens:');
console.log(extractToolResult(multipleItemsStructure));
console.log();

console.log('5️⃣ Estrutura simples:');
console.log(extractToolResult(simpleStructure));
console.log();
