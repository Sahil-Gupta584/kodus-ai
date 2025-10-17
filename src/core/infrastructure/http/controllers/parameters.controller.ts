import { CreateOrUpdateParametersUseCase } from '@/core/application/use-cases/parameters/create-or-update-use-case';
import { FindByKeyParametersUseCase } from '@/core/application/use-cases/parameters/find-by-key-use-case';
import { ListCodeReviewAutomationLabelsUseCase } from '@/core/application/use-cases/parameters/list-code-review-automation-labels-use-case';
import { ListCodeReviewV2DefaultsUseCase } from '@/core/application/use-cases/parameters/list-code-review-v2-defaults.use-case';
import { UpdateCodeReviewParameterRepositoriesUseCase } from '@/core/application/use-cases/parameters/update-code-review-parameter-repositories-use-case';
import { UpdateOrCreateCodeReviewParameterUseCase } from '@/core/application/use-cases/parameters/update-or-create-code-review-parameter-use-case';

import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import {
    Body,
    Controller,
    Get,
    Inject,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ListCodeReviewAutomationLabelsWithStatusUseCase } from '@/core/application/use-cases/parameters/list-code-review-automation-labels-with-status.use-case';

import { CreateOrUpdateCodeReviewParameterDto } from '../dtos/create-or-update-code-review-parameter.dto';
import { GenerateKodusConfigFileUseCase } from '@/core/application/use-cases/parameters/generate-kodus-config-file.use-case';
import { CopyCodeReviewParameterDTO } from '../dtos/copy-code-review-parameter.dto';
import { CopyCodeReviewParameterUseCase } from '@/core/application/use-cases/parameters/copy-code-review-parameter.use-case';
import { DeleteRepositoryCodeReviewParameterDto } from '../dtos/delete-repository-code-review-parameter.dto';
import { DeleteRepositoryCodeReviewParameterUseCase } from '@/core/application/use-cases/parameters/delete-repository-code-review-parameter.use-case';
import { PreviewPrSummaryDto } from '../dtos/preview-pr-summary.dto';
import { PreviewPrSummaryUseCase } from '@/core/application/use-cases/parameters/preview-pr-summary.use-case';
import { CodeReviewVersion } from '@/config/types/general/codeReview.type';
import {
    CheckPolicies,
    PolicyGuard,
} from '../../adapters/services/permissions/policy.guard';
import {
    checkPermissions,
    checkRepoPermissions,
} from '../../adapters/services/permissions/policy.handlers';
import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { MigrateCodeReviewParametersUseCase } from '@/core/application/use-cases/parameters/migrate-code-review-parameters.use-case'; // TODO: Remove once all orgs have migrated
import { GetDefaultConfigUseCase } from '@/core/application/use-cases/parameters/get-default-config.use-case';
import { GetCodeReviewParameterUseCase } from '@/core/application/use-cases/parameters/get-code-review-parameter.use-case';
import { REQUEST } from '@nestjs/core';
import { UserRequest } from '@/config/types/http/user-request.type';
import { UpdateOrCreateIssuesParameterBodyDto } from '../dtos/create-or-update-issues-parameter.dto';
import { UpdateOrCreateIssuesParameterUseCase } from '@/core/application/use-cases/parameters/update-or-create-issues-parameter-use-case';

@Controller('parameters')
export class ParametersController {
    constructor(
        @Inject(REQUEST)
        private readonly request: UserRequest,

        private readonly createOrUpdateParametersUseCase: CreateOrUpdateParametersUseCase,
        private readonly findByKeyParametersUseCase: FindByKeyParametersUseCase,
        private readonly updateOrCreateCodeReviewParameterUseCase: UpdateOrCreateCodeReviewParameterUseCase,
        private readonly updateOrCreateIssuesParameterUseCase: UpdateOrCreateIssuesParameterUseCase,
        private readonly updateCodeReviewParameterRepositoriesUseCase: UpdateCodeReviewParameterRepositoriesUseCase,
        private readonly generateKodusConfigFileUseCase: GenerateKodusConfigFileUseCase,
        private readonly copyCodeReviewParameterUseCase: CopyCodeReviewParameterUseCase,
        private readonly deleteRepositoryCodeReviewParameterUseCase: DeleteRepositoryCodeReviewParameterUseCase,
        private readonly previewPrSummaryUseCase: PreviewPrSummaryUseCase,
        private readonly listCodeReviewV2DefaultsUseCase: ListCodeReviewV2DefaultsUseCase,
        private readonly listCodeReviewAutomationLabelsWithStatusUseCase: ListCodeReviewAutomationLabelsWithStatusUseCase,
        private readonly getDefaultConfigUseCase: GetDefaultConfigUseCase,
        private readonly getCodeReviewParameterUseCase: GetCodeReviewParameterUseCase,
        private readonly migrateCodeReviewParametersUseCase: MigrateCodeReviewParametersUseCase, // TODO: Remove once all orgs have migrated
    ) {}

    //#region Parameters
    @Post('/create-or-update')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Create, ResourceType.CodeReviewSettings),
    )
    public async createOrUpdate(
        @Body()
        body: {
            key: ParametersKey;
            configValue: any;
            organizationAndTeamData: { organizationId: string; teamId: string };
        },
    ) {
        return await this.createOrUpdateParametersUseCase.execute(
            body.key,
            body.configValue,
            body.organizationAndTeamData,
        );
    }

    @Get('/find-by-key')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async findByKey(
        @Query('key') key: ParametersKey,
        @Query('teamId') teamId: string,
    ) {
        return await this.findByKeyParametersUseCase.execute(key, { teamId });
    }

    @Get('/list-all')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async listAll() {}

    //endregion
    //#region Code review routes

    @Get('/list-code-review-automation-labels')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async listCodeReviewAutomationLabels(
        @Query('codeReviewVersion') codeReviewVersion?: CodeReviewVersion,
        @Query('teamId') teamId?: string,
        @Query('repositoryId') repositoryId?: string,
    ) {
        return this.listCodeReviewAutomationLabelsWithStatusUseCase.execute({
            codeReviewVersion,
            teamId,
            repositoryId,
        });
    }

    @Get('/list-code-review-v2-defaults')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async listCodeReviewV2Defaults() {
        return this.listCodeReviewV2DefaultsUseCase.execute();
    }

    @Post('/create-or-update-code-review')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Create, ResourceType.CodeReviewSettings),
    )
    public async updateOrCreateCodeReviewParameter(
        @Body()
        body: CreateOrUpdateCodeReviewParameterDto,
    ) {
        return await this.updateOrCreateCodeReviewParameterUseCase.execute(
            body,
        );
    }

    @Post('/update-code-review-parameter-repositories')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Create, ResourceType.CodeReviewSettings),
    )
    public async UpdateCodeReviewParameterRepositories(
        @Body()
        body: {
            organizationAndTeamData: { organizationId: string; teamId: string };
        },
    ) {
        return await this.updateCodeReviewParameterRepositoriesUseCase.execute(
            body,
        );
    }

    @Get('/code-review-parameter')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async getCodeReviewParameter(@Query('teamId') teamId: string) {
        return await this.getCodeReviewParameterUseCase.execute(
            this.request.user,
            teamId,
        );
    }

    @Get('/default-code-review-parameter')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async getDefaultConfig() {
        return await this.getDefaultConfigUseCase.execute();
    }

    @Get('/generate-kodus-config-file')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async GenerateKodusConfigFile(
        @Res() response: Response,
        @Query('teamId') teamId: string,
        @Query('repositoryId') repositoryId?: string,
        @Query('directoryId') directoryId?: string,
    ) {
        const { yamlString } =
            await this.generateKodusConfigFileUseCase.execute(
                teamId,
                repositoryId,
                directoryId,
            );

        response.set({
            'Content-Type': 'application/x-yaml',
            'Content-Disposition': 'attachment; filename=kodus-config.yml',
        });

        return response.send(yamlString);
    }

    @Post('/copy-code-review-parameter')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkRepoPermissions(Action.Read, ResourceType.CodeReviewSettings, {
            key: {
                body: 'sourceRepositoryId',
            },
        }),
        checkRepoPermissions(Action.Create, ResourceType.CodeReviewSettings, {
            key: {
                body: 'targetRepositoryId',
            },
        }),
    )
    public async copyCodeReviewParameter(
        @Body()
        body: CopyCodeReviewParameterDTO,
    ) {
        return this.copyCodeReviewParameterUseCase.execute(body);
    }

    @Post('/delete-repository-code-review-parameter')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkRepoPermissions(Action.Delete, ResourceType.CodeReviewSettings, {
            key: {
                body: 'repositoryId',
            },
        }),
    )
    public async deleteRepositoryCodeReviewParameter(
        @Body()
        body: DeleteRepositoryCodeReviewParameterDto,
    ) {
        return this.deleteRepositoryCodeReviewParameterUseCase.execute(body);
    }
    //#endregion

    @Post('/preview-pr-summary')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Read, ResourceType.CodeReviewSettings),
    )
    public async previewPrSummary(
        @Body()
        body: PreviewPrSummaryDto,
    ) {
        return this.previewPrSummaryUseCase.execute(body);
    }

    // TODO: Remove once all orgs have migrated
    @Post('/migrate-code-review-parameters')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Manage, ResourceType.CodeReviewSettings),
    )
    public async migrateCodeReviewParameters() {
        return this.migrateCodeReviewParametersUseCase.execute();
    }

    @Post('/create-or-update-issues-config')
    @UseGuards(PolicyGuard)
    @CheckPolicies(checkPermissions(Action.Create, ResourceType.Issues))
    public async updateOrCreateIssuesParameter(
        @Body()
        body: UpdateOrCreateIssuesParameterBodyDto,
    ) {
        return await this.updateOrCreateIssuesParameterUseCase.execute(body);
    }
}
