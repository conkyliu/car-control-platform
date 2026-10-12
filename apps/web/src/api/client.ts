import { useAuthStore } from '../store/useAuthStore.ts';
import { useTenantStore } from '../store/useTenantStore.ts';

export class ApiError extends Error {
  public statusCode: number;
  public error?: string;
  public details?: any;

  constructor(message: string, statusCode: number, error?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  params?: Record<string, any>;
  data?: any;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipTenant?: boolean;
  _retry?: boolean;
}

export type FetchFunction = typeof fetch;

export class HttpClient {
  private baseUrl: string;
  private fetchFn: FetchFunction;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string = '/api/v1', customFetch?: FetchFunction) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchFn = customFetch || ((...args: Parameters<FetchFunction>) => globalThis.fetch(...args));
  }

  private buildUrl(url: string, params?: Record<string, any>): string {
    const isAbsolute = /^https?:\/\//i.test(url);
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    const fullPath = isAbsolute ? url : `${this.baseUrl}${normalizedUrl}`;

    if (!params || Object.keys(params).length === 0) {
      return fullPath;
    }

    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          val.forEach((item) => query.append(key, String(item)));
        } else {
          query.append(key, String(val));
        }
      }
    }

    const queryString = query.toString();
    if (!queryString) {
      return fullPath;
    }

    const separator = fullPath.includes('?') ? '&' : '?';
    return `${fullPath}${separator}${queryString}`;
  }

  private async parseResponseBody(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 204) {
      return null;
    }

    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    try {
      const text = await response.text();
      return text ? { message: text } : null;
    } catch {
      return null;
    }
  }

  private async executeTokenRefresh(refreshToken: string): Promise<string | null> {
    try {
      const refreshUrl = `${this.baseUrl}/auth/refresh`;
      const response = await this.fetchFn(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const errorBody = await this.parseResponseBody(response);
        throw new ApiError(
          errorBody?.message || 'Token refresh failed',
          response.status,
          errorBody?.error || 'Unauthorized',
          errorBody
        );
      }

      const data = await response.json();
      const newAccessToken = data.accessToken;
      const newRefreshToken = data.refreshToken || refreshToken;

      if (!newAccessToken) {
        throw new ApiError('Missing access token in refresh response', 500);
      }

      useAuthStore.getState().setTokens({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });

      if (data.user) {
        useAuthStore.getState().setUser(data.user);
      }

      return newAccessToken;
    } catch (err) {
      useAuthStore.getState().clearAuth();
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'session_expired' } }));
      }
      throw err;
    }
  }

  public async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const targetUrl = this.buildUrl(url, options.params);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (!options.skipAuth) {
      const token = useAuthStore.getState().accessToken;
      if (token && !headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    if (!options.skipTenant) {
      const tenantId = useTenantStore.getState().currentTenantId;
      if (tenantId && !headers['x-tenant-id'] && !headers['X-Tenant-Id']) {
        headers['x-tenant-id'] = tenantId;
      }
    }

    let requestBody: any = options.body;
    if (options.data !== undefined) {
      if (typeof FormData !== 'undefined' && options.data instanceof FormData) {
        delete headers['Content-Type'];
        requestBody = options.data;
      } else if (typeof options.data === 'string') {
        requestBody = options.data;
      } else {
        requestBody = JSON.stringify(options.data);
      }
    }

    const { params, data, skipAuth, skipTenant, _retry, ...fetchInit } = options;

    const response = await this.fetchFn(targetUrl, {
      ...fetchInit,
      headers,
      body: requestBody,
    });

    if (response.status === 401) {
      const isRefreshRequest = targetUrl.includes('/auth/refresh');
      const refreshToken = useAuthStore.getState().refreshToken;

      if (!isRefreshRequest && !_retry && refreshToken) {
        if (!this.refreshPromise) {
          this.refreshPromise = this.executeTokenRefresh(refreshToken).finally(() => {
            this.refreshPromise = null;
          });
        }

        try {
          const freshToken = await this.refreshPromise;
          if (freshToken) {
            return await this.request<T>(url, {
              ...options,
              _retry: true,
              headers: {
                ...options.headers,
                Authorization: `Bearer ${freshToken}`,
              },
            });
          }
        } catch (refreshErr) {
          throw refreshErr instanceof ApiError
            ? refreshErr
            : new ApiError('Session expired. Please log in again.', 401, 'Unauthorized');
        }
      }

      useAuthStore.getState().clearAuth();

      const errBody = await this.parseResponseBody(response);
      throw new ApiError(
        errBody?.message || 'Unauthorized',
        401,
        errBody?.error || 'Unauthorized',
        errBody
      );
    }

    const parsedData = await this.parseResponseBody(response);

    if (!response.ok) {
      const statusCode = response.status;
      const message = parsedData?.message || `Request failed with status ${statusCode}`;
      const error = parsedData?.error;
      throw new ApiError(message, statusCode, error, parsedData);
    }

    return parsedData as T;
  }

  public get<T>(url: string, params?: Record<string, any>, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET', params });
  }

  public post<T>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', data });
  }

  public put<T>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PUT', data });
  }

  public patch<T>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'PATCH', data });
  }

  public delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

export const http = new HttpClient();
