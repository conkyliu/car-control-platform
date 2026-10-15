import { http, ApiError } from './client.ts';
import {
  type GeofenceDto,
  type GeofenceStatus,
  type GeofenceFilterQuery,
  filterGeofences,
  isApiError,
  SEED_GEOFENCES,
} from '../views/telemetry/geofence-core.ts';

export type GeofenceQueryParams = GeofenceFilterQuery;

export type CreateGeofenceInput = Omit<GeofenceDto, 'id' | 'createdAt' | 'updatedAt' | 'boundVehicleCount'> & {
  boundVehicleCount?: number;
};

export type UpdateGeofenceInput = Partial<CreateGeofenceInput>;

// In-memory geofence state pool for offline fallback and simulation
let inMemoryGeofences: GeofenceDto[] = JSON.parse(JSON.stringify(SEED_GEOFENCES));

export function getInMemoryGeofences(): GeofenceDto[] {
  return inMemoryGeofences;
}

export function setInMemoryGeofences(list: GeofenceDto[]): void {
  inMemoryGeofences = list;
}

export function resetInMemoryGeofences(): void {
  inMemoryGeofences = JSON.parse(JSON.stringify(SEED_GEOFENCES));
}

/**
 * Fetch list of geofences with query filtering.
 */
export async function fetchGeofencesApi(params?: GeofenceQueryParams): Promise<GeofenceDto[]> {
  try {
    const res = await http.get<GeofenceDto[]>('/geofences', { params });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // Offline fallback
  const filtered = filterGeofences(inMemoryGeofences, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * Fetch single geofence details by ID.
 */
export async function fetchGeofenceDetailApi(id: string): Promise<GeofenceDto> {
  try {
    const res = await http.get<GeofenceDto>(`/geofences/${encodeURIComponent(id)}`);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const found = inMemoryGeofences.find((g) => g.id === id);
  if (!found) {
    throw new ApiError(`未找到 ID 为 [${id}] 的电子围栏`, 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * Create a new geofence.
 */
export async function createGeofenceApi(data: CreateGeofenceInput): Promise<GeofenceDto> {
  try {
    const res = await http.post<GeofenceDto>('/geofences', { data });
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString();
  const created: GeofenceDto = {
    ...data,
    id: `gf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    boundVehicleCount: data.boundVehicleCount ?? (data.vehicleIds ? data.vehicleIds.length : 0),
    createdAt: now,
    updatedAt: now,
  };

  inMemoryGeofences = [created, ...inMemoryGeofences];
  return JSON.parse(JSON.stringify(created));
}

/**
 * Update an existing geofence.
 */
export async function updateGeofenceApi(id: string, data: UpdateGeofenceInput): Promise<GeofenceDto> {
  try {
    const res = await http.put<GeofenceDto>(`/geofences/${encodeURIComponent(id)}`, { data });
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryGeofences.findIndex((g) => g.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的电子围栏进行更新`, 404);
  }

  const updated: GeofenceDto = {
    ...inMemoryGeofences[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (data.vehicleIds) {
    updated.boundVehicleCount = data.vehicleIds.length;
  }

  inMemoryGeofences[index] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * Toggle geofence active/disabled status.
 */
export async function toggleGeofenceStatusApi(id: string, status: GeofenceStatus): Promise<GeofenceDto> {
  try {
    const res = await http.patch<GeofenceDto>(`/geofences/${encodeURIComponent(id)}/status`, {
      data: { status },
    });
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryGeofences.findIndex((g) => g.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的电子围栏`, 404);
  }

  inMemoryGeofences[index] = {
    ...inMemoryGeofences[index],
    status,
    updatedAt: new Date().toISOString(),
  };

  return JSON.parse(JSON.stringify(inMemoryGeofences[index]));
}

/**
 * Delete a geofence by ID.
 */
export async function deleteGeofenceApi(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await http.delete<{ success: boolean; message: string }>(
      `/geofences/${encodeURIComponent(id)}`
    );
    if (res && res.success !== undefined) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const index = inMemoryGeofences.findIndex((g) => g.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的电子围栏进行删除`, 404);
  }

  inMemoryGeofences.splice(index, 1);
  return { success: true, message: '电子围栏删除成功' };
}
