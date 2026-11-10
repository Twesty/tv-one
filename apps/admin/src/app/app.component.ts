import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './core/auth.service';
import { ApiService, Device, MediaAsset, Venue } from './core/api.service';

@Component({
  selector: 'tv-root',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './app.component.html'
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  readonly venues = signal<Venue[]>([]);
  readonly selectedVenueId = signal('');
  readonly devices = signal<Device[]>([]);
  readonly media = signal<MediaAsset[]>([]);
  readonly section = signal<'overview' | 'devices' | 'media'>('overview');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly pairingSecret = signal('');

  email = '';
  password = '';
  venueName = '';
  venueDescription = '';
  deviceName = '';

  readonly selectedVenue = computed(
    () => this.venues().find((venue) => venue.id === this.selectedVenueId()) ?? null
  );

  constructor() {
    void this.loadVenues();
  }

  async signIn(): Promise<void> {
    this.run(async () => {
      await this.auth.signIn(this.email, this.password);
      await this.loadVenues();
    });
  }

  async signOut(): Promise<void> {
    this.run(() => this.auth.signOut());
  }

  async loadVenues(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    this.run(async () => {
      const items = await this.api.venues();
      this.venues.set(items);
      if (!this.selectedVenueId() && items.length) {
        this.selectedVenueId.set(items[0].id);
        await this.loadVenueData(items[0].id);
      } else if (this.selectedVenueId()) {
        await this.loadVenueData(this.selectedVenueId());
      }
    });
  }

  async selectVenue(id: string): Promise<void> {
    this.selectedVenueId.set(id);
    this.pairingSecret.set('');
    await this.loadVenueData(id);
  }

  async createVenue(): Promise<void> {
    if (!this.venueName.trim()) return;
    this.run(async () => {
      const venue = await this.api.createVenue({
        name: this.venueName.trim(),
        description: this.venueDescription.trim() || undefined
      });
      this.venueName = '';
      this.venueDescription = '';
      this.venues.update((items) => [venue, ...items]);
      this.selectedVenueId.set(venue.id);
      await this.loadVenueData(venue.id);
      this.notice.set('Заведение создано.');
    });
  }

  async createDevice(): Promise<void> {
    const venueId = this.selectedVenueId();
    if (!venueId || !this.deviceName.trim()) return;
    this.run(async () => {
      const device = await this.api.createDevice(venueId, this.deviceName.trim());
      this.deviceName = '';
      this.pairingSecret.set(device.pairingSecret);
      await this.loadVenueData(venueId);
      this.section.set('devices');
      this.notice.set('Устройство создано. Сохраните секрет привязки — повторно он не отображается.');
    });
  }

  async revokeDevice(device: Device): Promise<void> {
    const venueId = this.selectedVenueId();
    if (!venueId || !window.confirm(`Отозвать доступ устройства «${device.name}»?`)) return;
    this.run(async () => {
      await this.api.revokeDevice(venueId, device.id);
      await this.loadVenueData(venueId);
      this.notice.set('Доступ устройства отозван.');
    });
  }

  async uploadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const venueId = this.selectedVenueId();
    if (!file || !venueId) return;
    if (file.size > 50 * 1024 * 1024) {
      this.error.set('Максимальный размер файла — 50 MiB.');
      input.value = '';
      return;
    }
    this.run(async () => {
      await this.api.uploadMedia(venueId, file);
      await this.loadVenueData(venueId);
      this.notice.set('Файл загружен.');
      input.value = '';
    });
  }

  async copySecret(): Promise<void> {
    const secret = this.pairingSecret();
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    this.notice.set('Секрет скопирован.');
  }

  private async loadVenueData(venueId: string): Promise<void> {
    const [devices, media] = await Promise.all([
      this.api.devices(venueId),
      this.api.media(venueId)
    ]);
    this.devices.set(devices);
    this.media.set(media);
  }

  private run(action: () => Promise<unknown>): void {
    this.busy.set(true);
    this.error.set('');
    void action()
      .catch((error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Произошла неизвестная ошибка.');
      })
      .finally(() => this.busy.set(false));
  }
}
