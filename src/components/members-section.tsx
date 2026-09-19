"use client";

import { useState } from "react";
import type { Club, ClubMember, ClubRole } from "./types";
import { CLUB_ROLES } from "./types";
import { IconUsers, IconChevronDown, IconAlertTriangle, IconX } from "./icons";

interface MembersSectionProps {
  club: Club;
  members: ClubMember[];
  onUpdateMemberRole: (
    memberId: string,
    newRole: ClubRole
  ) => Promise<{ success: boolean; error?: string }>;
  onBackToDashboard?: () => void;
  currentUserId?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function MembersSection({
  club,
  members,
  onUpdateMemberRole,
  currentUserId,
  isLoading = false,
  error = null,
  onRetry,
}: MembersSectionProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isCurrentUserClubHead = Boolean(
    currentUserId && club.ownerId && currentUserId === club.ownerId
  );

  const isMemberHead = (member: ClubMember) => {
    return Boolean(
      (club.ownerId && member.userId && member.userId === club.ownerId) ||
      (club.ownerId && member.id === club.ownerId)
    );
  };

  const handleRoleChange = async (memberId: string, newRole: ClubRole) => {
    setUpdateError(null);
    setUpdatingId(memberId);
    try {
      const res = await onUpdateMemberRole(memberId, newRole);
      if (res && !res.success && res.error) {
        setUpdateError(res.error);
      }
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : "Failed to update member role");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconUsers className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-[#1E1B4B]">Members</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>
        {isCurrentUserClubHead && (
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
            Role editing enabled for Club Head
          </span>
        )}
      </div>

      {/* Role Update Error Banner */}
      {updateError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{updateError}</span>
          </div>
          <button
            onClick={() => setUpdateError(null)}
            className="text-red-500 hover:text-red-800 p-1 transition-colors"
            title="Dismiss"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-sm p-12 text-center space-y-3">
          <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading club members...</p>
        </div>
      ) : error ? (
        /* Error State */
        <div className="overflow-hidden rounded-2xl bg-red-50/50 border border-red-200/80 shadow-sm p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <IconAlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-red-900">Failed to load members</h3>
          <p className="text-xs text-red-700 max-w-sm mx-auto">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        /* Members Table */
        <div className="overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          {members.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <IconUsers className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#1E1B4B]">No members yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                This club does not have any members yet. Share invite code{" "}
                <span className="font-mono text-indigo-600 font-bold">{club.code}</span>{" "}
                with officers to have them join.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="py-3 px-5">
                      Name
                    </th>
                    <th scope="col" className="py-3 px-5">
                      Email
                    </th>
                    <th scope="col" className="py-3 px-5 text-right sm:text-left">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => {
                    const isHead = isMemberHead(member);

                    return (
                      <tr
                        key={member.id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        {/* Name */}
                        <td className="py-3.5 px-5 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{member.name}</span>
                            {isHead && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                                Club Head
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-5 font-mono text-slate-500 whitespace-nowrap">
                          {member.email}
                        </td>

                        {/* Role Selector or Badge */}
                        <td className="py-3.5 px-5 whitespace-nowrap text-right sm:text-left">
                          {isCurrentUserClubHead ? (
                            <div className="relative inline-block text-left">
                              <select
                                value={member.role}
                                disabled={updatingId === member.id}
                                onChange={(e) =>
                                  handleRoleChange(
                                    member.id,
                                    e.target.value as ClubRole
                                  )
                                }
                                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50/60 border border-indigo-200 text-indigo-800 hover:bg-indigo-50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                aria-label={`Change role for ${member.name}`}
                              >
                                {CLUB_ROLES.map((role) => (
                                  <option
                                    key={role}
                                    value={role}
                                    className="bg-white text-slate-800 py-1"
                                  >
                                    {role}
                                  </option>
                                ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-indigo-600">
                                {updatingId === member.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <IconChevronDown className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-50/70 border border-indigo-200/80 text-indigo-800 shadow-sm">
                              {member.role}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
