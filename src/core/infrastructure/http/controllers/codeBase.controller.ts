import {
    AST_ANALYSIS_SERVICE_TOKEN,
    IASTAnalysisService,
} from '@/core/domain/codeBase/contracts/ASTAnalysisService.contract';
import {
    Controller,
    Post,
    Body,
    StreamableFile,
    Res,
    Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { writeFileSync, createReadStream, unlink } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return [...value.entries()];
    }
    return value;
}
@Controller('code-base')
export class CodeBaseController {
    constructor(
        @Inject(AST_ANALYSIS_SERVICE_TOKEN)
        private readonly codeASTAnalysisService: IASTAnalysisService,
    ) {}

    @Post('analyze-dependencies')
    async analyzeDependencies(
        @Body() body: { headDir: string; baseDir: string },
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const result = await this.codeASTAnalysisService.cloneAndGenerate(
            {
                id: '929108425',
                name: 'testing-repo',
                full_name: 'kodustech/testing-repo',
            },
            {
                number: '15',
                head: {
                    ref: 'manim',
                },
                base: {
                    ref: 'manim',
                },
            },
            'github',
            {
                organizationId: '27aa99ae-d31e-4584-887e-1dc271274064',
                teamId: 'b951e67e-ba20-4d0e-9d04-26d7c17a3237',
            },
        );
        // Converte o resultado para JSON
        const jsonString = JSON.stringify(result, replacer);

        // Gera um caminho de arquivo temporário
        const tempFilePath = join(__dirname, `temp-${uuidv4()}.json`);
        writeFileSync(tempFilePath, jsonString);

        // Define os cabeçalhos para a resposta
        res.set({
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="dependencies.json"',
        });

        // Cria um stream de leitura do arquivo temporário
        const fileStream = createReadStream(tempFilePath);

        // Após o stream ser fechado, deleta o arquivo temporário
        fileStream.on('close', () => {
            unlink(tempFilePath, (err) => {
                if (err) {
                    console.error('Erro ao deletar arquivo temporário:', err);
                }
            });
        });

        return new StreamableFile(fileStream);
    }
}
