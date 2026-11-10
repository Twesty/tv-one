export type MediaKind = 'image' | 'video';
export type MediaStatus = 'uploading' | 'ready' | 'failed';
export type DeviceStatus = 'active' | 'revoked';

export interface VenueDto {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface DeviceAssignmentDto {
  media_asset_id: string;
  revision: number;
  started_at: string;
  image_duration_ms: number;
}

export interface DeviceDto {
  id: string;
  venue_id: string;
  name: string;
  status: DeviceStatus;
  last_seen_at: string | null;
  device_assignments: DeviceAssignmentDto | null;
}

export interface MediaAssetDto {
  id: string;
  venue_id: string;
  kind: MediaKind;
  status: MediaStatus;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface PlayerMediaDto {
  id: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  url: string;
  urlExpiresAt: string;
}

export interface PlayerConfigurationDto {
  serverTime: string;
  device: {
    id: string;
    name: string;
    venueId: string;
  };
  assignment: null | {
    revision: number;
    startedAt: string;
    imageDurationMs: number;
    media: PlayerMediaDto;
  };
}
