import { GetIssuesByFiltersUseCase } from '@/core/application/use-cases/issues/get-issues-by-filters.use-case';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { GetIssuesByFiltersDto } from '../dtos/get-issues-by-filters.dto';
import { GetTotalIssuesUseCase } from '@/core/application/use-cases/issues/get-total-issues.use-case';
import { GetIssueByIdUseCase } from '@/core/application/use-cases/issues/get-issue-by-id.use-case';
import { UpdateIssuePropertyUseCase } from '@/core/application/use-cases/issues/update-issue-property.use-case';
import { GetIssuesUseCase } from '@/core/application/use-cases/issues/get-issues.use-case';
import { CreateIssueManuallyDto } from '../dtos/create-issue-manually.dto';
import { CreateIssueManuallyUseCase } from '@/core/application/use-cases/issues/create-issue-manually.use-case';

@Controller('issues')
export class IssuesController {
    constructor(
        private readonly getIssuesByFiltersUseCase: GetIssuesByFiltersUseCase,
        private readonly getIssuesUseCase: GetIssuesUseCase,
        private readonly getTotalIssuesUseCase: GetTotalIssuesUseCase,
        private readonly getIssueByIdUseCase: GetIssueByIdUseCase,
        private readonly updateIssuePropertyUseCase: UpdateIssuePropertyUseCase,
        private readonly createIssueManuallyUseCase: CreateIssueManuallyUseCase,
    ) {}

    @Get()
    async getIssues(@Query() query: GetIssuesByFiltersDto) {
        return this.getIssuesUseCase.execute(query);
    }

    @Get('filters')
    async getIssuesByFilters(@Query() query: GetIssuesByFiltersDto) {
        return this.getIssuesByFiltersUseCase.execute(query);
    }

    @Get('count')
    async countIssues(@Query() query: GetIssuesByFiltersDto) {
        return await this.getTotalIssuesUseCase.execute(query);
    }

    @Get(':id')
    async getIssueById(@Param('id') id: string) {
        return await this.getIssueByIdUseCase.execute(id);
    }

    @Patch(':id')
    async updateIssueProperty(
        @Param('id') id: string,
        @Body() body: { field: 'severity' | 'label' | 'status'; value: string },
    ): Promise<IssuesEntity | null> {
        return await this.updateIssuePropertyUseCase.execute(
            id,
            body.field,
            body.value,
        );
    }

    @Post()
    async createIssue(@Body() body: CreateIssueManuallyDto) {
        return this.createIssueManuallyUseCase.execute(body)
    }
}
