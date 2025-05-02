import { Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Response, Request } from 'express';
import { PinoLoggerService } from '../../adapters/services/logger/pino.service';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { ReceiveWebhookUseCase } from '@/core/application/use-cases/platformIntegration/codeManagement/receiveWebhook.use-case';
import { validateWebhookToken } from '@/shared/utils/webhooks/webhookTokenCrypto';
import { createHash } from 'crypto';
import { CacheService } from '@/shared/utils/cache/cache.service';

@Controller('azure-repos')
export class AzureReposController {
    constructor(
        private readonly receiveWebhookUseCase: ReceiveWebhookUseCase,
        private logger: PinoLoggerService,
        private cacheService: CacheService,
    ) {}

    @Post('/webhook')
    async handleWebhook(@Req() req: Request, @Res() res: Response) {
        try {
            const encrypted = req.query.token as string;

            if (!validateWebhookToken(encrypted)) {
                this.logger.error({
                    message: 'Webhook Azure DevOps Not Token Valid',
                    context: AzureReposController.name,
                });
                return res.status(403).send('Unauthorized');
            }

            const payload = req.body as any;
            const eventType = payload?.eventType as string;

            if (!eventType) {
                this.logger.log({
                    message: 'Webhook Azure DevOps recebido sem eventType',
                    context: AzureReposController.name,
                    metadata: { payload },
                });
                return res
                    .status(HttpStatus.BAD_REQUEST)
                    .send('Evento não reconhecido');
            }

            // Verificar duplicação
            const isDuplicate = await this.isDuplicateRequest(payload, req);
            if (isDuplicate) {
                return res
                    .status(HttpStatus.OK)
                    .send('Webhook already processed');
            }

            // Executa o processamento de forma assíncrona após enviar a resposta
            res.status(HttpStatus.OK).send('Webhook received');

            setImmediate(() => {
                this.logger.log({
                    message: `Webhook received, ${eventType}`,
                    context: AzureReposController.name,
                    metadata: {
                        event: eventType,
                        repositoryName: payload?.resource?.repository?.name,
                        pullRequestId: payload?.resource?.pullRequestId,
                        projectId: payload?.resourceContainers?.project?.id,
                    },
                });

                this.receiveWebhookUseCase.execute({
                    payload,
                    event: eventType,
                    platformType: PlatformType.AZURE_REPOS,
                });
            });
        } catch (error) {
            this.logger.error({
                message: 'Error processing webhook',
                context: AzureReposController.name,
                error: error,
            });

            // Garante que a resposta é enviada mesmo em caso de erro
            if (!res.headersSent) {
                return res.status(HttpStatus.OK).send('Webhook received');
            }
        }
    }

    private async isDuplicateRequest(
        payload: any,
        req: Request,
    ): Promise<boolean> {
        const prId = payload?.resource?.pullRequestId;
        const eventType = payload?.eventType;

        if (!prId || !eventType) return false;

        // Usar o payload completo para comparação
        const payloadHash = createHash('md5')
            .update(
                JSON.stringify({
                    prId,
                    eventType,
                    createdDate: payload?.createdDate,
                    id: payload?.id,
                }),
            )
            .digest('hex');

        // Chave de cache única baseada no conteúdo
        const cacheKey = `azure_webhook:${prId}:${payloadHash}`;

        const exists = await this.cacheService.cacheExists(cacheKey);
        if (exists) {
            this.logger.warn({
                message: `Requisição duplicada detectada`,
                context: AzureReposController.name,
                metadata: { prId, eventType, payloadHash },
            });
            return true;
        }

        await this.cacheService.addToCache(cacheKey, true, 60000); // 1 minuto
        return false;
    }
}
