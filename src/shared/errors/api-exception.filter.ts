import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { DomainError, DomainErrorKind } from './domain-error.js';
import {
  ValidationFailedError,
  ValidationIssue,
} from './validation-failed.error.js';

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  invalid_input: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rule_violation: HttpStatus.UNPROCESSABLE_ENTITY,
  locked: HttpStatus.LOCKED,
  precondition_required: HttpStatus.PRECONDITION_REQUIRED,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
};

/** Framework messages echo request details back, so fixed texts are used. */
const FRAMEWORK_ERRORS: ReadonlyMap<number, { code: string; message: string }> =
  new Map([
    [
      HttpStatus.BAD_REQUEST,
      { code: 'VALIDATION_FAILED', message: 'Invalid request' },
    ],
    [
      HttpStatus.UNAUTHORIZED,
      { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    ],
    [HttpStatus.NOT_FOUND, { code: 'NOT_FOUND', message: 'Not found' }],
    [
      HttpStatus.PAYLOAD_TOO_LARGE,
      { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    ],
    [
      HttpStatus.TOO_MANY_REQUESTS,
      { code: 'RATE_LIMITED', message: 'Too many requests' },
    ],
    [
      HttpStatus.SERVICE_UNAVAILABLE,
      { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
    ],
  ]);

interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ValidationIssue[];
  };
}

interface MappedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ValidationIssue[];
}

const INTERNAL_ERROR: MappedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL',
  message: 'Internal error',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const mapped = mapException(exception);
    if (mapped === INTERNAL_ERROR) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    const body: ApiErrorBody = {
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: typeof request.id === 'string' ? request.id : 'unknown',
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
      },
    };
    response.status(mapped.status).json(body);
  }
}

/** Errors from Express middleware such as body-parser, built with http-errors. */
function isExposedHttpError(
  exception: unknown,
): exception is { status: number; expose: true } {
  return (
    exception instanceof Error &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    'expose' in exception &&
    exception.expose === true
  );
}

function findHttpStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  return isExposedHttpError(exception) ? exception.status : undefined;
}

function mapException(exception: unknown): MappedError {
  if (exception instanceof DomainError) {
    return {
      status: STATUS_BY_KIND[exception.kind],
      code: exception.code,
      message: exception.message,
      ...(exception instanceof ValidationFailedError
        ? { details: exception.details }
        : {}),
    };
  }
  const status = findHttpStatus(exception);
  const known = status === undefined ? undefined : FRAMEWORK_ERRORS.get(status);
  return status === undefined || known === undefined
    ? INTERNAL_ERROR
    : { status, ...known };
}
