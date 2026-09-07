import Link from "next/link";

import type { FamilyDataBasic } from "./types";

export default function AttendanceCard({
  familyData,
  todayMembers,
  todayOverride,
  scheduleTypeLabel,
  onToggleMember,
  onResetOverride,
}: {
  familyData: FamilyDataBasic | null;
  todayMembers: string[];
  todayOverride: string[] | null;
  scheduleTypeLabel: string;
  onToggleMember: (key: string) => void;
  onResetOverride: () => void;
}) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Household</p>
          <h2 className="text-lg font-semibold text-gray-950">Today's attendance</h2>
          <p className="mt-1 text-sm text-gray-500">
            {scheduleTypeLabel}
            {todayOverride ? " with today's override" : ""}
          </p>
        </div>
        <Link href="/family" className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
          Edit schedule
        </Link>
      </div>

      {familyData ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {[familyData.primary_member, ...familyData.additional_members].map((member) => {
              const selected = todayMembers.includes(member.member_key);
              return (
                <button
                  key={member.member_key}
                  type="button"
                  onClick={() => onToggleMember(member.member_key)}
                  className={`rounded-2xl px-4 py-3 text-left transition ${
                    selected ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {member.name}{member.member_key === "primary" ? " (you)" : ""}
                  </span>
                  <span className="mt-1 block text-xs opacity-70">{selected ? "Eating at home" : "Away today"}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-500">
            <span>{todayMembers.length} household member{todayMembers.length === 1 ? "" : "s"} eating at home</span>
            {todayOverride && (
              <button type="button" onClick={onResetOverride} className="font-semibold text-emerald-700 hover:text-emerald-900">
                Reset
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-500">Create a profile to set household attendance.</p>
      )}
    </div>
  );
}
