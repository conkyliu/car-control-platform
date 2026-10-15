# SDD ledger — plan: docs/superpowers/plans/2026-10-10-admin-web-console.md

## Pre-flight Conflict Scan (Sprint 1)

| Task Pair | Produces / Consumes | Conflict Scan Finding |
|---|---|---|
| Task 1 & Task 2 | Task 1 produces HTTP client, useAuthStore, login API / Task 2 consumes login API, SliderCaptcha, useAuthStore | Clean. Signatures aligned: `login(username, password)` sets token and user |
| Task 1 & Task 3 | Task 1 produces useAuthStore, useTenantStore / Task 3 consumes them in AdminLayout | Clean. Tenant switcher updates `useTenantStore.selectedTenantId` and Axios headers |
| Task 2 & Task 3 | Task 2 finishes auth and redirects to dashboard / Task 3 renders AdminLayout and child routes | Clean. AuthGuard verifies token existence and redirects cleanly |
| Task 3 & Task 4 | Task 3 renders navigation menu and router outlet / Task 4 mounts TenantListView and OrgTreeView | Clean. Views follow standard AntD 6 layout contracts |
| Task 4 & Task 5 | Task 4 manages tenants & orgs / Task 5 assigns users to orgs and roles | Clean. User edit modal loads org tree from Task 4 models |
| Task 5 & Task 6 | Task 5 produces roles & users / Task 6 queries audit logs recording user actions | Clean. Audit log displays operatorId, module, and tenant cleanly |
| Task 1-6 & Task 7 | Task 1-6 implement Sprint 1 components / Task 7 runs build, integration tests, and monorepo regression | Clean. Build command `pnpm --filter @car-control/web build` validates pure CSS variable AntD 6 & Vite 8 bundle |

Scan clean. Ready to execute Sprint 1 Task 1.

## Progress
- Sprint 0: complete (commit 5748445, all 10 PM & UI/UX design deliverables, 188-item traceability matrix, and pilot page specs established)
- Task 1: complete (commits 1117d69..11e2f69, review clean with 2 findings immediately addressed)
- Task 2: fix round 1/1 (4 addressed, 0 open; commits ff23739..f5579a5)
- Task 2: complete (commits 5748445..f5579a5, review clean)
- Task 3: fix round 1/1 (4 addressed, 0 open; commits aebfd00..020e809)
- Task 3: complete (commits f5579a5..020e809, review clean)
- Task 4: fix round 1/1 (3 addressed, 0 open; commits ed51918..97a3e15)
- Task 4: complete (commits 020e809..97a3e15, review APPROVED)
- Task 5: complete (commits 97a3e15..613f6bd, review APPROVED)
- Task 6: complete (commits 613f6bd..bfa8a5d, review APPROVED)
- Task 7: complete (commit bfa8a5d, 62/62 web tests pass, 112/112 api tests pass, 174/174 monorepo tests pass, Vite 8 Rolldown 681ms build pass)
- Sprint 1 (Week 1 Foundation & IAM): **100% COMPLETE** (All 7 tasks finished, reviewed, and signed off in `sprint-1-acceptance-report.md`)

## Pre-flight Conflict Scan (Sprint 2)

| Task Pair | Produces / Consumes | Conflict Scan Finding |
|---|---|---|
| Task 1 & Task 2 | Task 1 defines `device-core.ts` & `DeviceDto` / Task 2 imports them in `BatchImportModal` | Clean. Aligned models for IMEI (15-digit), ICCID (20-char), productKey |
| Task 1 & Task 3 | Task 1 provides table row trigger / Task 3 renders `DeviceDetailDrawer` | Clean. Drawer accepts `deviceId` and emits updates to list |
| Task 1 & Task 4 | Task 1 manages devices / Task 4 manages vehicles | Clean. Both share project & tenant context, status tags follow design tokens |
| Task 4 & Task 5 | Task 4 triggers bind/unbind / Task 5 implements `VehicleBindModal` | Clean. Modal takes vehicle or device and verifies binding invariants |
| Task 4 & Task 6 | Task 4 references models / Task 6 manages `ModelManageView` & `ProjectManageView` | Clean. 0x02 protocol code mapped consistently |
| Task 1-6 & Task 7 | Task 1-6 implement components / Task 7 tests and builds monorepo | Clean. Strict build gate |

Scan clean. Ready to execute Sprint 2 Task 1.

## Sprint 2 Progress
- Sprint 2 Task 1: complete (commits e5ee58f..b07322c, review APPROVED, 72/72 web tests, 184/184 monorepo tests, build pass)
- Sprint 2 Task 2: complete (commits f40c186..ebbd2f3, review APPROVED, 80/80 web tests, 192/192 monorepo tests, build pass)
- Sprint 2 Task 3: complete (commits 26bb2ce..c8621bb, review APPROVED, 99/99 web tests, 211/211 monorepo tests, build pass)
- Sprint 2 Task 4: complete (commits d773da5..7c6a51c, review APPROVED, 126/126 web tests, 238/238 monorepo tests, build pass)
- Sprint 2 Task 5: complete (commits d7b73ed..8e595c6, review APPROVED, 144/144 web tests, 256/256 monorepo tests, build pass)
- Sprint 2 Task 6: complete (commits 4649b9f..4093719, review APPROVED, 165/165 web tests, 277/277 monorepo tests, build pass)
- Sprint 2 Task 7: complete (165/165 web tests pass, 112/112 api tests pass, 277/277 monorepo tests pass, Vite 8 Rolldown 723ms build pass)
- Sprint 2 (Week 2 Asset & Inventory Core): **100% COMPLETE** (All 7 tasks finished, reviewed, and signed off in `sprint-2-acceptance-report.md`)

## Pre-flight Conflict Scan (Sprint 3)

| Task Pair | Produces / Consumes | Conflict Scan Finding |
|---|---|---|
| Task 1 & Task 2 | Task 1 provides command execution trigger & `command-core.ts` / Task 2 provides `CommandStreamDrawer` | Clean. Task 1 embeds or links drawer, sharing `commandId` and log stream |
| Task 1 & Task 3 | Task 1 evaluates vehicle capabilities / Task 3 edits `CapabilityTemplateView` | Clean. Both reference `EffectiveCapabilityDto` from `@car-control/contracts` |
| Task 3 & Task 4 | Task 3 edits templates / Task 4 creates per-vehicle overrides | Clean. Override drawer diffs against template definition |
| Task 1 & Task 5 | Task 1 controls vehicles / Task 5 provisions digital keys | Clean. Both operate on vehicle ID and share tenant scope |
| Task 1-6 & Task 7 | Task 1-6 implement components / Task 7 tests and builds monorepo | Clean. Strict build and test gates |

Scan clean. Ready to execute Sprint 3 Task 1.

## Sprint 3 Progress
- Sprint 3 Task 1: complete (commits 084836c..81c3605, review APPROVED, 193/193 web tests, 305/305 monorepo tests, build pass)
- Sprint 3 Task 2: complete (commits c15d8c3..5f36743, review APPROVED, 205/205 web tests, 317/317 monorepo tests, build pass)
- Sprint 3 Task 3: complete (commits d3235a2..ce2098a, review APPROVED, 237/237 web tests, 349/349 monorepo tests, build pass)
- Sprint 3 Task 4: complete (commits 850b282..0041be6, review APPROVED, 259/259 web tests, 371/371 monorepo tests, build pass)
- Sprint 3 Task 5: complete (commits 4c5b0a7..6f5e155, review APPROVED, 289/289 web tests, 401/401 monorepo tests, build pass)
- Sprint 3 Task 6: complete (commit 05dbc56, review APPROVED, 313/313 web tests, 425/425 monorepo tests, build pass)
- Sprint 3 Task 7: complete (commit 05dbc56, 313/313 web tests pass, 112/112 api tests pass, 425/425 monorepo tests pass, Vite 8 Rolldown 794ms build pass)
- Sprint 3 (Week 3 Remote Vehicle Control & Capability Center): **100% COMPLETE** (All 7 tasks finished, reviewed, and signed off in `sprint-3-acceptance-report.md`)

## Pre-flight Conflict Scan (Sprint 4)

| Task Pair | Produces / Consumes | Conflict Scan Finding |
|---|---|---|
| Task 1 & Task 2 | Task 1 provides `MapContainer` & `map-core.ts` / Task 2 consumes `MapContainer` for realtime multi-vehicle tracking | Clean. `MapContainer` supports markers, clustering, and responsive bounds via props |
| Task 1 & Task 3 | Task 1 provides map canvas base / Task 3 renders trajectory polyline & animated car marker | Clean. Task 3 reuses coordinate projection and polyline drawing helpers |
| Task 1 & Task 4 | Task 1 provides map container / Task 4 draws interactive circular and polygonal geofence layers | Clean. Geofence overlay layers cleanly onto `MapContainer` |
| Task 4 & Task 5 | Task 4 configures geofence rules / Task 5 handles GEOFENCE_IN/OUT alarm records | Clean. Both share `AlarmType.GEOFENCE_IN` and `AlarmType.GEOFENCE_OUT` from `@car-control/contracts` |
| Task 5 & Task 6 | Task 5 manages alarm lifecycle & `alarm-core.ts` / Task 6 listens to WebSocket `alarm.triggered` | Clean. Shared `AlarmRecord`, `AlarmType`, `AlarmLevel` and status transitions |
| Task 1-6 & Task 7 | Task 1-6 implement Sprint 4 views / Task 7 tests and builds monorepo | Clean. Build and full test suites enforce zero regressions |

Scan clean. Ready to execute Sprint 4 Task 1.

## Sprint 4 Progress
- Sprint 4 Task 1: complete (commits 910b393..4da7eda, review APPROVED, 338/338 web tests, 450/450 monorepo tests, build pass)
- Sprint 4 Task 2: pending (车辆实时定位监控视图 `RealtimeLocationMap.tsx` + `telemetry-core.ts` + `api/telemetry.ts`)
- Sprint 4 Task 3: pending (历史轨迹回放工作台与播放器 `TrajectoryReplayView.tsx` + `TrajectoryPlayer.tsx` + `trajectory-core.ts`)
- Sprint 4 Task 4: pending (电子围栏可视化管理 `GeofenceManageView.tsx` + `geofence-core.ts` + `api/geofence.ts`)
- Sprint 4 Task 5: pending (报警中心与人工处置抽屉 `AlertCenterView.tsx` + `AlertProcessDrawer.tsx` + `alarm-core.ts` + `api/alarm.ts`)
- Sprint 4 Task 6: pending (全局实时告警声光弹窗 `AlertRealtimeNotification.tsx`)
- Sprint 4 Task 7: pending (Sprint 4 综合验收与全工程回归)







