const FIRST_LAUNCH_COMPLETED_KEY = "acc_first_launch_completed_v1";
const COACH_MARKS_COMPLETED_KEY = "acc_coach_marks_completed_v1";

function readFlag(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore storage failures in restricted contexts
  }
}

export function isFirstLaunchCompleted() {
  return readFlag(FIRST_LAUNCH_COMPLETED_KEY);
}

export function setFirstLaunchCompleted(value: boolean) {
  writeFlag(FIRST_LAUNCH_COMPLETED_KEY, value);
}

export function isCoachMarksCompleted() {
  return readFlag(COACH_MARKS_COMPLETED_KEY);
}

export function setCoachMarksCompleted(value: boolean) {
  writeFlag(COACH_MARKS_COMPLETED_KEY, value);
}

export function resetFirstLaunchExperience() {
  setFirstLaunchCompleted(false);
  setCoachMarksCompleted(false);
}
