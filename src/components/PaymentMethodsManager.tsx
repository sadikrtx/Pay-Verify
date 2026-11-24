import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildActionHeadlineBn,
  buildActionStepsBn,
  CHECKOUT_METHOD_BRANDS,
  CHECKOUT_METHODS,
  defaultActionForAccountType,
  deleteMethodNumberRow,
  enforceEnabledRequiresSavedNumber,
  normalizePaymentAccounts,
  normalizePaymentActionType,
  parseCustomInstructionLines,
  PAYMENT_ACTION_LABELS_BN,
  PAYMENT_ACTION_TYPES,
  resolveStoreCheckoutOptions,
  saveMethodNumberRow,
  toBanglaDigits,
  toggleStoreMethodEnabled,
} from '../lib/checkoutFlow';
import type {
  MethodNumberEntry,
  NormalizedPaymentAccountsMap,
  NumberAccountType,
  PaymentActionType,
  PayStoreDoc,
  WalletEnabledMap,
  WalletMethod,
} from '../types/payment';
import { PaymentLogo } from './PaymentLogo';

const PREVIEW_SAMPLE_AMOUNT = '৳১,২৫০';

function createBlankDraft(): MethodNumberEntry {
  return {
    number: '',
    type: 'personal',
    actionType: 'send_money',
    customInstruction: '',
    active: true,
  };
}

interface PaymentMethodsManagerProps {
  store: PayStoreDoc;
  canEdit: boolean;
  onSaveMethods: (
    paymentAccounts: NormalizedPaymentAccountsMap,
    numberEnabled: WalletEnabledMap
  ) => Promise<void>;
  showBulkRuleBar?: boolean;
  showHonestCustomerPreview?: boolean;
  layout?: 'stack' | 'grid';
}

type EditTarget =
  | { method: WalletMethod; index: number }
  | { method: WalletMethod; index: 'new' }
  | null;

type DeleteTarget = { method: WalletMethod; index: number } | null;

export const PaymentMethodsManager: React.FC<PaymentMethodsManagerProps> = ({
  store,
  canEdit,
  onSaveMethods,
  showBulkRuleBar = true,
  showHonestCustomerPreview = true,
  layout = 'stack',
}) => {
  const accounts = useMemo(
    () => normalizePaymentAccounts(store.paymentAccounts, store.numbers),
    [store.paymentAccounts, store.numbers]
  );
  const enabled = useMemo(
    () => enforceEnabledRequiresSavedNumber(store.numberEnabled, accounts),
    [store.numberEnabled, accounts]
  );

  // Strictly AT MOST ONE row across the entire settings panel in edit/add mode at a time
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [draft, setDraft] = useState<MethodNumberEntry>(createBlankDraft);
  const [rowError, setRowError] = useState<string | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  const [savedBanner, setSavedBanner] = useState<{
    method: WalletMethod;
    index: number;
    message: string;
  } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget>(null);
  const [deletingRow, setDeletingRow] = useState(false);
  const [togglingMethod, setTogglingMethod] = useState<WalletMethod | null>(null);
  const [justTurnedOffMethod, setJustTurnedOffMethod] = useState<WalletMethod | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [bulkActions, setBulkActions] = useState<Record<WalletMethod, PaymentActionType>>({
    bkash: 'send_money',
    nagad: 'send_money',
    rocket: 'send_money',
    upay: 'send_money',
  });

  const activePreviewOptions = useMemo(
    () =>
      resolveStoreCheckoutOptions({
        numberEnabled: enabled,
        numbers: store.numbers,
        paymentAccounts: accounts,
      }),
    [enabled, store.numbers, accounts]
  );

  const offMethods = useMemo(
    () => CHECKOUT_METHODS.filter((m) => !enabled[m] || accounts[m].every((e) => !e.active)),
    [enabled, accounts]
  );

  const startAddNumber = (method: WalletMethod) => {
    if (!canEdit || savingRow) return;
    setConfirmDelete(null);
    setRowError(null);
    setGeneralError(null);
    setDraft(createBlankDraft());
    setEditTarget({ method, index: 'new' });
  };

  const startEditNumber = (method: WalletMethod, idx: number, existing: MethodNumberEntry) => {
    if (!canEdit || savingRow) return;
    setConfirmDelete(null);
    setRowError(null);
    setGeneralError(null);
    setDraft({
      number: existing.number,
      type: existing.type,
      actionType: normalizePaymentActionType(existing.actionType, existing.type),
      customInstruction: existing.customInstruction || '',
      active: Boolean(existing.active),
    });
    setEditTarget({ method, index: idx });
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setRowError(null);
    setDraft(createBlankDraft());
  };

  const handleDraftTypeChange = (nextType: NumberAccountType) => {
    setDraft((prev) => {
      const currentAction = normalizePaymentActionType(prev.actionType, prev.type);
      const wasDefault = currentAction === defaultActionForAccountType(prev.type);
      return {
        ...prev,
        type: nextType,
        actionType: wasDefault ? defaultActionForAccountType(nextType) : currentAction,
      };
    });
  };

  const handleSaveRow = async () => {
    if (!canEdit || !editTarget || savingRow) return;
    setRowError(null);
    setGeneralError(null);

    const outcome = saveMethodNumberRow({
      accounts,
      enabled,
      method: editTarget.method,
      rowIndex: editTarget.index === 'new' ? null : editTarget.index,
      draft,
    });

    if (!outcome.ok) {
      // Keep the user's typed text intact in `draft` so they can fix it!
      setRowError(outcome.errorBn || 'সঠিক নম্বর লিখুন।');
      return;
    }

    const savedMethod = editTarget.method;
    const savedIndex = outcome.savedIndex ?? 0;

    setSavingRow(true);
    try {
      await onSaveMethods(outcome.accounts, outcome.enabled);
      setEditTarget(null);
      setDraft(createBlankDraft());
      setSavedBanner({
        method: savedMethod,
        index: savedIndex,
        message: 'সংরক্ষিত হয়েছে',
      });
      window.setTimeout(() => {
        setSavedBanner((curr) =>
          curr && curr.method === savedMethod && curr.index === savedIndex ? null : curr
        );
      }, 3500);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'নম্বর সংরক্ষণ করা যায়নি।');
    } finally {
      setSavingRow(false);
    }
  };

  const handleConfirmDelete = async (method: WalletMethod, idx: number) => {
    if (!canEdit || deletingRow) return;
    setGeneralError(null);
    const outcome = deleteMethodNumberRow({
      accounts,
      enabled,
      method,
      rowIndex: idx,
    });

    setDeletingRow(true);
    try {
      await onSaveMethods(outcome.accounts, outcome.enabled);
      setConfirmDelete(null);
      if (editTarget && editTarget.method === method) {
        setEditTarget(null);
        setRowError(null);
      }
      if (outcome.becameEmpty) {
        setJustTurnedOffMethod(null);
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'নম্বর মুছে ফেলা যায়নি।');
    } finally {
      setDeletingRow(false);
    }
  };

  const handleToggleMethod = async (method: WalletMethod) => {
    if (!canEdit || togglingMethod || savingRow) return;
    setGeneralError(null);

    const outcome = toggleStoreMethodEnabled({
      accounts,
      enabled,
      method,
    });

    if (!outcome.changed) {
      return;
    }

    setTogglingMethod(method);
    try {
      await onSaveMethods(accounts, outcome.enabled);
      if (outcome.turnedOffWithNumbers) {
        setJustTurnedOffMethod(method);
      } else if (justTurnedOffMethod === method) {
        setJustTurnedOffMethod(null);
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'মাধ্যমটি পরিবর্তন করা যায়নি।');
    } finally {
      setTogglingMethod(null);
    }
  };

  const handleApplyBulkRule = async (method: WalletMethod) => {
    if (!canEdit || savingRow) return;
    const rows = accounts[method];
    if (rows.length === 0) return;

    setGeneralError(null);
    const actionToApply = bulkActions[method];
    const nextAccounts: NormalizedPaymentAccountsMap = {
      ...accounts,
      [method]: rows.map((row) => ({
        ...row,
        actionType: actionToApply,
      })),
    };

    setSavingRow(true);
    try {
      await onSaveMethods(nextAccounts, enabled);
      setSavedBanner({
        method,
        index: 0,
        message: 'সংরক্ষিত হয়েছে',
      });
      window.setTimeout(() => {
        setSavedBanner((curr) => (curr && curr.method === method ? null : curr));
      }, 3000);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'নিয়ম সংরক্ষণ করা যায়নি।');
    } finally {
      setSavingRow(false);
    }
  };

  const renderDraftFormFields = (method: WalletMethod, testSuffix: string) => {
    const brand = CHECKOUT_METHOD_BRANDS[method];
    const effectiveAction = normalizePaymentActionType(draft.actionType, draft.type);
    const sampleNum = draft.number.trim() || '01XXXXXXXXX';
    const autoHeadline = buildActionHeadlineBn(effectiveAction, PREVIEW_SAMPLE_AMOUNT);
    const autoSteps = buildActionStepsBn(
      method,
      effectiveAction,
      PREVIEW_SAMPLE_AMOUNT,
      sampleNum
    );
    const autoPlaceholder = autoSteps
      .map((s, sIdx) => `${toBanglaDigits(sIdx + 1)}) ${s}`)
      .join('\n');

    return (
      <div className="space-y-3.5">
        {/* Top Editable Number Input + Explicit Visible Save + Cancel */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <label className="sr-only" htmlFor={`num-${method}-${testSuffix}`}>
              {brand.name} রিসিভিং নম্বর
            </label>
            <input
              id={`num-${method}-${testSuffix}`}
              type="tel"
              inputMode="tel"
              autoFocus
              disabled={!canEdit || savingRow}
              value={draft.number}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, number: e.target.value }));
                if (rowError) setRowError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSaveRow();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              placeholder="01XXXXXXXXX"
              data-testid={`input-number-${method}-${testSuffix}`}
              className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border bg-white font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 ${
                rowError
                  ? 'border-rose-400 focus:ring-rose-500'
                  : 'border-slate-300 focus:ring-teal-500'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canEdit || savingRow}
              onClick={() => void handleSaveRow()}
              data-testid={`save-number-${method}-${testSuffix}`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {savingRow ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}
            </button>
            <button
              type="button"
              disabled={savingRow}
              onClick={cancelEdit}
              data-testid={`cancel-number-${method}-${testSuffix}`}
              className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              বাতিল
            </button>
          </div>
        </div>

        {rowError && (
          <div
            className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700"
            data-testid={`number-error-${method}-${testSuffix}`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{rowError}</span>
          </div>
        )}

        {/* Personal / Agent + Active checkbox */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div
            className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shrink-0"
            role="group"
            aria-label="নম্বরের ধরন"
          >
            {(['personal', 'agent'] as NumberAccountType[]).map((t) => {
              const active = draft.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!canEdit || savingRow}
                  data-testid={`type-${method}-${testSuffix}-${t}`}
                  onClick={() => handleDraftTypeChange(t)}
                  className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t === 'personal' ? 'Personal' : 'Agent'}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.active}
              disabled={!canEdit || savingRow}
              onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            সক্রিয়
          </label>
        </div>

        {/* 4 Bangla Payment Action Rules */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-700">
            কাস্টমার কী করবে (পেমেন্ট নিয়ম)
          </div>
          <div
            className="grid grid-cols-2 sm:inline-flex sm:flex-wrap gap-1.5 rounded-xl bg-white border border-slate-200 p-1"
            role="group"
            aria-label={`${brand.name} পেমেন্ট নিয়ম`}
          >
            {PAYMENT_ACTION_TYPES.map((act) => {
              const selected = effectiveAction === act;
              return (
                <button
                  key={act}
                  type="button"
                  disabled={!canEdit || savingRow}
                  data-testid={`action-${method}-${testSuffix}-${act}`}
                  onClick={() => setDraft((prev) => ({ ...prev, actionType: act }))}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selected
                      ? 'bg-teal-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {PAYMENT_ACTION_LABELS_BN[act]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Custom Instruction */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`custom-inst-${method}-${testSuffix}`}
              className="text-[11px] font-bold text-slate-700"
            >
              নিজের নির্দেশনা{' '}
              <span className="font-normal text-slate-500">
                (ঐচ্ছিক — খালি রাখলে অটো ধাপ দেখাবে)
              </span>
            </label>
            {(draft.customInstruction || '').trim() && (
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, customInstruction: '' }))}
                className="text-[11px] font-bold text-teal-700 hover:underline"
              >
                অটো নির্দেশনা ব্যবহার করুন
              </button>
            )}
          </div>
          <textarea
            id={`custom-inst-${method}-${testSuffix}`}
            rows={3}
            maxLength={500}
            disabled={!canEdit || savingRow}
            value={draft.customInstruction || ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, customInstruction: e.target.value }))}
            placeholder={autoPlaceholder}
            data-testid={`input-custom-instruction-${method}-${testSuffix}`}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="text-[11px] text-slate-500">প্রিভিউ শিরোনাম: {autoHeadline}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="payment-methods-manager">
      {generalError && (
        <div
          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800"
          data-testid="methods-manager-error"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{generalError}</span>
        </div>
      )}

      <div
        className={
          layout === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'
        }
      >
        {CHECKOUT_METHODS.map((method) => {
          const brand = CHECKOUT_METHOD_BRANDS[method];
          const rows = accounts[method];
          const hasSaved = rows.length > 0;
          const isOn = enabled[method];
          const isAddingHere = editTarget?.method === method && editTarget.index === 'new';
          const bulkRule = bulkActions[method];
          const toggleDisabled = !canEdit || togglingMethod === method || savingRow || !hasSaved;

          return (
            <div
              key={method}
              data-testid={`method-config-card-${method}`}
              className={`bg-white rounded-2xl border transition-colors shadow-xs overflow-hidden ${
                isOn ? 'border-slate-200/90' : 'border-slate-200/70'
              }`}
            >
              {/* Method Card Header + Smart ON/OFF Toggle */}
              <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <PaymentLogo method={method} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold" style={{ color: brand.primaryHex }}>
                        {brand.name}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">({brand.nameBn})</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {isOn ? 'কাস্টমার পেমেন্ট পেজে চালু আছে' : 'বর্তমানে বন্ধ আছে'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`${brand.name} চালু বা বন্ধ`}
                    disabled={toggleDisabled}
                    data-testid={`toggle-method-${method}`}
                    onClick={() => void handleToggleMethod(method)}
                    className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isOn
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isOn ? 'bg-emerald-600' : 'bg-slate-400'
                      }`}
                    />
                    {isOn ? 'চালু (ON)' : 'বন্ধ (OFF)'}
                  </button>

                  {!hasSaved && (
                    <span
                      className="text-[11px] font-semibold text-amber-700"
                      data-testid={`toggle-hint-${method}`}
                    >
                      আগে নম্বর সংরক্ষণ করুন
                    </span>
                  )}
                </div>
              </div>

              {/* Inline note when OFF and has saved numbers */}
              {!isOn && hasSaved && (
                <div
                  className="px-5 py-2.5 bg-amber-50/80 border-b border-amber-200/70 text-xs font-semibold text-amber-900 flex items-center gap-2"
                  data-testid={`method-off-notice-${method}`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>কাস্টমাররা এই মাধ্যমটি আর দেখতে পাবেন না</span>
                </div>
              )}

              <div className="p-5 space-y-3.5">
                {/* Empty State: ZERO open inputs by default */}
                {!hasSaved && !isAddingHere && (
                  <div
                    className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 flex flex-wrap items-center justify-between gap-3"
                    data-testid={`method-empty-${method}`}
                  >
                    <span className="text-xs font-semibold text-slate-500">
                      কোনো নম্বর যোগ করা হয়নি
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startAddNumber(method)}
                        data-testid={`add-number-${method}`}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        নম্বর যোগ করুন
                      </button>
                    )}
                  </div>
                )}

                {/* Bulk Rule Bar (only when saved numbers exist and not adding/editing multiple) */}
                {showBulkRuleBar && canEdit && rows.length > 1 && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200/70"
                    data-testid={`bulk-rule-bar-${method}`}
                  >
                    <span className="text-xs font-bold text-teal-950">
                      এই মাধ্যমের সব নাম্বারে একই নিয়ম
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`${brand.name} সব নাম্বারে নিয়ম নির্বাচন করুন`}
                        value={bulkRule}
                        onChange={(e) =>
                          setBulkActions((prev) => ({
                            ...prev,
                            [method]: e.target.value as PaymentActionType,
                          }))
                        }
                        data-testid={`bulk-rule-select-${method}`}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg border border-teal-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {PAYMENT_ACTION_TYPES.map((act) => (
                          <option key={act} value={act}>
                            {PAYMENT_ACTION_LABELS_BN[act]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={savingRow}
                        onClick={() => void handleApplyBulkRule(method)}
                        data-testid={`bulk-rule-apply-${method}`}
                        className="min-h-[36px] px-3 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        সবগুলোতে প্রয়োগ করুন
                      </button>
                    </div>
                  </div>
                )}

                {/* Saved Number Rows (Locked by default; editable strictly one row at a time) */}
                {rows.map((entry, idx) => {
                  const isEditingThisRow =
                    editTarget?.method === method && editTarget.index === idx;
                  const isConfirmingDelete =
                    confirmDelete?.method === method && confirmDelete.index === idx;
                  const isJustSaved =
                    savedBanner?.method === method && savedBanner.index === idx;
                  const effectiveAction = normalizePaymentActionType(entry.actionType, entry.type);
                  const customLines = parseCustomInstructionLines(entry.customInstruction);

                  if (isEditingThisRow) {
                    return (
                      <div
                        key={`${method}-${idx}`}
                        data-testid={`number-row-edit-${method}-${idx}`}
                        className="p-4 rounded-xl bg-teal-50/40 border-2 border-teal-500/40 space-y-3"
                      >
                        <div className="text-xs font-bold text-teal-900">
                          নম্বর #{toBanglaDigits(idx + 1)} সম্পাদনা করুন
                        </div>
                        {renderDraftFormFields(method, String(idx))}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${method}-${idx}`}
                      data-testid={`number-row-locked-${method}-${idx}`}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">
                              #{toBanglaDigits(idx + 1)}
                            </span>
                            <span
                              className="font-mono text-base font-extrabold text-slate-900 tracking-wide select-all"
                              data-testid={`saved-number-text-${method}-${idx}`}
                            >
                              {entry.number}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold"
                              data-testid={`saved-badge-${method}-${idx}`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              সংরক্ষিত
                            </span>
                            {isJustSaved && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-700 text-white text-[11px] font-bold"
                                data-testid={`saved-confirm-${method}-${idx}`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {savedBanner.message}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200">
                              {entry.type === 'agent' ? 'Agent' : 'Personal'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-teal-800">
                              {PAYMENT_ACTION_LABELS_BN[effectiveAction]}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded border ${
                                entry.active
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-500'
                              }`}
                            >
                              {entry.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                            </span>
                          </div>
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={savingRow || deletingRow}
                              onClick={() => startEditNumber(method, idx, entry)}
                              data-testid={`edit-number-${method}-${idx}`}
                              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              এডিট করুন
                            </button>
                            <button
                              type="button"
                              disabled={savingRow || deletingRow}
                              onClick={() => {
                                setEditTarget(null);
                                setRowError(null);
                                setConfirmDelete({ method, index: idx });
                              }}
                              data-testid={`delete-number-${method}-${idx}`}
                              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs font-bold text-rose-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              মুছুন
                            </button>
                          </div>
                        )}
                      </div>

                      {customLines.length > 0 && (
                        <div className="text-[11px] text-slate-600 bg-white border border-slate-200/70 rounded-lg px-2.5 py-1.5 whitespace-pre-line">
                          {customLines.join('\n')}
                        </div>
                      )}

                      {isConfirmingDelete && (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200"
                          data-testid={`delete-confirm-box-${method}-${idx}`}
                        >
                          <span className="text-xs font-bold text-rose-900">
                            নম্বরটি মুছে ফেলবেন?
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingRow}
                              onClick={() => void handleConfirmDelete(method, idx)}
                              data-testid={`confirm-delete-${method}-${idx}`}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                            >
                              {deletingRow ? 'মুছছে…' : 'হ্যাঁ, মুছুন'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingRow}
                              onClick={() => setConfirmDelete(null)}
                              data-testid={`cancel-delete-${method}-${idx}`}
                              className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
                            >
                              বাতিল
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Adding New Row Form */}
                {isAddingHere && (
                  <div
                    className="p-4 rounded-xl bg-teal-50/40 border-2 border-teal-500/40 space-y-3"
                    data-testid={`number-row-add-${method}`}
                  >
                    <div className="text-xs font-bold text-teal-900">
                      নতুন {brand.name} নম্বর যোগ করুন
                    </div>
                    {renderDraftFormFields(method, 'new')}
                  </div>
                )}

                {/* Add Another Number Button when at least 1 saved number already exists */}
                {canEdit && hasSaved && !isAddingHere && rows.length < 10 && (
                  <button
                    type="button"
                    onClick={() => startAddNumber(method)}
                    data-testid={`add-another-number-${method}`}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    আরেকটি {brand.name} নম্বর যোগ করুন
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Honest Live Customer Preview Summary */}
      {showHonestCustomerPreview && (
        <div
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3.5"
          data-testid="honest-customer-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              কাস্টমার যেমন দেখবে (সৎ লাইভ প্রিভিউ)
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              সক্রিয় মাধ্যম: {toBanglaDigits(activePreviewOptions.length)}টি
            </span>
          </div>

          {activePreviewOptions.length === 0 ? (
            <div
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600"
              data-testid="honest-preview-empty"
            >
              কাস্টমারের পেমেন্ট পেজে এখন কোনো মাধ্যম দেখাবে না। কমপক্ষে একটি নম্বরে সংরক্ষণ করে চালু (ON) করুন।
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {activePreviewOptions.map((opt) => {
                const b = CHECKOUT_METHOD_BRANDS[opt.method];
                return (
                  <div
                    key={opt.method}
                    data-testid={`honest-preview-method-${opt.method}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PaymentLogo method={opt.method} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold" style={{ color: b.primaryHex }}>
                          {b.name}
                        </div>
                        <div className="text-xs font-mono font-bold text-slate-800 truncate">
                          {opt.number}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
                      {PAYMENT_ACTION_LABELS_BN[opt.actionType]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {offMethods.length > 0 && (
            <div
              className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-600"
              data-testid="honest-off-methods-list"
            >
              {offMethods.map((m) => (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-semibold text-slate-600"
                >
                  বন্ধ আছে: {CHECKOUT_METHOD_BRANDS[m].name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
