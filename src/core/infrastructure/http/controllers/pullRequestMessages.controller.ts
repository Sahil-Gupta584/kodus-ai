import { CreateOrUpdatePullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/create-or-update-pull-request-messages.use-case';
import { FindByRepositoryIdPullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/find-by-repository-id.use-case';
import { FindByIdPullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/find-by-id.use-case';
import { FindByDirectoryIdPullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/find-by-directory-id.use-case';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserRequest } from '@/config/types/http/user-request.type';
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
import { FindByRepositoryOrDirectoryIdPullRequestMessagesUseCase } from '@/core/application/use-cases/pullRequestMessages/find-by-repo-or-directory.use-case';

@Controller('pull-request-messages')
export class PullRequestMessagesController {
    constructor(
        private readonly createOrUpdatePullRequestMessagesUseCase: CreateOrUpdatePullRequestMessagesUseCase,
        private readonly findByIdPullRequestMessagesUseCase: FindByIdPullRequestMessagesUseCase,
        private readonly findByRepositoryOrDirectoryIdPullRequestMessagesUseCase: FindByRepositoryOrDirectoryIdPullRequestMessagesUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Post('/')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions(Action.Create, ResourceType.CodeReviewSettings),
    )
    public async createOrUpdatePullRequestMessages(
        @Body() body: IPullRequestMessages,
    ) {
        return await this.createOrUpdatePullRequestMessagesUseCase.execute(
            this.request.user,
            body,
        );
    }

    @Get('/find-by-repository-or-directory')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkRepoPermissions(Action.Read, ResourceType.CodeReviewSettings, {
            key: {
                query: 'repositoryId',
            },
        }),
    )
    public async findByRepoOrDirectoryId(
        @Query('organizationId') organizationId: string,
        @Query('repositoryId') repositoryId: string,
        @Query('directoryId') directoryId?: string,
    ) {
        return await this.findByRepositoryOrDirectoryIdPullRequestMessagesUseCase.execute(
            organizationId,
            repositoryId,
            directoryId,
        );
    }

    @Get('/:id')
    public async findById(@Param('id') id: string) {
        return await this.findByIdPullRequestMessagesUseCase.execute(id);
    }
}
