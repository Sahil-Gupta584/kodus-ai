import { FileChangeContext, ReviewModeResponse, AnalysisContext, AIAnalysisResult } from "@/config/types/general/codeReview.type";
import { OrganizationAndTeamData } from "@/config/types/general/organizationAndTeamData";
import { IKodyRule } from "../../kodyRules/interfaces/kodyRules.interface";

export interface KodyRulesAnalysisService {
    analyzeCodeWithAI(
        organizationAndTeamData: OrganizationAndTeamData,
        prNumber: number,
        fileContext: FileChangeContext,
        reviewModeResponse: ReviewModeResponse,
        context: AnalysisContext,
        suggestions?: AIAnalysisResult,
    ): Promise<AIAnalysisResult>;
    addSeverityToSuggestions(
        suggestions: AIAnalysisResult,
        kodyRules: Array<Partial<IKodyRule>>,
    ): AIAnalysisResult
}