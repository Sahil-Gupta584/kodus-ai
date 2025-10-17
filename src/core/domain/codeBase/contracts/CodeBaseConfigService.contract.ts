import {
    CodeReviewConfig,
    FileChange,
    KodusConfigFile,
} from '@/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

export const CODE_BASE_CONFIG_SERVICE_TOKEN = Symbol('CodeBaseConfigService');

export interface ICodeBaseConfigService {
    getConfig(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
        preliminaryFiles?: FileChange[],
    ): Promise<CodeReviewConfig>;

    getCodeManagementAuthenticationPlatform(
        organizationAndTeamData: OrganizationAndTeamData,
    );
    getCodeManagementPatConfigAndRepositories(
        organizationAndTeamData: OrganizationAndTeamData,
    );
    getCodeManagementConfigAndRepositories(
        organizationAndTeamData: OrganizationAndTeamData,
    );

    getDirectoryIdForPath(
        organizationAndTeamData: OrganizationAndTeamData,
        repository: { name: string; id: string },
        affectedPath: string,
    ): Promise<string | undefined>;

    getKodusConfigFile(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        overrideConfig?: boolean;
        directoryPath?: string;
        defaultBranch?: string;
    }): Promise<KodusConfigFile | undefined>;
}
