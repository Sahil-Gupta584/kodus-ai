import { GetIssuesByFiltersUseCase } from '@/core/application/use-cases/issues/get-issues-by-filters.use-case';
import { UpdateIssueStatusUseCase } from '@/core/application/use-cases/issues/update-issues-status.use-case';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { GetIssuesByFiltersDto } from '../dtos/get-issues-by-filters.dto';
import { PaginationDto } from '../dtos/pagination.dto';

@Controller('issues')
export class IssuesController {
    constructor(
        private readonly getIssuesByFiltersUseCase: GetIssuesByFiltersUseCase,
        private readonly updateIssueStatusUseCase: UpdateIssueStatusUseCase,
    ) {}

    @Get('issues')
    async getIssues(
        @Query() query: GetIssuesByFiltersDto,
        @Query() options: PaginationDto,
    ) {
        return this.getIssuesByFiltersUseCase.execute(query, options);
    }

    // @Get(':id')
    // async getIssueById(@Param('id') id: string): Promise<IssuesEntity | null> {
    //     return await this.\\.getById(id);
    // }

    // @Patch(':id/status')
    // async updateStatus(
    //     @Param('id') id: string,
    //     @Body() body: { status: 'open' | 'resolved' | 'dismissed' },
    // ): Promise<IssuesEntity | null> {
    //     return await this.updateIssueStatusUseCase.execute(id, body.status);
    // }
}
