/**
 * 🎯 STRATEGY FORMATTERS
 *
 * Utilitários avançados para formatação de prompts e context
 * na nova arquitetura de strategies.
 *
 * Funcionalidades:
 * - Formatação inteligente de parâmetros de ferramentas
 * - Formatação de context adicional
 * - Formatação de schemas JSON
 * - Estimativa de tokens
 * - Utilitários de formatação
 */

//import { createLogger } from '../../../observability/index.js';
import { AgentContext } from '../../../core/types/allTypes.js';

interface Tool {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
    outputSchema?: Record<string, unknown>;
}

// type Logger = ReturnType<typeof createLogger>;

export class ToolParameterFormatter {
    //private readonly logger: Logger = createLogger('tool-parameter-formatter');

    /**
     * Formata parâmetros de ferramenta com tipos avançados
     */
    formatToolParameters(tool: Tool): string {
        if (!tool.parameters?.properties) {
            return '';
        }

        const properties = tool.parameters.properties as Record<
            string,
            unknown
        >;
        const required = (tool.parameters.required as string[]) || [];

        const paramStrings: string[] = [];

        for (const [name, prop] of Object.entries(properties)) {
            const isRequired = required.includes(name);
            const propObj = prop as {
                type?: string;
                description?: string;
                enum?: unknown[];
                format?: string;
                properties?: Record<string, unknown>;
                items?: Record<string, unknown>;
                nullable?: boolean;
                default?: unknown;
                minLength?: number;
                maxLength?: number;
                minimum?: number;
                maximum?: number;
            };

            // Determina o tipo de display
            let typeDisplay = this.determineTypeDisplay(propObj);

            // Adiciona constraints se existirem
            typeDisplay = this.addConstraints(typeDisplay, propObj);

            // Adiciona marker de obrigatoriedade
            const marker = isRequired ? 'REQUIRED' : 'OPTIONAL';

            // Monta a linha do parâmetro
            const paramLine = `- ${name} (${typeDisplay}, ${marker})${
                propObj.description ? `: ${propObj.description}` : ''
            }`;

            paramStrings.push(paramLine);

            // Adiciona propriedades aninhadas para objetos complexos
            const nestedLines = this.formatNestedProperties(name, propObj);
            paramStrings.push(...nestedLines);
        }

        return paramStrings.length > 0
            ? `Parameters:\n    ${paramStrings.join('\n    ')}`
            : '';
    }

    /**
     * Determina como exibir o tipo
     */
    private determineTypeDisplay(propObj: any): string {
        // Handle enums first
        if (propObj.enum && Array.isArray(propObj.enum)) {
            const enumValues = propObj.enum
                .map((v: unknown) => `"${v}"`)
                .join(' | ');
            return `(${enumValues})`;
        }

        // Handle arrays
        if (propObj.type === 'array' && propObj.items) {
            return this.formatArrayType(propObj.items);
        }

        // Handle objects
        if (propObj.type === 'object' && propObj.properties) {
            return this.formatObjectType(propObj.properties);
        }

        // Handle unions (anyOf, oneOf)
        if (propObj.anyOf || propObj.oneOf) {
            return this.formatUnionType(propObj);
        }

        // Simple types
        let typeDisplay = propObj.type || 'unknown';

        // Handle specific formats
        if (propObj.format) {
            typeDisplay = `${typeDisplay}:${propObj.format}`;
        }

        return typeDisplay;
    }

    /**
     * Formata tipos de array
     */
    private formatArrayType(items: any): string {
        if (items.type === 'object' && items.properties) {
            const propKeys = Object.keys(items.properties);
            if (propKeys.length > 0) {
                return `array<object{${propKeys.join(',')}}>`;
            }
            return 'array<object>';
        }

        if (items.enum && Array.isArray(items.enum)) {
            const enumValues = items.enum
                .map((v: unknown) => `"${v}"`)
                .join('|');
            return `array<enum[${enumValues}]>`;
        }

        return `array<${items.type || 'unknown'}>`;
    }

    /**
     * Formata tipos de objeto
     */
    private formatObjectType(properties: Record<string, unknown>): string {
        const propKeys = Object.keys(properties);
        if (propKeys.length > 0) {
            return `object{${propKeys.join(',')}}`;
        }
        return 'object';
    }

    /**
     * Formata tipos de união
     */
    private formatUnionType(propObj: any): string {
        const unionTypes = propObj.anyOf || propObj.oneOf || [];
        const types = unionTypes.map((t: any) => this.determineTypeDisplay(t));
        return `(${types.join(' | ')})`;
    }

    /**
     * Adiciona constraints ao tipo
     */
    private addConstraints(typeDisplay: string, propObj: any): string {
        const constraints: string[] = [];

        // String constraints
        if (
            propObj.minLength !== undefined ||
            propObj.maxLength !== undefined
        ) {
            const strConstraints: string[] = [];
            if (propObj.minLength !== undefined)
                strConstraints.push(`min: ${propObj.minLength}`);
            if (propObj.maxLength !== undefined)
                strConstraints.push(`max: ${propObj.maxLength}`);
            constraints.push(`[${strConstraints.join(', ')}]`);
        }

        // Number constraints
        if (propObj.minimum !== undefined || propObj.maximum !== undefined) {
            const numConstraints: string[] = [];
            if (propObj.minimum !== undefined)
                numConstraints.push(`min: ${propObj.minimum}`);
            if (propObj.maximum !== undefined)
                numConstraints.push(`max: ${propObj.maximum}`);
            constraints.push(`[${numConstraints.join(', ')}]`);
        }

        // Default value
        if (propObj.default !== undefined) {
            constraints.push(`default: ${JSON.stringify(propObj.default)}`);
        }

        // Nullable
        if (propObj.nullable) {
            return `${typeDisplay} | null`;
        }

        return constraints.length > 0
            ? `${typeDisplay} ${constraints.join(' ')}`
            : typeDisplay;
    }

    /**
     * Formata propriedades aninhadas
     */
    private formatNestedProperties(
        _parentName: string,
        propObj: any,
    ): string[] {
        const nestedLines: string[] = [];

        // Handle array of objects
        if (
            propObj.type === 'array' &&
            propObj.items?.type === 'object' &&
            propObj.items.properties
        ) {
            const nestedProps = propObj.items.properties as Record<
                string,
                unknown
            >;
            const nestedRequired = (propObj.items.required as string[]) || [];

            for (const [nestedName, nestedProp] of Object.entries(
                nestedProps,
            )) {
                const nestedPropObj = nestedProp as any;
                const isNestedRequired = nestedRequired.includes(nestedName);
                const nestedMarker = isNestedRequired ? 'REQUIRED' : 'OPTIONAL';

                let nestedTypeDisplay = nestedPropObj.type || 'unknown';
                if (nestedPropObj.enum && Array.isArray(nestedPropObj.enum)) {
                    const enumValues = nestedPropObj.enum
                        .map((v: unknown) => `"${v}"`)
                        .join('|');
                    nestedTypeDisplay = `enum[${enumValues}]`;
                }

                const nestedLine = `    - ${nestedName} (${nestedTypeDisplay}, ${nestedMarker})${
                    nestedPropObj.description
                        ? `: ${nestedPropObj.description}`
                        : ''
                }`;
                nestedLines.push(nestedLine);
            }
        }

        // Handle nested object properties
        if (propObj.type === 'object' && propObj.properties) {
            const nestedProps = propObj.properties as Record<string, unknown>;
            const nestedRequired = (propObj.required as string[]) || [];

            for (const [nestedName, nestedProp] of Object.entries(
                nestedProps,
            )) {
                const nestedPropObj = nestedProp as any;
                const isNestedRequired = nestedRequired.includes(nestedName);
                const nestedMarker = isNestedRequired ? 'REQUIRED' : 'OPTIONAL';

                let nestedTypeDisplay =
                    this.determineTypeDisplay(nestedPropObj);
                nestedTypeDisplay = this.addConstraints(
                    nestedTypeDisplay,
                    nestedPropObj,
                );

                const nestedLine = `    - ${nestedName} (${nestedTypeDisplay}, ${nestedMarker})${
                    nestedPropObj.description
                        ? `: ${nestedPropObj.description}`
                        : ''
                }`;
                nestedLines.push(nestedLine);
            }
        }

        return nestedLines;
    }
}

// =============================================================================
// 📋 FORMATADORES DE CONTEXT
// =============================================================================

/**
 * Formatador de context adicional e metadados
 */
export class ContextFormatter {
    //private readonly logger: Logger = createLogger('context-formatter');

    /**
     * Formata context adicional (user context, agent identity, etc.)
     */
    formatAdditionalContext(
        additionalContext: Record<string, unknown>,
    ): string {
        const sections: string[] = ['## 🔍 ADDITIONAL INFO'];

        // Formatar valor de forma segura
        const formatValue = (value: unknown): string => {
            if (value === null) return 'null';
            if (value === undefined) return 'undefined';
            if (typeof value === 'object')
                return JSON.stringify(value, null, 2);
            return String(value);
        };

        // Handle user context
        if (additionalContext.userContext) {
            const userCtx = additionalContext.userContext as Record<
                string,
                unknown
            >;
            sections.push('### 👤 USER CONTEXT');
            this.formatContextFields(userCtx, sections, formatValue);
        }

        // Handle agent identity
        if (additionalContext.agentIdentity) {
            const identity = additionalContext.agentIdentity as Record<
                string,
                unknown
            >;
            sections.push('### 🤖 AGENT IDENTITY');
            this.formatContextFields(identity, sections, formatValue);
        }

        // Handle session context
        if (additionalContext.sessionContext) {
            const session = additionalContext.sessionContext as Record<
                string,
                unknown
            >;
            sections.push('### 📊 SESSION CONTEXT');
            this.formatContextFields(session, sections, formatValue);
        }

        // Handle runtime context
        if (additionalContext.runtimeContext) {
            const runtime = additionalContext.runtimeContext as Record<
                string,
                unknown
            >;
            sections.push('### ⚙️ RUNTIME CONTEXT');
            this.formatContextFields(runtime, sections, formatValue);
        }

        return sections.join('\n');
    }

    /**
     * Formatação genérica de campos de context
     */
    private formatContextFields(
        context: Record<string, unknown>,
        sections: string[],
        formatValue: (value: unknown) => string,
    ): void {
        Object.entries(context).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                sections.push(
                    `**${this.formatFieldName(key)}:** ${formatValue(value)}`,
                );
            }
        });
    }

    /**
     * Formata nome do campo para exibição
     */
    private formatFieldName(key: string): string {
        // Converte camelCase para Title Case
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
    }

    /**
     * Formata agent context para uso em prompts
     */
    formatAgentContext(agentContext: AgentContext): string {
        const contextParts: string[] = [];

        if (agentContext.agentName) {
            contextParts.push(`**Agent:** ${agentContext.agentName}`);
        }

        if (agentContext.sessionId) {
            contextParts.push(`**Session:** ${agentContext.sessionId}`);
        }

        if (agentContext.correlationId) {
            contextParts.push(`**Correlation:** ${agentContext.correlationId}`);
        }

        if (agentContext.tenantId) {
            contextParts.push(`**Tenant:** ${agentContext.tenantId}`);
        }

        // Adicionar dados runtime se disponíveis
        if ((agentContext as any).kernel?.state) {
            contextParts.push(
                `**Kernel State:** ${(agentContext as any).kernel.state}`,
            );
        }

        if ((agentContext as any).memory?.totalItems) {
            contextParts.push(
                `**Memory Items:** ${(agentContext as any).memory.totalItems}`,
            );
        }

        if ((agentContext as any).session?.duration) {
            const duration = (agentContext as any).session.duration;
            const minutes = Math.floor(duration / (60 * 1000));
            contextParts.push(`**Session Duration:** ${minutes}min`);
        }

        return contextParts.join('\n');
    }

    /**
     * Formata contexto de replan para histórico
     */
    formatReplanContext(replanContext: Record<string, unknown>): string {
        const sections: string[] = ['## 🔄 REPLAN CONTEXT'];

        if (replanContext.executedPlan) {
            const executedPlan = replanContext.executedPlan as Record<
                string,
                unknown
            >;
            const plan = executedPlan.plan as Record<string, unknown>;

            sections.push('### 📋 EXECUTED PLAN');
            if (plan.id) {
                sections.push(`**Plan ID:** ${plan.id}`);
            }

            const executionData = executedPlan.executionData as Record<
                string,
                unknown
            >;

            if (executionData) {
                sections.push('### EXECUTION DATA');

                // Tools that worked
                const toolsThatWorked =
                    executionData.toolsThatWorked as unknown[];
                if (toolsThatWorked?.length > 0) {
                    toolsThatWorked.forEach((tool: unknown) => {
                        const toolData = tool as Record<string, unknown>;
                        const toolName =
                            toolData.tool || toolData.stepId || 'Unknown';
                        const description =
                            toolData.description || 'No description';
                        const result = toolData.result || 'No result';

                        sections.push(`  - ✅ ${toolName}: ${description}`);
                        sections.push(
                            `    Result: ${this.truncateResult(result)}`,
                        );
                    });
                }

                // Tools that failed
                const toolsThatFailed =
                    executionData.toolsThatFailed as unknown[];
                if (toolsThatFailed?.length > 0) {
                    sections.push(
                        `**❌ Failed Tools:** ${toolsThatFailed.length}`,
                    );
                    toolsThatFailed.forEach((tool: unknown) => {
                        const toolData = tool as Record<string, unknown>;
                        const toolName =
                            toolData.tool || toolData.stepId || 'Unknown';
                        const error = toolData.error || 'Unknown error';
                        sections.push(`  - ${toolName}: ${error}`);
                    });
                }
            }
        }

        // Plan history
        if (
            replanContext.planHistory &&
            Array.isArray(replanContext.planHistory)
        ) {
            const history = replanContext.planHistory as Array<
                Record<string, unknown>
            >;
            if (history.length > 0) {
                sections.push('### 📚 PLAN HISTORY');
                sections.push(`**Previous Attempts:** ${history.length}`);

                history.forEach((planData, index) => {
                    const plan = planData.plan as Record<string, unknown>;
                    sections.push(
                        `\n**Attempt ${index + 1}:** ${plan.id || 'Unknown Plan'}`,
                    );
                    if (plan.goal)
                        sections.push(
                            `  Goal: "${this.truncateText(plan.goal as string, 100)}"`,
                        );
                });
            }
        }

        sections.push(
            '\n**⚠️ REPLAN MODE:** Use previous results to improve the new plan.',
        );
        return sections.join('\n');
    }

    /**
     * Trunca resultado para exibição
     */
    private truncateResult(result: unknown): string {
        const text =
            typeof result === 'string' ? result : JSON.stringify(result);
        return this.truncateText(text, 200);
    }

    /**
     * Trunca texto com ellipsis
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// =============================================================================
// 📊 FORMATADORES DE SCHEMA
// =============================================================================

/**
 * Formatador avançado de schemas JSON
 */
export class SchemaFormatter {
    // private readonly logger: Logger = createLogger('schema-formatter');

    /**
     * Formata schema de saída para display amigável
     */
    formatOutputSchema(
        outputSchema: Record<string, unknown>,
        toolName?: string,
    ): string {
        if (!outputSchema) return '';

        // Unwrap schema se necessário
        const unwrapped = this.unwrapOutputSchema(outputSchema);

        // Verifica se é vazio
        if (this.isEmptyOutputSchema(unwrapped)) return '';

        // Formata o tipo
        const formatted = this.formatSchemaType(unwrapped, 0, false);
        if (!formatted) return '';

        // Verifica se é apenas tipo genérico
        if (this.isGenericTypeOnly(formatted)) return '';

        const toolSuffix = toolName ? ` (from ${toolName})` : '';
        return `\n  Returns: ${formatted}${toolSuffix}`;
    }

    /**
     * Desembrulha schema (remove wrappers comuns)
     */
    private unwrapOutputSchema(
        schema: Record<string, unknown>,
    ): Record<string, unknown> {
        if (schema.type !== 'object' || !schema.properties) {
            return schema;
        }

        const properties = schema.properties as Record<string, unknown>;
        const propNames = Object.keys(properties);

        // Remove wrapper { data: ... }
        if (
            propNames.includes('data') &&
            (propNames.includes('success') || propNames.includes('count'))
        ) {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) return dataField;
        }

        // Remove wrapper { data: ... } único
        if (propNames.length === 1 && propNames[0] === 'data') {
            const dataField = properties.data as Record<string, unknown>;
            if (dataField) return dataField;
        }

        // Remove wrapper { results: ... }
        if (propNames.includes('results') && propNames.length <= 3) {
            const resultsField = properties.results as Record<string, unknown>;
            if (resultsField) return resultsField;
        }

        return schema;
    }

    /**
     * Verifica se schema é vazio
     */
    private isEmptyOutputSchema(schema: Record<string, unknown>): boolean {
        if (!schema || Object.keys(schema).length === 0) return true;

        if (schema.type === 'object') {
            const properties = schema.properties as Record<string, unknown>;
            if (!properties || Object.keys(properties).length === 0)
                return true;
        }

        return false;
    }

    /**
     * Verifica se é apenas tipo genérico
     */
    private isGenericTypeOnly(formatted: string): boolean {
        const trimmed = formatted.trim();
        const genericTypes = [
            'Object',
            'Array',
            'string',
            'number',
            'boolean',
            'any',
        ];

        return genericTypes.includes(trimmed);
    }

    /**
     * Formata tipo de schema recursivamente
     */
    private formatSchemaType(
        schema: Record<string, unknown>,
        depth: number = 0,
        showRequiredMarkers: boolean = true,
    ): string {
        if (!schema) return 'unknown';

        const indent = '    '.repeat(depth);
        const type = schema.type as string;
        const description = schema.description as string;
        const enumValues = schema.enum as unknown[];

        // Handle enums
        if (enumValues && enumValues.length > 0) {
            const values = enumValues.map((v) => `"${v}"`).join(' | ');
            const enumType = `(${values})`;
            return description ? `${enumType} - ${description}` : enumType;
        }

        switch (type) {
            case 'string': {
                let typeDisplay = 'string';
                if ((schema as any).format) {
                    typeDisplay += ` (${(schema as any).format})`;
                }

                const constraints = this.formatStringConstraints(schema as any);
                if (constraints) typeDisplay += ` ${constraints}`;

                return description
                    ? `${typeDisplay} - ${description}`
                    : typeDisplay;
            }

            case 'number':
            case 'integer': {
                let typeDisplay = type;
                const constraints = this.formatNumberConstraints(schema as any);
                if (constraints) typeDisplay += ` ${constraints}`;

                return description
                    ? `${typeDisplay} - ${description}`
                    : typeDisplay;
            }

            case 'boolean':
                return description ? `boolean - ${description}` : 'boolean';

            case 'array': {
                const items = schema.items as Record<string, unknown>;

                if (!items) {
                    return description ? `array - ${description}` : 'array';
                }

                let itemType: string;
                if (items.type === 'object' && items.properties) {
                    const fullStructure = this.formatSchemaType(
                        items,
                        depth,
                        showRequiredMarkers,
                    );
                    itemType = fullStructure;
                } else {
                    itemType = this.formatSchemaType(
                        items,
                        depth,
                        showRequiredMarkers,
                    );
                }

                const arrayType = `${itemType}[]`;
                const constraints = this.formatArrayConstraints(schema as any);

                return description
                    ? `${arrayType}${constraints} - ${description}`
                    : `${arrayType}${constraints}`;
            }

            case 'object': {
                const properties = schema.properties as Record<string, unknown>;
                const required = (schema.required as string[]) || [];

                if (!properties || Object.keys(properties).length === 0) {
                    const typeName = this.extractTypeName(schema);
                    return description
                        ? `${typeName} - ${description}`
                        : typeName;
                }

                const lines: string[] = [];
                const typeName = this.extractTypeName(schema);
                const objectHeader = description
                    ? `${typeName} - ${description}`
                    : typeName;
                lines.push(`${objectHeader} {`);

                for (const [propName, propSchema] of Object.entries(
                    properties,
                )) {
                    const isRequired = required.includes(propName);
                    const requiredMark = showRequiredMarkers
                        ? isRequired
                            ? ' (required)'
                            : ' (optional)'
                        : '';
                    const propType = this.formatSchemaType(
                        propSchema as Record<string, unknown>,
                        depth + 1,
                        showRequiredMarkers,
                    );

                    lines.push(
                        `${indent}    ${propName}: ${propType}${requiredMark}`,
                    );
                }

                lines.push(`${indent}}`);
                return lines.join('\n');
            }

            default: {
                if (
                    (schema as any).oneOf ||
                    (schema as any).anyOf ||
                    (schema as any).allOf
                ) {
                    return this.formatUnionTypes(
                        schema as any,
                        depth,
                        showRequiredMarkers,
                    );
                }

                if (schema.properties) {
                    return this.formatSchemaType(
                        { ...schema, type: 'object' },
                        depth,
                        showRequiredMarkers,
                    );
                }

                return description ? `unknown - ${description}` : 'unknown';
            }
        }
    }

    /**
     * Formata constraints de string
     */
    private formatStringConstraints(schema: any): string {
        const constraints: string[] = [];
        if (schema.minLength !== undefined)
            constraints.push(`min: ${schema.minLength}`);
        if (schema.maxLength !== undefined)
            constraints.push(`max: ${schema.maxLength}`);
        return constraints.length > 0 ? `[${constraints.join(', ')}]` : '';
    }

    /**
     * Formata constraints de number
     */
    private formatNumberConstraints(schema: any): string {
        const constraints: string[] = [];
        if (schema.minimum !== undefined)
            constraints.push(`min: ${schema.minimum}`);
        if (schema.maximum !== undefined)
            constraints.push(`max: ${schema.maximum}`);
        return constraints.length > 0 ? `[${constraints.join(', ')}]` : '';
    }

    /**
     * Formata constraints de array
     */
    private formatArrayConstraints(schema: any): string {
        const constraints: string[] = [];
        if (schema.minItems !== undefined)
            constraints.push(`min: ${schema.minItems}`);
        if (schema.maxItems !== undefined)
            constraints.push(`max: ${schema.maxItems}`);
        return constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';
    }

    /**
     * Formata tipos de união
     */
    private formatUnionTypes(
        schema: any,
        depth: number,
        showRequiredMarkers: boolean,
    ): string {
        const oneOf = schema.oneOf as Record<string, unknown>[];
        const anyOf = schema.anyOf as Record<string, unknown>[];
        const allOf = schema.allOf as Record<string, unknown>[];

        if (oneOf && oneOf.length > 0) {
            const types = oneOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' | ')})`;
        }

        if (anyOf && anyOf.length > 0) {
            const types = anyOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' | ')})`;
        }

        if (allOf && allOf.length > 0) {
            const types = allOf.map((s) =>
                this.formatSchemaType(s, depth, showRequiredMarkers),
            );
            return `(${types.join(' & ')})`;
        }

        return 'union';
    }

    /**
     * Extrai nome do tipo
     */
    private extractTypeName(schema: Record<string, unknown>): string {
        if (
            (schema as any).title &&
            typeof (schema as any).title === 'string'
        ) {
            return (schema as any).title;
        }

        if ((schema as any).$ref && typeof (schema as any).$ref === 'string') {
            const refMatch = (schema as any).$ref.match(/\/([^\/]+)$/);
            if (refMatch && refMatch[1]) return refMatch[1];
        }

        if ((schema as any).$id && typeof (schema as any).$id === 'string') {
            const idMatch = (schema as any).$id.match(/([^\/]+)\.json?$/);
            if (idMatch && idMatch[1]) return this.capitalize(idMatch[1]);
        }

        if (
            (schema as any).definitions &&
            typeof (schema as any).definitions === 'object'
        ) {
            const definitions = (schema as any).definitions as Record<
                string,
                unknown
            >;
            const defKeys = Object.keys(definitions);
            if (defKeys.length === 1 && defKeys[0]) return defKeys[0];
        }

        if (this.isZodSchema(schema)) {
            return this.extractFromZodSchema(schema);
        }

        if (
            (schema as any).components &&
            typeof (schema as any).components === 'object' &&
            (schema as any).components.schemas &&
            typeof (schema as any).components.schemas === 'object'
        ) {
            const schemas = (schema as any).components.schemas as Record<
                string,
                unknown
            >;
            const schemaKeys = Object.keys(schemas);
            if (schemaKeys.length === 1 && schemaKeys[0]) return schemaKeys[0];
        }

        const type = schema.type as string;
        switch (type) {
            case 'object':
                return 'Object';
            case 'array':
                return 'Array';
            case 'string':
                return 'String';
            case 'number':
            case 'integer':
                return 'Number';
            case 'boolean':
                return 'Boolean';
            default:
                return 'Object';
        }
    }

    /**
     * Verifica se é schema Zod
     */
    private isZodSchema(schema: Record<string, unknown>): boolean {
        return !!(
            (schema as any)._def ||
            (schema as any).parse ||
            (schema as any).safeParse ||
            ((schema as any).constructor &&
                (schema as any).constructor.name.includes('Zod'))
        );
    }

    /**
     * Extrai tipo de schema Zod
     */
    private extractFromZodSchema(schema: Record<string, unknown>): string {
        const def = (schema as any)._def as { typeName?: string };
        if (def?.typeName) {
            return def.typeName.replace(/^Zod/, '');
        }
        return 'Object';
    }

    /**
     * Capitaliza primeira letra
     */
    private capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// =============================================================================
// 📏 UTILITÁRIOS DE ESTIMATIVA
// =============================================================================

/**
 * Utilitários para estimativa de tokens e recursos
 */
export class EstimationUtils {
    /**
     * Estima contagem de tokens (aproximação simples)
     */
    static estimateTokenCount(text: string, tools?: Tool[]): number {
        // Estimativa básica: ~4 caracteres por token
        let tokenCount = Math.ceil(text.length / 4);

        // Adiciona overhead por tool
        if (tools) {
            tools.forEach((tool) => {
                // Nome da tool
                tokenCount += Math.ceil(tool.name.length / 4);
                // Descrição
                tokenCount += Math.ceil((tool.description || '').length / 4);
                // Parâmetros (estimativa)
                if (tool.parameters?.properties) {
                    const paramCount = Object.keys(
                        tool.parameters.properties,
                    ).length;
                    tokenCount += paramCount * 10; // ~10 tokens por parâmetro
                }
            });
        }

        return tokenCount;
    }

    /**
     * Estima complexidade da tarefa
     */
    static estimateComplexity(input: string, tools: Tool[]): number {
        let complexity = 0;

        // Base complexity
        complexity += tools.length;

        // Input complexity
        if (input.length > 100) complexity += 1;
        if (input.length > 500) complexity += 2;

        // Keyword complexity
        const complexKeywords =
            /analyze|create|generate|build|integrate|workflow|plan/i;
        if (complexKeywords.test(input)) complexity += 2;

        // Multiple actions
        const actionKeywords = /and|then|after|before|while|until/i;
        if (actionKeywords.test(input)) complexity += 1;

        return complexity;
    }

    /**
     * Estima recursos necessários
     */
    static estimateResources(complexity: number) {
        return {
            estimatedMemory: Math.max(complexity * 10, 50), // MB
            estimatedTime: Math.max(complexity * 5, 10), // seconds
            priority: complexity > 5 ? 'high' : ('normal' as const),
        };
    }
}

// =============================================================================
// 🎯 FACADE PRINCIPAL
// =============================================================================

/**
 * Facade principal para todos os formatadores
 */
export class StrategyFormatters {
    private readonly toolFormatter = new ToolParameterFormatter();
    private readonly contextFormatter = new ContextFormatter();
    private readonly schemaFormatter = new SchemaFormatter();

    /**
     * Formata parâmetros de ferramenta
     */
    formatToolParameters(tool: Tool): string {
        return this.toolFormatter.formatToolParameters(tool);
    }

    /**
     * Formata lista completa de ferramentas
     */
    formatToolsList(tools: Tool[]): string {
        const sections: string[] = ['## 🛠️ AVAILABLE TOOLS'];

        tools.forEach((tool, index) => {
            sections.push(
                `### ${index + 1}. ${tool.name}\n${tool.description || tool.name}`,
            );

            const params = this.formatToolParameters(tool);
            if (params) {
                sections.push(params);
            }

            // Formatar output schema se disponível
            if (tool.outputSchema) {
                const schemaFormat = this.schemaFormatter.formatOutputSchema(
                    tool.outputSchema,
                    tool.name,
                );
                if (schemaFormat) {
                    sections.push(schemaFormat);
                }
            }

            sections.push(''); // Espaçamento
        });

        return sections.join('\n');
    }

    /**
     * Formata context adicional
     */
    formatAdditionalContext(
        additionalContext: Record<string, unknown>,
    ): string {
        return this.contextFormatter.formatAdditionalContext(additionalContext);
    }

    /**
     * Formata agent context
     */
    formatAgentContext(agentContext: AgentContext): string {
        return this.contextFormatter.formatAgentContext(agentContext);
    }

    /**
     * Formata replan context
     */
    formatReplanContext(replanContext: Record<string, unknown>): string {
        return this.contextFormatter.formatReplanContext(replanContext);
    }

    /**
     * Formata schema de saída
     */
    formatOutputSchema(
        outputSchema: Record<string, unknown>,
        toolName?: string,
    ): string {
        return this.schemaFormatter.formatOutputSchema(outputSchema, toolName);
    }

    /**
     * Estimativas úteis
     */
    estimateComplexity(input: string, tools: Tool[]): number {
        return EstimationUtils.estimateComplexity(input, tools);
    }

    estimateTokenCount(text: string, tools?: Tool[]): number {
        return EstimationUtils.estimateTokenCount(text, tools);
    }

    estimateResources(complexity: number) {
        return EstimationUtils.estimateResources(complexity);
    }
}

// =============================================================================
// 🎯 EXPORTS PRINCIPAIS
// =============================================================================

// Export default para conveniência
export default StrategyFormatters;
