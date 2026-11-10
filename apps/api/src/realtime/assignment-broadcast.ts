import { supabaseAdmin } from '../config/supabase.js';

// Device topics contain only UUIDs and the broadcast payload contains no
// credentials or media URLs. Players still re-fetch the authoritative config.
export async function publishAssignmentUpdates(deviceIds: string[]): Promise<void> {
  await Promise.all(deviceIds.map(async (deviceId) => {
    const channel = supabaseAdmin.channel(`device:${deviceId}`, {
      config: { broadcast: { ack: true } }
    });
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'assignment-updated',
        payload: { deviceId }
      });
      if (result !== 'ok') {
        console.warn('TV One Realtime broadcast was not acknowledged.', { deviceId, result });
      }
    } catch (error) {
      // Database state is authoritative; polling is the fallback if Realtime is unavailable.
      console.warn('TV One Realtime broadcast failed.', { deviceId, error });
    } finally {
      await supabaseAdmin.removeChannel(channel);
    }
  }));
}
