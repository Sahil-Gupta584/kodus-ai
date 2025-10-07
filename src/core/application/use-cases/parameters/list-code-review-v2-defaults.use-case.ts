import { Injectable } from '@nestjs/common';
import { getV2DefaultsText } from '@/shared/utils/codeReview/v2Defaults';

@Injectable()
export class ListCodeReviewV2DefaultsUseCase {
    execute() {
        // Returns string-only defaults, ready for UI textareas
        return getV2DefaultsText();
    }
}

