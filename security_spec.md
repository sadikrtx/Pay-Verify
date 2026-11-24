# PayVerify BD Security Specification (Prompt A1 + A2 Hardened Multi-Tenant)

## Data Invariants
1. **Default Deny First**: Top-level `match /{document=**} { allow read, write: if false; }` denies every unlisted path.
2. **Verified Super Admin Identity**: `isSuperAdmin()` requires `request.auth.token.email == 'sadikrtx3060@gmail.com'` AND `request.auth.token.email_verified == true`.
3. **Plan System Authority (`payPlans`, `payAddons`, `payCoupons`)**:
   - Only Super Admin may create or update `payPlans`, `payAddons`, and `payCoupons`.
   - `payPlans` and `payAddons` and `payCoupons` NEVER allow client `delete` (archive-only so active accounts are never orphaned).
   - `payCoupons` forbids `allow list` for non-super-admins so merchants cannot enumerate/scrape hidden coupon codes; exact-ID `get` is permitted only for active coupons to preview discounts while final pricing stays server-side.
   - Merchants CANNOT modify their own `planId`, `planStatus`, `paidUntil`, `storeLimitOverride`, `dailySessionCapOverride`, or `ownedAddons` in `payAccounts`.
4. **Hard Device Binding (`pairingTokens`, `payDevices`)**:
   - `pairingTokens` can only be created by the authenticated account owner with `accountId == request.auth.uid`, `usedAt == null`, and `createdAt == request.time`.
   - Clients can NEVER `update` or `delete` `pairingTokens` (prevents resetting `usedAt` or extending `expiresAt`; only the Worker redeems a token).
   - `payDevices` stays strictly isolated to `accountId == request.auth.uid` (Super Admin read-only for health monitoring).
5. **Login Security & Activity Isolation (`payActivity`)**:
   - Non-super-admin accounts can `get`/`list` ONLY `payActivity` documents where `resource.data.accountId == request.auth.uid` (for their own `login` history and server-written `device_rejected` alerts).
   - Non-super-admin accounts can `create` ONLY `type == 'login'` entries with `actorAccountId == request.auth.uid` and `accountId == request.auth.uid` and `createdAt == request.time`; they CANNOT forge `device_rejected`, `plan_change`, or admin audit records.
6. **Changelog Isolation (`payChangelog`)**:
   - Readable by signed-in accounts (`resource.data.createdAt != null`), writable ONLY by Super Admin.
7. **Subscription Receipts (`paySessions`)**:
   - Accounts may read confirmed sessions where `resource.data.subscriptionRefAccountId == request.auth.uid` (for their own receipt history), while remaining strictly blocked from updating/mutating those subscription store sessions.
8. **Zero-Trust A1 Invariants Preserved**:
   - `usedTrxIds` remains strictly `allow read, write: if false;` (Worker-only).
   - Super Admin cannot edit another account's `paySessions` or `paySms`.
   - Zero `get()`/`exists()` inside any `allow list` rule (Pillar 8).

## The "Dirty Dozen" Payloads (Must All Be Denied)
1. **Unauthenticated read of `payAccounts`, `payStores`, `paySessions`, `paySms`, `payDevices`, `pairingTokens`, `payChangelog`**.
2. **Non-super-admin creates or updates a `payPlans` document** (or tries to delete any `payPlans` doc).
3. **Non-super-admin lists `payCoupons`** to scrape secret discount codes, or modifies `usedCount`/`percentOff`.
4. **Account owner self-upgrades `planId`, `planStatus`, `paidUntil`, `storeLimitOverride`, or `ownedAddons`** on `payAccounts/{uid}`.
5. **Account owner attempts to reset `usedAt: null` or extend `expiresAt`** on an existing `pairingTokens/{tokenId}` document.
6. **Account A creates a `pairingTokens` doc with `accountId: 'account_B'`** (cross-tenant device hijacking).
7. **Non-super-admin writes a `payChangelog` entry**.
8. **Non-super-admin forges a `payActivity` doc with `type: 'device_rejected'` or `targetType: 'plan'`** (only `type == 'login'` self-logging allowed).
9. **Account A reads `payActivity` belonging to Account B**.
10. **Super Admin with `email_verified == false`** attempts to write `payPlans`, `payCoupons`, or `payPlatform/config`.
11. **Shadow/ghost field injection** on `payPlans`, `payAddons`, `payCoupons`, `pairingTokens`, or `payChangelog`.
12. **Client read or write of `usedTrxIds/{trxId}`**, or Super Admin updating another merchant's `paySessions`/`paySms`.
