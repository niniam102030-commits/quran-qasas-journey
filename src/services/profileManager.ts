// src/services/profileManager.ts
// مدیریت چند پروفایل روی یک دستگاه (C2): هر پروفایل دیتابیس Dexie جداگانه دارد، پروفایل اصلی بدون کپی‌کردن روی QasasLearningDB می‌ماند.
import Dexie from "dexie";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  dbNameForProfile,
  MAIN_PROFILE_ID,
  setActiveProfileDb,
} from "../db/learningDb";

export const PROFILES_STORAGE_KEY = "qasas.profiles.v1";

export interface AppProfile {
  id: string;
  name: string;
  createdAt: number;
}

const memoryFallback = new Map<string, string>();

function getStorage(): Pick<Storage, "getItem" | "setItem"> {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return {
    getItem: (k) => memoryFallback.get(k) ?? null,
    setItem: (k, v) => {
      memoryFallback.set(k, v);
    },
  };
}

function readProfiles(): AppProfile[] {
  try {
    const raw = getStorage().getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is AppProfile =>
        typeof p === "object" &&
        p !== null &&
        typeof p.id === "string" &&
        p.id.length > 0 &&
        typeof p.name === "string" &&
        p.name.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function writeProfiles(profiles: AppProfile[]) {
  getStorage().setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

/**
 * مقداردهی اولیه فهرست پروفایل‌ها:
 * در اولین اجرای نسخهٔ ۳، پروفایل «اصلی» (id: "main") ثبت می‌شود که دقیقاً به دیتابیس قدیمی QasasLearningDB متصل است.
 */
export function initProfileRegistry(): AppProfile[] {
  const storage = getStorage();
  let profiles = readProfiles();
  if (profiles.length === 0) {
    profiles = [{ id: MAIN_PROFILE_ID, name: "اصلی", createdAt: Date.now() }];
    writeProfiles(profiles);
  }
  const activeId = storage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  if (!activeId || !profiles.some((p) => p.id === activeId)) {
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profiles[0].id);
    setActiveProfileDb(profiles[0].id);
  } else {
    setActiveProfileDb(activeId);
  }
  return profiles;
}

export function listProfiles(): AppProfile[] {
  return initProfileRegistry();
}

export function getActiveProfileId(): string {
  const profiles = initProfileRegistry();
  const active = getStorage().getItem(ACTIVE_PROFILE_STORAGE_KEY);
  return active && profiles.some((p) => p.id === active) ? active : profiles[0].id;
}

export function getActiveProfile(): AppProfile {
  const profiles = initProfileRegistry();
  const id = getActiveProfileId();
  return profiles.find((p) => p.id === id) ?? profiles[0];
}

export function profileAvatarLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : "؟";
}

export function createProfile(name: string): AppProfile {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("نام پروفایل نمی‌تواند خالی باشد.");
  }
  const profiles = initProfileRegistry();
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const created: AppProfile = { id, name: cleanName, createdAt: Date.now() };
  writeProfiles([...profiles, created]);
  return created;
}

export function switchProfile(profileId: string, opts?: { reload?: boolean }): AppProfile {
  const profiles = initProfileRegistry();
  const target = profiles.find((p) => p.id === profileId);
  if (!target) {
    throw new Error("پروفایل انتخاب‌شده پیدا نشد.");
  }
  getStorage().setItem(ACTIVE_PROFILE_STORAGE_KEY, target.id);
  setActiveProfileDb(target.id);
  if (opts?.reload !== false && typeof window !== "undefined" && typeof window.location?.reload === "function") {
    window.location.reload();
  }
  return target;
}

export async function deleteProfile(profileId: string, opts?: { reloadOnActiveSwitch?: boolean }): Promise<AppProfile[]> {
  const profiles = initProfileRegistry();
  if (profiles.length <= 1) {
    throw new Error("حداقل یک پروفایل باید باقی بماند؛ امکان حذف آخرین پروفایل نیست.");
  }
  const exists = profiles.some((p) => p.id === profileId);
  if (!exists) return profiles;

  const remaining = profiles.filter((p) => p.id !== profileId);
  const wasActive = getActiveProfileId() === profileId;

  if (wasActive) {
    const nextActive = remaining[0];
    getStorage().setItem(ACTIVE_PROFILE_STORAGE_KEY, nextActive.id);
    setActiveProfileDb(nextActive.id);
  }

  writeProfiles(remaining);
  await Dexie.delete(dbNameForProfile(profileId));

  if (
    wasActive &&
    opts?.reloadOnActiveSwitch !== false &&
    typeof window !== "undefined" &&
    typeof window.location?.reload === "function"
  ) {
    window.location.reload();
  }

  return remaining;
}
