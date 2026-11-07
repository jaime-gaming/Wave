export const FEEDBACK_KEY = 'wave-local-feature-feedback-v1';
const DAY = 86_400_000;
export interface RecordState {
  firstSeen: number;
  nextAt: number;
  uses: number;
  disabled?: boolean;
  ratings: { feature: string; helpful: boolean; at: number }[];
}

export function feedbackEligible(record: RecordState, now: number, chance: number) {
  return (
    !record.disabled &&
    now >= record.nextAt &&
    now - record.firstSeen >= 7 * DAY &&
    record.uses >= 12 &&
    chance < 0.02
  );
}
