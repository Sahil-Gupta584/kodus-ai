import { IIssuesService, ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IssuesService } from '@/core/infrastructure/adapters/services/issues/issues.service';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateIssueStatusUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,
    ) {}

    async execute(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null> {
        return await this.issuesService.updateStatus(uuid, status);
    }
}