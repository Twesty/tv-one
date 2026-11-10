import { Component, OnDestroy, ViewChild, inject, signal, type ElementRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { PlayerApiService, type PlayerConfiguration, type PlayerDevice, type PlayerVenue } from './player-api.service';
import { PlayerRealtimeService } from './player-realtime.service';

interface SavedPairing { venueId: string; deviceId: string; pairingSecret: string; }

@Component({
  selector: 'tv-root',
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  private readonly api = inject(PlayerApiService);
  private readonly realtime = inject(PlayerRealtimeService);
  readonly venues = signal<PlayerVenue[]>([]);
  readonly devices = signal<PlayerDevice[]>([]);
  readonly selectedVenueId = signal('');
  readonly selectedDeviceId = signal('');
  readonly pairingSecret = signal('');
  readonly setupRequired = signal(true);
  readonly loading = signal(true);
  readonly offline = signal(!navigator.onLine);
  readonly message = signal('Подключение к серверу…');
  readonly mediaUrl = signal('');
  readonly mediaKind = signal<'image' | 'video' | null>(null);
  readonly imageDurationMs = signal(10000);
  readonly revision = signal(0);
  readonly deviceName = signal('');
  private serverOffsetMs = 0;
  private lastStartedAt = '';
  private currentMediaId = '';
  private currentRevision = 0;
  private currentMediaPersisted = false;
  private mediaUrlExpiresAt = '';
  @ViewChild('videoElement') private videoElement?: ElementRef<HTMLVideoElement>;
  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private imageHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly cacheName = 'tv-one-media-v1';
  private readonly savedKey = 'tv-one-pairing-v1';
  private readonly onOnline = (): void => {
    this.offline.set(false);
    void this.refreshConfiguration();
  };
  private readonly onOffline = (): void => {
    this.offline.set(true);
    if (!this.mediaUrl().startsWith('blob:')) void this.loadCachedAssignment();
  };

  constructor() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    void this.initialize();
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.stopTimers();
    this.realtime.unsubscribe();
    const currentUrl = this.mediaUrl();
    if (currentUrl.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
  }

  async loadVenues(): Promise<void> {
    this.loading.set(true);
    try {
      this.venues.set(await this.api.venues());
      this.message.set('Выберите заведение и экран.');
    } catch {
      this.message.set('Не удалось загрузить список заведений. Проверьте подключение.');
    } finally {
      this.loading.set(false);
    }
  }

  async selectVenue(id: string): Promise<void> {
    this.selectedVenueId.set(id);
    this.selectedDeviceId.set('');
    this.devices.set([]);
    if (!id) return;
    try {
      this.devices.set(await this.api.devices(id));
    } catch {
      this.message.set('Не удалось загрузить список экранов.');
    }
  }

  async connect(): Promise<void> {
    const venueId = this.selectedVenueId();
    const deviceId = this.selectedDeviceId();
    const secret = this.pairingSecret().trim();
    if (!venueId || !deviceId || secret.length < 32) {
      this.message.set('Выберите заведение, экран и введите секрет привязки.');
      return;
    }

    this.loading.set(true);
    try {
      const requestStartedAt = Date.now();
      const config = await this.api.configuration(deviceId, secret);
      const responseReceivedAt = Date.now();
      const pairing: SavedPairing = { venueId, deviceId, pairingSecret: secret };
      localStorage.setItem(this.savedKey, JSON.stringify(pairing));
      this.setupRequired.set(false);
      await this.applyConfiguration(config, requestStartedAt, responseReceivedAt);
      this.startPolling();
      this.realtime.subscribe(deviceId, () => void this.refreshConfiguration());
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Не удалось привязать устройство.');
    } finally {
      this.loading.set(false);
    }
  }

  async refreshConfiguration(): Promise<void> {
    const pairing = this.readPairing();
    if (!pairing || !navigator.onLine) return;
    try {
      const requestStartedAt = Date.now();
      const config = await this.api.configuration(pairing.deviceId, pairing.pairingSecret);
      const responseReceivedAt = Date.now();
      await this.applyConfiguration(config, requestStartedAt, responseReceivedAt);
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        await this.resetPairing();
        this.message.set('Доступ устройства отозван или привязка недействительна.');
        return;
      }
      this.offline.set(true);
      this.message.set('Нет связи с сервером. Используется последняя сохранённая версия.');
      await this.loadCachedAssignment();
    }
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      this.message.set('Полноэкранный режим недоступен в этом браузере.');
    }
  }

  async resetPairing(): Promise<void> {
    localStorage.removeItem(this.savedKey);
    this.stopTimers();
    this.realtime.unsubscribe();
    this.setupRequired.set(true);
    this.mediaUrl.set('');
    this.mediaKind.set(null);
    await this.loadVenues();
  }

  onVideoMetadata(video: HTMLVideoElement): void {
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;
    if (!duration) return;
    if (!this.lastStartedAt) return;
    const elapsed = Math.max(0, Date.now() + this.serverOffsetMs - Date.parse(this.lastStartedAt));
    const expected = (elapsed / 1000) % duration;
    try { video.currentTime = expected; } catch { /* Metadata may not be seekable yet. */ }
    void video.play().catch(() => {
      this.message.set('Нажмите на экран, чтобы разрешить воспроизведение.');
    });
  }

  private async applyConfiguration(
    config: PlayerConfiguration,
    requestStartedAt: number,
    responseReceivedAt: number
  ): Promise<void> {
    this.serverOffsetMs = Date.parse(config.serverTime) - (requestStartedAt + responseReceivedAt) / 2;
    this.deviceName.set(config.device.name);

    if (!config.assignment) {
      this.currentMediaId = '';
      this.currentRevision = 0;
      this.currentMediaPersisted = false;
      this.lastStartedAt = '';
      this.mediaUrl.set('');
      this.mediaKind.set(null);
      localStorage.removeItem('tv-one-last-assignment-v1');
      this.message.set('Для этого экрана пока не назначен контент.');
      return;
    }

    const assignment = config.assignment;
    const media = assignment.media;

    // If only the schedule anchor/revision changed but the media did not,
    // keep the current source and correct the video against server time.
    if (this.currentMediaId === media.id && this.currentRevision === assignment.revision && (this.currentMediaPersisted || this.mediaUrl().startsWith('blob:'))) {
      this.lastStartedAt = assignment.startedAt;
      this.revision.set(assignment.revision);
      this.imageDurationMs.set(assignment.imageDurationMs);
      if (this.currentMediaPersisted) {
        this.saveAssignment(media.id, media.kind, assignment.startedAt, assignment.imageDurationMs, assignment.revision);
      }
      if (media.kind === 'video') this.syncVideoPosition();
      else this.scheduleImageRefresh(assignment.imageDurationMs);
      if (!this.mediaUrl().startsWith('blob:') && Date.parse(this.mediaUrlExpiresAt) < Date.now() + 120000) {
        this.mediaUrl.set(media.url);
        this.mediaUrlExpiresAt = media.urlExpiresAt;
      }
      this.message.set(this.offline() ? 'Автономное воспроизведение' : 'Воспроизведение');
      return;
    }

    let cachedBlob = await this.getCachedMedia(media.id);
    let persisted = cachedBlob !== null;

    if (!cachedBlob && navigator.onLine) {
      try {
        const response = await fetch(media.url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Media download failed.');
        const blob = await response.blob();
        if (blob.size === 0 || blob.size > 50 * 1024 * 1024) {
          throw new Error('Media file has an invalid size.');
        }
        cachedBlob = blob;
        try {
          await this.storeCachedMedia(media.id, blob, media.mimeType);
          persisted = true;
        } catch {
          // Continue online from the in-memory Blob if browser storage is full.
          persisted = false;
        }
      } catch {
        this.offline.set(true);
      }
    }

    if (cachedBlob) {
      this.setBlobMedia(cachedBlob, media.kind);
    } else if (navigator.onLine && !this.offline()) {
      // Stream directly if the complete file could not be downloaded.
      // This mode is online-only and does not replace the last offline copy.
      this.mediaUrl.set(media.url);
      this.mediaUrlExpiresAt = media.urlExpiresAt;
      this.mediaKind.set(media.kind);
    } else {
      this.message.set('Контент ещё не сохранён для автономного воспроизведения.');
      return;
    }

    this.lastStartedAt = assignment.startedAt;
    this.revision.set(assignment.revision);
    this.imageDurationMs.set(assignment.imageDurationMs);
    this.currentMediaId = media.id;
    this.currentRevision = assignment.revision;
    this.currentMediaPersisted = persisted;

    if (persisted) {
      this.saveAssignment(media.id, media.kind, assignment.startedAt, assignment.imageDurationMs, assignment.revision);
    }

    this.message.set(this.offline() ? 'Автономное воспроизведение' : 'Воспроизведение');
    if (media.kind === 'image') this.scheduleImageRefresh(assignment.imageDurationMs);
  }

  private saveAssignment(
    mediaId: string,
    kind: 'image' | 'video',
    startedAt: string,
    imageDurationMs: number,
    revision: number
  ): void {
    localStorage.setItem('tv-one-last-assignment-v1', JSON.stringify({
      mediaId,
      kind,
      startedAt,
      imageDurationMs,
      revision,
      serverOffsetMs: this.serverOffsetMs
    }));
  }

  private syncVideoPosition(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || !this.lastStartedAt) return;
    const elapsed = Math.max(0, Date.now() + this.serverOffsetMs - Date.parse(this.lastStartedAt));
    const expected = (elapsed / 1000) % video.duration;
    if (Math.abs(video.currentTime - expected) > 1.25) {
      try { video.currentTime = expected; } catch { /* A seek can be rejected while metadata is changing. */ }
    }
    if (video.paused) void video.play().catch(() => undefined);
  }

  private async initialize(): Promise<void> {
    const pairing = this.readPairing();
    if (!pairing) {
      await this.loadVenues();
      return;
    }
    this.selectedVenueId.set(pairing.venueId);
    this.selectedDeviceId.set(pairing.deviceId);
    this.pairingSecret.set(pairing.pairingSecret);
    try {
      const requestStartedAt = Date.now();
      const config = await this.api.configuration(pairing.deviceId, pairing.pairingSecret);
      const responseReceivedAt = Date.now();
      this.setupRequired.set(false);
      await this.applyConfiguration(config, requestStartedAt, responseReceivedAt);
      this.startPolling();
      this.realtime.subscribe(pairing.deviceId, () => void this.refreshConfiguration());
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        localStorage.removeItem(this.savedKey);
        this.setupRequired.set(true);
        await this.loadVenues();
      } else {
        this.offline.set(true);
        this.setupRequired.set(false);
        await this.loadCachedAssignment();
        this.startPolling();
      }
    } finally {
      this.loading.set(false);
    }
  }

  private startPolling(): void {
    if (this.refreshHandle) clearInterval(this.refreshHandle);
    this.refreshHandle = setInterval(() => void this.refreshConfiguration(), 20000);
  }

  private scheduleImageRefresh(duration: number): void {
    if (this.imageHandle) clearTimeout(this.imageHandle);
    this.imageHandle = setTimeout(() => void this.refreshConfiguration(), duration);
  }

  private stopTimers(): void {
    if (this.refreshHandle) clearInterval(this.refreshHandle);
    if (this.imageHandle) clearTimeout(this.imageHandle);
    this.refreshHandle = null;
    this.imageHandle = null;
  }

  private readPairing(): SavedPairing | null {
    try {
      const raw = localStorage.getItem(this.savedKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPairing;
      if (!parsed.venueId || !parsed.deviceId || !parsed.pairingSecret) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async storeCachedMedia(id: string, blob: Blob, mimeType: string): Promise<void> {
    const cache = await caches.open(this.cacheName);
    const key = new Request(`${location.origin}/__tv-one-cache__/${encodeURIComponent(id)}`);
    await cache.put(key, new Response(blob, { headers: { 'Content-Type': mimeType } }));
  }

  private async getCachedMedia(id: string): Promise<Blob | null> {
    try {
      const cache = await caches.open(this.cacheName);
      const response = await cache.match(
        new Request(`${location.origin}/__tv-one-cache__/${encodeURIComponent(id)}`)
      );
      return response ? await response.blob() : null;
    } catch {
      return null;
    }
  }

  private setBlobMedia(blob: Blob, kind: 'image' | 'video'): void {
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = this.mediaUrl();
    this.mediaUrl.set(nextUrl);
    this.mediaKind.set(kind);
    if (previousUrl.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
  }

  private async loadCachedAssignment(): Promise<void> {
    const raw = localStorage.getItem('tv-one-last-assignment-v1');
    if (!raw) {
      this.message.set('Нет сохранённого контента. Подключитесь к интернету для первой загрузки.');
      return;
    }
    try {
      const saved = JSON.parse(raw) as { mediaId: string; kind: 'image' | 'video'; startedAt: string; imageDurationMs: number; revision?: number; serverOffsetMs?: number };
      const blob = await this.getCachedMedia(saved.mediaId);
      if (!blob) throw new Error('Cached media missing.');
      this.setBlobMedia(blob, saved.kind);
      this.lastStartedAt = saved.startedAt;
      this.currentMediaId = saved.mediaId;
      this.currentRevision = saved.revision ?? 0;
      this.currentMediaPersisted = true;
      this.serverOffsetMs = saved.serverOffsetMs ?? 0;
      this.imageDurationMs.set(saved.imageDurationMs);
      this.message.set('Автономное воспроизведение последнего контента');
    } catch {
      this.message.set('Не удалось восстановить сохранённый контент.');
    }
  }
}
