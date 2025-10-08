import {
    Inject,
    Injectable,
    UnauthorizedException,
    InternalServerErrorException,
} from '@nestjs/common';
import {
    AUTH_SERVICE_TOKEN,
    IAuthService,
} from '@/core/domain/auth/contracts/auth.service.contracts';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { STATUS } from '@/config/types/database/status.type';
import { sendConfirmationEmail } from '@/shared/utils/email/sendMail';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';

interface DecodedPayload {
    readonly email: string;
}

@Injectable()
export class ResendEmailUseCase {
    constructor(
        @Inject(AUTH_SERVICE_TOKEN)
        private readonly authService: IAuthService,
        @Inject(USER_SERVICE_TOKEN)
        private readonly usersService: IUsersService,
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(email: string): Promise<{ message: string }> {
        try {
            const user = await this.usersService.findOne({
                email,
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            const token = await this.authService.createEmailToken(
                user.uuid,
                user.email,
            );

            await sendConfirmationEmail(
                token,
                user.email,
                user.organization.name,
                {
                    organizationId: user.organization.uuid,
                },
            );

            return { message: 'Email sent successfully' };
        } catch (error) {
            this.logger.error({
                message: 'Something went wrong while confirming email',
                context: ResendEmailUseCase.name,
                error,
            });
            throw new InternalServerErrorException(
                'Something went wrong while resending email',
            );
        }
    }
}
