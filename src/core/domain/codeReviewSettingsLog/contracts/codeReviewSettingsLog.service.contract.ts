import { CodeReviewSettingsLogEntity } from '../entities/codeReviewSettingsLog.entity';
import { ICodeReviewSettingsLog } from '../interfaces/codeReviewSettingsLog.interface';

export const CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN = Symbol(
    'CodeReviewSettingsLogService',
);

export interface ICodeReviewSettingsLogService {
    create(
        codeReviewSettingsLog: CodeReviewSettingsLogEntity,
    ): Promise<CodeReviewSettingsLogEntity>;

    bulkCreate(
        codeReviewSettingsLog: CodeReviewSettingsLogEntity[],
    ): Promise<CodeReviewSettingsLogEntity[]>;

    find(
        filter?: Partial<ICodeReviewSettingsLog>,
    ): Promise<CodeReviewSettingsLogEntity[]>;
}
