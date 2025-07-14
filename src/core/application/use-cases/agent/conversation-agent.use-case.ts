import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Injectable } from '@nestjs/common';
import { ConversationAgentProvider } from '@/core/infrastructure/adapters/services/agent/agents/conversationAgent';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

@Injectable()
export class ConversationAgentUseCase implements IUseCase {
    constructor(
        private readonly conversationAgentProvider: ConversationAgentProvider,
    ) {}

    async execute(request: {
        prompt: string;
        organizationAndTeamData?: OrganizationAndTeamData;
    }): Promise<any> {
        try {
            const { prompt, organizationAndTeamData } = request;

            // Usar o método flexível do provider
            let result: {
                response: string;
                reasoning: string;
                agentType: string;
                timestamp: string;
                toolUsed?: string;
                toolResult?: unknown;
            };

            result = await this.conversationAgentProvider.execute(
                prompt,
                organizationAndTeamData,
            );

            return result;
        } catch (error) {
            console.error('Erro no use-case de conversação:', error);
            throw new Error(`Falha ao processar conversação: ${error.message}`);
        }
    }
}
