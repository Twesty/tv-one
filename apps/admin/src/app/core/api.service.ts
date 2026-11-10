import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TV_ONE_CONFIG } from './runtime-config';

export interface Venue {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  venue_id: string;
  name: string;
  status: 'active' | 'revoked';
  last_seen_at: string | null;
  device_assignments: Array<{
    media_asset_id: string;
    revision: number;
    started_at: string;
    image_duration_ms: number;
  }> | null;
}

export interface MediaAsset {
  id: string;
  venue_id: string;
  kind: 'image' | 'video';
  status: 'uploading' | 'ready' | 'failed';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(TV_ONE_CONFIG);
  private readonly baseUrl = this.config.apiBaseUrl;

  async venues(): Promise<Venue[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: Venue[] }>(`${this.baseUrl}/api/admin/venues`)
    );
    return response.data;
  }

  async createVenue(payload: { name: string; description?: string }): Promise<Venue> {
    const response = await firstValueFrom(
      this.http.post<{ data: Venue }>(`${this.baseUrl}/api/admin/venues`, payload)
    );
    return response.data;
  }

  async devices(venueId: string): Promise<Device[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: Device[] }>(
        `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/devices`
      )
    );
    return response.data;
  }

  async createDevice(venueId: string, name: string): Promise<{ id: string; name: string; pairingSecret: string }> {
    const response = await firstValueFrom(
      this.http.post<{ data: { id: string; name: string; pairingSecret: string } }>(
        `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/devices`,
        { name }
      )
    );
    return response.data;
  }

  async renameDevice(venueId: string, deviceId: string, name: string): Promise<void> {
    await firstValueFrom(this.http.patch(
      `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/devices/${encodeURIComponent(deviceId)}`,
      { name }
    ));
  }

  async revokeDevice(venueId: string, deviceId: string): Promise<void> {
    await firstValueFrom(this.http.delete(
      `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/devices/${encodeURIComponent(deviceId)}`
    ));
  }

  async media(venueId: string): Promise<MediaAsset[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: MediaAsset[] }>(
        `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/media`
      )
    );
    return response.data;
  }

  async assignMediaToDevices(
    venueId: string,
    deviceIds: string[],
    mediaAssetId: string,
    imageDurationMs = 10000
  ): Promise<void> {
    await firstValueFrom(this.http.put(
      `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/assignments`,
      { deviceIds, mediaAssetId, imageDurationMs }
    ));
  }

  async deleteMedia(venueId: string, mediaId: string): Promise<void> {
    await firstValueFrom(this.http.delete(
      `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/media/${encodeURIComponent(mediaId)}`
    ));
  }

  async uploadMedia(venueId: string, file: File): Promise<MediaAsset> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await firstValueFrom(
      this.http.post<{ data: MediaAsset }>(
        `${this.baseUrl}/api/admin/venues/${encodeURIComponent(venueId)}/media`,
        formData
      )
    );
    return response.data;
  }
}
