// @ts-nocheck
import {
  ResponseError,
  ToResponseErrorOptions,
  ErrorType,
} from './interface';
import {
  // DEFAULT_RESPONSEERROR,
  CONNECT_LOCK_DEFAULT_TIMEOUT,
} from './constant';
import AsyncLock from 'async-lock';

export const lock: AsyncLock = new AsyncLock({
  timeout: CONNECT_LOCK_DEFAULT_TIMEOUT,
});

/**
 * 转换ResponseError格式
 * @param { ResponseError | Error} err
 * @param { string } uri uri格式标注来源
 * @param { string } details 错误详情
 * @return { ResponseError }
 */
export function buildResponseError(
  err: ResponseError | Error,
  uri: string = 'unkonw',
  details: string = 'unknown',
): ResponseError {
  let opts: ToResponseErrorOptions = null;
  if (err instanceof Error) {
    opts = {
      error_uri: '/sync-msg/' + uri || null,
      details,
    };
  } else if (err == null) {
    return {
      error: ErrorType.LOCAL,
      error_description: 'err is null',
      error_uri: 'null',
      details: 'null',
    };
  } else {
    err.error_uri = err.error_uri || '/sync-msg/' + uri;
  }
  return toResponseError(err, opts);
}

/**
 * @description 转ResponseError。
 *
 * @param {ResponseError | Error | any} error
 * @param {ToResponseErrorOptions} options
 * @return {ResponseError}
 */
export const toResponseError = (
  error: ResponseError | Error | any,
  options?: ToResponseErrorOptions,
): ResponseError => {
  let responseError: ResponseError;
  const formatOptions: ToResponseErrorOptions = options || {};
  if (error instanceof Error) {
    responseError = {
      error: formatOptions.error || ErrorType.LOCAL,
      error_description: formatOptions.error_description || error.message,
      error_uri: formatOptions.error_uri,
      details: formatOptions.details || error.stack,
    };
  } else {
    const formatError: ToResponseErrorOptions = error || {};
    responseError = {
      error: formatOptions.error || formatError.error || ErrorType.LOCAL,
      error_code:
        typeof formatOptions.error_code == 'number'
          ? formatOptions.error_code
          : formatError.error_code,
      error_description:
        formatOptions.error_description || formatError.error_description,
      error_uri: formatOptions.error_uri || formatError.error_uri,
      details: formatOptions.details || formatError.details,
    };
  }
  return responseError;
};
