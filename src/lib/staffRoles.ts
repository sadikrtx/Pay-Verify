import type {
  StaffActionKey,
  StaffAreaCrudRule,
  StaffAreaKey,
  StaffMemberDoc,
  StaffRoleDoc,
  StaffRuleMatrix,
} from '../types/payment';

export const STAFF_AREAS: ReadonlyArray<{
  key: StaffAreaKey;
  labelBn: string;
  descBn: string;
  supportsExport?: boolean;
}> = [
  {
    key: 'merchants',
    labelBn: 'মার্চেন্ট',
    descBn: 'তালিকা, বিবরণ, অ্যাক্টিভেশন/ব্লক',
  },
  {
    key: 'plans',
    labelBn: 'প্ল্যান',
    descBn: 'তালিকা, মূল্য, ফিচার',
  },
  {
    key: 'payments',
    labelBn: 'পেমেন্ট ও লেনদেন',
    descBn: 'তালিকা, বিবরণ, ম্যানুয়াল যাচাই/নোট',
  },
  {
    key: 'app_updates',
    labelBn: 'Android App আপডেট',
    descBn: 'APK আপলোড ও পাবলিশ',
  },
  {
    key: 'reports',
    labelBn: 'রিপোর্ট ও সারসংক্ষেপ',
    descBn: 'সারসংক্ষেপ ও সিএসভি এক্সপোর্ট',
    supportsExport: true,
  },
  {
    key: 'merchant_notes',
    labelBn: 'মার্চেন্ট নোট / সাপোর্ট মন্তব্য',
    descBn: 'মার্চেন্ট অ্যাকাউন্টে নোট ও সাপোর্ট মন্তব্য',
  },
];

export const STARTER_ROLE_IDS = {
  moderator: 'role_starter_moderator',
  support: 'role_starter_support_staff',
} as const;

export function makeEmptyAreaRule(withExport = false): StaffAreaCrudRule & { export?: boolean } {
  const base: StaffAreaCrudRule = {
    view: false,
    create: false,
    edit: false,
    delete: false,
  };
  if (withExport) {
    return { ...base, export: false };
  }
  return base;
}

export function makeEmptyStaffRuleMatrix(): StaffRuleMatrix {
  return {
    merchants: { view: false, create: false, edit: false, delete: false },
    plans: { view: false, create: false, edit: false, delete: false },
    payments: { view: false, create: false, edit: false, delete: false },
    app_updates: { view: false, create: false, edit: false, delete: false },
    reports: { view: false, create: false, edit: false, delete: false, export: false },
    merchant_notes: { view: false, create: false, edit: false, delete: false },
  };
}

export function makeFullSuperAdminRuleMatrix(): StaffRuleMatrix {
  return {
    merchants: { view: true, create: true, edit: true, delete: true },
    plans: { view: true, create: true, edit: true, delete: true },
    payments: { view: true, create: true, edit: true, delete: true },
    app_updates: { view: true, create: true, edit: true, delete: true },
    reports: { view: true, create: true, edit: true, delete: true, export: true },
    merchant_notes: { view: true, create: true, edit: true, delete: true },
  };
}

/**
 * Enforces Part C dependency invariant on a single area rule:
 * - If view is false, create/edit/delete/export cannot remain true.
 * - If any of create/edit/delete/export is true, view must be true.
 */
export function normalizeAreaRule(
  raw: unknown,
  withExport = false
): StaffAreaCrudRule & { export: boolean } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let view = Boolean(obj.view);
  const create = Boolean(obj.create);
  const edit = Boolean(obj.edit);
  const del = Boolean(obj.delete);
  const exp = withExport ? Boolean(obj.export) : false;

  if (create || edit || del || exp) {
    view = true;
  }

  return {
    view,
    create: view ? create : false,
    edit: view ? edit : false,
    delete: view ? del : false,
    export: withExport ? (view ? exp : false) : false,
  };
}

export function normalizeStaffRuleMatrix(raw: unknown): StaffRuleMatrix {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const merchants = normalizeAreaRule(obj.merchants, false);
  const plans = normalizeAreaRule(obj.plans, false);
  const payments = normalizeAreaRule(obj.payments, false);
  const appUpdates = normalizeAreaRule(obj.app_updates, false);
  const reports = normalizeAreaRule(obj.reports, true);
  const merchantNotes = normalizeAreaRule(obj.merchant_notes, false);

  return {
    merchants: {
      view: merchants.view,
      create: merchants.create,
      edit: merchants.edit,
      delete: merchants.delete,
    },
    plans: {
      view: plans.view,
      create: plans.create,
      edit: plans.edit,
      delete: plans.delete,
    },
    payments: {
      view: payments.view,
      create: payments.create,
      edit: payments.edit,
      delete: payments.delete,
    },
    app_updates: {
      view: appUpdates.view,
      create: appUpdates.create,
      edit: appUpdates.edit,
      delete: appUpdates.delete,
    },
    reports: {
      view: reports.view,
      create: reports.create,
      edit: reports.edit,
      delete: reports.delete,
      export: reports.export,
    },
    merchant_notes: {
      view: merchantNotes.view,
      create: merchantNotes.create,
      edit: merchantNotes.edit,
      delete: merchantNotes.delete,
    },
  };
}

/**
 * Toggles a specific switch (view | create | edit | delete | export) in an area while enforcing:
 * - Turning 'view' off automatically turns off create, edit, delete, and export.
 * - Turning any of create, edit, delete, or export on automatically turns 'view' on.
 */
export function toggleStaffRuleSwitch(
  matrix: StaffRuleMatrix,
  area: StaffAreaKey,
  action: StaffActionKey,
  nextValue: boolean
): StaffRuleMatrix {
  const cloned = normalizeStaffRuleMatrix(matrix);
  const current = { ...cloned[area] } as StaffAreaCrudRule & { export?: boolean };

  if (action === 'view') {
    if (!nextValue) {
      current.view = false;
      current.create = false;
      current.edit = false;
      current.delete = false;
      if (area === 'reports') {
        current.export = false;
      }
    } else {
      current.view = true;
    }
  } else if (action === 'export') {
    if (area === 'reports') {
      current.export = nextValue;
      if (nextValue) {
        current.view = true;
      }
    }
  } else {
    current[action] = nextValue;
    if (nextValue) {
      current.view = true;
    }
  }

  if (area === 'reports') {
    cloned.reports = {
      view: Boolean(current.view),
      create: Boolean(current.create),
      edit: Boolean(current.edit),
      delete: Boolean(current.delete),
      export: Boolean(current.export),
    };
  } else {
    cloned[area] = {
      view: Boolean(current.view),
      create: Boolean(current.create),
      edit: Boolean(current.edit),
      delete: Boolean(current.delete),
    };
  }

  return cloned;
}

export function areRuleMatricesEqual(a: StaffRuleMatrix, b: StaffRuleMatrix): boolean {
  const na = normalizeStaffRuleMatrix(a);
  const nb = normalizeStaffRuleMatrix(b);
  for (const area of STAFF_AREAS) {
    const ra = na[area.key] as StaffAreaCrudRule & { export?: boolean };
    const rb = nb[area.key] as StaffAreaCrudRule & { export?: boolean };
    if (
      ra.view !== rb.view ||
      ra.create !== rb.create ||
      ra.edit !== rb.edit ||
      ra.delete !== rb.delete
    ) {
      return false;
    }
    if (area.key === 'reports' && Boolean(ra.export) !== Boolean(rb.export)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves the effective rule matrix for a staff member given their role and optional custom override.
 */
export function resolveStaffEffectiveRules(
  roleRules: StaffRuleMatrix | null | undefined,
  hasCustomOverride: boolean,
  overrideRules: StaffRuleMatrix | null | undefined
): StaffRuleMatrix {
  if (hasCustomOverride && overrideRules) {
    return normalizeStaffRuleMatrix(overrideRules);
  }
  if (roleRules) {
    return normalizeStaffRuleMatrix(roleRules);
  }
  return makeEmptyStaffRuleMatrix();
}

/**
 * Checks if the actor (Super Admin or active Staff Member) has permission for (area, action).
 */
export function checkAdminPermission(
  isSuperAdmin: boolean,
  staffMember: StaffMemberDoc | null | undefined,
  area: StaffAreaKey,
  action: StaffActionKey
): boolean {
  if (isSuperAdmin) return true;
  if (!staffMember || staffMember.status !== 'active') return false;
  const areaRule = staffMember.effectiveRules[area] as StaffAreaCrudRule & { export?: boolean };
  if (!areaRule) return false;
  if (action === 'export') {
    return Boolean(areaRule.view && areaRule.export);
  }
  if (action === 'view') {
    return Boolean(areaRule.view);
  }
  return Boolean(areaRule.view && areaRule[action]);
}

/**
 * Two built-in starter roles ("মডারেটর" and "সাপোর্ট স্টাফ") shipped as ordinary editable roles.
 */
export function buildStarterStaffRoles(nowMs = Date.now()): StaffRoleDoc[] {
  const moderatorRules: StaffRuleMatrix = {
    merchants: { view: true, create: false, edit: true, delete: false },
    plans: { view: true, create: false, edit: false, delete: false },
    payments: { view: true, create: false, edit: true, delete: false },
    app_updates: { view: true, create: true, edit: true, delete: false },
    reports: { view: true, create: false, edit: false, delete: false, export: true },
    merchant_notes: { view: true, create: true, edit: true, delete: true },
  };

  const supportStaffRules: StaffRuleMatrix = {
    merchants: { view: true, create: false, edit: false, delete: false },
    plans: { view: true, create: false, edit: false, delete: false },
    payments: { view: true, create: false, edit: false, delete: false },
    app_updates: { view: true, create: false, edit: false, delete: false },
    reports: { view: true, create: false, edit: false, delete: false, export: false },
    merchant_notes: { view: true, create: true, edit: true, delete: false },
  };

  return [
    {
      id: STARTER_ROLE_IDS.moderator,
      name: 'মডারেটর',
      rules: moderatorRules,
      isStarter: true,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    },
    {
      id: STARTER_ROLE_IDS.support,
      name: 'সাপোর্ট স্টাফ',
      rules: supportStaffRules,
      isStarter: true,
      createdAtMs: nowMs + 1,
      updatedAtMs: nowMs + 1,
    },
  ];
}
