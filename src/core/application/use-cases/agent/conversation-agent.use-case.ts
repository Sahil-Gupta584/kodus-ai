import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { Thread } from '@kodus/flow';
import { ConversationAgentProvider } from '@/core/infrastructure/adapters/services/agent/kodus-flow/conversationAgent';

@Injectable()
export class ConversationAgentUseCase implements IUseCase {
    constructor(
        private readonly conversationAgentProvider: ConversationAgentProvider,
    ) {}

    async execute(request: {
        prompt: string;
        organizationAndTeamData?: OrganizationAndTeamData;
        thread?: Thread;
        prepareContext?: any;
    }): Promise<any> {
        try {
            const { prompt, organizationAndTeamData, prepareContext, thread } =
                request;

            // Usar o método flexível do provider
            let result: {
                response: string;
                timestamp: string;
            };

            result = await this.conversationAgentProvider.execute(prompt, {
                organizationAndTeamData,
                prepareContext,
                thread,
            });

            return result;
        } catch (error) {
            console.error('Erro no use-case de conversação:', error);
            throw new Error(`Falha ao processar conversação: ${error.message}`);
        }
    }
}
