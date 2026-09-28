import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/** Maps every status code to a stable error name for the `{ error, message }` shape. */
const ERROR_NAMES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'ValidationError',
  [HttpStatus.NOT_FOUND]: 'NotFound',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TooManyRequests',
  [HttpStatus.BAD_GATEWAY]: 'UpstreamError',
  [HttpStatus.GATEWAY_TIMEOUT]: 'UpstreamTimeout',
};

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

/**
 * Single global filter that maps every thrown exception to the API's
 * `{ error, message }` contract, so controllers can throw standard NestJS
 * exceptions without repeating error formatting.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        error: ERROR_NAMES[status] ?? exception.name.replace(/Exception$/, ''),
        message: extractMessage(exception),
      });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    });
  }
}

function extractMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as NestErrorBody).message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? exception.message;
}
