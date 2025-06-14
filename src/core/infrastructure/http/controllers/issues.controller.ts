import { GetIssuesByFiltersUseCase } from '@/core/application/use-cases/issues/get-issues-by-filters.use-case';
import { UpdateIssueStatusUseCase } from '@/core/application/use-cases/issues/update-issues-status.use-case';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { Body, Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { GetIssuesByFiltersDto } from '../dtos/get-issues-by-filters.dto';
import { PaginationDto } from '../dtos/pagination.dto';
import { GetTotalIssuesUseCase } from '@/core/application/use-cases/issues/get-total-issues.use-case';

@Controller('issues')
export class IssuesController {
    constructor(
        private readonly getIssuesByFiltersUseCase: GetIssuesByFiltersUseCase,
        private readonly getTotalIssuesUseCase: GetTotalIssuesUseCase,
        private readonly updateIssueStatusUseCase: UpdateIssueStatusUseCase,
    ) {}

    @Get()
    async getIssues(
        @Query() query: GetIssuesByFiltersDto,
    ) {
        return this.getIssuesByFiltersUseCase.execute(query);
    }

    @Get('count')
    async countIssues(
        @Query() query: GetIssuesByFiltersDto,
    ) {
        return await this.getTotalIssuesUseCase.execute(query);
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
