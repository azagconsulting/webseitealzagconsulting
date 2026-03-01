import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  override catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    switch (exception.code) {
      case 'P2002': {
        const fields = exception.meta?.target;
        throw new ConflictException(
          `Unique constraint failed on: ${String(fields)}`,
        );
      }
      case 'P2025': {
        throw new NotFoundException(
          exception.meta?.cause ?? 'Record not found',
        );
      }
      default: {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          code: exception.code,
        });
      }
    }
  }
}
