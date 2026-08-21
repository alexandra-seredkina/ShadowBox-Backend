import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { DomainError } from './domain-error.js';

class AliasLimitExceededError extends DomainError {
  readonly code = 'ALIAS_LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';
}

const REQUEST_ID = '0b5c8a52-6f1e-4b8e-9d2a-5c1f0e3d7a90';

function createHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: REQUEST_ID }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ApiExceptionFilter', () => {
  const logger = { setContext: vi.fn(), error: vi.fn() };
  let filter: ApiExceptionFilter;

  beforeEach(() => {
    logger.error.mockReset();
    filter = new ApiExceptionFilter(logger as unknown as PinoLogger);
  });

  it('maps a domain error by its kind and keeps its code', () => {
    const { host, status, json } = createHost();

    filter.catch(new AliasLimitExceededError('Alias limit reached'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'ALIAS_LIMIT_EXCEEDED',
        message: 'Alias limit reached',
        requestId: REQUEST_ID,
      },
    });
  });

  it('maps a framework 404 to NOT_FOUND', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('Cannot GET /nope'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'NOT_FOUND' }),
      }),
    );
  });

  it('hides unknown errors behind INTERNAL and logs them', () => {
    const { host, status, json } = createHost();
    const failure = new Error('relation "account" does not exist');

    filter.catch(failure, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL',
        message: 'Internal error',
        requestId: REQUEST_ID,
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: failure },
      'Unhandled exception',
    );
  });

  it('maps a body-parser size error to PAYLOAD_TOO_LARGE', () => {
    const { host, status, json } = createHost();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });

    filter.catch(tooLarge, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }),
      }),
    );
  });

  it('does not trust a status on errors that are not marked exposable', () => {
    const { host, status } = createHost();
    const internal = Object.assign(new Error('db failure'), { status: 404 });

    filter.catch(internal, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('treats an http status without an API code as internal', () => {
    const { host, status } = createHost();

    filter.catch(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
