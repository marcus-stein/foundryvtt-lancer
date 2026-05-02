import { LANCER } from "../config";
import type { LancerItem, LancerItemType } from "./lancer-item";
import { handleGenControls, handlePopoutTextEditor } from "../helpers/commons";
import { handleCounterInteraction, handleInputPlusMinusButtons } from "../helpers/item";
import {
  handleRefDragging,
  handleRefSlotDropping,
  handleDocListDropping,
  click_evt_open_ref,
  handleUsesInteraction,
  handleLIDListDropping,
} from "../helpers/refs";
import { handleContextMenus } from "../helpers/item";
import { applyCollapseListeners, initializeCollapses } from "../helpers/collapse";
import { ActionEditDialog } from "../apps/action-editor";
import { findLicenseFor, get_pack_id } from "../util/doc";
import { lookupOwnedDeployables } from "../util/lid";
import { EntryType, StatusConditionType } from "../enums";
import type { LancerDEPLOYABLE } from "../actor/lancer-actor";
import { BonusEditDialog } from "../apps/bonus-editor";
import { OrgType } from "../enums";
import { handleTagEditButtons } from "../helpers/tags";

const lp = LANCER.log_prefix;

/**
 * Extend the basic ItemSheetV2 with Lancer-specific behavior.
 */
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class LancerItemSheet<T extends LancerItemType> extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "item"],
    position: { width: 700, height: 700 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static PARTS = { body: { template: "" } } as Record<string, any>;

  protected _configureRenderParts(_options: any): Record<string, any> {
    return { body: { template: this.template, templates: [] } };
  }

  get item(): LancerItem {
    return this.document as LancerItem;
  }

  get template(): string {
    return `systems/lancer/templates/item/${this.document.type}.hbs`;
  }

  protected async _renderHTML(context: object, _options: any): Promise<Record<string, HTMLElement>> {
    const html = await foundry.applications.handlebars.renderTemplate(this.template, context as Record<string, unknown>);
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-application-part", "body");
    wrapper.innerHTML = html;
    return { body: wrapper };
  }

  async _prepareContext(_opts: any): Promise<object> {
    const base = await super._prepareContext(_opts);
    const item = this.item;
    const context: Record<string, unknown> = {
      ...base,
      item,
      system: item.system,
      editable: this.isEditable,
      collapse: {},
      deployables: {} as Record<string, LancerDEPLOYABLE>,
      license: null,
    };

    // Populate deployables
    if (!item.pack && item.actor) {
      context.deployables = lookupOwnedDeployables(item.actor);
    } else {
      const deps =
        (await game.packs.get(get_pack_id(EntryType.DEPLOYABLE))?.getDocuments({ type: EntryType.DEPLOYABLE })) ?? [];
      for (const d of deps as LancerDEPLOYABLE[]) {
        (context.deployables as Record<string, LancerDEPLOYABLE>)[d.system.lid] = d;
      }
    }

    // License lookup
    const actor = item.actor as any;
    if (actor?.is_pilot() || actor?.is_mech()) {
      context.license = await findLicenseFor(item, actor);
    } else {
      context.license = await findLicenseFor(item);
    }

    if (item.is_organization()) {
      context.org_types = OrgType;
    }

    if (item.is_status()) {
      context.status_types = StatusConditionType;
      if (!item.system.lid) {
        (item.system as any).lid = `status-${item.id}`;
      }
    }

    console.log(`${lp} Rendering with following item ctx: `, context);
    return context;
  }

  async _onFirstRender(_context: object, _options: any): Promise<void> {
    this.element.setAttribute("autocomplete", "off");
    // Add item type as CSS class for type-specific styling
    this.element.classList.add(this.document.type);
  }

  async _onRender(_context: object, _options: any): Promise<void> {
    // Activate tabs
    new foundry.applications.ux.Tabs({
      navSelector: ".lancer-tabs",
      contentSelector: ".sheet-body",
      initial: "description",
    }).bind(this.element);

    const html = this.element;
    initializeCollapses(html);
    applyCollapseListeners(html);
    $(html).find(".ref.set.click-open").on("click", click_evt_open_ref);
    handleRefDragging(html);
    handleContextMenus(html, this.item, !this.isEditable);
    handleTagEditButtons(html, this.item);

    if (!this.isEditable) return;

    handleInputPlusMinusButtons(html, this.item);
    handleCounterInteraction(html, this.item);
    handleUsesInteraction(html, this.item);
    handleDocListDropping(html, this.item);
    handleLIDListDropping(html, this.item);
    handleRefSlotDropping(html, this.item, null);
    BonusEditDialog.handle(html, ".editable.bonus", this.item);
    ActionEditDialog.handle(html, ".action-editor", this.item);
    handlePopoutTextEditor(html, this.item);
    handleGenControls(html, this.item);
  }
}
