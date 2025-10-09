import { InteractionModel, InteractionSchema } from './interaction.model';

import { LogModel, LogSchema } from './log.model';
import {
    CodeReviewFeedbackModel,
    CodeReviewFeedbackSchema,
} from './codeReviewFeedback.model';
import {
    CodeReviewSettingsLogModel,
    CodeReviewSettingsLogSchema,
} from './codeReviewSettingsLog.model';
import {
    PullRequestMessagesModel,
    PullRequestMessagesSchema,
} from './pullRequestMessages.model';

export const LogModelInstance = {
    name: LogModel.name,
    schema: LogSchema,
};

export const CodeReviewFeedbackModelInstance = {
    name: CodeReviewFeedbackModel.name,
    schema: CodeReviewFeedbackSchema,
};

export const CodeReviewSettingsLogModelInstance = {
    name: CodeReviewSettingsLogModel.name,
    schema: CodeReviewSettingsLogSchema,
};

export const InteractionModelInstance = {
    name: InteractionModel.name,
    schema: InteractionSchema,
};

export const PullRequestMessagesModelInstance = {
    name: PullRequestMessagesModel.name,
    schema: PullRequestMessagesSchema,
};
