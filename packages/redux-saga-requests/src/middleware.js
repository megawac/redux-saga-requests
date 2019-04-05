import { GET_REQUEST_CACHE, CLEAR_REQUESTS_CACHE } from './constants';
import {
  success,
  isRequestAction,
  isSuccessAction,
  isResponseAction,
  getRequestActionFromResponse,
  getActionPayload,
} from './actions';

const shouldActionBePromisified = (action, auto) =>
  (auto && !(action.meta && action.meta.asPromise === false)) ||
  (action.meta && action.meta.asPromise);

export const requestsPromiseMiddleware = ({ auto = false } = {}) => {
  const requestMap = new Map();

  return () => next => action => {
    if (isRequestAction(action) && shouldActionBePromisified(action, auto)) {
      return new Promise((resolve, reject) => {
        requestMap.set(action, (response, error) =>
          error ? reject(response) : resolve(response),
        );

        next(action);
      });
    }

    if (isResponseAction(action)) {
      const requestAction = getRequestActionFromResponse(action);

      if (shouldActionBePromisified(requestAction, auto)) {
        const requestActionPromise = requestMap.get(requestAction);
        requestActionPromise(
          action,
          action.type !== success(requestAction.type),
        );
        requestMap.delete(requestAction);
      }
    }

    return next(action);
  };
};

const isCacheValid = cache =>
  cache.expiring === null || Date.now() <= cache.expiring;

const getNewCacheTimeout = cache =>
  cache === true ? null : cache * 1000 + Date.now();

export const requestsCacheMiddleware = () => {
  const cacheMap = new Map();

  return () => next => action => {
    if (action.type === GET_REQUEST_CACHE) {
      return cacheMap;
    }

    if (action.type === CLEAR_REQUESTS_CACHE) {
      if (action.actionTypes.length === 0) {
        cacheMap.clear();
      } else {
        action.actionTypes.forEach(actionType => cacheMap.delete(actionType));
      }

      return null;
    }

    if (
      isRequestAction(action) &&
      cacheMap.get(action.type) &&
      isCacheValid(cacheMap.get(action.type))
    ) {
      return next({
        ...action,
        meta: {
          ...action.meta,
          cacheResponse: cacheMap.get(action.type).response,
        },
      });
    }

    if (
      isSuccessAction(action) &&
      action.meta &&
      action.meta.cache &&
      !action.meta.cacheResponse
    ) {
      cacheMap.set(getRequestActionFromResponse(action).type, {
        response: getActionPayload(action).response,
        expiring: getNewCacheTimeout(action.meta.cache),
      });
    }

    return next(action);
  };
};
