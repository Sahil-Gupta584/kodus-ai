/**
 * 🧠 EXEMPLO 2: HIERARQUIA DE MEMÓRIA EM AÇÃO
 *
 * Este exemplo demonstra como a arquitetura hierárquica de memória
 * trabalha de forma inteligente para fornecer contexto relevante
 */

import type {
    MemoryService,
    ShortTermMemoryService,
    LongTermMemoryService,
    EpisodicMemoryService,
    MemoryRetrievalService,
    KnowledgeGraph,
    Episode,
} from '../index.js';

// ===============================================
// 🎯 CENÁRIO: E-COMMERCE CUSTOMER SUPPORT
// ===============================================

export class EcommerceMemoryExample {
    async demonstrateMemoryHierarchy(memoryService: MemoryService) {
        console.log('🧠 EXEMPLO: Hierarquia de Memória em E-commerce\n');

        // ===== CENÁRIO: Cliente fazendo múltiplas perguntas =====
        await this.simulateCustomerSession(memoryService);

        // ===== DEMONSTRAR PODER DA RETRIEVAL =====
        await this.demonstrateSmartRetrieval(memoryService);

        // ===== DEMONSTRAR LEARNING E PATTERNS =====
        await this.demonstrateLearningCapabilities(memoryService);

        // ===== DEMONSTRAR KNOWLEDGE GRAPH =====
        await this.demonstrateKnowledgeGraph(memoryService);
    }

    private async simulateCustomerSession(memoryService: MemoryService) {
        console.log('📞 SIMULANDO SESSÃO DE CUSTOMER SUPPORT\n');

        // ===== SHORT TERM MEMORY: Interações da sessão atual =====
        const shortTerm = memoryService.getShortTermMemory();

        // Primeira interação
        await memoryService.storeMemory(
            {
                id: 'interaction-1',
                content: 'Cliente João pergunta sobre status do pedido #12345',
                timestamp: Date.now() - 300000, // 5 min atrás
                type: 'interaction',
                source: 'chat',
                importance: 'medium',
                verified: true,
                relevanceScore: 0.9,
                contextTags: [
                    'order-status',
                    'customer-service',
                    'pedido-12345',
                ],
            },
            'short_term',
        );

        // Segunda interação
        await memoryService.storeMemory(
            {
                id: 'interaction-2',
                content: 'João reporta produto danificado, solicita reembolso',
                timestamp: Date.now() - 180000, // 3 min atrás
                type: 'interaction',
                source: 'chat',
                importance: 'high',
                verified: true,
                relevanceScore: 0.95,
                contextTags: [
                    'produto-danificado',
                    'reembolso',
                    'pedido-12345',
                ],
            },
            'short_term',
        );

        // Terceira interação
        await memoryService.storeMemory(
            {
                id: 'interaction-3',
                content:
                    'João aceita troca ao invés de reembolso, prefere entrega expressa',
                timestamp: Date.now() - 60000, // 1 min atrás
                type: 'interaction',
                source: 'chat',
                importance: 'high',
                verified: true,
                relevanceScore: 0.9,
                contextTags: ['troca', 'entrega-expressa', 'resolucao'],
            },
            'short_term',
        );

        console.log('✅ SHORT TERM: 3 interações da sessão atual armazenadas');

        // ===== LONG TERM MEMORY: Histórico do cliente =====
        const longTerm = memoryService.getLongTermMemory();

        await memoryService.storeMemory(
            {
                id: 'customer-profile-joao',
                content:
                    'João Silva - Cliente Premium desde 2023, histórico de 15 pedidos, preferência por eletrônicos, nunca cancelou pedido',
                timestamp: Date.now() - 86400000, // 1 dia atrás
                type: 'insight',
                source: 'customer-analysis',
                importance: 'high',
                verified: true,
                relevanceScore: 0.85,
                contextTags: ['cliente-premium', 'perfil', 'eletronicos'],
            },
            'long_term',
        );

        await memoryService.storeMemory(
            {
                id: 'preference-joao',
                content:
                    'João prefere resolver problemas via chat, responde bem a ofertas de upgrade, valoriza entrega rápida',
                timestamp: Date.now() - 172800000, // 2 dias atrás
                type: 'pattern',
                source: 'behavioral-analysis',
                importance: 'medium',
                verified: true,
                relevanceScore: 0.8,
                contextTags: ['preferencias', 'comportamento', 'comunicacao'],
            },
            'long_term',
        );

        console.log(
            '✅ LONG TERM: Perfil e preferências do cliente armazenados',
        );

        // ===== EPISODIC MEMORY: Eventos similares =====
        const episodic = memoryService.getEpisodicMemory();

        await episodic.createEpisode(
            'Resolução de produto danificado - Case similar',
            {
                customerType: 'premium',
                productCategory: 'electronics',
                issueType: 'damaged-product',
                resolutionPreference: 'exchange',
            },
        );

        console.log('✅ EPISODIC: Episódio de caso similar criado\n');
    }

    private async demonstrateSmartRetrieval(memoryService: MemoryService) {
        console.log('🔍 DEMONSTRANDO SMART RETRIEVAL\n');

        // ===== QUERY: "Como resolver situação do João?" =====
        const relevantMemories = await memoryService.retrieveRelevantMemories(
            'resolução problema João produto danificado reembolso troca',
            {
                limit: 10,
                similarity_threshold: 0.7,
                time_range: {
                    start: Date.now() - 86400000 * 7, // última semana
                    end: Date.now(),
                },
            },
        );

        console.log('📊 MEMÓRIAS RELEVANTES ENCONTRADAS:');
        relevantMemories.forEach((memory) => {
            console.log(
                `- ${memory.content} (relevância: ${memory.relevance_score})`,
            );
            console.log(
                `  Tipo: ${memory.type} | Timestamp: ${new Date(memory.timestamp).toLocaleString()}`,
            );
        });

        // ===== CONTEXT SELECTION PARA LLM =====
        const selectedContext = await memoryService.selectContextForLLM(2000);

        console.log(`\n🧠 CONTEXTO OTIMIZADO PARA LLM:`);
        console.log(`- Token count: ${selectedContext.token_count}`);
        console.log(`- Sources: ${selectedContext.sources.length}`);
        console.log(
            `- Relevance scores: ${selectedContext.relevance_scores.map((s) => s.toFixed(2)).join(', ')}`,
        );
        console.log(
            `- Content preview: ${selectedContext.content.substring(0, 200)}...\n`,
        );
    }

    private async demonstrateLearningCapabilities(
        memoryService: MemoryService,
    ) {
        console.log('🎓 DEMONSTRANDO LEARNING CAPABILITIES\n');

        // ===== ANÁLISE DE PADRÕES =====
        const memoryPatterns = await memoryService.analyzeMemoryPatterns();

        console.log('📈 PADRÕES IDENTIFICADOS:');
        memoryPatterns.common_patterns.forEach((pattern) => {
            console.log(
                `- ${pattern.description} (frequência: ${pattern.frequency}, confiança: ${pattern.confidence})`,
            );
        });

        console.log('\n📊 FREQUÊNCIA DE USO:');
        Object.entries(memoryPatterns.usage_frequency).forEach(
            ([key, freq]) => {
                console.log(`- ${key}: ${freq} vezes`);
            },
        );

        console.log('\n🔍 PADRÕES DE RETRIEVAL:');
        memoryPatterns.retrieval_patterns.forEach((pattern) => {
            console.log(`- Query tipo: ${pattern.query_type}`);
            console.log(`  Resultados típicos: ${pattern.typical_results}`);
            console.log(`  Relevância média: ${pattern.average_relevance}`);
        });

        console.log('\n💡 OTIMIZAÇÕES SUGERIDAS:');
        memoryPatterns.optimization_suggestions.forEach((suggestion) => {
            console.log(`- ${suggestion}`);
        });
    }

    private async demonstrateKnowledgeGraph(memoryService: MemoryService) {
        console.log('\n🕸️ DEMONSTRANDO KNOWLEDGE GRAPH\n');

        const longTerm = memoryService.getLongTermMemory();

        // ===== CONSTRUIR KNOWLEDGE GRAPH =====
        const knowledgeGraph = await longTerm.buildKnowledgeGraph();

        console.log('🧠 KNOWLEDGE GRAPH CONSTRUÍDO:');
        console.log(`- Nodes: ${knowledgeGraph.nodes.length}`);
        console.log(`- Edges: ${knowledgeGraph.edges.length}`);
        console.log(`- Clusters: ${knowledgeGraph.clusters.length}`);
        console.log(`- Density: ${knowledgeGraph.metrics.density.toFixed(3)}`);
        console.log(
            `- Average clustering: ${knowledgeGraph.metrics.averageClustering.toFixed(3)}`,
        );

        console.log('\n🎯 PRINCIPAIS NODES:');
        knowledgeGraph.nodes
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5)
            .forEach((node) => {
                console.log(
                    `- ${node.label} (${node.type}, peso: ${node.weight.toFixed(2)})`,
                );
            });

        console.log('\n🔗 PRINCIPAIS RELATIONSHIPS:');
        knowledgeGraph.edges
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5)
            .forEach((edge) => {
                const fromNode = knowledgeGraph.nodes.find(
                    (n) => n.id === edge.fromNode,
                );
                const toNode = knowledgeGraph.nodes.find(
                    (n) => n.id === edge.toNode,
                );
                console.log(
                    `- ${fromNode?.label} → ${edge.relationship} → ${toNode?.label} (${edge.weight.toFixed(2)})`,
                );
            });

        console.log('\n🏛️ KNOWLEDGE CLUSTERS:');
        knowledgeGraph.clusters.forEach((cluster) => {
            console.log(
                `- ${cluster.name}: ${cluster.nodes.length} nodes (cohesion: ${cluster.cohesion.toFixed(2)})`,
            );
        });
    }
}

// ===============================================
// 🚀 CENÁRIO AVANÇADO: MULTI-DOMAIN KNOWLEDGE
// ===============================================

export class MultiDomainMemoryExample {
    async demonstrateMultiDomainLearning(memoryService: MemoryService) {
        console.log('\n🌍 EXEMPLO: MULTI-DOMAIN KNOWLEDGE SYSTEM\n');

        // ===== DOMAIN 1: TECHNICAL SUPPORT =====
        await this.storeTechnicalKnowledge(memoryService);

        // ===== DOMAIN 2: SALES =====
        await this.storeSalesKnowledge(memoryService);

        // ===== DOMAIN 3: PRODUCT MANAGEMENT =====
        await this.storeProductKnowledge(memoryService);

        // ===== CROSS-DOMAIN RETRIEVAL =====
        await this.demonstrateCrossDomainRetrieval(memoryService);

        // ===== KNOWLEDGE CONSOLIDATION =====
        await this.demonstrateKnowledgeConsolidation(memoryService);
    }

    private async storeTechnicalKnowledge(memoryService: MemoryService) {
        const technicalFacts = [
            {
                id: 'tech-1',
                content:
                    'Produto XYZ-123 tem problema conhecido com bateria após 18 meses de uso',
                contextTags: [
                    'technical',
                    'produto-xyz-123',
                    'bateria',
                    'bug-conhecido',
                ],
                importance: 'high' as const,
            },
            {
                id: 'tech-2',
                content:
                    'Solução temporária para XYZ-123: reduzir brightness para 70% aumenta duração da bateria',
                contextTags: [
                    'technical',
                    'workaround',
                    'produto-xyz-123',
                    'otimizacao',
                ],
                importance: 'medium' as const,
            },
            {
                id: 'tech-3',
                content:
                    'Firmware v2.1.3 corrige problema de bateria no XYZ-123, disponível desde março 2024',
                contextTags: [
                    'technical',
                    'firmware',
                    'produto-xyz-123',
                    'fix',
                    '2024',
                ],
                importance: 'high' as const,
            },
        ];

        for (const fact of technicalFacts) {
            await memoryService.storeMemory(
                {
                    id: fact.id,
                    content: fact.content,
                    timestamp: Date.now(),
                    type: 'insight',
                    source: 'technical-team',
                    importance: fact.importance,
                    verified: true,
                    relevanceScore: 0.9,
                    contextTags: fact.contextTags,
                },
                'long_term',
            );
        }

        console.log('✅ TECHNICAL DOMAIN: 3 knowledge items stored');
    }

    private async storeSalesKnowledge(memoryService: MemoryService) {
        const salesFacts = [
            {
                id: 'sales-1',
                content:
                    'XYZ-123 tem 85% customer satisfaction, principais reclamações sobre bateria (15%)',
                contextTags: [
                    'sales',
                    'produto-xyz-123',
                    'satisfaction',
                    'metrics',
                ],
                importance: 'high' as const,
            },
            {
                id: 'sales-2',
                content:
                    'Clientes que reportam problema de bateria, 92% aceitam upgrade para XYZ-456 com desconto de 20%',
                contextTags: [
                    'sales',
                    'upsell',
                    'produto-xyz-456',
                    'desconto',
                    'conversion',
                ],
                importance: 'high' as const,
            },
            {
                id: 'sales-3',
                content:
                    'XYZ-123 será descontinuado em Q4 2024, focar vendas no XYZ-456 com melhor margem',
                contextTags: [
                    'sales',
                    'product-lifecycle',
                    'descontinuacao',
                    'xyz-456',
                ],
                importance: 'critical' as const,
            },
        ];

        for (const fact of salesFacts) {
            await memoryService.storeMemory(
                {
                    id: fact.id,
                    content: fact.content,
                    timestamp: Date.now(),
                    type: 'insight',
                    source: 'sales-team',
                    importance: fact.importance,
                    verified: true,
                    relevanceScore: 0.85,
                    contextTags: fact.contextTags,
                },
                'long_term',
            );
        }

        console.log('✅ SALES DOMAIN: 3 knowledge items stored');
    }

    private async storeProductKnowledge(memoryService: MemoryService) {
        const productFacts = [
            {
                id: 'product-1',
                content:
                    'XYZ-456 lançado como sucessor do XYZ-123, bateria 40% maior e processador 2x mais rápido',
                contextTags: [
                    'product',
                    'xyz-456',
                    'successor',
                    'specs',
                    'performance',
                ],
                importance: 'high' as const,
            },
            {
                id: 'product-2',
                content:
                    'Roadmap: XYZ-789 será lançado em Q2 2025 com IA integrada e bateria que dura 3 dias',
                contextTags: [
                    'product',
                    'roadmap',
                    'xyz-789',
                    '2025',
                    'ai',
                    'battery-life',
                ],
                importance: 'medium' as const,
            },
        ];

        for (const fact of productFacts) {
            await memoryService.storeMemory(
                {
                    id: fact.id,
                    content: fact.content,
                    timestamp: Date.now(),
                    type: 'insight',
                    source: 'product-team',
                    importance: fact.importance,
                    verified: true,
                    relevanceScore: 0.8,
                    contextTags: fact.contextTags,
                },
                'long_term',
            );
        }

        console.log('✅ PRODUCT DOMAIN: 2 knowledge items stored\n');
    }

    private async demonstrateCrossDomainRetrieval(
        memoryService: MemoryService,
    ) {
        console.log('🔄 DEMONSTRANDO CROSS-DOMAIN RETRIEVAL\n');

        // Query que deve buscar em múltiplos domínios
        const query =
            'Cliente reclama bateria XYZ-123 não dura, qual melhor solução?';

        const crossDomainResults = await memoryService.retrieveRelevantMemories(
            query,
            {
                limit: 8,
                similarity_threshold: 0.6,
            },
        );

        console.log('🧠 RESULTADOS CROSS-DOMAIN:');
        crossDomainResults.forEach((result) => {
            const domain = this.identifyDomain(result.metadata);
            console.log(`[${domain.toUpperCase()}] ${result.content}`);
            console.log(
                `  Relevância: ${result.relevance_score.toFixed(2)} | Tipo: ${result.type}\n`,
            );
        });

        // Demonstrar synthesis inteligente
        const synthesis =
            this.synthesizeCrossDomainKnowledge(crossDomainResults);
        console.log('🎯 SYNTHESIS INTELIGENTE:');
        console.log(`- Problema: ${synthesis.problem}`);
        console.log(`- Causa técnica: ${synthesis.technicalCause}`);
        console.log(`- Soluções disponíveis:`);
        synthesis.solutions.forEach((sol) => console.log(`  • ${sol}`));
        console.log(`- Estratégia comercial: ${synthesis.businessStrategy}\n`);
    }

    private identifyDomain(metadata: Record<string, unknown>): string {
        const source = metadata.source as string;
        if (source?.includes('technical')) return 'tech';
        if (source?.includes('sales')) return 'sales';
        if (source?.includes('product')) return 'product';
        return 'general';
    }

    private synthesizeCrossDomainKnowledge(results: any[]) {
        return {
            problem: 'Bateria XYZ-123 com duração reduzida após 18 meses',
            technicalCause:
                'Bug conhecido, firmware v2.1.3 disponível como fix',
            solutions: [
                'Workaround: reduzir brightness para 70%',
                'Fix definitivo: update firmware v2.1.3',
                'Upgrade para XYZ-456 com 40% mais bateria',
            ],
            businessStrategy:
                'Oferecer upgrade XYZ-456 com 20% desconto (92% acceptance rate)',
        };
    }

    private async demonstrateKnowledgeConsolidation(
        memoryService: MemoryService,
    ) {
        console.log('🔗 DEMONSTRANDO KNOWLEDGE CONSOLIDATION\n');

        const longTerm = memoryService.getLongTermMemory();

        // ===== IDENTIFICAR DUPLICATAS =====
        const duplicates = await longTerm.identifyDuplicates();

        console.log('🔍 DUPLICATAS IDENTIFICADAS:');
        duplicates.forEach((group) => {
            console.log(`- Grupo com ${group.items.length} itens similares:`);
            group.items.forEach((item) => {
                console.log(`  • ${item.content.substring(0, 60)}...`);
            });
        });

        // ===== CONSOLIDAR CONHECIMENTO =====
        if (duplicates.length > 0) {
            const consolidatedMemory = await longTerm.consolidateMemories(
                duplicates[0].items.map((item) => item.id),
            );

            console.log('\n✅ CONHECIMENTO CONSOLIDADO:');
            console.log(`- ID: ${consolidatedMemory.id}`);
            console.log(`- Content: ${consolidatedMemory.content}`);
            console.log(`- Tags: ${consolidatedMemory.contextTags.join(', ')}`);
            console.log(`- Importance: ${consolidatedMemory.importance}`);
        }

        // ===== SEMANTIC CLUSTERS =====
        const clusters = await longTerm.getSemanticClusters();

        console.log('\n🎭 SEMANTIC CLUSTERS IDENTIFICADOS:');
        clusters.forEach((cluster) => {
            console.log(
                `- ${cluster.name} (${cluster.items.length} items, cohesion: ${cluster.cohesion.toFixed(2)})`,
            );
            console.log(`  Tópicos: ${cluster.topics.join(', ')}`);
        });

        // ===== KNOWLEDGE METRICS =====
        const metrics = await longTerm.getKnowledgeMetrics();

        console.log('\n📊 KNOWLEDGE METRICS:');
        console.log(`- Total concepts: ${metrics.totalConcepts}`);
        console.log(`- Total relationships: ${metrics.totalRelationships}`);
        console.log(
            `- Knowledge density: ${metrics.knowledgeDensity.toFixed(3)}`,
        );
        console.log(
            `- Average confidence: ${metrics.averageConfidence.toFixed(2)}`,
        );
        console.log(`- Coverage score: ${metrics.coverageScore.toFixed(2)}`);
    }
}

// ===============================================
// 🚀 EXEMPLO DE USO PRÁTICO
// ===============================================

export async function demonstrateMemoryHierarchyPower() {
    console.log('🧠 DEMONSTRAÇÃO: Poder da Hierarquia de Memória\n');

    // Mock memory service para demonstração
    const memoryService: MemoryService = createMockMemoryService();

    // Demonstrar cenário e-commerce
    const ecommerceExample = new EcommerceMemoryExample();
    await ecommerceExample.demonstrateMemoryHierarchy(memoryService);

    // Demonstrar multi-domain
    const multiDomainExample = new MultiDomainMemoryExample();
    await multiDomainExample.demonstrateMultiDomainLearning(memoryService);

    console.log('\n🎯 BENEFÍCIOS DEMONSTRADOS:');
    console.log('✅ Memória contextual inteligente');
    console.log('✅ Retrieval multi-layer otimizado');
    console.log('✅ Learning automático de padrões');
    console.log('✅ Knowledge graph semântico');
    console.log('✅ Cross-domain synthesis');
    console.log('✅ Knowledge consolidation');
}

// Helper para criar mock service
function createMockMemoryService(): MemoryService {
    const memoryStore: any[] = [];

    return {
        async storeMemory(memory, type) {
            memoryStore.push({ ...memory, memoryType: type });
        },

        async retrieveRelevantMemories(query, options) {
            // Simulação de busca semântica
            return memoryStore
                .filter((m) => {
                    const queryWords = query.toLowerCase().split(' ');
                    const contentWords = m.content.toLowerCase();
                    return queryWords.some((word) =>
                        contentWords.includes(word),
                    );
                })
                .map((m) => ({
                    content: m.content,
                    relevance_score: Math.random() * 0.3 + 0.7, // 0.7-1.0
                    timestamp: m.timestamp,
                    type: m.type,
                    metadata: { source: m.source },
                }))
                .sort((a, b) => b.relevance_score - a.relevance_score)
                .slice(0, options?.limit || 10);
        },

        async selectContextForLLM(maxTokens) {
            const relevantMemories = memoryStore.slice(0, 5);
            return {
                content: relevantMemories.map((m) => m.content).join('\n'),
                token_count: Math.min(maxTokens, 1500),
                sources: relevantMemories.map((m) => m.source),
                relevance_scores: relevantMemories.map(
                    () => Math.random() * 0.3 + 0.7,
                ),
            };
        },

        async analyzeMemoryPatterns() {
            return {
                common_patterns: [
                    {
                        id: '1',
                        description: 'Clientes premium preferem chat',
                        frequency: 15,
                        confidence: 0.85,
                    },
                    {
                        id: '2',
                        description: 'Problemas de bateria levam a upgrades',
                        frequency: 8,
                        confidence: 0.92,
                    },
                ],
                usage_frequency: {
                    'customer-support': 25,
                    'product-issues': 15,
                    'sales-inquiries': 10,
                },
                retrieval_patterns: [
                    {
                        query_type: 'customer-problem',
                        typical_results: 6,
                        average_relevance: 0.82,
                    },
                    {
                        query_type: 'product-info',
                        typical_results: 4,
                        average_relevance: 0.78,
                    },
                ],
                optimization_suggestions: [
                    'Aumentar índice para queries de customer-support',
                    'Criar cluster específico para problemas de produto',
                    'Implementar cache para queries recorrentes',
                ],
            };
        },

        getLongTermMemory() {
            return {
                async buildKnowledgeGraph() {
                    return {
                        nodes: [
                            {
                                id: '1',
                                label: 'XYZ-123',
                                type: 'product',
                                weight: 0.9,
                                properties: {},
                            },
                            {
                                id: '2',
                                label: 'Battery Issue',
                                type: 'problem',
                                weight: 0.8,
                                properties: {},
                            },
                            {
                                id: '3',
                                label: 'Premium Customer',
                                type: 'segment',
                                weight: 0.7,
                                properties: {},
                            },
                            {
                                id: '4',
                                label: 'XYZ-456',
                                type: 'product',
                                weight: 0.85,
                                properties: {},
                            },
                        ],
                        edges: [
                            {
                                fromNode: '1',
                                toNode: '2',
                                relationship: 'has-problem',
                                weight: 0.9,
                                properties: {},
                            },
                            {
                                fromNode: '3',
                                toNode: '1',
                                relationship: 'owns',
                                weight: 0.8,
                                properties: {},
                            },
                            {
                                fromNode: '1',
                                toNode: '4',
                                relationship: 'upgrades-to',
                                weight: 0.85,
                                properties: {},
                            },
                        ],
                        clusters: [
                            {
                                id: '1',
                                name: 'Product Issues',
                                nodes: ['1', '2'],
                                centrality: 0.8,
                                cohesion: 0.75,
                            },
                            {
                                id: '2',
                                name: 'Customer Segments',
                                nodes: ['3'],
                                centrality: 0.6,
                                cohesion: 0.9,
                            },
                        ],
                        metrics: {
                            nodeCount: 4,
                            edgeCount: 3,
                            clusterCount: 2,
                            density: 0.5,
                            averageClustering: 0.75,
                            averagePathLength: 2.1,
                        },
                    };
                },

                async identifyDuplicates() {
                    return [
                        {
                            similarity: 0.85,
                            items: [
                                {
                                    id: 'tech-1',
                                    content:
                                        'XYZ-123 bateria problema conhecido 18 meses',
                                },
                                {
                                    id: 'sales-1',
                                    content:
                                        'XYZ-123 customer satisfaction 85% reclamações bateria',
                                },
                            ],
                        },
                    ];
                },

                async consolidateMemories(itemIds) {
                    return {
                        id: 'consolidated-1',
                        content:
                            'XYZ-123 tem problema conhecido de bateria após 18 meses (15% dos casos), impactando 85% customer satisfaction',
                        timestamp: Date.now(),
                        type: 'insight',
                        source: 'consolidated-knowledge',
                        importance: 'high',
                        verified: true,
                        relevanceScore: 0.95,
                        contextTags: [
                            'xyz-123',
                            'bateria',
                            'customer-satisfaction',
                            'consolidado',
                        ],
                    };
                },

                async getSemanticClusters() {
                    return [
                        {
                            name: 'Product Issues',
                            items: ['tech-1', 'tech-3'],
                            cohesion: 0.82,
                            topics: ['bateria', 'firmware', 'bugs'],
                        },
                        {
                            name: 'Customer Experience',
                            items: ['sales-1', 'sales-2'],
                            cohesion: 0.76,
                            topics: ['satisfaction', 'upsell', 'conversion'],
                        },
                    ];
                },

                async getKnowledgeMetrics() {
                    return {
                        totalConcepts: 45,
                        totalRelationships: 78,
                        knowledgeDensity: 0.672,
                        averageConfidence: 0.84,
                        coverageScore: 0.91,
                    };
                },
            } as any;
        },
    } as any;
}

// Executar demonstração
// demonstrateMemoryHierarchyPower();
