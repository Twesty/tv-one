import { supabaseAdmin } from '../config/supabase.js';

// Device topics contain only UUIDs and the broadcast payload contains no
// credentials or media URLs. Players still re-fetch the authoritative config.
export async function publishAssignmentUpdates(deviceIds: string[]): Promise<void> {
  await Promise.all(deviceIds.map(async (deviceId) => {
    const channel = supabaseAdmin.channel(`device:${deviceId}`);
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'assignment-updated',
        payload: { deviceId }
      });
      if (result !== 'ok') {
        throw new Error(`Realtime broadcast returned ${result} for device ${deviceId}`);
      }
    } finally {
      await supabaseAdmin.removeChannel(channel);
    }
  }));
}
