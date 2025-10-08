import { Body, Controller, Post } from '@nestjs/common';
import { ConversationAgentUseCase } from '@/core/application/use-cases/agent/conversation-agent.use-case';
import { OrganizationAndTeamDataDto } from '../dtos/organizationAndTeamData.dto';
import { createThreadId } from '@kodus/flow';

@Controller('agent')
export class AgentController {
    constructor(
        private readonly conversationAgentUseCase: ConversationAgentUseCase,
    ) {}

    @Post('/conversation')
    public async conversation(
        @Body()
        body: {
            prompt: string;
            organizationAndTeamData: OrganizationAndTeamDataDto;
        },
    ) {
        const thread = createThreadId(
            {
                organizationId: body.organizationAndTeamData.organizationId,
                teamId: body.organizationAndTeamData.teamId,
            },
            {
                prefix: 'cmc', // Code Management Chat
            },
        );
        return this.conversationAgentUseCase.execute({ ...body, thread });
    }
}
