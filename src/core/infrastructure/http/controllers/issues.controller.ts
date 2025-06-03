import { GetIssuesByOrganizationUseCase } from '@/core/application/use-cases/issues/get-issues-by-organization.use-case';
import { UpdateIssueStatusUseCase } from '@/core/application/use-cases/issues/update-issues-status.use-case';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

@Controller('issues')
export class IssuesController {
    constructor(
        private readonly getIssuesByOrganizationUseCase: GetIssuesByOrganizationUseCase,
        private readonly updateIssueStatusUseCase: UpdateIssueStatusUseCase,
    ) {}

    @Get()
    async getIssues(
        @Query('organizationId') organizationId: string,
        @Query('repositoryId') repositoryId?: string,
        @Query('status') status?: 'open' | 'resolved' | 'dismissed',
        @Query('severity') severity?: 'low' | 'medium' | 'high' | 'critical',
    ): Promise<IssuesEntity[]> {
        return await this.getIssuesByOrganizationUseCase.execute({
            organizationId,
            repositoryId,
            status,
            severity,
        });
    }

    @Get(':id')
    async getIssueById(@Param('id') id: string): Promise<IssuesEntity | null> {
        return await this.getIssuesByOrganizationUseCase.getById(id);
    }

    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() body: { status: 'open' | 'resolved' | 'dismissed' },
    ): Promise<IssuesEntity | null> {
        return await this.updateIssueStatusUseCase.execute(id, body.status);
    }
}