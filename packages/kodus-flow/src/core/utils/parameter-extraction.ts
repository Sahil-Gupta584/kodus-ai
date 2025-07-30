// /**
//  * @module core/utils/parameter-extraction
//  * @description Sistema inteligente de extração automática de parâmetros
//  *
//  * OBJETIVO:
//  * Resolver o problema core: "Planner não tem contexto para preencher parâmetros obrigatórios das tools"
//  *
//  * FUNCIONALIDADES:
//  * - Date Parser: "último mês" → dateRange estruturado
//  * - Category Mapper: "tecnologia" → "tech"
//  * - Context Extractor: Usa histórico da conversa
//  * - Smart Defaults: Valores padrão inteligentes
//  *
//  * EXEMPLO:
//  * Input: "busque notícias de IA do último mês"
//  * Output: {
//  *   query: "IA",
//  *   filters: { category: "tech", dateRange: { start: "2024-12-16", end: "2025-01-16" } },
//  *   limit: 10
//  * }
//  */

// import { createLogger } from '../../observability/index.js';
// import type { ToolMetadataForLLM } from '../types/tool-types.js';

// const logger = createLogger('parameter-extraction');

// // ==================== TYPES ====================

// export interface ExtractedParameter {
//     name: string;
//     value: unknown;
//     confidence: number; // 0.0-1.0
//     source: 'explicit' | 'inferred' | 'context' | 'default';
//     reasoning?: string;
// }

// export interface ParameterExtractionResult {
//     parameters: Record<string, unknown>;
//     extractedParams: ExtractedParameter[];
//     confidence: number; // Overall confidence
//     warnings: string[];
//     metadata: {
//         inputAnalysis: string;
//         patternsDetected: string[];
//         contextUsed: boolean;
//         defaultsApplied: string[];
//     };
// }

// export interface ExtractionContext {
//     conversationHistory?: Array<{
//         input: string;
//         action: unknown;
//         result: unknown;
//     }>;
//     userPreferences?: Record<string, unknown>;
//     previousParameters?: Record<string, unknown>;
//     sessionMetadata?: Record<string, unknown>;
// }

// export interface DateRange {
//     start: string; // ISO date
//     end: string; // ISO date
// }

// // ==================== CORE EXTRACTOR ====================

// export class ParameterExtractor {
//     private logger = createLogger('parameter-extractor');

//     // Pattern caches for performance
//     private datePatterns: Map<string, DateRange> = new Map();
//     private categoryMappings: Map<string, string> = new Map();

//     constructor() {
//         this.initializePatterns();
//     }

//     /**
//      * Extrai parâmetros automaticamente do input do usuário
//      */
//     async extractParameters(
//         input: string,
//         toolMetadata: ToolMetadataForLLM,
//         context?: ExtractionContext,
//     ): Promise<ParameterExtractionResult> {
//         const startTime = Date.now();

//         this.logger.info('Starting parameter extraction', {
//             input: input.substring(0, 100),
//             toolName: toolMetadata.name,
//             hasContext: !!context,
//             requiredParams: toolMetadata.parameters?.required?.length || 0,
//         });

//         try {
//             // 1. Análise inicial do input
//             const inputAnalysis = this.analyzeInput(input);

//             // 2. Extrair parâmetros explícitos
//             const explicitParams = this.extractExplicitParameters(
//                 input,
//                 toolMetadata,
//             );

//             // 3. Inferir parâmetros baseado em patterns
//             const inferredParams = this.inferParameters(
//                 input,
//                 toolMetadata,
//                 inputAnalysis,
//             );

//             // 4. Usar contexto da conversa
//             const contextParams = context
//                 ? this.extractFromContext(toolMetadata, context)
//                 : [];

//             // 5. Aplicar defaults inteligentes
//             const defaultParams = this.applySmartDefaults(toolMetadata, [
//                 ...explicitParams,
//                 ...inferredParams,
//                 ...contextParams,
//             ]);

//             // 6. Combinar todos os parâmetros
//             const allParams = [
//                 ...explicitParams,
//                 ...inferredParams,
//                 ...contextParams,
//                 ...defaultParams,
//             ];
//             const result = this.buildResult(
//                 allParams,
//                 inputAnalysis,
//                 toolMetadata,
//             );

//             const extractionTime = Date.now() - startTime;

//             this.logger.info('Parameter extraction completed', {
//                 toolName: toolMetadata.name,
//                 parametersExtracted: Object.keys(result.parameters).length,
//                 confidence: result.confidence,
//                 extractionTime,
//                 warnings: result.warnings.length,
//             });

//             return result;
//         } catch (error) {
//             this.logger.error('Parameter extraction failed', error as Error, {
//                 input: input.substring(0, 100),
//                 toolName: toolMetadata.name,
//             });

//             // Fallback: retornar estrutura básica
//             return this.createFallbackResult(input, toolMetadata);
//         }
//     }

//     // ==================== INPUT ANALYSIS ====================

//     private analyzeInput(input: string): {
//         keywords: string[];
//         entities: string[];
//         intent: string;
//         temporal: string[];
//         categories: string[];
//         quantities: Array<{ value: number; unit?: string }>;
//     } {
//         const normalized = input.toLowerCase();

//         return {
//             keywords: this.extractKeywords(normalized),
//             entities: this.extractEntities(input),
//             intent: this.detectIntent(normalized),
//             temporal: this.extractTemporalExpressions(normalized),
//             categories: this.extractCategories(normalized),
//             quantities: this.extractQuantities(input),
//         };
//     }

//     private extractKeywords(input: string): string[] {
//         // Remove stop words and extract meaningful keywords
//         const stopWords = new Set([
//             'de',
//             'da',
//             'do',
//             'em',
//             'na',
//             'no',
//             'para',
//             'com',
//             'por',
//             'sobre',
//             'a',
//             'o',
//             'e',
//             'que',
//             'se',
//         ]);
//         return input
//             .split(/\s+/)
//             .filter((word) => word.length > 2 && !stopWords.has(word))
//             .slice(0, 10); // Top 10 keywords
//     }

//     private extractEntities(input: string): string[] {
//         // Simple entity extraction - could be enhanced with NLP
//         const entityPatterns = [
//             /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, // Proper nouns
//             /\b\w+\.(com|org|net|ai|io)\b/g, // Domain names
//             /\b[A-Z]{2,}\b/g, // Acronyms
//         ];

//         const entities: string[] = [];
//         for (const pattern of entityPatterns) {
//             const matches = input.match(pattern);
//             if (matches) entities.push(...matches);
//         }

//         return [...new Set(entities)]; // Remove duplicates
//     }

//     private detectIntent(input: string): string {
//         const intentPatterns = [
//             { pattern: /busca|procura|encontra|pesquisa/i, intent: 'search' },
//             { pattern: /cria|gera|faz|produz/i, intent: 'create' },
//             { pattern: /atualiza|modifica|altera|muda/i, intent: 'update' },
//             { pattern: /deleta|remove|exclui/i, intent: 'delete' },
//             { pattern: /lista|mostra|exibe|visualiza/i, intent: 'read' },
//             { pattern: /analisa|avalia|examina/i, intent: 'analyze' },
//         ];

//         for (const { pattern, intent } of intentPatterns) {
//             if (pattern.test(input)) return intent;
//         }

//         return 'unknown';
//     }

//     private extractTemporalExpressions(input: string): string[] {
//         const temporalPatterns = [
//             /último\s+(mês|semana|ano|dia)/g,
//             /próximo\s+(mês|semana|ano|dia)/g,
//             /há\s+(\d+)\s+(dias?|semanas?|meses?|anos?)/g,
//             /em\s+(\d{4})/g,
//             /(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/g,
//             /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
//             /(hoje|ontem|amanhã)/g,
//         ];

//         const expressions: string[] = [];
//         for (const pattern of temporalPatterns) {
//             const matches = input.match(pattern);
//             if (matches) expressions.push(...matches);
//         }

//         return expressions;
//     }

//     private extractCategories(input: string): string[] {
//         const categoryMappings = [
//             {
//                 keywords: [
//                     'ia',
//                     'inteligência artificial',
//                     'ai',
//                     'machine learning',
//                     'ml',
//                 ],
//                 category: 'tech',
//             },
//             {
//                 keywords: ['notícia', 'news', 'jornal', 'mídia'],
//                 category: 'news',
//             },
//             {
//                 keywords: ['financeiro', 'dinheiro', 'investimento', 'ação'],
//                 category: 'finance',
//             },
//             {
//                 keywords: ['saúde', 'medicina', 'hospital', 'médico'],
//                 category: 'health',
//             },
//             {
//                 keywords: ['esporte', 'futebol', 'basquete', 'olimpíadas'],
//                 category: 'sports',
//             },
//         ];

//         const categories: string[] = [];
//         for (const mapping of categoryMappings) {
//             if (mapping.keywords.some((keyword) => input.includes(keyword))) {
//                 categories.push(mapping.category);
//             }
//         }

//         return categories;
//     }

//     private extractQuantities(
//         input: string,
//     ): Array<{ value: number; unit?: string }> {
//         const quantityPatterns = [
//             /(\d+)\s*(item|items|resultado|resultados|página|páginas)/g,
//             /(\d+)\s*(gb|mb|kb|bytes?)/g,
//             /(\d+)\s*(segundo|segundos|minuto|minutos|hora|horas)/g,
//             /(\d+)(?!\d)/g, // Plain numbers
//         ];

//         const quantities: Array<{ value: number; unit?: string }> = [];

//         for (const pattern of quantityPatterns) {
//             let match;
//             while ((match = pattern.exec(input)) !== null) {
//                 quantities.push({
//                     value: parseInt(match[1]),
//                     unit: match[2] || undefined,
//                 });
//             }
//         }

//         return quantities;
//     }

//     // ==================== PARAMETER EXTRACTION ====================

//     private extractExplicitParameters(
//         input: string,
//         toolMetadata: ToolMetadataForLLM,
//     ): ExtractedParameter[] {
//         const params: ExtractedParameter[] = [];
//         const properties = toolMetadata.parameters?.properties || {};

//         // Look for explicit parameter patterns: "param: value" or "param=value"
//         const explicitPatterns = [
//             /(\w+):\s*([^,\n]+)/g,
//             /(\w+)=([^,\s]+)/g,
//             /"([^"]+)"/g, // Quoted strings
//         ];

//         for (const [paramName, paramDef] of Object.entries(properties)) {
//             const paramDefObj = paramDef as Record<string, unknown>;

//             // Try to find explicit mentions of this parameter
//             const paramPattern = new RegExp(
//                 `\\b${paramName}\\s*[:=]\\s*([^,\\n]+)`,
//                 'i',
//             );
//             const match = input.match(paramPattern);

//             if (match) {
//                 params.push({
//                     name: paramName,
//                     value: this.parseParameterValue(
//                         match[1],
//                         paramDefObj.type as string,
//                     ),
//                     confidence: 0.9,
//                     source: 'explicit',
//                     reasoning: `Found explicit parameter: ${paramName}=${match[1]}`,
//                 });
//             }
//         }

//         return params;
//     }

//     private inferParameters(
//         input: string,
//         toolMetadata: ToolMetadataForLLM,
//         analysis: ReturnType<typeof ParameterExtractor.prototype.analyzeInput>,
//     ): ExtractedParameter[] {
//         const params: ExtractedParameter[] = [];
//         const properties = toolMetadata.parameters?.properties || {};

//         for (const [paramName, paramDef] of Object.entries(properties)) {
//             const paramDefObj = paramDef as Record<string, unknown>;
//             const paramType = paramDefObj.type as string;
//             const paramDesc = (paramDefObj.description as string) || '';

//             // Infer based on parameter name and description
//             const inferred = this.inferParameterValue(
//                 paramName,
//                 paramType,
//                 paramDesc,
//                 input,
//                 analysis,
//             );

//             if (inferred) {
//                 params.push(inferred);
//             }
//         }

//         return params;
//     }

//     private inferParameterValue(
//         paramName: string,
//         paramType: string,
//         paramDesc: string,
//         input: string,
//         analysis: ReturnType<typeof ParameterExtractor.prototype.analyzeInput>,
//     ): ExtractedParameter | null {
//         const lowerParamName = paramName.toLowerCase();
//         const lowerInput = input.toLowerCase();

//         // Query/Search parameters
//         if (
//             lowerParamName.includes('query') ||
//             lowerParamName.includes('search') ||
//             lowerParamName.includes('term')
//         ) {
//             const keywords = analysis.keywords.slice(0, 3).join(' ');
//             if (keywords) {
//                 return {
//                     name: paramName,
//                     value: keywords,
//                     confidence: 0.8,
//                     source: 'inferred',
//                     reasoning: `Inferred query from keywords: ${keywords}`,
//                 };
//             }
//         }

//         // Date/Time parameters
//         if (
//             lowerParamName.includes('date') ||
//             lowerParamName.includes('time') ||
//             lowerParamName.includes('when')
//         ) {
//             const dateRange = this.parseDateExpressions(analysis.temporal);
//             if (dateRange) {
//                 return {
//                     name: paramName,
//                     value: dateRange,
//                     confidence: 0.7,
//                     source: 'inferred',
//                     reasoning: `Parsed date from temporal expressions: ${analysis.temporal.join(', ')}`,
//                 };
//             }
//         }

//         // Category parameters
//         if (
//             lowerParamName.includes('category') ||
//             lowerParamName.includes('type') ||
//             lowerParamName.includes('filter')
//         ) {
//             if (analysis.categories.length > 0) {
//                 return {
//                     name: paramName,
//                     value: analysis.categories[0],
//                     confidence: 0.6,
//                     source: 'inferred',
//                     reasoning: `Inferred category: ${analysis.categories[0]}`,
//                 };
//             }
//         }

//         // Limit/Count parameters
//         if (
//             lowerParamName.includes('limit') ||
//             lowerParamName.includes('count') ||
//             lowerParamName.includes('max')
//         ) {
//             const quantity = analysis.quantities.find(
//                 (q) =>
//                     !q.unit ||
//                     q.unit.includes('resultado') ||
//                     q.unit.includes('item'),
//             );
//             if (quantity) {
//                 return {
//                     name: paramName,
//                     value: quantity.value,
//                     confidence: 0.8,
//                     source: 'inferred',
//                     reasoning: `Found explicit quantity: ${quantity.value}`,
//                 };
//             }
//         }

//         return null;
//     }

//     private extractFromContext(
//         toolMetadata: ToolMetadataForLLM,
//         context: ExtractionContext,
//     ): ExtractedParameter[] {
//         const params: ExtractedParameter[] = [];

//         // Use previous parameters if similar tool was used
//         if (context.previousParameters) {
//             const properties = toolMetadata.parameters?.properties || {};

//             for (const [paramName, paramDef] of Object.entries(properties)) {
//                 if (paramName in context.previousParameters) {
//                     params.push({
//                         name: paramName,
//                         value: context.previousParameters[paramName],
//                         confidence: 0.5,
//                         source: 'context',
//                         reasoning: 'Reused from previous similar action',
//                     });
//                 }
//             }
//         }

//         // Extract from conversation history
//         if (
//             context.conversationHistory &&
//             context.conversationHistory.length > 0
//         ) {
//             const recentInputs = context.conversationHistory
//                 .slice(-3) // Last 3 interactions
//                 .map((h) => h.input)
//                 .join(' ');

//             // Re-analyze recent context for additional parameters
//             const contextAnalysis = this.analyzeInput(recentInputs);

//             // Add context-based entities and keywords
//             if (contextAnalysis.entities.length > 0) {
//                 const properties = toolMetadata.parameters?.properties || {};
//                 for (const [paramName] of Object.entries(properties)) {
//                     if (
//                         paramName.toLowerCase().includes('name') ||
//                         paramName.toLowerCase().includes('id')
//                     ) {
//                         params.push({
//                             name: paramName,
//                             value: contextAnalysis.entities[0],
//                             confidence: 0.4,
//                             source: 'context',
//                             reasoning: `Found entity in conversation history: ${contextAnalysis.entities[0]}`,
//                         });
//                         break;
//                     }
//                 }
//             }
//         }

//         return params;
//     }

//     private applySmartDefaults(
//         toolMetadata: ToolMetadataForLLM,
//         existingParams: ExtractedParameter[],
//     ): ExtractedParameter[] {
//         const params: ExtractedParameter[] = [];
//         const properties = toolMetadata.parameters?.properties || {};
//         const required = (toolMetadata.parameters?.required as string[]) || [];
//         const existingParamNames = new Set(existingParams.map((p) => p.name));

//         for (const [paramName, paramDef] of Object.entries(properties)) {
//             // Skip if already extracted
//             if (existingParamNames.has(paramName)) continue;

//             const paramDefObj = paramDef as Record<string, unknown>;
//             const paramType = paramDefObj.type as string;
//             const isRequired = required.includes(paramName);

//             // Apply smart defaults for required parameters
//             if (isRequired) {
//                 const defaultValue = this.getSmartDefault(
//                     paramName,
//                     paramType,
//                     paramDefObj,
//                 );
//                 if (defaultValue !== null) {
//                     params.push({
//                         name: paramName,
//                         value: defaultValue,
//                         confidence: 0.3,
//                         source: 'default',
//                         reasoning: `Applied smart default for required parameter`,
//                     });
//                 }
//             }
//         }

//         return params;
//     }

//     private getSmartDefault(
//         paramName: string,
//         paramType: string,
//         paramDef: Record<string, unknown>,
//     ): unknown {
//         // Use explicit default if available
//         if (paramDef.default !== undefined) {
//             return paramDef.default;
//         }

//         const lowerParamName = paramName.toLowerCase();

//         // Smart defaults based on parameter name patterns
//         if (
//             lowerParamName.includes('limit') ||
//             lowerParamName.includes('count')
//         ) {
//             return 10; // Reasonable default limit
//         }

//         if (lowerParamName.includes('format')) {
//             return 'json';
//         }

//         if (
//             lowerParamName.includes('sort') ||
//             lowerParamName.includes('order')
//         ) {
//             return 'desc';
//         }

//         if (
//             lowerParamName.includes('include') ||
//             lowerParamName.includes('with')
//         ) {
//             return true;
//         }

//         if (lowerParamName.includes('timeout')) {
//             return 30000; // 30 seconds
//         }

//         // Type-based defaults
//         switch (paramType) {
//             case 'boolean':
//                 return true;
//             case 'number':
//                 return 0;
//             case 'string':
//                 return lowerParamName.includes('query') ? 'all' : '';
//             case 'array':
//                 return [];
//             case 'object':
//                 return {};
//             default:
//                 return null;
//         }
//     }

//     // ==================== HELPER METHODS ====================

//     private parseParameterValue(value: string, type: string): unknown {
//         const trimmed = value.trim();

//         switch (type) {
//             case 'number':
//                 const num = parseFloat(trimmed);
//                 return isNaN(num) ? 0 : num;
//             case 'boolean':
//                 return ['true', 'yes', '1', 'sim'].includes(
//                     trimmed.toLowerCase(),
//                 );
//             case 'array':
//                 try {
//                     return JSON.parse(trimmed);
//                 } catch {
//                     return trimmed.split(',').map((s) => s.trim());
//                 }
//             case 'object':
//                 try {
//                     return JSON.parse(trimmed);
//                 } catch {
//                     return { value: trimmed };
//                 }
//             default:
//                 return trimmed;
//         }
//     }

//     private parseDateExpressions(temporal: string[]): DateRange | null {
//         if (temporal.length === 0) return null;

//         const now = new Date();
//         const expression = temporal[0].toLowerCase();

//         // Check cache first
//         if (this.datePatterns.has(expression)) {
//             return this.datePatterns.get(expression)!;
//         }

//         let start: Date;
//         const end: Date = now;

//         if (expression.includes('último mês')) {
//             start = new Date(
//                 now.getFullYear(),
//                 now.getMonth() - 1,
//                 now.getDate(),
//             );
//         } else if (expression.includes('última semana')) {
//             start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
//         } else if (expression.includes('último ano')) {
//             start = new Date(
//                 now.getFullYear() - 1,
//                 now.getMonth(),
//                 now.getDate(),
//             );
//         } else if (expression.includes('hoje')) {
//             start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//         } else {
//             return null;
//         }

//         const dateRange: DateRange = {
//             start: start.toISOString().split('T')[0],
//             end: end.toISOString().split('T')[0],
//         };

//         // Cache for performance
//         this.datePatterns.set(expression, dateRange);

//         return dateRange;
//     }

//     private buildResult(
//         allParams: ExtractedParameter[],
//         inputAnalysis: ReturnType<
//             typeof ParameterExtractor.prototype.analyzeInput
//         >,
//         toolMetadata: ToolMetadataForLLM,
//     ): ParameterExtractionResult {
//         // Build final parameters object
//         const parameters: Record<string, unknown> = {};
//         const paramsByName = new Map<string, ExtractedParameter>();

//         // Use highest confidence value for each parameter
//         for (const param of allParams) {
//             const existing = paramsByName.get(param.name);
//             if (!existing || param.confidence > existing.confidence) {
//                 paramsByName.set(param.name, param);
//                 parameters[param.name] = param.value;
//             }
//         }

//         // Calculate overall confidence
//         const confidenceScores = Array.from(paramsByName.values()).map(
//             (p) => p.confidence,
//         );
//         const overallConfidence =
//             confidenceScores.length > 0
//                 ? confidenceScores.reduce((a, b) => a + b, 0) /
//                   confidenceScores.length
//                 : 0;

//         // Generate warnings
//         const warnings: string[] = [];
//         const required = (toolMetadata.parameters?.required as string[]) || [];
//         const missing = required.filter((param) => !(param in parameters));

//         if (missing.length > 0) {
//             warnings.push(`Missing required parameters: ${missing.join(', ')}`);
//         }

//         return {
//             parameters,
//             extractedParams: Array.from(paramsByName.values()),
//             confidence: overallConfidence,
//             warnings,
//             metadata: {
//                 inputAnalysis: `Intent: ${inputAnalysis.intent}, Keywords: ${inputAnalysis.keywords.slice(0, 3).join(', ')}`,
//                 patternsDetected: [
//                     ...inputAnalysis.temporal.map((t) => `temporal:${t}`),
//                     ...inputAnalysis.categories.map((c) => `category:${c}`),
//                     ...inputAnalysis.quantities.map(
//                         (q) => `quantity:${q.value}${q.unit || ''}`,
//                     ),
//                 ],
//                 contextUsed: allParams.some((p) => p.source === 'context'),
//                 defaultsApplied: allParams
//                     .filter((p) => p.source === 'default')
//                     .map((p) => p.name),
//             },
//         };
//     }

//     private createFallbackResult(
//         input: string,
//         toolMetadata: ToolMetadataForLLM,
//     ): ParameterExtractionResult {
//         return {
//             parameters: {},
//             extractedParams: [],
//             confidence: 0.1,
//             warnings: ['Parameter extraction failed - using fallback'],
//             metadata: {
//                 inputAnalysis: `Fallback for input: ${input.substring(0, 50)}...`,
//                 patternsDetected: [],
//                 contextUsed: false,
//                 defaultsApplied: [],
//             },
//         };
//     }

//     private initializePatterns(): void {
//         // Pre-populate common date patterns for performance
//         this.datePatterns.set('último mês', {
//             start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
//                 .toISOString()
//                 .split('T')[0],
//             end: new Date().toISOString().split('T')[0],
//         });

//         // Pre-populate category mappings
//         this.categoryMappings.set('ia', 'tech');
//         this.categoryMappings.set('inteligência artificial', 'tech');
//         this.categoryMappings.set('tecnologia', 'tech');
//         this.categoryMappings.set('notícias', 'news');
//     }
// }

// // ==================== FACTORY ====================

// /**
//  * Factory function para criar extrator de parâmetros
//  */
// export function createParameterExtractor(): ParameterExtractor {
//     return new ParameterExtractor();
// }

// /**
//  * Função de conveniência para extração rápida
//  */
// export async function extractParametersFromInput(
//     input: string,
//     toolMetadata: ToolMetadataForLLM,
//     context?: ExtractionContext,
// ): Promise<ParameterExtractionResult> {
//     const extractor = createParameterExtractor();
//     return extractor.extractParameters(input, toolMetadata, context);
// }
