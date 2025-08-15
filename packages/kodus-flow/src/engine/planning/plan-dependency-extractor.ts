/**
 * @module engine/planning/plan-dependency-extractor
 * @description Extração de dependências de Plans para ToolEngine
 *
 * OBJETIVO:
 * Converter Plan.steps[].dependencies em ToolDependency[] para execução
 * automática respeitando a ordem planejada pelo Planner.
 */

import { createLogger } from '../../observability/index.js';
import type { Plan, PlanStep } from './planner.js';
import type { ToolDependency, ToolCall } from '../../core/types/tool-types.js';

const logger = createLogger('plan-dependency-extractor');

/**
 * Resultado da extração de dependências
 */
export interface PlanDependencyExtractionResult {
    toolCalls: ToolCall[];
    dependencies: ToolDependency[];
    warnings: string[];
    stepMap: Map<string, PlanStep>;
}

/**
 * Configuração para extração de dependências
 */
export interface PlanDependencyExtractionConfig {
    /** Se deve incluir steps não-críticos */
    includeNonCritical?: boolean;
    /** Ação padrão para falhas de dependência */
    defaultFailureAction?: 'stop' | 'continue' | 'retry' | 'fallback';
    /** Timeout padrão para cada step */
    defaultTimeout?: number;
    /** Se deve validar dependências circulares */
    validateCircular?: boolean;
}

/**
 * Extrai dependências de um Plan para execução no ToolEngine
 */
export function extractDependenciesFromPlan(
    plan: Plan,
    config: PlanDependencyExtractionConfig = {},
): PlanDependencyExtractionResult {
    const startTime = Date.now();

    logger.info('Extracting dependencies from plan', {
        planId: plan.id,
        stepCount: plan.steps.length,
        strategy: plan.strategy,
    });

    const {
        includeNonCritical = true,
        defaultFailureAction = 'stop',
        validateCircular = true,
    } = config;

    const toolCalls: ToolCall[] = [];
    const dependencies: ToolDependency[] = [];
    const warnings: string[] = [];
    const stepMap = new Map<string, PlanStep>();

    // Build step map para lookup rápido
    for (const step of plan.steps) {
        stepMap.set(step.id, step);
    }

    // Filtrar steps relevantes (que têm tools)
    const relevantSteps = plan.steps.filter((step) => {
        // Incluir se tem tool definida
        if (step.tool) return true;

        // Incluir se tem action/description que parece ser tool call
        if (step.description && isToolLikeDescription(step.description)) {
            warnings.push(
                `Step ${step.id} parece ser tool call mas não tem 'tool' definida`,
            );
            return true;
        }

        // Excluir se não é crítico e config não inclui não-críticos
        if (!includeNonCritical && step.critical === false) {
            return false;
        }

        return true;
    });

    logger.debug('Filtered relevant steps', {
        totalSteps: plan.steps.length,
        relevantSteps: relevantSteps.length,
        includeNonCritical,
    });

    // Converter steps para ToolCalls
    for (const step of relevantSteps) {
        const toolCall: ToolCall = {
            id: step.id,
            toolName:
                step.tool || extractToolNameFromDescription(step.description),
            arguments: extractArgumentsFromStep(step),
            timestamp: Date.now(),
            correlationId: plan.id,
            metadata: {
                planId: plan.id,
                stepId: step.id,
                critical: step.critical,
                complexity: step.complexity,
                estimatedDuration: step.estimatedDuration,
                canRunInParallel: step.canRunInParallel,
            },
        };

        toolCalls.push(toolCall);
    }

    // Extrair dependências dos steps
    for (const step of relevantSteps) {
        if (step.dependencies && step.dependencies.length > 0) {
            for (const depStepId of step.dependencies) {
                const dependentStep = stepMap.get(depStepId);

                if (!dependentStep) {
                    warnings.push(
                        `Step ${step.id} depende de step inexistente: ${depStepId}`,
                    );
                    continue;
                }

                // Só criar dependência se o step dependente também é relevante
                if (!relevantSteps.some((s) => s.id === depStepId)) {
                    warnings.push(
                        `Step ${step.id} depende de step filtrado: ${depStepId}`,
                    );
                    continue;
                }

                const toolDependency: ToolDependency = {
                    toolName:
                        step.tool ||
                        extractToolNameFromDescription(step.description),
                    type: step.critical === false ? 'optional' : 'required',
                    condition: buildConditionFromStep(step, dependentStep),
                    failureAction:
                        step.critical === false
                            ? 'continue'
                            : defaultFailureAction,
                    fallbackTool: extractFallbackFromStep(step),
                };

                dependencies.push(toolDependency);
            }
        }

        // Extrair tool dependencies específicas se definidas
        if (step.toolDependencies && step.toolDependencies.length > 0) {
            // Criar dependência para cada tool dependency
            const toolDependency: ToolDependency = {
                toolName:
                    step.tool ||
                    extractToolNameFromDescription(step.description),
                type: 'required',
                failureAction: defaultFailureAction,
            };

            dependencies.push(toolDependency);
        }
    }

    // Validar dependências circulares se configurado
    if (validateCircular) {
        const circularWarnings = detectCircularDependencies(dependencies);
        warnings.push(...circularWarnings);
    }

    const extractionTime = Date.now() - startTime;

    logger.info('Plan dependency extraction completed', {
        planId: plan.id,
        toolCallsCount: toolCalls.length,
        dependenciesCount: dependencies.length,
        warningsCount: warnings.length,
        extractionTime,
    });

    if (warnings.length > 0) {
        logger.warn('Plan dependency extraction warnings', {
            planId: plan.id,
            warnings,
        });
    }

    return {
        toolCalls,
        dependencies,
        warnings,
        stepMap,
    };
}

/**
 * Detecta se uma description parece ser um tool call
 */
function isToolLikeDescription(description: string): boolean {
    const toolPatterns = [
        /^(call|invoke|execute|run)\s+/i,
        /\w+\([^)]*\)/, // function call pattern
        /^(GET|POST|PUT|DELETE)\s+/i, // HTTP methods
        /^(build|test|deploy|fetch|process|analyze|generate)\s+/i, // common tool actions
    ];

    return toolPatterns.some((pattern) => pattern.test(description));
}

/**
 * Extrai nome da tool da description
 */
function extractToolNameFromDescription(description: string): string {
    // Tentar extrair primeiro "word" que parece ser nome de tool
    const matches = description.match(/^(\w+)/);
    if (matches && matches[1]) {
        return matches[1].toLowerCase();
    }

    // Fallback para description sanitizada
    return (
        description
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 50) || 'unknown_tool'
    );
}

/**
 * Extrai argumentos do step
 */
function extractArgumentsFromStep(step: PlanStep): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    // Usar params se disponível
    if (step.params) {
        if (step.params.tool) {
            Object.assign(args, step.params.tool);
        }
        // Remover referências a propriedades inexistentes
    }

    // Adicionar metadados úteis
    args.stepId = step.id;
    args.description = step.description;

    if (step.estimatedDuration) {
        args.timeout = step.estimatedDuration;
    }

    return args;
}

/**
 * Constrói condição baseada nos steps
 */
function buildConditionFromStep(
    step: PlanStep,
    dependentStep: PlanStep,
): string | undefined {
    // Construir condição baseada nos types de steps
    if (step.critical && dependentStep.critical) {
        return `${dependentStep.id}_completed_successfully`;
    }

    if (step.complexity === 'high' && dependentStep.complexity === 'low') {
        return `${dependentStep.id}_completed_fast`;
    }

    return undefined;
}

/**
 * Extrai fallback tool do step
 */
function extractFallbackFromStep(step: PlanStep): string | undefined {
    // Se step tem retry, pode usar versão "lite" como fallback
    if (step.retry && step.retry > 1) {
        return `${step.tool || 'unknown'}_lite`;
    }

    return undefined;
}

/**
 * Detecta dependências circulares
 */
function detectCircularDependencies(dependencies: ToolDependency[]): string[] {
    const warnings: string[] = [];
    const dependencyGraph = new Map<string, string[]>();

    // Construir grafo de dependências
    for (const dep of dependencies) {
        if (!dependencyGraph.has(dep.toolName)) {
            dependencyGraph.set(dep.toolName, []);
        }
        // Note: ToolDependency não tem "dependsOn", usando toolName como placeholder
        // dependencyGraph.get(dep.toolName)!.push(dep.dependsOn);
    }

    // DFS para detectar ciclos
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function hasCycle(toolName: string): boolean {
        if (visiting.has(toolName)) {
            warnings.push(
                `Circular dependency detected involving tool: ${toolName}`,
            );
            return true;
        }

        if (visited.has(toolName)) {
            return false;
        }

        visiting.add(toolName);
        const deps = dependencyGraph.get(toolName) || [];

        for (const dep of deps) {
            if (hasCycle(dep)) {
                return true;
            }
        }

        visiting.delete(toolName);
        visited.add(toolName);
        return false;
    }

    for (const toolName of dependencyGraph.keys()) {
        if (!visited.has(toolName)) {
            hasCycle(toolName);
        }
    }

    return warnings;
}

/**
 * Converte Plan para formato compatível com executeWithDependencies
 */
export function planToToolExecution(
    plan: Plan,
    config?: PlanDependencyExtractionConfig,
) {
    const extraction = extractDependenciesFromPlan(plan, config);

    return {
        tools: extraction.toolCalls,
        dependencies: extraction.dependencies,
        warnings: extraction.warnings,
        metadata: {
            planId: plan.id,
            planStrategy: plan.strategy,
            extractionTimestamp: Date.now(),
        },
    };
}

/**
 * Utilitário para debug de extração
 */
export function debugPlanExtraction(
    plan: Plan,
    config?: PlanDependencyExtractionConfig,
): void {
    const extraction = extractDependenciesFromPlan(plan, config);

    logger.info('🔍 Plan Dependency Extraction Debug');
    logger.info(`📋 Plan: ${plan.id} (${plan.strategy})`);
    logger.info(`🔧 Tool Calls: ${extraction.toolCalls.length}`);
    logger.info(`🔗 Dependencies: ${extraction.dependencies.length}`);
    logger.warn(`⚠️ Warnings: ${extraction.warnings.length}`);

    if (extraction.warnings.length > 0) {
        logger.warn('⚠️ Warnings:');
        extraction.warnings.forEach((warning, i) => {
            logger.warn(`  ${i + 1}. ${warning}`);
        });
    }

    logger.info('\n🔧 Tool Calls:');
    extraction.toolCalls.forEach((call, i) => {
        logger.info(`  ${i + 1}. ${call.toolName} (${call.id})`);
    });

    logger.info('\n🔗 Dependencies:');
    extraction.dependencies.forEach((dep, i) => {
        logger.info(`  ${i + 1}. ${dep.toolName} (${dep.type})`);
    });
}
