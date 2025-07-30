import { Module } from '@nestjs/common';
import { ConversationAgentProvider } from '@/core/infrastructure/adapters/services/agent/kodus-flow/conversationAgent';
import { ConversationAgentUseCase } from '@/core/application/use-cases/agent/conversation-agent.use-case';

@Module({
    providers: [ConversationAgentProvider, ConversationAgentUseCase],
    exports: [ConversationAgentProvider, ConversationAgentUseCase],
})
export class McpAgentModule {}
