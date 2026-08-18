import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { AppConfig } from '../../config/app-config.js';
import { REDACT_PATHS } from './redact-paths.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Request ids are always generated here: a client-supplied id would let
 * anyone write arbitrary strings into the logs.
 */
function generateRequestId(
  _request: IncomingMessage,
  response: ServerResponse,
): string {
  const id = randomUUID();
  response.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Only the method and path are logged: no headers, query, body or IP. */
function serializeRequest(request: IncomingMessage & { id?: unknown }): object {
  return {
    id: request.id,
    method: request.method,
    path: request.url?.split('?', 1)[0],
  };
}

function serializeResponse(response: ServerResponse): object {
  return { statusCode: response.statusCode };
}

export function buildHttpLoggerOptions(config: AppConfig): Options {
  return {
    level: config.logLevel,
    redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
    genReqId: generateRequestId,
    serializers: { req: serializeRequest, res: serializeResponse },
    customLogLevel: (_request, response, error) =>
      error !== undefined || response.statusCode >= 500 ? 'error' : 'info',
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: buildHttpLoggerOptions(config),
      }),
    }),
  ],
})
export class LoggingModule {}
