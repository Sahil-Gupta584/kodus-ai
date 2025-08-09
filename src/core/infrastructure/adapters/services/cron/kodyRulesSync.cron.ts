import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { IIntegrationConfigService, INTEGRATION_CONFIG_SERVICE_TOKEN } from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { KodyRulesSyncService } from '../kodyRules/kody-rules-sync.service';
import { PinoLoggerService } from '../logger/pino.service';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

const API_CRON_KODY_RULES_SYNC = process.env.API_CRON_KODY_RULES_SYNC || '0 * * * *';

@Injectable()
export class KodyRulesSyncCronProvider {
  constructor(
    @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
    private readonly integrationConfigService: IIntegrationConfigService,
    private readonly codeManagementService: CodeManagementService,
    private readonly kodyRulesSyncService: KodyRulesSyncService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Cron(API_CRON_KODY_RULES_SYNC, { name: 'Kody Rules Sync', timeZone: 'America/Sao_Paulo' })
  async handleCron() {
    try {
      this.logger.log({ message: 'CRON - Kody Rules sync started', context: KodyRulesSyncCronProvider.name });

      const platforms: PlatformType[] = [
        PlatformType.GITHUB,
        PlatformType.GITLAB,
        PlatformType.BITBUCKET,
        PlatformType.AZURE_REPOS,
      ];

      for (const platform of platforms) {
        // Listar todas configs de REPOSITORIES para a plataforma
        const configs = await this.integrationConfigService.find({
          configKey: IntegrationConfigKey.REPOSITORIES,
          integration: { platform } as any,
        } as any);

        for (const cfg of configs || []) {
          const organizationAndTeamData: OrganizationAndTeamData = {
            organizationId: cfg?.team?.organization?.uuid,
            teamId: cfg?.team?.uuid,
          };

          const repos = Array.isArray(cfg?.configValue) ? cfg.configValue : [];
          for (const repo of repos) {
            await this.kodyRulesSyncService.syncRepositoryMain({
              organizationAndTeamData,
              repository: { id: String(repo.id), name: repo.name, fullName: repo.fullName, defaultBranch: repo.defaultBranch },
            });
          }
        }
      }

      this.logger.log({ message: 'CRON - Kody Rules sync finished', context: KodyRulesSyncCronProvider.name });
    } catch (error) {
      this.logger.error({ message: 'CRON - Kody Rules sync failed', context: KodyRulesSyncCronProvider.name, error });
    }
  }
}


