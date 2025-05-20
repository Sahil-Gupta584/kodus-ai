import {
    AUTH_SERVICE_TOKEN,
    IAuthService,
} from '@/core/domain/auth/contracts/auth.service.contracts';
import { sendForgotPasswordEmail } from '@/shared/utils/email/sendMail';
import {
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';

@Injectable()
export class ForgotPasswordUseCase {
    constructor(
        @Inject(AUTH_SERVICE_TOKEN)
        private readonly authService: IAuthService,
    ) {}

    async execute(email: string) {
        try {

            const user = await this.authService.validateUser({ email });
            if (!user) {
                throw new NotFoundException('User Not found.');
            }
            const token = await this.authService.createForgotPassToken(
                user.uuid,
                email,
            );
            const sendForgotPasswordEmailRes = await sendForgotPasswordEmail(
                user,
                token,
            );
            return { message: 'Reset link sent.' };
        } catch (error) {
            throw new InternalServerErrorException();
        }
    }
}
