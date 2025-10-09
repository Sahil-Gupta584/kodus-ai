import { IssueStatus } from '@/config/types/general/issues.type';
import { ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { ORGANIZATION_SERVICE_TOKEN } from '@/core/domain/organization/contracts/organization.service.contract';
import { IssuesService } from '@/core/infrastructure/adapters/services/issues/issues.service';
import { OrganizationService } from '@/core/infrastructure/adapters/services/organization.service';
import { CreateIssueManuallyDto } from '@/core/infrastructure/http/dtos/create-issue-manually.dto';
import {
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

type User = {
    uuid: string;
    organization: { uuid: string };
};

@Injectable({ scope: Scope.REQUEST })
export class CreateIssueManuallyUseCase {
    constructor(
        @Inject(ORGANIZATION_SERVICE_TOKEN)
        private readonly organizationService: OrganizationService,

        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IssuesService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: User;
        },
    ) {}

    async execute(dto: CreateIssueManuallyDto): Promise<IssuesEntity> {
        const user = this.request.user;
        const organizationId = dto.organizationId || user?.organization?.uuid;
        const org = await this.organizationService.findOne({
            uuid: organizationId,
        });

        if (!org) {
            throw new NotFoundException('api.organizations.not_found');
        }

        const isUserBelongsToOrg = org.user?.find((u) => u?.uuid === user?.uuid);
        if (!isUserBelongsToOrg)
            throw new ForbiddenException('Invalid permission');

        const issue: IIssue = {
            title: dto.title,
            description: dto.description,
            filePath: dto.filePath,
            language: dto.language,
            label: dto.label,
            severity: dto.severity,
            organizationId,
            repository: dto.repository,
            owner: dto.owner,
            status: IssueStatus.OPEN,
            reporter: dto.reporter,
            contributingSuggestions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        return await this.issuesService.create(issue);
    }
}
