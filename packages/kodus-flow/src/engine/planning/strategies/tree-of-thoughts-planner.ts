/**
 * Tree of Thoughts Planner
 *
 * Implementa o pattern Tree of Thoughts onde:
 * 1. Gera múltiplos pensamentos (branches)
 * 2. Avalia cada pensamento
 * 3. Seleciona o melhor caminho
 * 4. Explora branches promissores em profundidade
 */

import { createLogger } from '../../../observability/index.js';
import type { LLMAdapter } from '../../../adapters/llm/index.js';
import type {
    Planner,
    AgentThought,
    AgentAction,
    ActionResult,
    ResultAnalysis,
    PlannerExecutionContext,
} from '../planner-factory.js';
import {
    isErrorResult,
    getResultError,
    createToolCallAction,
    createFinalAnswerAction,
} from '../planner-factory.js';

export interface ThoughtNode {
    id: string;
    content: string;
    action: AgentAction;
    depth: number;
    score: number;
    parentId?: string;
    children: ThoughtNode[];
    isExplored: boolean;
    evaluation: string;
    metadata?: Record<string, unknown>;
}

export interface ThoughtTree {
    root: ThoughtNode;
    currentPath: string[];
    maxDepth: number;
    maxBranches: number;
    exploredNodes: Map<string, ThoughtNode>;
    bestPath?: string[];
    bestScore?: number;
}

export class TreeOfThoughtsPlanner implements Planner {
    private logger = createLogger('tree-of-thoughts-planner');
    private tree: ThoughtTree | null = null;
    private maxDepth: number = 4;
    private maxBranches: number = 3;

    constructor(private llmAdapter: LLMAdapter) {
        this.logger.info('Tree of Thoughts Planner initialized', {
            llmProvider: llmAdapter.getProvider?.()?.name || 'unknown',
            maxDepth: this.maxDepth,
            maxBranches: this.maxBranches,
        });
    }

    async think(context: PlannerExecutionContext): Promise<AgentThought> {
        try {
            // Inicializar árvore se necessário
            if (!this.tree || this.shouldRebuildTree(context)) {
                await this.initializeTree(context);
            }

            // Explorar próximo nó promissor
            return await this.exploreNextNode(context);
        } catch (error) {
            this.logger.error(
                'Tree of Thoughts thinking failed',
                error as Error,
            );

            return {
                reasoning: `Error in tree exploration: ${error instanceof Error ? error.message : 'Unknown error'}`,
                action: {
                    type: 'final_answer',
                    content: `I encountered an error while exploring thoughts: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                },
            };
        }
    }

    private async initializeTree(
        context: PlannerExecutionContext,
    ): Promise<void> {
        const input = context.input;
        // Gerar pensamentos iniciais (nós raiz)
        const initialThoughts = await this.generateInitialThoughts(
            input,
            context,
        );

        // Criar nó raiz
        const rootNode: ThoughtNode = {
            id: 'root',
            content: input,
            action: { type: 'final_answer', content: 'Starting exploration' },
            depth: 0,
            score: 0,
            children: initialThoughts,
            isExplored: true,
            evaluation: 'Root node - starting point',
        };

        this.tree = {
            root: rootNode,
            currentPath: ['root'],
            maxDepth: this.maxDepth,
            maxBranches: this.maxBranches,
            exploredNodes: new Map([['root', rootNode]]),
        };

        // Avaliar pensamentos iniciais
        for (const thought of initialThoughts) {
            thought.score = await this.evaluateThought(thought, context);
            this.tree.exploredNodes.set(thought.id, thought);
        }

        this.logger.info('Thought tree initialized', {
            initialThoughts: initialThoughts.length,
            rootId: rootNode.id,
        });
    }

    private async generateInitialThoughts(
        input: string,
        context: PlannerExecutionContext,
    ): Promise<ThoughtNode[]> {
        // const availableToolNames =
        //     context.availableTools?.map((tool) => tool.name) || [];

        // ✅ CONTEXT ENGINEERING - Informar tools disponíveis de forma simples
        // const toolsContext =
        //     availableToolNames.length > 0
        //         ? `Available tools: ${availableToolNames.join(', ')}`
        //         : `No tools available for this session`;

        const prompt = `

Generate ${this.maxBranches} different approaches to solve this problem: ${input}

For each approach, provide:
1. A clear reasoning strategy
2. The first action to take
3. Why this approach might work

Generate multiple approaches to solve this problem effectively.

Respond in this format:
Approach 1: [reasoning] | Action: [action_type:tool_name:arguments] | Rationale: [why]
Approach 2: [reasoning] | Action: [action_type:tool_name:arguments] | Rationale: [why]
Approach 3: [reasoning] | Action: [action_type:tool_name:arguments] | Rationale: [why]
        `;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: prompt }],
            });

            return this.parseInitialThoughts(response.content);
        } catch (error) {
            this.logger.warn('Failed to generate initial thoughts', {
                error: (error as Error).message,
            });

            // Fallback - gerar pensamentos básicos
            return this.generateFallbackThoughts(input, context);
        }
    }

    private parseInitialThoughts(response: string): ThoughtNode[] {
        const approaches = response.split(/Approach \d+:/).slice(1);

        return approaches.slice(0, this.maxBranches).map((approach, index) => {
            const parts = approach.split('|');
            const reasoning = parts[0]?.trim() || `Approach ${index + 1}`;
            const actionPart = parts[1]?.replace('Action:', '').trim() || '';
            const rationale = parts[2]?.replace('Rationale:', '').trim() || '';

            const action = this.parseAction(actionPart);

            return {
                id: `thought-${index + 1}`,
                content: reasoning,
                action,
                depth: 1,
                score: 0,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: rationale,
                metadata: {
                    approachIndex: index + 1,
                },
            };
        });
    }

    private parseAction(actionString: string): AgentAction {
        // Parse format: action_type:tool_name:arguments
        const parts = actionString.split(':');

        if (parts.length >= 2 && parts[0] === 'tool_call') {
            return createToolCallAction(
                parts[1] || 'unknown',
                parts[2] ? this.parseArguments(parts[2]) : {},
                'Tool call action',
            );
        }

        return createFinalAnswerAction(actionString || 'Explore this approach');
    }

    private parseArguments(argString: string): Record<string, unknown> {
        try {
            return JSON.parse(argString);
        } catch {
            return { query: argString };
        }
    }

    private generateFallbackThoughts(
        input: string,
        _context: PlannerExecutionContext,
    ): ThoughtNode[] {
        const thoughts: ThoughtNode[] = [];
        const availableToolNames: string[] = [];

        if (availableToolNames.length === 0) {
            // ✅ CONTEXT ENGINEERING - Fallback para cenário sem tools
            thoughts.push({
                id: 'fallback-no-tools-1',
                content: 'Conversational response explaining limitations',
                action: {
                    type: 'final_answer',
                    content: `Não tenho acesso a ferramentas específicas para "${input}". Como posso ajudar de outra forma? Posso fornecer orientações, explicações ou sugerir alternativas.`,
                },
                depth: 1,
                score: 0.8,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: 'No tools available - provide helpful explanation',
            });

            thoughts.push({
                id: 'fallback-no-tools-2',
                content: 'General information approach',
                action: {
                    type: 'final_answer',
                    content: `Posso fornecer informações gerais sobre "${input}" baseado no meu conhecimento, embora não tenha acesso a ferramentas específicas.`,
                },
                depth: 1,
                score: 0.7,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: 'Provide general knowledge response',
            });
        } else {
            // Pensamento 1: Análise direta
            thoughts.push({
                id: 'fallback-1',
                content: 'Direct analysis approach',
                action: {
                    type: 'final_answer',
                    content: `Direct analysis of: ${input}`,
                },
                depth: 1,
                score: 0.6,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: 'Simple direct approach',
            });

            // Pensamento 2: Usar primeira ferramenta disponível
            thoughts.push({
                id: 'fallback-2',
                content: 'Tool-based approach',
                action: createToolCallAction(
                    availableToolNames[0] || 'unknown',
                    { query: input },
                    'Tool-based approach',
                ),
                depth: 1,
                score: 0.7,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: 'Use available tools',
            });

            // Pensamento 3: Abordagem exploratória
            thoughts.push({
                id: 'fallback-3',
                content: 'Exploratory approach',
                action: {
                    type: 'final_answer',
                    content: `Need more information about: ${input}`,
                },
                depth: 1,
                score: 0.5,
                parentId: 'root',
                children: [],
                isExplored: false,
                evaluation: 'Gather more information first',
            });
        }

        return thoughts;
    }

    private async exploreNextNode(
        context: PlannerExecutionContext,
    ): Promise<AgentThought> {
        if (!this.tree) {
            throw new Error('No thought tree available');
        }

        // Encontrar melhor nó não explorado
        const bestNode = this.findBestUnexploredNode();

        if (!bestNode) {
            // Árvore completamente explorada - retornar melhor resultado
            return this.getBestResult();
        }

        // Atualizar caminho atual
        this.updateCurrentPath(bestNode);

        // Marcar como sendo explorado
        bestNode.isExplored = true;

        this.logger.debug('Exploring node', {
            nodeId: bestNode.id,
            depth: bestNode.depth,
            score: bestNode.score,
        });

        return {
            reasoning: `Tree of Thoughts - exploring: ${bestNode.content} (score: ${bestNode.score.toFixed(2)}). Context: ${context.history.length} actions, iteration ${context.iterations}`,
            action: bestNode.action,
            confidence: this.calculateConfidence(bestNode, context),
            metadata: {
                nodeId: bestNode.id,
                depth: bestNode.depth,
                score: bestNode.score,
                treeSize: this.tree.exploredNodes.size,
                isTreeComplete: this.isTreeComplete(),
                contextHistory: context.history.length,
                currentIteration: context.iterations,
                availableTools: [],
            },
        };
    }

    private findBestUnexploredNode(): ThoughtNode | null {
        if (!this.tree) return null;

        let bestNode: ThoughtNode | null = null;
        let bestScore = -Infinity;

        const searchNodes = (node: ThoughtNode) => {
            if (!node.isExplored && node.score > bestScore) {
                bestScore = node.score;
                bestNode = node;
            }

            for (const child of node.children) {
                searchNodes(child);
            }
        };

        searchNodes(this.tree.root);
        return bestNode;
    }

    private async evaluateThought(
        thought: ThoughtNode,
        context: PlannerExecutionContext,
    ): Promise<number> {
        const evaluationPrompt = `
Evaluate this approach for solving the problem:

Problem: ${context.input}
Approach: ${thought.content}
Proposed Action: ${JSON.stringify(thought.action)}
Current depth: ${thought.depth}/${this.maxDepth}

Rate this approach on a scale of 0.0 to 1.0 based on:
1. Likelihood of success (0.4 weight)
2. Efficiency/directness (0.3 weight)
3. Risk/safety (0.2 weight)
4. Novelty/creativity (0.1 weight)

Respond with just a number between 0.0 and 1.0
        `;

        try {
            const response = await this.llmAdapter.call({
                messages: [{ role: 'user', content: evaluationPrompt }],
            });

            const score = parseFloat(response.content.trim());
            return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
        } catch (error) {
            this.logger.warn('Failed to evaluate thought', {
                thoughtId: thought.id,
                error: (error as Error).message,
            });

            // Fallback scoring
            return this.calculateFallbackScore(thought);
        }
    }

    private calculateFallbackScore(thought: ThoughtNode): number {
        let score = 0.5; // Base score

        // Tool calls generally better than final answers (except at leaves)
        if (thought.action.type === 'tool_call') score += 0.2;

        // Penalize excessive depth
        if (thought.depth > this.maxDepth / 2) score -= 0.1;

        // Reward specific actions over generic ones
        if (thought.content.length > 20) score += 0.1;

        return Math.max(0, Math.min(1, score));
    }

    async analyzeResult(
        result: ActionResult,
        context: PlannerExecutionContext,
    ): Promise<ResultAnalysis> {
        this.logger.debug('Analyzing result in tree context', {
            resultType: result.type,
            hasError: isErrorResult(result),
            hasTree: !!this.tree,
        });

        if (!this.tree) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'No tree to analyze',
                shouldContinue: false,
            };
        }

        const currentNode = this.getCurrentNode();

        if (!currentNode) {
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: 'Tree exploration completed',
                shouldContinue: false,
            };
        }

        // Atualizar score do nó baseado no resultado
        await this.updateNodeScore(currentNode, result);

        // Decidir se expandir o nó ou explorar outros
        if (this.shouldExpandNode(currentNode, result)) {
            await this.expandNode(currentNode, context);
        }

        // Verificar se encontramos uma solução ou se devemos continuar
        if (result.type === 'final_answer' && !isErrorResult(result)) {
            this.updateBestPath(currentNode);
            return {
                isComplete: true,
                isSuccessful: true,
                feedback: `Tree exploration found solution via path: ${this.tree.currentPath.join(' → ')}`,
                shouldContinue: false,
            };
        }

        if (isErrorResult(result)) {
            // Penalizar este caminho e explorar alternativas
            currentNode.score *= 0.5;
            return {
                isComplete: false,
                isSuccessful: false,
                feedback: `Path failed: ${getResultError(result)}. Exploring alternative branches.`,
                shouldContinue: true,
                suggestedNextAction: 'Explore alternative thought branch',
            };
        }

        // Continuar explorando
        const hasMoreNodes = this.findBestUnexploredNode() !== null;
        return {
            isComplete: !hasMoreNodes,
            isSuccessful: true,
            feedback: hasMoreNodes
                ? 'Continue exploring thought tree'
                : 'Tree exploration completed',
            shouldContinue: hasMoreNodes,
        };
    }

    private shouldRebuildTree(context: PlannerExecutionContext): boolean {
        if (!this.tree) return true;

        // Rebuild if too many failures in current tree
        const recentFailures = context.history
            .slice(-3)
            .filter((h) => isErrorResult(h.result)).length;

        return recentFailures >= 2;
    }

    private updateCurrentPath(node: ThoughtNode): void {
        if (!this.tree) return;

        // Build path from root to this node
        const path: string[] = [];
        let current: ThoughtNode | undefined = node;

        while (current) {
            path.unshift(current.id);
            current = current.parentId
                ? this.tree.exploredNodes.get(current.parentId)
                : undefined;
        }

        this.tree.currentPath = path;
    }

    private getCurrentNode(): ThoughtNode | null {
        if (!this.tree || this.tree.currentPath.length === 0) return null;

        const currentId =
            this.tree.currentPath[this.tree.currentPath.length - 1];
        return currentId
            ? this.tree.exploredNodes.get(currentId) || null
            : null;
    }

    private async updateNodeScore(
        node: ThoughtNode,
        result: ActionResult,
    ): Promise<void> {
        if (isErrorResult(result)) {
            node.score *= 0.3; // Heavily penalize failures
        } else if (result.type === 'final_answer') {
            node.score *= 1.2; // Reward successful conclusions
        } else {
            node.score *= 1.1; // Slight reward for progress
        }

        // Keep score in bounds
        node.score = Math.max(0, Math.min(1, node.score));
    }

    private shouldExpandNode(node: ThoughtNode, result: ActionResult): boolean {
        return (
            !isErrorResult(result) &&
            result.type !== 'final_answer' &&
            node.depth < this.maxDepth &&
            node.children.length === 0 &&
            node.score > 0.6 // Only expand promising nodes
        );
    }

    private async expandNode(
        node: ThoughtNode,
        context: PlannerExecutionContext,
    ): Promise<void> {
        // Generate child thoughts based on current result
        const childThoughts = await this.generateChildThoughts(node, context);

        node.children = childThoughts;

        // Evaluate child thoughts
        for (const child of childThoughts) {
            child.score = await this.evaluateThought(child, context);
            this.tree?.exploredNodes.set(child.id, child);
        }

        this.logger.debug('Expanded node', {
            nodeId: node.id,
            childrenCount: childThoughts.length,
        });
    }

    private async generateChildThoughts(
        parentNode: ThoughtNode,
        context: PlannerExecutionContext,
    ): Promise<ThoughtNode[]> {
        // Generate follow-up actions based on context and parent node
        const childThoughts: ThoughtNode[] = [];

        for (let i = 0; i < Math.min(this.maxBranches, 2); i++) {
            childThoughts.push({
                id: `${parentNode.id}-child-${i + 1}`,
                content: `Continue from ${parentNode.content}`,
                action: {
                    type: 'final_answer',
                    content: `Next step after ${parentNode.content}`,
                },
                depth: parentNode.depth + 1,
                score: 0.5,
                parentId: parentNode.id,
                children: [],
                isExplored: false,
                evaluation: 'Generated continuation based on context',
                metadata: {
                    basedOnContext: true,
                    contextHistory: context.history.length,
                    availableTools: [],
                },
            });
        }

        return childThoughts;
    }

    private getBestResult(): AgentThought {
        if (!this.tree) {
            return {
                reasoning: 'No tree available',
                action: {
                    type: 'final_answer',
                    content: 'Tree exploration failed',
                },
            };
        }

        const bestPath = this.tree.bestPath || this.tree.currentPath;
        const bestScore = this.tree.bestScore || 0;

        return {
            reasoning: `Tree exploration completed. Best path: ${bestPath.join(' → ')} (score: ${bestScore.toFixed(2)})`,
            action: {
                type: 'final_answer',
                content: 'Task completed using tree of thoughts exploration',
            },
            confidence: bestScore,
            metadata: {
                bestPath,
                bestScore,
                nodesExplored: this.tree.exploredNodes.size,
                treeComplete: true,
            },
        };
    }

    private updateBestPath(node: ThoughtNode): void {
        if (!this.tree) return;

        if (!this.tree.bestScore || node.score > this.tree.bestScore) {
            this.tree.bestScore = node.score;
            this.tree.bestPath = [...this.tree.currentPath];
        }
    }

    private isTreeComplete(): boolean {
        return this.findBestUnexploredNode() === null;
    }

    private calculateConfidence(
        node: ThoughtNode,
        context: PlannerExecutionContext,
    ): number {
        let confidence = node.score;

        // Adjust for depth - deeper nodes may be more uncertain
        confidence *= Math.max(0.5, 1 - (node.depth / this.maxDepth) * 0.3);

        // Adjust for tree exploration progress
        if (this.tree) {
            const explorationProgress =
                this.tree.exploredNodes.size /
                (this.maxDepth * this.maxBranches);
            confidence *= 0.7 + explorationProgress * 0.3;
        }

        // Use context to adjust confidence
        const recentSuccesses = context.history
            .slice(-5)
            .filter((h) => !isErrorResult(h.result));
        if (recentSuccesses.length >= 4) {
            confidence += 0.1; // High recent success rate
        } else if (recentSuccesses.length <= 1) {
            confidence -= 0.1; // Low recent success rate
        }

        // Consider iteration count (higher iterations = lower confidence)
        if (context.iterations > 5) {
            confidence -= 0.05;
        }

        return Math.max(0.1, Math.min(1.0, confidence));
    }
}
