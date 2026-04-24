# Foundry VTT v13/v14 Upgrade Plan

## Current State

`system.json` declares `minimum: 13, verified: 13, maximum: 13` but the code still uses APIs deprecated in v13 that **will be removed in v14**. The goal is to ship two PRs to upstream:

- **PR A** — Full v13 compliance (remove all deprecated `appv1` API usage)
- **PR B** — v14 compatibility (update system.json to v14, fix any v14 breakage)

---

## Deprecated API Inventory

| Class / Function | File | Deprecated API | Target |
|---|---|---|---|
| `LancerActorSheet` | `actor/lancer-actor-sheet.ts` | `foundry.appv1.sheets.ActorSheet` | `ActorSheetV2` |
| `LancerPilotSheet` | `actor/pilot-sheet.ts` | inherits `appv1` | inherits `ActorSheetV2` |
| `LancerMechSheet` | `actor/mech-sheet.ts` | inherits `appv1` | inherits `ActorSheetV2` |
| `LancerNPCSheet` | `actor/npc-sheet.ts` | inherits `appv1` | inherits `ActorSheetV2` |
| `LancerDeployableSheet` | `actor/deployable-sheet.ts` | inherits `appv1` | inherits `ActorSheetV2` |
| `LancerItemSheet` | `item/item-sheet.ts` | `foundry.appv1.sheets.ItemSheet` | `ItemSheetV2` |
| `LancerFrameSheet` | `item/frame-sheet.ts` | inherits `appv1` | inherits `ItemSheetV2` |
| `LancerLicenseSheet` | `item/license-sheet.ts` | inherits `appv1` | inherits `ItemSheetV2` |
| `LancerNPCClassSheet` | `item/npc-class-sheet.ts` | inherits `appv1` | inherits `ItemSheetV2` |
| `LancerNPCFeatureSheet` | `item/npc-feature-sheet.ts` | inherits `appv1` | inherits `ItemSheetV2` |
| `TargetedEditForm` | `apps/targeted-form-editor.ts` | `FormApplication` | `ApplicationV2` |
| `HTMLEditDialog` | `apps/text-editor.ts` | `FormApplication` | `ApplicationV2` |
| `InventoryDialog` | `apps/inventory.ts` | `Dialog` | `DialogV2` |
| `promptText()` | `apps/simple-prompt.ts` | `new Dialog()` | `DialogV2.wait()` |
| inline dialogs | `flows/full-repair.ts`, `flows/stabilize.ts`, `helpers/automation/combat.ts`, `apps/status-icon-config.ts` | `new Dialog()` | `DialogV2` |

**Already modern (no migration needed):**
- `LCPManager` — `HandlebarsApplicationMixin(ApplicationV2)` ✓
- `LancerCombatTracker` — `foundry.applications.sidebar.tabs.CombatTracker` ✓
- `AccDiffHUD`, `DamageHUD`, `StructStressHUD` — pure Svelte 5 ✓
- `world_migration.ts` — already uses `DialogV2` ✓

---

## Work Chunks (ordered by risk)

### Chunk 1 — Dialog → DialogV2

**Effort:** ~1 day | **Risk:** Low

All uses of `new Dialog()` replaced with `DialogV2` static methods.

Files:
- `apps/simple-prompt.ts`
- `apps/inventory.ts` (`InventoryDialog extends Dialog`)
- `flows/full-repair.ts`
- `flows/stabilize.ts`
- `helpers/automation/combat.ts`
- `apps/status-icon-config.ts`

Reference pattern from `util/world_migration.ts`:
```typescript
await foundry.applications.api.DialogV2.confirm({
  window: { title: "..." },
  content: "<p>...</p>",
});
```

---

### Chunk 2 — FormApplication → ApplicationV2

**Effort:** ~2 days | **Risk:** Medium

`TargetedEditForm` and `HTMLEditDialog` need full ApplicationV2 rewrites. Also audit `action-editor.ts`, `bonus-editor.ts`, `counter-editor.ts`, `tag-editor.ts`, `action-tracker-settings.ts`, `automation-settings.ts` for any remaining FormApplication usage.

Key API changes:
```typescript
// Before
class MyForm extends FormApplication {
  static get defaultOptions() { return mergeObject(super.defaultOptions, { template: '...' }); }
  getData() { return { ... }; }
  activateListeners(html: JQuery) { html.find('.btn').on('click', ...); }
  async _updateObject(event, formData) { ... }
}

// After
import ApplicationV2 = foundry.applications.api.ApplicationV2;
import HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;

class MyForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = { window: { title: '...' } };
  static PARTS = { body: { template: 'systems/lancer/templates/...' } };
  async _prepareContext(options) { return { ... }; }
  _onRender(context, options) {
    this.element.querySelector('.btn')?.addEventListener('click', ...);
  }
}
```

---

### Chunk 3 — LancerItemSheet migration

**Effort:** ~3-4 days | **Risk:** High

Migrate all item sheets off `appv1.sheets.ItemSheet`. This requires:
1. Change base class to `foundry.applications.sheets.ItemSheetV2` (via HandlebarsApplicationMixin)
2. Convert all `activateListeners(html: JQuery)` → `_onRender(context, options)` with vanilla DOM
3. Refactor helper functions in `module/helpers/` that currently accept `html: JQuery`

Suggested helper signature change (all helpers):
```typescript
// Before
export function handleRefClickOpen(html: JQuery): void { html.find('.ref-clickable').on(...); }

// After  
export function handleRefClickOpen(html: HTMLElement): void {
  html.querySelectorAll('.ref-clickable').forEach(el => el.addEventListener(...));
}
```

Files (core):
- `item/item-sheet.ts`
- `item/frame-sheet.ts`
- `item/license-sheet.ts`
- `item/npc-class-sheet.ts`
- `item/npc-feature-sheet.ts`

Helper files to refactor:
- `helpers/refs.ts`
- `helpers/collapse.ts`
- `helpers/commons.ts`
- `helpers/item.ts`
- `helpers/tags.ts`
- `helpers/dragdrop.ts`

---

### Chunk 4 — LancerActorSheet migration

**Effort:** ~4-5 days | **Risk:** Very High

This is the largest chunk and depends on Chunk 3 (shared helpers must already be converted).

Files (core):
- `actor/lancer-actor-sheet.ts`
- `actor/pilot-sheet.ts`
- `actor/mech-sheet.ts`
- `actor/npc-sheet.ts`
- `actor/deployable-sheet.ts`

Same patterns as Chunk 3, plus:
- Drag-drop lifecycle (`_onDragStart`, `_onDrop`) — API changes in ApplicationV2
- Any appv1-specific drop handling logic

---

### Chunk 5 — v14 system.json and audit

**Effort:** ~1-2 days | **Risk:** Unknown

After all code is off appv1:
1. Update `system.json`: `"compatibility": { "minimum": 14, "verified": 14, "maximum": 14 }`
2. Run through major workflows in a Foundry v14 dev instance
3. Fix any remaining v14-specific breakage (canvas/token APIs, setting APIs, etc.)
4. Add `maximum: 13` to the v13 PR's system.json to cap it cleanly

---

## JQuery → Vanilla DOM Quick Reference

| JQuery | Vanilla DOM |
|---|---|
| `html.find(sel)` | `Array.from(html.querySelectorAll(sel))` |
| `html.find(sel).first()` / `html.find(sel)[0]` | `html.querySelector(sel)` |
| `$(el).on(evt, handler)` | `el.addEventListener(evt, handler)` |
| `html.on(evt, sel, handler)` | delegate on `html`, use `e.target.closest(sel)` |
| `$(el).data('key')` | `el.dataset.key` |
| `$(el).val()` | `(el as HTMLInputElement).value` |
| `$(el).addClass('x')` | `el.classList.add('x')` |
| `$(el).attr('x', v)` | `el.setAttribute('x', v)` |
| `$(el).trigger('click')` | `el.dispatchEvent(new MouseEvent('click'))` |
| `$(el).closest(sel)` | `el.closest(sel)` |
| `$(el).siblings(sel)` | `Array.from(el.parentElement?.children ?? []).filter(c => c !== el && c.matches(sel))` |

---

## Branch / PR Strategy

```
master (upstream)
├── feature/v13-dialog-migration       → PR A1 (Chunk 1)
├── feature/v13-formapp-migration      → PR A2 (Chunk 2)
├── feature/v13-itemsheet-migration    → PR A3 (Chunk 3)
├── feature/v13-actorsheet-migration   → PR A4 (Chunk 4, depends on A3)
└── feature/v14-compatibility          → PR B (depends on A1-A4)
```

Each PR should:
- Target upstream `master`
- Be independently mergeable (or clearly depend on a prior PR)
- Include a test checklist in the PR description
- Not change gameplay logic, only API plumbing

---

## Testing Checklist (per chunk)

- [ ] Build completes without TypeScript errors (`npm run build`)
- [ ] Sheets open for: pilot, mech, NPC, deployable actors
- [ ] Sheets open for: frame, license, weapon, system, NPC class/feature items
- [ ] Drag-drop items onto actor sheets
- [ ] Attack flow (roll attack, damage, apply)
- [ ] Structure/stress flows
- [ ] Tech attack flow
- [ ] LCP manager opens and installs a pack
- [ ] Acc/Diff HUD renders correctly
- [ ] Damage HUD renders correctly
- [ ] Combat tracker works
- [ ] Active effects apply/remove correctly
- [ ] World migration runs on version upgrade
