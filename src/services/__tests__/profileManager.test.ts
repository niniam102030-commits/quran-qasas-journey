// src/services/__tests__/profileManager.test.ts
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbNameForProfile, ldb, LEGACY_DB_NAME, MAIN_PROFILE_ID } from "../../db/learningDb";
import { newCard } from "../../learning/cardScheduler";
import { createBackupPayload, parseAndValidateBackup } from "../backupService";
import {
  createProfile,
  deleteProfile,
  getActiveProfile,
  getActiveProfileId,
  initProfileRegistry,
  listProfiles,
  profileAvatarLetter,
  switchProfile,
} from "../profileManager";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
  return store;
}

describe("profileManager & multi-profile isolation (C2)", () => {
  beforeEach(async () => {
    installMemoryLocalStorage();
    // پاکسازی همه دیتابیس‌های قبلی بین تست‌ها
    const names = await Dexie.getDatabaseNames();
    for (const name of names) {
      await Dexie.delete(name);
    }
    initProfileRegistry();
  });

  it("auto-registers existing QasasLearningDB as main profile 'اصلی' without copying or deleting data", async () => {
    await ldb.open();
    await ldb.cards.put(newCard("vr:7"));
    await ldb.profile.put({
      id: "main",
      chillehCurrentDays: 12,
      chillehBestDays: 12,
      chillehStage: 14,
      lastActivityDate: "2026-11-23",
      chillehShieldActive: false,
      noorXp: 450,
      aqeeqGems: 35,
      updatedAt: 1000,
    });

    // شبیه‌سازی پاک‌شدن کلید رجیستری پیش از اجرای نسخهٔ ۳
    globalThis.localStorage.clear();
    const profiles = initProfileRegistry();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(MAIN_PROFILE_ID);
    expect(profiles[0].name).toBe("اصلی");
    expect(dbNameForProfile(MAIN_PROFILE_ID)).toBe(LEGACY_DB_NAME);
    expect(ldb.name).toBe(LEGACY_DB_NAME);

    // داده‌های قبلی بدون هیچ کپی یا حذفی سر جایشان هستند
    expect(await ldb.cards.get("vr:7")).toBeDefined();
    expect((await ldb.profile.get("main"))?.aqeeqGems).toBe(35);
    expect(profileAvatarLetter("اصلی")).toBe("ا");
  });

  it("isolates second profile completely, reloads on switch, and deletes only the targeted profile DB", async () => {
    await ldb.open();
    await ldb.cards.put(newCard("vr:1"));
    await ldb.profile.put({
      id: "main",
      chillehCurrentDays: 5,
      chillehBestDays: 5,
      chillehStage: 7,
      lastActivityDate: "2026-11-24",
      chillehShieldActive: false,
      noorXp: 100,
      aqeeqGems: 20,
      updatedAt: 1000,
    });

    const p2 = createProfile("سارا");
    expect(listProfiles()).toHaveLength(2);

    const reloadMock = vi.fn();
    Object.defineProperty(globalThis, "window", {
      value: { location: { reload: reloadMock } },
      configurable: true,
      writable: true,
    });

    switchProfile(p2.id, { reload: true });
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(getActiveProfileId()).toBe(p2.id);
    expect(ldb.name).toBe(`QasasLearningDB__${p2.id}`);

    // پروفایل دوم کاملاً خالی و جدا از اصلی است
    await ldb.open();
    expect(await ldb.cards.toArray()).toHaveLength(0);
    await ldb.cards.put(newCard("vt:2"));
    await ldb.profile.put({
      id: "main",
      chillehCurrentDays: 1,
      chillehBestDays: 1,
      chillehStage: 7,
      lastActivityDate: "2026-11-24",
      chillehShieldActive: false,
      noorXp: 10,
      aqeeqGems: 5,
      updatedAt: 2000,
    });

    // بکاپ روی پروفایل فعال (سارا) گرفته می‌شود و نام پروفایل مبدأ در آن ثبت می‌شود
    const backup = await createBackupPayload();
    expect(backup.sourceProfileName).toBe("سارا");
    expect(backup.cards.map((c) => c.key)).toEqual(["vt:2"]);

    // بکاپ قدیمی بدون sourceProfileName همچنان معتبر است
    const { sourceProfileName: _omit, ...legacyObj } = backup;
    expect(parseAndValidateBackup(JSON.stringify(legacyObj)).cards).toHaveLength(1);
    expect(parseAndValidateBackup(JSON.stringify(backup)).sourceProfileName).toBe("سارا");

    // برگشت به اصلی و حذف پروفایل دوم
    switchProfile(MAIN_PROFILE_ID, { reload: false });
    expect(getActiveProfile().name).toBe("اصلی");
    await deleteProfile(p2.id, { reloadOnActiveSwitch: false });

    expect(listProfiles().map((p) => p.id)).toEqual([MAIN_PROFILE_ID]);
    const dbNamesAfter = await Dexie.getDatabaseNames();
    expect(dbNamesAfter).toContain(LEGACY_DB_NAME);
    expect(dbNamesAfter).not.toContain(`QasasLearningDB__${p2.id}`);

    // داده‌های اصلی کاملاً دست‌نخورده مانده‌اند
    expect(await ldb.cards.get("vr:1")).toBeDefined();
    expect(await ldb.cards.get("vt:2")).toBeUndefined();

    // حذف آخرین پروفایل مجاز نیست
    await expect(deleteProfile(MAIN_PROFILE_ID)).rejects.toThrow();
  });
});
