export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SLOT_STATUS_VALUES = ['free', 'blocked'] as const;
export type SlotStatusValue = (typeof SLOT_STATUS_VALUES)[number];

export const RECURRENCE_VALUES = ['daily', 'weekly'] as const;
export type RecurrenceValue = (typeof RECURRENCE_VALUES)[number];

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
