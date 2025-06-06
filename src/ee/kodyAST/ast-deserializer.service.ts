import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    NodeType as SerializedNodeType,
    EnrichGraph as SerializedEnrichGraph,
    RelationshipType as SerializedRelationshipType,
} from '@kodus/kodus-proto/v2';
import { Injectable } from '@nestjs/common';
import {
    EnrichGraph,
    NodeType,
    RelationshipType,
} from './code-analyzer.service';
import { CodeGraph } from '../codeBase/ast/types/types';

@Injectable()
export class ASTDeserializerService {
    constructor(private readonly logger: PinoLoggerService) {}

    deserializeEnrichedGraph(serialized: SerializedEnrichGraph): EnrichGraph {
        const nodes = serialized.nodes.map((node) => ({
            ...node,
            type: this.deserializeNodeType(node.type),
        }));

        const relationships = serialized.relationships.map((relationship) => ({
            ...relationship,
            type: this.deserializeRelationshipType(relationship.type),
        }));

        return {
            nodes,
            relationships,
        };
    }

    private deserializeNodeType(serializedType: SerializedNodeType): NodeType {
        switch (serializedType) {
            case SerializedNodeType.NODE_TYPE_CLASS:
                return NodeType.CLASS;
            case SerializedNodeType.NODE_TYPE_FUNCTION:
                return NodeType.FUNCTION;
            case SerializedNodeType.NODE_TYPE_INTERFACE:
                return NodeType.INTERFACE;
            case SerializedNodeType.NODE_TYPE_METHOD:
                return NodeType.METHOD;
            default:
                this.logger.error({
                    message: 'Unknown node type',
                    context: ASTDeserializerService.name,
                    metadata: {
                        serializedType,
                    },
                    serviceName: ASTDeserializerService.name,
                });
                throw new Error(`Unknown node type: ${serializedType}`);
        }
    }

    private deserializeRelationshipType(
        serializedType: SerializedRelationshipType,
    ): RelationshipType {
        switch (serializedType) {
            case SerializedRelationshipType.RELATIONSHIP_TYPE_CALLS:
                return RelationshipType.CALLS;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION:
                return RelationshipType.CALLS_IMPLEMENTATION;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_HAS_METHOD:
                return RelationshipType.HAS_METHOD;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_IMPORTS:
                return RelationshipType.IMPORTS;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_IMPLEMENTS:
                return RelationshipType.IMPLEMENTS;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_IMPLEMENTED_BY:
                return RelationshipType.IMPLEMENTED_BY;
            case SerializedRelationshipType.RELATIONSHIP_TYPE_EXTENDS:
                return RelationshipType.EXTENDS;
            default:
                this.logger.error({
                    message: 'Unknown relationship type',
                    context: ASTDeserializerService.name,
                    metadata: {
                        serializedType,
                    },
                    serviceName: ASTDeserializerService.name,
                });
                throw new Error(`Unknown relationship type: ${serializedType}`);
        }
    }
}
