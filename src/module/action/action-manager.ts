import tippy from "tippy.js";
import type { ActionTrackingData, ActionType } from ".";
import type { LancerActor } from "../actor/lancer-actor";
import { LANCER } from "../config";
import { getActions, modAction, toggleAction } from "./action-tracker";

declare module "fvtt-types/configuration" {
  interface FlagConfig {
    User: {
      lancer: {
        "action-manager"?: {
          pos?: {
            top: number;
            left: number;
          };
        };
      };
    };
  }
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LancerActionManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEF_LEFT = 600;
  static DEF_TOP = 20;
  static enabled: boolean;

  target: LancerActor | null = null;

  static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.Configuration = {
    id: "action-manager",
    classes: ["clipped", "card"],
    window: { frame: false },
    position: { width: 310, height: 70, left: LancerActionManager.DEF_LEFT, top: LancerActionManager.DEF_TOP },
  };

  static PARTS = {
    main: { template: "systems/lancer/templates/window/action_manager.hbs" },
  };

  async init() {
    LancerActionManager.enabled =
      game.settings.get(game.system.id, LANCER.setting_actionTracker).showHotbar &&
      !game.settings.get("core", "noCanvas");
    if (LancerActionManager.enabled) {
      await this.updateControlledToken();
      this.render({ force: true });
    }
  }

  async _prepareContext(_options: any): Promise<object> {
    return {
      name: this.target?.name.toLocaleUpperCase() ?? null,
      actions: this.getActions(),
      clickable: game.user?.isGM || game.settings.get(game.system.id, LANCER.setting_actionTracker).allowPlayers,
    };
  }

  async _onFirstRender(_context: object, _options: any): Promise<void> {
    this._loadUserPos();
  }

  async _onRender(_context: object, _options: any): Promise<void> {
    const hasActions = !!this.getActions();
    this.element.classList.toggle("hidden", !hasActions);
    this.element.classList.toggle("noclick", !this.canMod());

    this._initDrag();

    this.element.querySelector("#action-manager-reset")?.addEventListener("click", e => {
      e.preventDefault();
      if (this.canMod()) {
        this._resetActions();
      } else {
        console.log(`${game.user?.name} :: Users currently not allowed to reset actions through action manager.`);
      }
    });

    this.element.querySelectorAll<HTMLElement>("a.action[data-action]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        if (this.canMod()) {
          const action = (e.currentTarget as HTMLElement).dataset.action;
          action && this.target && toggleAction(this.target, action as ActionType);
        } else {
          console.log(`${game.user?.name} :: Users currently not allowed to toggle actions through action manager.`);
        }
      });
    });

    this._loadTooltips();
  }

  // DATA BINDING
  private getActions(): ActionTrackingData | null {
    return this.target ? getActions(this.target) : null;
  }

  async reset() {
    await this.close();
    this.render({ force: true });
  }

  async update(_force?: boolean) {
    if (LancerActionManager.enabled) {
      await this.updateControlledToken();
      this.render({ force: true });
    }
  }

  async updateConfig() {
    if (
      game.settings.get(game.system.id, LANCER.setting_actionTracker).showHotbar &&
      !game.settings.get("core", "noCanvas")
    ) {
      await this.update();
      LancerActionManager.enabled = true;
    } else {
      this.close();
      LancerActionManager.enabled = false;
    }
  }

  private async updateControlledToken() {
    if (!canvas.ready) return;
    const token = canvas.tokens?.controlled?.[0];
    if (token && token.inCombat && token.actor) {
      const actor = token.actor as LancerActor;
      if (actor.is_mech() || actor.is_npc()) {
        this.target = token.actor;
        return;
      }
    }
    this.target = null;
  }

  private async _resetActions() {
    if (this.target) {
      console.log("Resetting " + this.target.name);
      modAction(this.target, false);
    }
  }

  private _loadUserPos() {
    const pos = game.user?.getFlag(game.system.id, "action-manager")?.pos;
    if (!pos) return;
    const newTop = pos.top < 5 || pos.top > window.innerHeight + 5 ? LancerActionManager.DEF_TOP : pos.top;
    const newLeft = pos.left < 5 || pos.left > window.innerWidth + 5 ? LancerActionManager.DEF_LEFT : pos.left;
    this.setPosition({ top: newTop, left: newLeft });
  }

  private _loadTooltips() {
    tippy('.action[data-action="protocol"]', { content: "Protocol" });
    tippy('.action[data-action="full"]', { content: "Full Action" });
    tippy('.action[data-action="quick"]', { content: "Quick Action" });
    tippy('.action[data-action="move"]', { content: "Movement Action" });
    tippy('.action[data-action="reaction"]', { content: "Reaction" });
    tippy('.action[data-action="free"]', { content: "Free Actions" });
  }

  private _initDrag(): void {
    const self = this;
    const dragHandle = this.element.querySelector<HTMLElement>("#action-manager-drag");
    if (!dragHandle) return;

    dragHandle.addEventListener("mousedown", ev => {
      ev.preventDefault();
      const hud = document.getElementById("action-manager")!;
      const marginLeft = parseInt(getComputedStyle(hud).marginLeft) || 0;
      const marginTop = parseInt(getComputedStyle(hud).marginTop) || 0;

      let pos1 = 0, pos2 = 0, pos3 = ev.clientX, pos4 = ev.clientY;

      function elementDrag(e: MouseEvent) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        hud.style.top = (hud.offsetTop - pos2 - marginTop) + "px";
        hud.style.left = (hud.offsetLeft - pos1 - marginLeft) + "px";
      }

      function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        let xPos = hud.offsetLeft - pos1 > window.innerWidth ? window.innerWidth : hud.offsetLeft - pos1;
        let yPos = hud.offsetTop - pos2 > window.innerHeight - 20 ? window.innerHeight - 100 : hud.offsetTop - pos2;
        xPos = xPos < 8 ? 0 : xPos - 8;
        yPos = yPos < 8 ? 0 : yPos - 8;
        if (xPos !== hud.offsetLeft - pos1 || yPos !== hud.offsetTop - pos2) {
          hud.style.top = yPos + "px";
          hud.style.left = xPos + "px";
        }
        console.log(`Action Manager | CACHING: ${xPos} || ${yPos}.`);
        game.user?.update({ flags: { lancer: { "action-manager": { pos: { top: yPos, left: xPos } } } } });
        self.setPosition({ top: yPos, left: xPos });
      }

      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    });
  }

  private canMod() {
    return game.user?.isGM || game.settings.get(game.system.id, LANCER.setting_actionTracker).allowPlayers;
  }
}
