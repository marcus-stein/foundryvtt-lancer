import type { LancerActor } from "../actor/lancer-actor";
import { handleGenControls } from "../helpers/commons";
import { handleRefDragging, click_evt_open_ref } from "../helpers/refs";
import { handleContextMenus } from "../helpers/item";
import { applyCollapseListeners, initializeCollapses } from "../helpers/collapse";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface FilledCategory {
  label: string;
  items: any[];
}

/**
 * A helper ApplicationV2 subclass for viewing an actor's inventory
 */
export class InventoryDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  readonly actor: LancerActor;

  constructor(actor: LancerActor, options: Partial<foundry.applications.api.ApplicationV2.Configuration> = {}) {
    super(options);
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    classes: ["lancer", "inventory-editor"],
    position: { width: 700, height: 700 },
  };

  static PARTS = {
    body: { template: "systems/lancer/templates/window/inventory.hbs" },
  };

  get title(): string {
    return `${this.actor.name}'s inventory`;
  }

  async _prepareContext(_opts: any): Promise<object> {
    return { categories: this.populate_categories(this.actor) };
  }

  async _onFirstRender(_context: object, _options: any): Promise<void> {
    this.actor.apps[this.id] = this as any;
  }

  /** @override */
  async _onRender(_context: object, _options: any): Promise<void> {
    // JQuery shim — helpers will be converted to vanilla DOM in Chunk 3
    const html = $(this.element);
    initializeCollapses(html);
    applyCollapseListeners(html);
    handleGenControls(html, this.actor);
    handleRefDragging(html);
    handleContextMenus(html, this.actor);
    html.find(".ref.set.click-open").on("click", click_evt_open_ref);
  }

  protected async _onClose(_options: any): Promise<void> {
    delete this.actor.apps[this.id];
    return super._onClose(_options);
  }

  populate_categories(actor: LancerActor): FilledCategory[] {
    let cats: FilledCategory[] = [];
    if (actor.is_mech()) {
      cats = [
        { label: "Frames", items: actor.items.filter(i => i.is_frame()) },
        { label: "Weapons", items: actor.items.filter(i => i.is_mech_weapon()) },
        { label: "Systems", items: actor.items.filter(i => i.is_mech_system()) },
        { label: "Mods", items: actor.items.filter(i => i.is_weapon_mod()) },
        { label: "Statuses", items: actor.items.filter(i => i.is_status()) },
      ];
    } else if (actor.is_pilot()) {
      cats = [
        { label: "Weapons", items: actor.items.filter(i => i.is_pilot_weapon()) },
        { label: "Armor", items: actor.items.filter(i => i.is_pilot_armor()) },
        { label: "Gear", items: actor.items.filter(i => i.is_pilot_gear()) },
        { label: "Talents", items: actor.items.filter(i => i.is_talent()) },
        { label: "Skills", items: actor.items.filter(i => i.is_skill()) },
        { label: "Licenses", items: actor.items.filter(i => i.is_license()) },
        { label: "Core Bonuses", items: actor.items.filter(i => i.is_core_bonus()) },
        { label: "Reserves", items: actor.items.filter(i => i.is_reserve()) },
        { label: "Organizations", items: actor.items.filter(i => i.is_organization()) },
        { label: "Statuses", items: actor.items.filter(i => i.is_status()) },
      ];
    } else {
      console.warn("Cannot yet show inventory for " + actor.type);
    }
    return cats;
  }

  static async show_inventory(actor: LancerActor): Promise<void> {
    new this(actor).render({ force: true });
  }
}
