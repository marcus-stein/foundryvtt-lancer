import type { ActionType } from "../action";
import { modAction } from "../action/action-tracker";
import { InventoryDialog } from "../apps/inventory";
import { LANCER } from "../config";
import { LancerActiveEffect } from "../effects/lancer-active-effect";
import { EntryType } from "../enums";
import { LancerFlowState } from "../flows/interfaces";
import { beginItemChatFlow } from "../flows/item";
import { CollapseHandler, applyCollapseListeners, initializeCollapses } from "../helpers/collapse";
import { handleGenControls, handlePopoutTextEditor } from "../helpers/commons";
import {
  DroppableFlowType,
  type LancerFlowDropData,
  type ResolvedDropData,
  handleDocDropping,
} from "../helpers/dragdrop";
import {
  handleContextMenus,
  handleCounterInteraction,
  handleInputPlusMinusButtons,
  handlePowerUsesInteraction,
} from "../helpers/item";
import {
  handleChargedInteraction,
  handleLoadedInteraction,
  handleRefClickOpen,
  handleRefDragging,
  handleRefSlotDropping,
  handleUsesInteraction,
} from "../helpers/refs";
import { LancerItem } from "../item/lancer-item";
import { lookupOwnedDeployables } from "../util/lid";
import { LancerActor, type LancerActorType } from "./lancer-actor";
const lp = LANCER.log_prefix;

/**
 * Extend the basic ActorSheetV2 for Lancer actors.
 */
export class LancerActorSheet<T extends LancerActorType> extends foundry.applications.sheets.ActorSheetV2 {
  // Tracks collapse state between renders (retained for potential future use)
  protected collapse_handler = new CollapseHandler();

  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "actor"],
    position: { width: 800, height: 800 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static PARTS = {} as Record<string, any>;

  get actor(): LancerActor {
    return this.document as unknown as LancerActor;
  }

  protected get tabInitial(): string {
    return "stats";
  }

  get template(): string {
    return `systems/${game.system.id}/templates/actor/${this.document.type}.hbs`;
  }

  protected async _renderHTML(context: object, _options: any): Promise<Record<string, HTMLElement>> {
    const html = await renderTemplate(this.template, context as Record<string, unknown>);
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-application-part", "body");
    wrapper.innerHTML = html;
    return { body: wrapper };
  }

  async _prepareContext(_opts: any): Promise<any> {
    const base = await super._prepareContext(_opts);
    const data: any = { ...base };
    data.actor = this.actor;
    data.collapse = {};
    data.system = this.actor.system;
    if (data.system.loadout) {
      for (const [key, value] of Object.entries(data.system.loadout)) {
        if (!Array.isArray(value)) continue;
        data.system.loadout[key] = (value as { id: string; status: string; value: LancerItem }[]).sort(
          (a: any, b: any) => a?.value?.sort - b?.value?.sort
        );
      }
    }
    data.itemTypes = this.actor.itemTypes;
    for (const [key, value] of Object.entries(data.itemTypes)) {
      data.itemTypes[key] = (value as LancerItem[]).sort((a: any, b: any) => a.sort - b.sort);
    }
    data.effect_categories = LancerActiveEffect.prepareActiveEffectCategories(this.actor);
    data.deployables = lookupOwnedDeployables(this.actor);
    console.log(`${lp} Rendering with following actor ctx: `, data);
    return data;
  }

  async _onFirstRender(_context: object, _options: any): Promise<void> {
    this.element.setAttribute("autocomplete", "off");
    this.element.classList.add(this.document.type);
  }

  async _onRender(_context: object, _options: any): Promise<void> {
    new foundry.applications.ux.Tabs({
      navSelector: ".lancer-tabs",
      contentSelector: ".sheet-body",
      initial: this.tabInitial,
    }).bind(this.element);

    const html = this.element;

    initializeCollapses(html);
    applyCollapseListeners(html);
    this._activateActionGridListeners(html);
    handleRefClickOpen(html);
    handleRefDragging(html);

    if (!this.isEditable) return;

    this._activateFlowListeners(html);
    this._activateFlowDragging(html);
    handleInputPlusMinusButtons(html, this.actor);
    handleCounterInteraction(html, this.actor);
    handleUsesInteraction(html, this.actor);
    handleLoadedInteraction(html, this.actor);
    handleChargedInteraction(html, this.actor);
    handlePowerUsesInteraction(html, this.actor);
    handleContextMenus(html, this.actor);
    this._activateInventoryButton(html);
    handleRefSlotDropping(html, this.actor, x => this.quickOwnDrop(x).then(v => v[0]));
    handleGenControls(html, this.actor);
    handlePopoutTextEditor(html, this.actor);

    handleDocDropping(
      $(html),
      async (entry, dest, event) => this.onRootDrop(entry, event.originalEvent!, dest[0]),
      (entry, _dest, _event) => this.canRootDrop(entry)
    );
  }

  protected override async _processSubmitData(event: SubmitEvent, form: HTMLFormElement, submitData: any): Promise<void> {
    this._propagateData(submitData);
    return super._processSubmitData(event, form, submitData);
  }

  _activateFlowDragging(html: HTMLElement) {
    const FlowDragHandler = (e: DragEvent) => this._onFlowButtonDragStart(e);
    const $html = $(html);

    $html
      .find(".lancer-flow-button")
      .add(".roll-stat")
      .add(".roll-attack")
      .add(".roll-tech")
      .add(".roll-damage")
      .add(".chat-flow-button")
      .add(".skill-flow")
      .add(".bond-power-flow")
      .add(".effect-flow")
      .add(".activation-flow")
      .each((_i, item) => {
        item.setAttribute("draggable", "true");
        item.addEventListener("dragstart", FlowDragHandler, false);
      });
  }

  _onFlowButtonDragStart(e: DragEvent) {
    if (!e.currentTarget) return;
    e.stopPropagation();

    const dragElement = e.currentTarget as HTMLElement;
    let data: LancerFlowDropData | null = null;
    if (dragElement.classList.contains("lancer-flow-button")) {
      const flowElement = dragElement.closest("[data-flow-type]") as HTMLElement;
      const flowType: DroppableFlowType = DroppableFlowType.BASIC;
      const flowSubtype = flowElement?.dataset.flowType;
      const flowArgs = JSON.parse(flowElement?.dataset.flowArgs ?? "{}");
      if (flowSubtype) {
        data = {
          lancerType: this.actor.type as EntryType,
          uuid: this.actor.uuid,
          flowType,
          flowSubtype,
          args: flowArgs,
        };
      }
    } else if (dragElement.classList.contains("roll-stat")) {
      const el = dragElement.closest("[data-uuid]") as HTMLElement;
      const statPath = el?.dataset.path;
      if (!statPath) throw Error("No stat path found!");
      data = {
        lancerType: this.actor.type as EntryType,
        uuid: this.actor.uuid,
        flowType: DroppableFlowType.STAT,
        args: { statPath },
      };
    } else if (dragElement.classList.contains("roll-attack") || dragElement.classList.contains("roll-damage")) {
      const weaponElement = dragElement.closest("[data-uuid]") as HTMLElement;
      const weaponId = weaponElement?.dataset.uuid;
      if (!weaponId) throw Error("No weapon ID found!");
      const weapon = LancerItem.fromUuidSync(weaponId, `Invalid weapon ID: ${weaponId}`);
      data = {
        lancerType: weapon.type as EntryType,
        uuid: weaponId,
        flowType: dragElement.classList.contains("roll-attack") ? DroppableFlowType.ATTACK : DroppableFlowType.DAMAGE,
        args: {},
      };
    } else if (dragElement.classList.contains("roll-tech")) {
      const techElement = dragElement.closest("[data-uuid]") as HTMLElement;
      const techId = techElement?.dataset.uuid;
      if (!techId) throw Error("No tech ID found!");
      const techItem = LancerItem.fromUuidSync(techId, `Invalid tech ID: ${techId}`);
      data = {
        lancerType: techItem.type as EntryType,
        uuid: techId,
        flowType: DroppableFlowType.TECH_ATTACK,
        args: {},
      };
    } else if (dragElement.classList.contains("chat-flow-button")) {
      const el = dragElement.closest("[data-uuid]") as HTMLElement;
      if (!el || !el.dataset.uuid) throw Error(`No item UUID found!`);
      const item = LancerItem.fromUuidSync(el.dataset.uuid, `Invalid item ID: ${el.dataset.uuid}`);
      data = {
        lancerType: item.type as EntryType,
        uuid: el.dataset.uuid,
        flowType: DroppableFlowType.CHAT,
        args: { ...el.dataset },
      };
    } else if (dragElement.classList.contains("skill-flow")) {
      const el = dragElement.closest("[data-uuid]") as HTMLElement;
      const skillId = el?.dataset.uuid;
      if (!skillId) throw Error("No skill ID found!");
      const skill = LancerItem.fromUuidSync(skillId, `Invalid skill ID: ${skillId}`);
      data = {
        lancerType: skill.type as EntryType,
        uuid: skillId,
        flowType: DroppableFlowType.SKILL,
        args: { skillId },
      };
    } else if (dragElement.classList.contains("bond-power-flow")) {
      const powerElement = dragElement.closest("[data-uuid]") as HTMLElement;
      const bondId = powerElement?.dataset.uuid;
      if (!bondId) throw Error("No bond ID found!");
      const bond = LancerItem.fromUuidSync(bondId, `Invalid bond ID: ${bondId}`);
      const powerIndex = parseInt(powerElement?.dataset.powerIndex ?? "-1");
      data = {
        lancerType: bond.type as EntryType,
        uuid: bondId,
        flowType: DroppableFlowType.BOND_POWER,
        args: { powerIndex },
      };
    } else if (dragElement.classList.contains("effect-flow")) {
      const el = dragElement.closest("[data-uuid]") as HTMLElement;
      const itemId = el?.dataset.uuid;
      if (!itemId) throw Error("No item ID found!");
      const item = LancerItem.fromUuidSync(itemId, `Invalid item ID: ${itemId}`);
      data = {
        lancerType: item.type as EntryType,
        uuid: itemId,
        flowType: DroppableFlowType.EFFECT,
        args: {},
      };
    } else if (dragElement.classList.contains("activation-flow")) {
      const el = dragElement as HTMLElement;
      const itemId = el.dataset.uuid;
      const path = el.dataset.path;
      if (!itemId || !path) throw Error("No item ID from activation chip");
      let isDeployable = path.includes("deployable");
      let isAction = !isDeployable && path.includes("action");
      let isCoreSystem = !isDeployable && path.includes("core_system");
      const item = LancerItem.fromUuidSync(itemId, `Invalid item ID: ${itemId}`);
      if (isAction) {
        data = {
          lancerType: item.type as EntryType,
          uuid: itemId,
          flowType: DroppableFlowType.ACTIVATION,
          args: { path },
        };
      } else if (isCoreSystem) {
        data = {
          lancerType: item.type as EntryType,
          uuid: itemId,
          flowType: DroppableFlowType.CORE_ACTIVE,
          args: { path },
        };
      } else if (isDeployable) {
        // TODO - deployable actions
      } else {
        ui.notifications!.error("Could not infer action type");
        throw Error("Could not infer action type");
      }
    }
    if (!data) return;
    e.dataTransfer?.setData("text/plain", JSON.stringify(data));
    console.log("Flow drag data:", data, e.dataTransfer?.getData("text/plain"));
  }

  async _activateActionGridListeners(html: HTMLElement) {
    const $html = $(html);
    let elements = $html.find(".lancer-action-button");
    elements.on("click", async ev => {
      ev.stopPropagation();

      if (game.user?.isGM || game.settings.get(game.system.id, LANCER.setting_actionTracker).allowPlayers) {
        const params = ev.currentTarget.dataset;
        const action = params.action as ActionType | undefined;
        if (action && params.val) {
          let spend: boolean;
          if (params.action === "move") {
            spend = parseInt(params.val) > 0;
          } else {
            spend = params.val === "true";
          }
          modAction(this.actor, spend, action);
        }
      } else {
        console.log(`${game.user?.name} :: Users currently not allowed to toggle actions through action manager.`);
      }
    });
  }

  _activateFlowListeners(html: HTMLElement) {
    const $html = $(html);

    // Basic flow buttons
    let actorFlows = $html.find(".lancer-flow-button");
    actorFlows.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      const flowElement = $(ev.currentTarget).closest("[data-flow-type]")[0] as HTMLElement;
      const flowType = flowElement?.dataset.flowType;
      const flowArgs = JSON.parse(flowElement?.dataset.flowArgs ?? "{}");
      const BasicFlowType = LancerFlowState.BasicFlowType;
      switch (flowType) {
        case BasicFlowType.FullRepair:
          this.actor.beginFullRepairFlow(flowArgs?.title ?? undefined);
          break;
        case BasicFlowType.Stabilize:
          this.actor.beginStabilizeFlow(flowArgs?.title ?? undefined);
          break;
        case BasicFlowType.Overheat:
          this.actor.beginOverheatFlow();
          break;
        case BasicFlowType.Structure:
          this.actor.beginStructureFlow();
          break;
        case BasicFlowType.Overcharge:
          this.actor.beginOverchargeFlow();
          break;
        case BasicFlowType.Burn:
          this.actor.beginBurnFlow();
          break;
        case BasicFlowType.BasicAttack:
          this.actor.beginBasicAttackFlow(flowArgs?.title ?? undefined);
          break;
        case BasicFlowType.Damage:
          this.actor.beginDamageFlow(flowArgs?.title ?? undefined);
          break;
        case BasicFlowType.TechAttack:
          this.actor.beginBasicTechAttackFlow(flowArgs?.title ?? undefined);
          break;
      }
    });

    // Stat rollers
    let statRollers = $html.find(".roll-stat");
    statRollers.on("click", ev => {
      ev.stopPropagation();
      const el = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const statPath = el?.dataset.path;
      if (!statPath) throw Error("No stat path found!");
      this.actor.beginStatFlow(statPath);
    });

    // Weapon rollers
    let weaponRollers = $html.find(".roll-attack");
    weaponRollers.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      const weaponElement = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const weaponId = weaponElement?.dataset.uuid;
      const weapon = LancerItem.fromUuidSync(weaponId ?? "", `Invalid weapon ID: ${weaponId}`);
      weapon.beginWeaponAttackFlow();
    });

    let techRollers = $html.find(".roll-tech");
    techRollers.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      const techElement = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const techId = techElement?.dataset.uuid;
      const techItem = LancerItem.fromUuidSync(techId ?? "", `Invalid weapon ID: ${techId}`);
      techItem.beginTechAttackFlow();
    });

    let damageRollers = $html.find(".roll-damage");
    damageRollers.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      const el = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const itemId = el?.dataset.uuid;
      const item = LancerItem.fromUuidSync(itemId ?? "", `Invalid item ID: ${itemId}`);
      item.beginDamageFlow();
    });

    let itemFlows = $html.find(".chat-flow-button");
    itemFlows.on("click", async ev => {
      ev.stopPropagation();
      const el = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      if (!el || !el.dataset.uuid) throw Error(`No item UUID found!`);
      const item = await LancerItem.fromUuid(el.dataset.uuid);
      if (!item) throw Error(`UUID "${el.dataset.uuid}" does not resolve to an item!`);
      beginItemChatFlow(item, el.dataset);
    });

    let skillFlows = $html.find(".skill-flow");
    skillFlows.on("click", ev => {
      ev.stopPropagation();
      const el = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const skillId = el?.dataset.uuid;
      const skill = LancerItem.fromUuidSync(skillId ?? "", `Invalid skill ID: ${skillId}`);
      skill.beginSkillFlow();
    });

    // Bond Power flow
    let powerFlows = $html.find(".bond-power-flow");
    powerFlows.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      const powerElement = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
      const bondId = powerElement?.dataset.uuid;
      const bond = LancerItem.fromUuidSync(bondId ?? "", `Invalid bond ID: ${bondId}`);
      const powerIndex = parseInt(powerElement?.dataset.powerIndex ?? "-1");
      bond.beginBondPowerFlow(powerIndex);
    });

    // Bond XP
    let bondXp = $html.find(".bond-xp-button");
    bondXp.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      if (!this.actor.is_pilot() || !this.actor.system.bond) return;
      this.actor.tallyBondXP();
    });

    // Refresh Bond powers
    let bondRefresh = $html.find(".refresh-powers-button");
    bondRefresh.on("click", ev => {
      if (!ev.currentTarget) return;
      ev.stopPropagation();
      if (!this.actor.is_pilot() || !this.actor.system.bond) return;
      this.actor.system.bond.refreshPowers();
    });

    // Non-action system use flows
    $html.find(".effect-flow").on("click", ev => {
      ev.stopPropagation();
      const el = (ev.currentTarget as HTMLElement).closest("[data-uuid]") as HTMLElement;
      const itemId = el?.dataset.uuid;
      const item = LancerItem.fromUuidSync(itemId ?? "", `Invalid item ID: ${itemId}`);
      item.beginSystemFlow();
    });

    // Action-chip flows
    $html.find(".activation-flow").on("click", ev => {
      ev.stopPropagation();
      const el = ev.currentTarget;
      const itemId = el.dataset.uuid;
      const path = el.dataset.path;
      if (!itemId || !path) throw Error("No item ID from activation chip");
      let isDeployable = path.includes("deployable");
      let isAction = !isDeployable && path.includes("action");
      let isCoreSystem = !isDeployable && path.includes("core_system");
      const item = LancerItem.fromUuidSync(itemId ?? "", `Invalid item ID: ${itemId}`);
      if (isAction) {
        item.beginActivationFlow(path);
      } else if (isCoreSystem) {
        item.beginCoreActiveFlow(path);
      } else if (isDeployable) {
        // TODO - deployable actions
      } else {
        ui.notifications!.error("Could not infer action type");
      }
    });

    let ChargeMacro = $html.find(".charge-macro");
    ChargeMacro.on("click", ev => {
      ev.stopPropagation();
      this.actor.beginRechargeFlow();
    });
  }

  _activateInventoryButton(html: HTMLElement) {
    const button = html.querySelector<HTMLButtonElement>(".inventory button");
    button?.addEventListener("click", async ev => {
      ev.preventDefault();
      return InventoryDialog.show_inventory(this.actor as LancerActor);
    });
  }

  canRootDrop(_item: ResolvedDropData): boolean {
    return false;
  }

  async onRootDrop(_item: ResolvedDropData, _event: DragEvent, _dest: HTMLElement): Promise<void> {}

  // Override base behavior — Lancer handles drops via onRootDrop / handleDocDropping
  protected _createDragDropHandlers(): DragDrop[] {
    return [];
  }

  async quickOwn(document: LancerItem): Promise<[LancerItem, boolean]> {
    return this.actor.quickOwn(document);
  }

  async quickOwnDrop(drop: ResolvedDropData): Promise<[ResolvedDropData, boolean]> {
    if (drop.type == "Item") {
      let [document, new_] = await this.quickOwn(drop.document);
      return [{ type: "Item", document }, new_];
    } else {
      return [drop, false];
    }
  }

  _propagateData(formData: any): void {
    let token = this.actor.prototypeToken;
    if (!token) {
      formData["prototypeToken.texture.src"] = formData["img"];
      formData["prototypeToken.name"] = formData["name"];
    } else {
      if (this.actor.img === token.texture.src && this.actor.img !== formData["img"]) {
        formData["prototypeToken.texture.src"] = formData["img"];
      }
      if (this.actor.name === token["name"] && this.actor.name !== formData["name"]) {
        formData["prototypeToken.name"] = formData["name"];
      }
    }
  }
}
