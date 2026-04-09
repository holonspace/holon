import { HTTPException } from 'hono/http-exception'

// ─── 4xx Client Errors ────────────────────────────────────────────────────────

export class BadRequestException extends HTTPException {
  constructor(message = 'Bad Request') {
    super(400, { message })
  }
}

export class UnauthorizedException extends HTTPException {
  constructor(message = 'Unauthorized') {
    super(401, { message })
  }
}

export class ForbiddenException extends HTTPException {
  constructor(message = 'Forbidden') {
    super(403, { message })
  }
}

export class NotFoundException extends HTTPException {
  constructor(message = 'Not Found') {
    super(404, { message })
  }
}

export class ConflictException extends HTTPException {
  constructor(message = 'Conflict') {
    super(409, { message })
  }
}

export class UnprocessableEntityException extends HTTPException {
  constructor(message = 'Unprocessable Entity') {
    super(422, { message })
  }
}

// ─── 5xx Server Errors ────────────────────────────────────────────────────────

export class InternalServerErrorException extends HTTPException {
  constructor(message = 'Internal Server Error') {
    super(500, { message })
  }
}
