// src/pages/ProfilesPage.tsx
// صفحه انتخاب، ساخت و مدیریت چند پروفایل کاملاً مجزا روی یک دستگاه (C2)
import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  listProfiles,
  profileAvatarLetter,
  switchProfile,
  type AppProfile,
} from "../services/profileManager";

interface Props {
  onBack: () => void;
}

export default function ProfilesPage({ onBack }: Props) {
  const [profiles, setProfiles] = useState<AppProfile[]>(() => listProfiles());
  const [activeId, setActiveId] = useState<string>(() => getActiveProfileId());
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<{ id: string; step: 1 | 2 } | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = createProfile(newName);
      setProfiles(listProfiles());
      setNewName("");
      switchProfile(created.id, { reload: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت پروفایل");
    }
  };

  const handleSwitch = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    switchProfile(id, { reload: true });
  };

  const handleConfirmDelete = async (id: string) => {
    setError(null);
    try {
      const remaining = await deleteProfile(id, { reloadOnActiveSwitch: true });
      setProfiles(remaining);
      setActiveId(getActiveProfileId());
      setDeleteStep(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در حذف پروفایل");
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#FAF7F2] dark:bg-[#0B132B] text-slate-900 dark:text-slate-100 pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#FAF7F2]/95 dark:bg-[#0B132B]/95 backdrop-blur border-b-2 border-[#d4af37]/50 dark:border-teal-800/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            title="بازگشت"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-black text-[#8a5b29] dark:text-amber-400">
              پروفایل‌های دستگاه
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              هر پروفایل چله، عقیق، باغ، کارت‌های FSRS و کارنامهٔ کاملاً جداگانه دارد
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold">
            {error}
          </div>
        )}

        {/* فهرست پروفایل‌ها */}
        <section className="bg-white dark:bg-[#1C2541] rounded-3xl border-2 border-[#E5DEC9] dark:border-[#3A506B] p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black">
            <Users className="w-4 h-4 text-teal-600" />
            <span>انتخاب یا مدیریت پروفایل</span>
          </div>

          <div className="space-y-2.5">
            {profiles.map((p) => {
              const isActive = p.id === activeId;
              const del = deleteStep?.id === p.id ? deleteStep : null;
              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border-2 space-y-2.5 transition-all ${
                    isActive
                      ? "bg-teal-50/70 dark:bg-teal-950/40 border-[#00A896]"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                          isActive
                            ? "bg-[#00A896] text-white"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                        }`}
                      >
                        {profileAvatarLetter(p.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isActive ? "پروفایل فعال فعلی" : "آمادهٔ جابه‌جایی"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> فعال
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSwitch(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                        >
                          ورود به پروفایل
                        </button>
                      )}

                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeleteStep({ id: p.id, step: 1 })}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-800"
                          title="حذف پروفایل"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* تأیید دو مرحله‌ای حذف */}
                  {del && (
                    <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs space-y-2">
                      <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>
                          {del.step === 1
                            ? `هشدار: با حذف «${p.name}»، تمام پیشرفت، کارت‌ها، چله و کارنامه‌های این پروفایل برای همیشه پاک می‌شود (بقیه پروفایل‌ها دست‌نخورده می‌مانند).`
                            : `تأیید نهایی: آیا مطمئن هستید که همه داده‌های پروفایل «${p.name}» کاملاً حذف شود؟`}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {del.step === 1 ? (
                          <button
                            type="button"
                            onClick={() => setDeleteStep({ id: p.id, step: 2 })}
                            className="flex-1 py-2 px-3 rounded-xl bg-rose-600 text-white font-bold"
                          >
                            ادامه حذف
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete(p.id)}
                            className="flex-1 py-2 px-3 rounded-xl bg-rose-700 text-white font-black"
                          >
                            بله، برای همیشه حذف شود
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteStep(null)}
                          className="flex-1 py-2 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 font-bold"
                        >
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ساخت پروفایل جدید */}
        <section className="bg-white dark:bg-[#1C2541] rounded-3xl border border-[#e6dbc5] dark:border-slate-800 p-4 sm:p-5 space-y-3 shadow-sm">
          <h2 className="font-bold text-sm">ساخت پروفایل تازه</h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="نام پروفایل (مثلاً: سارا، علی...)"
              maxLength={32}
              className="flex-1 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs font-bold"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:opacity-45 text-white font-black text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>ساخت و ورود</span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
