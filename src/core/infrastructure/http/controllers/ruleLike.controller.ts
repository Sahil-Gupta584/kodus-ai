import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ProgrammingLanguage } from '@/shared/domain/enums/programming-language.enum';
import { IRuleLikeService } from '@/core/domain/kodyRules/contracts/ruleLike.service.contract';
import { SetRuleLikeUseCase } from '@/core/application/use-cases/rule-like/set-rule-like.use-case';
import { CountRuleLikesUseCase } from '@/core/application/use-cases/rule-like/count-rule-likes.use-case';
import { GetTopRulesByLanguageUseCase } from '@/core/application/use-cases/rule-like/get-top-rules-by-language.use-case';
import { FindRuleLikesUseCase } from '@/core/application/use-cases/rule-like/find-rule-likes.use-case';
import { GetAllRuleLikesUseCase } from '@/core/application/use-cases/rule-like/get-all-rules-likes.use-case';
import { GetAllRulesWithLikesUseCase } from '@/core/application/use-cases/rule-like/get-all-rules-with-likes.use-case';

@Controller('rule-like')
export class RuleLikeController {
    constructor(
        private readonly setRuleLikeUseCase: SetRuleLikeUseCase,
        private readonly countRuleLikesUseCase: CountRuleLikesUseCase,
        private readonly getTopRulesByLanguageUseCase: GetTopRulesByLanguageUseCase,
        private readonly findRuleLikesUseCase: FindRuleLikesUseCase,
        private readonly getAllRuleLikesUseCase: GetAllRuleLikesUseCase,
        private readonly getAllRulesWithLikesUseCase: GetAllRulesWithLikesUseCase,
    ) {}

    @Post(':ruleId')
    async setLike(
        @Param('ruleId') ruleId: string,
        @Body('language') language: ProgrammingLanguage,
        @Body('liked') liked: boolean,
        @Body('userId') userId?: string,
    ) {
        return this.setRuleLikeUseCase.execute(ruleId, language, liked, userId);
    }

    @Get(':ruleId/count')
    async countByRule(@Param('ruleId') ruleId: string) {
        return this.countRuleLikesUseCase.execute(ruleId);
    }

    @Get('top')
    async topByLanguage(
        @Query('language') language: ProgrammingLanguage,
        @Query('limit') limit?: number,
    ) {
        return this.getTopRulesByLanguageUseCase.execute(language, limit);
    }

    @Get()
    async find(
        @Query('ruleId') ruleId?: string,
        @Query('userId') userId?: string,
        @Query('language') language?: ProgrammingLanguage,
    ) {
        const filter = {
            ...(ruleId && { ruleId }),
            ...(userId && { userId }),
            ...(language && { language }),
        };
        return this.findRuleLikesUseCase.execute(filter);
    }

    @Get('all')
    async getAllLikes() {
        return this.getAllRuleLikesUseCase.execute();
    }

    @Get('all-rules-with-likes')
    async getAllRulesWithLikes() {
        return this.getAllRulesWithLikesUseCase.execute();
    }
}
