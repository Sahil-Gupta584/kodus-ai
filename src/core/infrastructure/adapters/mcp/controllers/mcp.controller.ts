import { Controller, Post, Get, Delete, Body, Headers, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { McpServerService } from '../services/mcp-server.service';
import { McpEnabledGuard } from '../guards/mcp-enabled.guard';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { PinoLoggerService } from '../../services/logger/pino.service';

@Controller('mcp')
@UseGuards(McpEnabledGuard)
export class McpController {
    constructor(
        private readonly mcpServerService: McpServerService,
        private readonly logger: PinoLoggerService,
    ) {}

    @Post()
    async handleClientRequest(
        @Body() body: any,
        @Headers('mcp-session-id') sessionId: string | undefined,
        @Res() res: Response,
    ) {
        try {
            if (sessionId && this.mcpServerService.hasSession(sessionId)) {
                // Reuse existing session
                await this.mcpServerService.handleRequest(sessionId, body, res);
            } else if (!sessionId && isInitializeRequest(body)) {
                // New initialization request
                const newSessionId = await this.mcpServerService.createSession();
                await this.mcpServerService.handleRequest(newSessionId, body, res);
            } else {
                // Invalid request
                res.status(HttpStatus.BAD_REQUEST).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                });
            }
        } catch (error) {
            this.logger.error({
                message: 'Error handling MCP request',
                context: McpController.name,
                error: error,
                metadata: { sessionId, body },
            });
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal error',
                },
                id: null,
            });
        }
    }

    @Get()
    async handleServerNotifications(
        @Headers('mcp-session-id') sessionId: string | undefined,
        @Res() res: Response,
    ) {
        if (!sessionId || !this.mcpServerService.hasSession(sessionId)) {
            res.status(HttpStatus.BAD_REQUEST).send('Invalid or missing session ID');
            return;
        }

        await this.mcpServerService.handleServerNotifications(sessionId, res);
    }

    @Delete()
    async handleSessionTermination(
        @Headers('mcp-session-id') sessionId: string | undefined,
        @Res() res: Response,
    ) {
        if (!sessionId || !this.mcpServerService.hasSession(sessionId)) {
            res.status(HttpStatus.BAD_REQUEST).send('Invalid or missing session ID');
            return;
        }

        await this.mcpServerService.terminateSession(sessionId, res);
    }
}

