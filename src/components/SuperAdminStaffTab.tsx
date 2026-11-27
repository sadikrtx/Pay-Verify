import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Edit3,
  KeyRound,
  Mail,
  Phone,
  Plus,
  Power,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  makeEmptyStaffRuleMatrix,
  normalizeStaffRuleMatrix,
  STAFF_AREAS,
  toggleStaffRuleSwitch,
} from '../lib/staffRoles';
import { formatBanglaDateTime } from '../lib/money';
import type {
  StaffActionKey,
  StaffAreaCrudRule,
  StaffAreaKey,
  StaffMemberDoc,
  StaffRoleDoc,
  StaffRuleMatrix,
} from '../types/payment';

interface RuleMatrixEditorProps {
  matrix: StaffRuleMatrix;
  onChange: (next: StaffRuleMatrix) => void;
  disabled?: boolean;
  testIdPrefix?: string;
}

const ACTION_COLUMNS: ReadonlyArray<{
  key: 'view' | 'create' | 'edit' | 'delete';
  labelBn: string;
}> = [
  { key: 'view', labelBn: 'দেখা (View)' },
  { key: 'create', labelBn: 'তৈরি (Create)' },
  { key: 'edit', labelBn: 'সম্পাদনা (Edit)' },
  { key: 'delete', labelBn: 'মোছা (Delete)' },
];

export const StaffRuleMatrixEditor: React.FC<RuleMatrixEditorProps> = ({
  matrix,
  onChange,
  disabled = false,
  testIdPrefix = 'rule-matrix',
}) => {
  const handleToggle = (area: StaffAreaKey, action: StaffActionKey, currentVal: boolean) => {
    if (disabled) return;
    const next = toggleStaffRuleSwitch(matrix, area, action, !currentVal);
    onChange(next);
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-container`}>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/90 bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold text-slate-700">
              <th className="py-3 px-4">সেকশন / এরিয়া</th>
              {ACTION_COLUMNS.map((col) => (
                <th key={col.key} className="py-3 px-3 text-center">
                  {col.labelBn}
                </th>
              ))}
              <th className="py-3 px-3 text-center">এক্সপোর্ট</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {STAFF_AREAS.map((area) => {
              const areaRule = matrix[area.key] as StaffAreaCrudRule & { export?: boolean };
              return (
                <tr key={area.key} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{area.labelBn}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{area.descBn}</div>
                  </td>
                  {ACTION_COLUMNS.map((col) => {
                    const checked = Boolean(areaRule[col.key]);
                    return (
                      <td key={col.key} className="py-3 px-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          aria-label={`${area.labelBn} - ${col.labelBn}`}
                          disabled={disabled}
                          data-testid={`${testIdPrefix}-${area.key}-${col.key}`}
                          onClick={() => handleToggle(area.key, col.key, checked)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none disabled:opacity-50 ${
                            checked ? 'bg-teal-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-2xs transition duration-150 ${
                              checked ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-center">
                    {area.supportsExport ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(areaRule.export)}
                        aria-label={`${area.labelBn} - এক্সপোর্ট`}
                        disabled={disabled}
                        data-testid={`${testIdPrefix}-${area.key}-export`}
                        onClick={() => handleToggle(area.key, 'export', Boolean(areaRule.export))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none disabled:opacity-50 ${
                          areaRule.export ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-2xs transition duration-150 ${
                            areaRule.export ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2.5">
        {STAFF_AREAS.map((area) => {
          const areaRule = matrix[area.key] as StaffAreaCrudRule & { export?: boolean };
          return (
            <div
              key={area.key}
              className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
            >
              <div>
                <div className="text-xs font-bold text-slate-900">{area.labelBn}</div>
                <div className="text-[11px] text-slate-500">{area.descBn}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_COLUMNS.map((col) => {
                  const checked = Boolean(areaRule[col.key]);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleToggle(area.key, col.key, checked)}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                        checked
                          ? 'bg-teal-50/80 border-teal-200 text-teal-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span>{col.labelBn}</span>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          checked ? 'bg-teal-600' : 'bg-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
                {area.supportsExport && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleToggle(area.key, 'export', Boolean(areaRule.export))}
                    className={`col-span-2 flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      areaRule.export
                        ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <span>এক্সপোর্ট (Export)</span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        areaRule.export ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function summarizeRuleMatrixBn(rules: StaffRuleMatrix): string[] {
  const badges: string[] = [];
  for (const area of STAFF_AREAS) {
    const r = rules[area.key] as StaffAreaCrudRule & { export?: boolean };
    if (!r?.view) continue;
    const ops: string[] = ['দেখা'];
    if (r.create) ops.push('তৈরি');
    if (r.edit) ops.push('সম্পাদনা');
    if (r.delete) ops.push('মোছা');
    if (area.supportsExport && r.export) ops.push('এক্সপোর্ট');
    badges.push(`${area.labelBn}: ${ops.join(', ')}`);
  }
  return badges;
}

export const SuperAdminStaffTab: React.FC = () => {
  const {
    account,
    staffRoles,
    staffMembers,
    adminSaveStaffRole,
    adminDuplicateStaffRole,
    adminDeleteStaffRole,
    adminCreateStaffAccount,
    adminUpdateStaffMember,
    adminToggleStaffStatus,
    adminSendStaffPasswordReset,
    adminRemoveStaffMember,
  } = usePayVerify();

  const [subTab, setSubTab] = useState<'staff_list' | 'roles_rules'>('staff_list');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── PART B & C: ROLE CREATE / EDIT / DUPLICATE / DELETE STATE ───
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<StaffRoleDoc | null>(null);
  const [roleNameInput, setRoleNameInput] = useState('');
  const [roleRulesDraft, setRoleRulesDraft] = useState<StaffRuleMatrix>(() =>
    makeEmptyStaffRuleMatrix()
  );
  const [roleConfirmWarningCount, setRoleConfirmWarningCount] = useState<number | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [deleteRoleModalTarget, setDeleteRoleModalTarget] = useState<StaffRoleDoc | null>(null);
  const [roleDeletingId, setRoleDeletingId] = useState<string | null>(null);

  // ─── PART D: ADD NEW STAFF STATE ───
  const [addStaffModalOpen, setAddStaffModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffTempPass, setNewStaffTempPass] = useState('');
  const [newStaffRoleId, setNewStaffRoleId] = useState('');
  const [newStaffHasOverride, setNewStaffHasOverride] = useState(false);
  const [newStaffOverrideMatrix, setNewStaffOverrideMatrix] = useState<StaffRuleMatrix>(() =>
    makeEmptyStaffRuleMatrix()
  );
  const [creatingStaff, setCreatingStaff] = useState(false);

  // ─── PART E: MANAGE EXISTING STAFF STATE ───
  const [editStaffTarget, setEditStaffTarget] = useState<StaffMemberDoc | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffRoleId, setEditStaffRoleId] = useState('');
  const [editStaffHasOverride, setEditStaffHasOverride] = useState(false);
  const [editStaffOverrideMatrix, setEditStaffOverrideMatrix] = useState<StaffRuleMatrix>(() =>
    makeEmptyStaffRuleMatrix()
  );
  const [updatingStaff, setUpdatingStaff] = useState(false);

  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [removeStaffTarget, setRemoveStaffTarget] = useState<StaffMemberDoc | null>(null);
  const [removeConfirmText, setRemoveConfirmText] = useState('');
  const [removingStaff, setRemovingStaff] = useState(false);

  // Count how many staff members are assigned to each role
  const staffCountByRoleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of staffMembers) {
      map.set(s.roleId, (map.get(s.roleId) || 0) + 1);
    }
    return map;
  }, [staffMembers]);

  // Visible ONLY to the Super Admin — staff accounts never see it, not even greyed out.
  if (!account?.isSuperAdmin) {
    return null;
  }

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
  };

  // ─── PART B: ROLE HANDLERS ───
  const openCreateRoleModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingRole(null);
    setRoleNameInput('');
    setRoleRulesDraft(makeEmptyStaffRuleMatrix());
    setRoleConfirmWarningCount(null);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (role: StaffRoleDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingRole(role);
    setRoleNameInput(role.name);
    setRoleRulesDraft(normalizeStaffRuleMatrix(role.rules));
    setRoleConfirmWarningCount(null);
    setRoleModalOpen(true);
  };

  const handleDuplicateRole = async (role: StaffRoleDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const copy = await adminDuplicateStaffRole(role.id);
      flashSuccess(`"${copy.name}" রোলটি তৈরি হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'রোল ডুপ্লিকেট ব্যর্থ হয়েছে।');
    }
  };

  const executeSaveRole = async () => {
    setErrorMsg(null);
    setRoleSaving(true);
    try {
      const saved = await adminSaveStaffRole(
        {
          name: roleNameInput.trim(),
          rules: roleRulesDraft,
        },
        editingRole?.id
      );
      setRoleModalOpen(false);
      setRoleConfirmWarningCount(null);
      flashSuccess(
        editingRole
          ? `"${saved.name}" রোল ও নিয়ম সংরক্ষিত হয়েছে।`
          : `"${saved.name}" নতুন রোল তৈরি হয়েছে।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'রোল সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleRoleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleNameInput.trim()) {
      setErrorMsg('রোলের নাম লিখুন।');
      return;
    }
    if (editingRole) {
      const assignedCount = staffCountByRoleId.get(editingRole.id) || 0;
      if (assignedCount > 0 && roleConfirmWarningCount === null) {
        setRoleConfirmWarningCount(assignedCount);
        return;
      }
    }
    await executeSaveRole();
  };

  const handleConfirmDeleteRole = async () => {
    if (!deleteRoleModalTarget) return;
    const target = deleteRoleModalTarget;
    setErrorMsg(null);
    setRoleDeletingId(target.id);
    try {
      await adminDeleteStaffRole(target.id);
      setDeleteRoleModalTarget(null);
      flashSuccess(`"${target.name}" রোল মুছে ফেলা হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'রোল মুছে ফেলা যায়নি।');
    } finally {
      setRoleDeletingId(null);
    }
  };

  // ─── PART D: ADD NEW STAFF HANDLERS ───
  const openAddStaffModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const defaultRole = staffRoles[0] || null;
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffTempPass('');
    setNewStaffRoleId(defaultRole?.id || '');
    setNewStaffHasOverride(false);
    setNewStaffOverrideMatrix(
      defaultRole ? normalizeStaffRuleMatrix(defaultRole.rules) : makeEmptyStaffRuleMatrix()
    );
    setAddStaffModalOpen(true);
  };

  const handleSelectNewStaffRole = (roleId: string) => {
    setNewStaffRoleId(roleId);
    const found = staffRoles.find((r) => r.id === roleId);
    if (found && !newStaffHasOverride) {
      setNewStaffOverrideMatrix(normalizeStaffRuleMatrix(found.rules));
    }
  };

  const handleCreateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCreatingStaff(true);
    try {
      const created = await adminCreateStaffAccount({
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        phone: newStaffPhone.trim(),
        tempPassword: newStaffTempPass,
        roleId: newStaffRoleId,
        hasCustomOverride: newStaffHasOverride,
        overrideRules: newStaffHasOverride ? newStaffOverrideMatrix : null,
      });
      setAddStaffModalOpen(false);
      flashSuccess(
        `নতুন স্টাফ "${created.name}" (${created.email}) যুক্ত হয়েছে। প্রথম লগইনে তাকে নতুন পাসওয়ার্ড সেট করতে হবে।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'স্টাফ তৈরি করা যায়নি।');
    } finally {
      setCreatingStaff(false);
    }
  };

  // ─── PART E: MANAGE STAFF HANDLERS ───
  const openEditStaffModal = (member: StaffMemberDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditStaffTarget(member);
    setEditStaffName(member.name);
    setEditStaffPhone(member.phone);
    setEditStaffRoleId(member.roleId);
    setEditStaffHasOverride(member.hasCustomOverride);
    const baseRole = staffRoles.find((r) => r.id === member.roleId);
    setEditStaffOverrideMatrix(
      member.hasCustomOverride && member.overrideRules
        ? normalizeStaffRuleMatrix(member.overrideRules)
        : baseRole
          ? normalizeStaffRuleMatrix(baseRole.rules)
          : normalizeStaffRuleMatrix(member.effectiveRules)
    );
  };

  const handleSelectEditStaffRole = (roleId: string) => {
    setEditStaffRoleId(roleId);
    const found = staffRoles.find((r) => r.id === roleId);
    if (found && !editStaffHasOverride) {
      setEditStaffOverrideMatrix(normalizeStaffRuleMatrix(found.rules));
    }
  };

  const handleUpdateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStaffTarget) return;
    setErrorMsg(null);
    setUpdatingStaff(true);
    try {
      await adminUpdateStaffMember(editStaffTarget.id, {
        name: editStaffName.trim(),
        phone: editStaffPhone.trim(),
        roleId: editStaffRoleId,
        hasCustomOverride: editStaffHasOverride,
        overrideRules: editStaffHasOverride ? editStaffOverrideMatrix : null,
      });
      setEditStaffTarget(null);
      flashSuccess(`"${editStaffName.trim()}"-এর রোল ও নিয়ম আপডেট হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'স্টাফ আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setUpdatingStaff(false);
    }
  };

  const handleToggleStatus = async (member: StaffMemberDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyStaffId(member.id);
    try {
      const nextStatus = member.status === 'active' ? 'disabled' : 'active';
      await adminToggleStaffStatus(member.id, nextStatus);
      flashSuccess(
        nextStatus === 'active'
          ? `"${member.name}"-এর অ্যাকাউন্ট সক্রিয় করা হয়েছে।`
          : `"${member.name}"-এর অ্যাকাউন্ট বন্ধ করা হয়েছে (লগইন তাৎক্ষণিক ব্লক)।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setBusyStaffId(null);
    }
  };

  const handleSendResetEmail = async (member: StaffMemberDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyStaffId(member.id);
    try {
      await adminSendStaffPasswordReset(member.id);
      flashSuccess(`${member.email}-এ পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট ইমেইল পাঠানো যায়নি।');
    } finally {
      setBusyStaffId(null);
    }
  };

  const handleConfirmRemoveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removeStaffTarget) return;
    const expectedEmail = removeStaffTarget.email.trim().toLowerCase();
    const expectedName = removeStaffTarget.name.trim().toLowerCase();
    const typed = removeConfirmText.trim().toLowerCase();
    if (typed !== expectedEmail && typed !== expectedName) {
      setErrorMsg('নিশ্চিত করতে স্টাফের সঠিক ইমেইল অথবা নাম টাইপ করুন।');
      return;
    }
    setErrorMsg(null);
    setRemovingStaff(true);
    try {
      const removedName = removeStaffTarget.name;
      await adminRemoveStaffMember(removeStaffTarget.id);
      setRemoveStaffTarget(null);
      setRemoveConfirmText('');
      flashSuccess(`"${removedName}"-কে স্টাফ তালিকা থেকে মুছে ফেলা হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'স্টাফ মুছে ফেলা যায়নি।');
    } finally {
      setRemovingStaff(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="super-admin-staff-section">
      {/* Sub-tabs header: "স্টাফ তালিকা" and "রোল ও নিয়ম" */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="staff-subtab-list"
            onClick={() => {
              setSubTab('staff_list');
              setErrorMsg(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
              subTab === 'staff_list'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            স্টাফ তালিকা ({staffMembers.length.toLocaleString('bn-BD')})
          </button>

          <button
            type="button"
            data-testid="staff-subtab-roles"
            onClick={() => {
              setSubTab('roles_rules');
              setErrorMsg(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
              subTab === 'roles_rules'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            রোল ও নিয়ম ({staffRoles.length.toLocaleString('bn-BD')})
          </button>
        </div>

        {subTab === 'staff_list' ? (
          <button
            type="button"
            data-testid="open-add-staff-btn"
            onClick={openAddStaffModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
          >
            <UserPlus className="w-4 h-4" />
            নতুন স্টাফ
          </button>
        ) : (
          <button
            type="button"
            data-testid="open-create-role-btn"
            onClick={openCreateRoleModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            নতুন রোল তৈরি করুন
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          className="flex items-center gap-2.5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800"
          data-testid="staff-error-banner"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800"
          data-testid="staff-success-banner"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: স্টাফ তালিকা (PART D & PART E)
         ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'staff_list' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {staffMembers.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-slate-800">এখনো কোনো স্টাফ যোগ করা হয়নি</div>
              <button
                type="button"
                onClick={openAddStaffModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
              >
                <UserPlus className="w-3.5 h-3.5" />
                নতুন স্টাফ যোগ করুন
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-600">
                      <th className="py-3 px-4">নাম ও ইমেইল</th>
                      <th className="py-3 px-4">ফোন নম্বর</th>
                      <th className="py-3 px-4">রোল ও নিয়ম</th>
                      <th className="py-3 px-4">অবস্থা</th>
                      <th className="py-3 px-4">শেষ লগইন</th>
                      <th className="py-3 px-4 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {staffMembers.map((m) => {
                      const isBusy = busyStaffId === m.id;
                      return (
                        <tr
                          key={m.id}
                          data-testid={`staff-row-${m.email}`}
                          className="hover:bg-slate-50/60"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{m.name}</div>
                            <div className="font-mono text-slate-500 mt-0.5">{m.email}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700">
                            {m.phone || '—'}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-800">
                                {m.roleName}
                              </span>
                              {m.hasCustomOverride && (
                                <span
                                  data-testid={`staff-custom-badge-${m.email}`}
                                  className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold"
                                >
                                  কাস্টম নিয়ম
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-lg font-bold border ${
                                m.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {m.status === 'active' ? 'সক্রিয়' : 'বন্ধ'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                            {m.lastLoginAtMs ? formatBanglaDateTime(m.lastLoginAtMs) : 'কখনো লগইন করেননি'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openEditStaffModal(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                রোল / নিয়ম
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleStatus(m)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-semibold disabled:opacity-50 ${
                                  m.status === 'active'
                                    ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                {m.status === 'active' ? 'বন্ধ করুন' : 'সক্রিয় করুন'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSendResetEmail(m)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                পাসওয়ার্ড রিসেট
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setRemoveStaffTarget(m);
                                  setRemoveConfirmText('');
                                  setErrorMsg(null);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                মুছুন
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {staffMembers.map((m) => {
                  const isBusy = busyStaffId === m.id;
                  return (
                    <div key={m.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{m.name}</div>
                          <div className="text-xs font-mono text-slate-500 truncate">{m.email}</div>
                          {m.phone && (
                            <div className="text-xs font-mono text-slate-600 mt-0.5">{m.phone}</div>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border shrink-0 ${
                            m.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {m.status === 'active' ? 'সক্রিয়' : 'বন্ধ'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-bold text-slate-800">
                          {m.roleName}
                        </span>
                        {m.hasCustomOverride && (
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold">
                            কাস্টম নিয়ম
                          </span>
                        )}
                        <span className="text-slate-500 ml-auto">
                          শেষ লগইন:{' '}
                          {m.lastLoginAtMs ? formatBanglaDateTime(m.lastLoginAtMs) : 'কখনো না'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => openEditStaffModal(m)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          রোল / নিয়ম
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleToggleStatus(m)}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold ${
                            m.status === 'active'
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {m.status === 'active' ? 'বন্ধ করুন' : 'সক্রিয় করুন'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleSendResetEmail(m)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          পাসওয়ার্ড রিসেট
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRemoveStaffTarget(m);
                            setRemoveConfirmText('');
                            setErrorMsg(null);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          মুছুন
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: রোল ও নিয়ম (PART B & PART C)
         ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'roles_rules' && (
        <div className="space-y-4">
          {staffRoles.map((role) => {
            const assignedCount = staffCountByRoleId.get(role.id) || 0;
            const summaryBadges = summarizeRuleMatrixBn(role.rules);
            return (
              <div
                key={role.id}
                data-testid={`role-card-${role.id}`}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">{role.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                      নিযুক্ত স্টাফ: {assignedCount.toLocaleString('bn-BD')} জন
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      data-testid={`edit-role-btn-${role.id}`}
                      onClick={() => openEditRoleModal(role)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      সম্পাদনা
                    </button>
                    <button
                      type="button"
                      data-testid={`duplicate-role-btn-${role.id}`}
                      onClick={() => void handleDuplicateRole(role)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      ডুপ্লিকেট
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-role-btn-${role.id}`}
                      onClick={() => {
                        setErrorMsg(null);
                        setDeleteRoleModalTarget(role);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      মুছুন
                    </button>
                  </div>
                </div>

                {summaryBadges.length === 0 ? (
                  <div className="text-xs text-slate-400">কোনো এরিয়ায় দেখার অনুমতি দেওয়া নেই</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {summaryBadges.map((b, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-teal-50/70 border border-teal-200/80 text-xs font-semibold text-teal-900"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: CREATE / EDIT ROLE & RULE MATRIX (PART B & PART C)
         ═══════════════════════════════════════════════════════════════════ */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <h2 className="text-lg font-bold text-slate-900">
                {editingRole ? `রোল সম্পাদনা: ${editingRole.name}` : 'নতুন রোল তৈরি করুন'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setRoleModalOpen(false);
                  setRoleConfirmWarningCount(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRoleFormSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  রোলের নাম <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  data-testid="role-name-input"
                  value={roleNameInput}
                  onChange={(e) => setRoleNameInput(e.target.value)}
                  placeholder="যেমন: হিসাবরক্ষক, সাপোর্ট লিড"
                  className="w-full max-w-md h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">
                  অনুমতি ম্যাট্রিক্স (দেখা বন্ধ করলে বাকিগুলোও স্বয়ংক্রিয়ভাবে বন্ধ হবে)
                </div>
                <StaffRuleMatrixEditor
                  matrix={roleRulesDraft}
                  onChange={(next) => {
                    setRoleRulesDraft(next);
                    setRoleConfirmWarningCount(null);
                  }}
                  testIdPrefix="role-editor"
                />
              </div>

              {/* Part B.3 Confirmation Warning when changing a role with assigned staff */}
              {roleConfirmWarningCount !== null && roleConfirmWarningCount > 0 && (
                <div
                  className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2"
                  data-testid="role-change-confirm-warning"
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      এই রোলে {roleConfirmWarningCount.toLocaleString('bn-BD')} জন স্টাফ আছে — সবার নিয়ম বদলে যাবে।
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setRoleModalOpen(false);
                    setRoleConfirmWarningCount(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  data-testid="save-role-btn"
                  disabled={roleSaving}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                >
                  {roleSaving
                    ? 'সংরক্ষণ হচ্ছে...'
                    : roleConfirmWarningCount !== null
                      ? 'হ্যাঁ, সবার নিয়ম আপডেট করুন'
                      : 'রোল সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: DELETE ROLE (BLOCKED IF STAFF ASSIGNED)
         ═══════════════════════════════════════════════════════════════════ */}
      {deleteRoleModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            {(() => {
              const count = staffCountByRoleId.get(deleteRoleModalTarget.id) || 0;
              return (
                <>
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        count > 0
                          ? 'bg-amber-50 border border-amber-200 text-amber-700'
                          : 'bg-rose-50 border border-rose-200 text-rose-600'
                      }`}
                    >
                      {count > 0 ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {count > 0
                          ? `"${deleteRoleModalTarget.name}" রোল এখন মোছা যাবে না`
                          : `"${deleteRoleModalTarget.name}" রোল মুছে ফেলবেন?`}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">
                        {count > 0
                          ? `এই রোলে বর্তমানে ${count.toLocaleString('bn-BD')} জন স্টাফ নিযুক্ত আছেন। রোলটি মুছে ফেলার আগে অনুগ্রহ করে তাদের অন্য রোলে স্থানান্তর করুন।`
                          : 'এই রোলে কোনো স্টাফ নিযুক্ত নেই। মুছে ফেললে এটি আর ফিরিয়ে আনা যাবে না।'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteRoleModalTarget(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {count > 0 ? 'ঠিক আছে' : 'বাতিল'}
                    </button>
                    {count === 0 && (
                      <button
                        type="button"
                        data-testid="confirm-delete-role-btn"
                        disabled={roleDeletingId === deleteRoleModalTarget.id}
                        onClick={() => void handleConfirmDeleteRole()}
                        className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
                      >
                        {roleDeletingId === deleteRoleModalTarget.id
                          ? 'মুছে ফেলা হচ্ছে...'
                          : 'হ্যাঁ, রোল মুছুন'}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: ADD NEW STAFF ACCOUNT (PART D)
         ═══════════════════════════════════════════════════════════════════ */}
      {addStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <h2 className="text-lg font-bold text-slate-900">নতুন স্টাফ যোগ করুন</h2>
              <button
                type="button"
                onClick={() => setAddStaffModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaffSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    নাম <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="new-staff-name"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="স্টাফের পূর্ণ নাম"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ইমেইল <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      data-testid="new-staff-email"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      placeholder="staff@example.com"
                      className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ফোন নম্বর <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      data-testid="new-staff-phone"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    অস্থায়ী পাসওয়ার্ড <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    data-testid="new-staff-password"
                    value={newStaffTempPass}
                    onChange={(e) => setNewStaffTempPass(e.target.value)}
                    placeholder="কমপক্ষে ৬ অক্ষর"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    রোল নির্বাচন করুন <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    data-testid="new-staff-role"
                    value={newStaffRoleId}
                    onChange={(e) => handleSelectNewStaffRole(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {staffRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Part D.2: Optional per-staff override */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>কাস্টম নিয়ম (শুধু এই স্টাফের জন্য)</span>
                      {newStaffHasOverride && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                          কাস্টম নিয়ম
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      চালু করলে নির্বাচিত রোলের উপর ভিত্তি করে শুধু এই স্টাফের জন্য আলাদা সুইচ কাস্টমাইজ করা যাবে
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newStaffHasOverride}
                    data-testid="new-staff-override-toggle"
                    onClick={() => {
                      const nextVal = !newStaffHasOverride;
                      setNewStaffHasOverride(nextVal);
                      const found = staffRoles.find((r) => r.id === newStaffRoleId);
                      if (found) {
                        setNewStaffOverrideMatrix(normalizeStaffRuleMatrix(found.rules));
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      newStaffHasOverride ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-2xs transition ${
                        newStaffHasOverride ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {newStaffHasOverride && (
                  <StaffRuleMatrixEditor
                    matrix={newStaffOverrideMatrix}
                    onChange={setNewStaffOverrideMatrix}
                    testIdPrefix="new-staff-override"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddStaffModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  data-testid="submit-create-staff-btn"
                  disabled={creatingStaff}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                >
                  {creatingStaff ? 'তৈরি হচ্ছে...' : 'স্টাফ তৈরি করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: EDIT EXISTING STAFF ROLE & CUSTOM OVERRIDE (PART E)
         ═══════════════════════════════════════════════════════════════════ */}
      {editStaffTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  স্টাফ সম্পাদনা: {editStaffTarget.name}
                </h2>
                <div className="text-xs font-mono text-slate-500">{editStaffTarget.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditStaffTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStaffSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">নাম</label>
                  <input
                    type="text"
                    required
                    value={editStaffName}
                    onChange={(e) => setEditStaffName(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ফোন নম্বর</label>
                  <input
                    type="tel"
                    required
                    value={editStaffPhone}
                    onChange={(e) => setEditStaffPhone(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">রোল</label>
                  <select
                    required
                    value={editStaffRoleId}
                    onChange={(e) => handleSelectEditStaffRole(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {staffRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>কাস্টম নিয়ম (শুধু এই স্টাফের জন্য)</span>
                      {editStaffHasOverride && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                          কাস্টম নিয়ম সক্রিয়
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      কাস্টম নিয়ম বন্ধ করলে স্টাফ সরাসরি তার মূল রোলের নিয়মে ফিরে যাবে
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={editStaffHasOverride}
                    onClick={() => {
                      const nextVal = !editStaffHasOverride;
                      setEditStaffHasOverride(nextVal);
                      const found = staffRoles.find((r) => r.id === editStaffRoleId);
                      if (found) {
                        setEditStaffOverrideMatrix(normalizeStaffRuleMatrix(found.rules));
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      editStaffHasOverride ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-2xs transition ${
                        editStaffHasOverride ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {editStaffHasOverride && (
                  <StaffRuleMatrixEditor
                    matrix={editStaffOverrideMatrix}
                    onChange={setEditStaffOverrideMatrix}
                    testIdPrefix="edit-staff-override"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditStaffTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={updatingStaff}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                >
                  {updatingStaff ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: TYPE-TO-CONFIRM REMOVE STAFF (PART E.2)
         ═══════════════════════════════════════════════════════════════════ */}
      {removeStaffTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  &quot;{removeStaffTarget.name}&quot;-কে মুছে ফেলবেন?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  মুছে ফেললে তার অ্যাক্সেস তাৎক্ষণিকভাবে বাতিল হবে, তবে অ্যাক্টিভিটি লগে তার পূর্বের কাজের রেকর্ড অক্ষুণ্ণ থাকবে।
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmRemoveStaff} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  নিশ্চিত করতে স্টাফের ইমেইল (<span className="font-mono">{removeStaffTarget.email}</span>) টাইপ করুন:
                </label>
                <input
                  type="text"
                  required
                  data-testid="confirm-remove-staff-input"
                  value={removeConfirmText}
                  onChange={(e) => setRemoveConfirmText(e.target.value)}
                  placeholder={removeStaffTarget.email}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setRemoveStaffTarget(null);
                    setRemoveConfirmText('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  data-testid="confirm-remove-staff-btn"
                  disabled={removingStaff}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
                >
                  {removingStaff ? 'মুছে ফেলা হচ্ছে...' : 'স্টাফ মুছে ফেলুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
