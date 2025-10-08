import { Module, forwardRef } from '@nestjs/common';
import { ConversationAgentProvider } from '@/core/infrastructure/adapters/services/agent/kodus-flow/conversationAgent';
import { ConversationAgentUseCase } from '@/core/application/use-cases/agent/conversation-agent.use-case';
import { BusinessRulesValidationAgentProvider } from '@/core/infrastructure/adapters/services/agent/kodus-flow/businessRulesValidationAgent';
import { BusinessRulesValidationAgentUseCase } from '@/core/application/use-cases/agent/business-rules-validation-agent.use-case';
import { ParametersModule } from './parameters.module';
import { McpModule } from '@/core/infrastructure/adapters/mcp/mcp.module';
import { PermissionValidationModule } from '@/ee/shared/permission-validation.module';

@Module({
    imports: [
        forwardRef(() => ParametersModule),
        McpModule.forRoot(),
        PermissionValidationModule,
    ],
    providers: [
        ConversationAgentProvider,
        ConversationAgentUseCase,
        BusinessRulesValidationAgentProvider,
        BusinessRulesValidationAgentUseCase,
    ],
    exports: [
        ConversationAgentProvider,
        ConversationAgentUseCase,
        BusinessRulesValidationAgentProvider,
        BusinessRulesValidationAgentUseCase,
    ],
})
export class McpAgentModule {}
