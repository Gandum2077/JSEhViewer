interface AppError {
  code: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
  details?: string;
  stack?: string;
}

class NotFoundError extends Error implements AppError {
  code: string;
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.code = 'NOT_FOUND';
    this.details = details;
    this.stack = new Error().stack;
  }
}

class ValidationError extends Error implements AppError {
  code: string;
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.code = 'VALIDATION_ERROR';
    this.details = details;
    this.stack = new Error().stack;
  }
}

class InternalError extends Error implements AppError {
  code: string;
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.code = 'INTERNAL_ERROR';
    this.details = details;
    this.stack = new Error().stack;
  }
}

function findUser(userId: string) {
  // 假设我们在这里查找用户
  const user = null; // 模拟没有找到用户的情况

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  return user;
}

function validateUserData(userData: any) {
  // 假设我们在这里验证用户数据
  const isValid = false; // 模拟验证失败的情况

  if (!isValid) {
    throw new ValidationError('User data validation failed.');
  }
}

try {
  const user = findUser('123');
  validateUserData(user);
} catch (error: any) {
  if (error instanceof NotFoundError) {
    console.error('Resource not found:', error.message);
    // 处理未找到错误的逻辑
  } else if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
    // 处理验证错误的逻辑
  } else if (error instanceof InternalError) {
    console.error('Internal server error:', error.message);
    // 处理内部服务器错误的逻辑
  } else {
    console.error('Unknown error:', error.message);
    // 处理未知错误的逻辑
  }
}
