import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areRuleMatricesEqual,
  buildStarterStaffRoles,
  checkAdminPermission,
  makeEmptyStaffRuleMatrix,
  resolveStaffEffectiveRules,
  toggleStaffRuleSwitch,
} from './staffRoles';
import type { StaffMemberDoc } from '../types/payment';

test('toggleStaffRuleSwitch enforces Part C View dependency (turning View off clears Create/Edit/Delete/Export; turning any on turns View on)', () => {
  let matrix = makeEmptyStaffRuleMatrix();

  // Turning Edit on automatically turns View on
  matrix = toggleStaffRuleSwitch(matrix, 'payments', 'edit', true);
  assert.equal(matrix.payments.view, true);
  assert.equal(matrix.payments.edit, true);
  assert.equal(matrix.payments.create, false);

  // Turning Delete on keeps View on
  matrix = toggleStaffRuleSwitch(matrix, 'payments', 'delete', true);
  assert.equal(matrix.payments.delete, true);

  // Turning View off turns Create, Edit, Delete all off
  matrix = toggleStaffRuleSwitch(matrix, 'payments', 'view', false);
  assert.equal(matrix.payments.view, false);
  assert.equal(matrix.payments.create, false);
  assert.equal(matrix.payments.edit, false);
  assert.equal(matrix.payments.delete, false);

  // Turning Export on in reports turns View on; turning View off clears Export
  matrix = toggleStaffRuleSwitch(matrix, 'reports', 'export', true);
  assert.equal(matrix.reports.view, true);
  assert.equal(matrix.reports.export, true);
  matrix = toggleStaffRuleSwitch(matrix, 'reports', 'view', false);
  assert.equal(matrix.reports.view, false);
  assert.equal(matrix.reports.export, false);
});

test('buildStarterStaffRoles ships "মডারেটর" and "সাপোর্ট স্টাফ" editable starter roles', () => {
  const starters = buildStarterStaffRoles(1000);
  assert.equal(starters.length, 2);
  assert.equal(starters[0].name, 'মডারেটর');
  assert.equal(starters[1].name, 'সাপোর্ট স্টাফ');
});

test('checkAdminPermission enforces custom role (e.g., "হিসাবরক্ষক" with পেমেন্ট = View only) and blocks disabled staff', () => {
  let accountantRules = makeEmptyStaffRuleMatrix();
  accountantRules = toggleStaffRuleSwitch(accountantRules, 'payments', 'view', true);
  accountantRules = toggleStaffRuleSwitch(accountantRules, 'reports', 'view', true);

  const activeAccountant: StaffMemberDoc = {
    id: 'staff_acc_1',
    name: 'রহিম আহমেদ',
    email: 'accountant@payverify.app',
    phone: '01711000000',
    roleId: 'role_accountant',
    roleName: 'হিসাবরক্ষক',
    hasCustomOverride: false,
    overrideRules: null,
    effectiveRules: resolveStaffEffectiveRules(accountantRules, false, null),
    status: 'active',
    mustChangePassword: false,
    lastLoginAtMs: 2000,
    createdAtMs: 1000,
    updatedAtMs: 2000,
  };

  // Can view payments & reports, but CANNOT edit or delete payments, and CANNOT view merchants/plans/app_updates
  assert.equal(checkAdminPermission(false, activeAccountant, 'payments', 'view'), true);
  assert.equal(checkAdminPermission(false, activeAccountant, 'payments', 'edit'), false);
  assert.equal(checkAdminPermission(false, activeAccountant, 'payments', 'delete'), false);
  assert.equal(checkAdminPermission(false, activeAccountant, 'merchants', 'view'), false);
  assert.equal(checkAdminPermission(false, activeAccountant, 'plans', 'view'), false);

  // When role rules are updated, non-overridden staff member gets updated rules
  const updatedRoleRules = toggleStaffRuleSwitch(accountantRules, 'payments', 'edit', true);
  const reResolved = resolveStaffEffectiveRules(updatedRoleRules, false, null);
  assert.equal(areRuleMatricesEqual(reResolved, updatedRoleRules), true);

  // Deactivated staff member is denied all permissions immediately
  const disabledAccountant: StaffMemberDoc = {
    ...activeAccountant,
    status: 'disabled',
  };
  assert.equal(checkAdminPermission(false, disabledAccountant, 'payments', 'view'), false);
});
