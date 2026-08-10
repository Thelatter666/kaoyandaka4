import { z } from 'zod';

export const UpdateSettingsSchema = z.object({
  pomodoroSoundEnabled: z.boolean(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
