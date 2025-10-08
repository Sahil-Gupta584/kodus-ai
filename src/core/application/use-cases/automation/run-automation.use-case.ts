import { Inject, Injectable } from '@nestjs/common';
import {
    AUTOMATION_SERVICE_TOKEN,
    IAutomationService,
} from '@/core/domain/automation/contracts/automation.service';
import {
    TEAM_AUTOMATION_SERVICE_TOKEN,
    ITeamAutomationService,
} from '@/core/domain/automation/contracts/team-automation.service';
import { AutomationType } from '@/core/domain/automation/enums/automation-type';
import {
    EXECUTE_AUTOMATION_SERVICE_TOKEN,
    IExecuteAutomationService,
} from '@/shared/domain/contracts/execute.automation.service.contracts';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

@Injectable()
export class RunAutomationUseCase {
    constructor(
        @Inject(AUTOMATION_SERVICE_TOKEN)
        private readonly automationService: IAutomationService,

        @Inject(TEAM_AUTOMATION_SERVICE_TOKEN)
        private readonly teamAutomationService: ITeamAutomationService,

        @Inject(EXECUTE_AUTOMATION_SERVICE_TOKEN)
        private readonly executeAutomation: IExecuteAutomationService,

        private logger: PinoLoggerService,
    ) {}

    async execute(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        automationName: AutomationType;
        channelId?: string;
        origin: string;
    }) {
        try {
            const automation = (
                await this.automationService.find({
                    automationType: params.automationName,
                })
            )[0];

            if (!automation) {
                this.logger.warn({
                    message: 'No automation found',
                    context: RunAutomationUseCase.name,
                    metadata: {
                        automationName: params.automationName,
                    },
                });
                throw new Error('No automation found');
            }

            const teamAutomations = await this.teamAutomationService.find({
                automation: { uuid: automation.uuid },
                status: true,
                team: { uuid: params.organizationAndTeamData.teamId },
            });

            if (!teamAutomations) {
                this.logger.warn({
                    message: 'No team automation found',
                    context: RunAutomationUseCase.name,
                    metadata: {
                        automation: automation.uuid,
                        teamId: params.automationName,
                    },
                });
                new Error('No active team automation found');
            }

            for (const teamAutomation of teamAutomations) {
                return await this.executeAutomation.executeStrategy(
                    params.automationName,
                    {
                        organizationAndTeamData: params.organizationAndTeamData,
                        teamAutomationId: teamAutomation.uuid,
                        channelId: params.channelId,
                        origin: params.origin,
                        team: teamAutomation?.team,
                    },
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Error executing weekly progress automation',
                context: RunAutomationUseCase.name,
                error: error,
                metadata: {
                    automationName: params.automationName,
                    teamId: params.organizationAndTeamData.teamId,
                    channelId: params.channelId,
                },
            });
        }
    }
}
