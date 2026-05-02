import { LancerActorSheet } from "./lancer-actor-sheet";
import { resolveDotpath } from "../helpers/commons";
import { type LancerActor, type LancerMECH } from "./lancer-actor";
import type { ResolvedDropData } from "../helpers/dragdrop";
import { EntryType, fittingsForMount, MountType } from "../enums";
import type { SourceData } from "../source-template";

interface MechStatLine {
  label: string;
  value: number;
  replace: boolean;
}

function buildMechStatTooltips(actor: LancerActor): Record<string, string> {
  if (!actor.is_mech()) return {};

  const breakdowns: Record<string, { title: string; lines: MechStatLine[] }> = {
    "system.hp.max": { title: "Max HP", lines: [] },
    "system.heat.max": { title: "Heat Cap", lines: [] },
    "system.evasion": { title: "Evasion", lines: [] },
    "system.armor": { title: "Armor", lines: [] },
    "system.structure.max": { title: "Structure", lines: [] },
    "system.stress.max": { title: "Stress", lines: [] },
    "system.edef": { title: "E-Defense", lines: [] },
    "system.speed": { title: "Speed", lines: [] },
    "system.save": { title: "Save Target", lines: [] },
    "system.sensor_range": { title: "Sensor Range", lines: [] },
    "system.tech_attack": { title: "Tech Attack", lines: [] },
    "system.repairs.max": { title: "Max Repairs", lines: [] },
    "system.grit": { title: "Grit", lines: [] },
    "system.hull": { title: "Hull", lines: [] },
    "system.agi": { title: "Agility", lines: [] },
    "system.sys": { title: "Systems", lines: [] },
    "system.eng": { title: "Engineering", lines: [] },
  };

  for (const e of actor.allApplicableEffects()) {
    if (!e.affectsUs()) continue;
    const sourceName = e.name ?? "Unknown";
    for (const change of e.changes) {
      const bd = breakdowns[change.key];
      if (!bd) continue;
      const value = Number(change.value);
      if (isNaN(value) || value === 0) continue;
      const isOverride = (change as any).type === "override";
      bd.lines.push({ label: sourceName, value, replace: isOverride });
    }
  }

  const result: Record<string, string> = {};
  for (const [key, { title, lines }] of Object.entries(breakdowns)) {
    if (!lines.length) continue;
    const statKey = key.replace("system.", "").replace(/\./g, "_");
    const lineStrings = lines.map(l => {
      if (l.replace) return `${l.value} ${l.label}`;
      const sign = l.value >= 0 ? "+" : "";
      return `${sign}${l.value} ${l.label}`;
    });
    result[statKey] = `<b>${title}</b><br>${lineStrings.join("<br>")}`;
  }
  return result;
}

/**
 * Extend the basic ActorSheet for Lancer mechs.
 */
export class LancerMechSheet extends LancerActorSheet<EntryType.MECH> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "actor", "mech"],
    position: { width: 900, height: 800 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  protected get tabInitial(): string {
    return "stats";
  }

  /* -------------------------------------------- */

  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    if (!this.isEditable) return;

    this._activateOverchargeControls(this.element);
    this._activateLoadoutControls(this.element);
    this._activateMountContextMenus(this.element);
  }

  /* -------------------------------------------- */

  canRootDrop(item: ResolvedDropData): boolean {
    if (item.type == "Actor" && item.document.is_pilot()) {
      return true;
    } else if (item.type === "Item") {
      return (
        item.document.is_mech_system() ||
        item.document.is_mech_weapon() ||
        item.document.is_frame() ||
        item.document.is_status()
      );
    } else {
      return false;
    }
  }

  async onRootDrop(base_drop: ResolvedDropData, _event: DragEvent, _dest: HTMLElement): Promise<void> {
    let [drop, is_new] = await this.quickOwnDrop(base_drop);

    if (drop.type == "Item" && drop.document.is_frame() && this.actor.is_mech()) {
      const oldFrame = this.actor.items.find(i => i.is_frame() && i.id != drop.document.id);
      if (oldFrame) {
        await this.actor.deleteEmbeddedDocuments("Item", [oldFrame.id!]);
      }
      await this.actor.swapFrameImage(drop.document);
      await this.actor.updateTokenSize(drop.document);
      const frameStats = drop.document.system.stats;
      await this.actor.update({
        "system.loadout.frame": drop.document.id,
        "system.hp.value": frameStats.hp,
        "system.structure.value": frameStats.structure,
        "system.stress.value": frameStats.stress,
        "system.heat.value": 0,
      });
      await this.actor.loadoutHelper.resetMounts();
    } else if (is_new && drop.type == "Item" && drop.document.is_mech_weapon()) {
      let currMounts: SourceData.Mech["loadout"]["weapon_mounts"] = foundry.utils.duplicate(
        (this.actor.system._source as any).loadout.weapon_mounts
      );
      let set = false;
      for (let mount of currMounts) {
        if (set) break;
        for (let i = 0; i < mount.slots.length; i++) {
          if (!mount.slots[i].weapon) {
            mount.slots[i].weapon = drop.document.id;
            set = true;
            break;
          }
        }
      }
      await this.actor.update({
        "system.loadout.weapon_mounts": currMounts,
      });
    } else if (is_new && drop.type == "Item" && drop.document.is_mech_system()) {
      let oldSystems: string[] = (this.actor as any).system._source.loadout.systems;
      await this.actor.update({
        "system.loadout.systems": [...oldSystems, drop.document.id],
      });
    } else if (drop.type == "Actor" && drop.document.is_pilot()) {
      await this.actor.update({
        "system.pilot": drop.document.uuid,
      });
      await drop.document.update({
        "system.active_mech": this.actor.uuid,
      });
    }
  }

  _activateOverchargeControls(html: HTMLElement) {
    const $html = $(html);
    let overchargeText = $html.find(".overcharge-text");
    overchargeText.on("click", ev => {
      if (!this.actor.is_mech()) return;
      this._setOverchargeLevel(ev, Math.min(this.actor.system.overcharge + 1, 3));
    });

    let overchargeReset = $html.find(".overcharge-reset");
    overchargeReset.on("click", ev => {
      this._setOverchargeLevel(ev, 0);
    });
  }

  async _setOverchargeLevel(_event: any, level: number) {
    let a = this.actor as LancerMECH;
    return a.update({
      "system.overcharge": level,
    });
  }

  _activateLoadoutControls(html: HTMLElement) {
    const $html = $(html);
    $html.find(".reset-weapon-mount-button").on("click", async (evt: JQuery.ClickEvent) => {
      this._event_handler("reset-wep", evt);
    });

    $html.find(".reset-all-weapon-mounts-button").on("click", async (evt: JQuery.ClickEvent) => {
      this._event_handler("reset-all-weapon-mounts", evt);
    });

    $html.find(".reset-system-mount-button").on("click", async (evt: JQuery.ClickEvent) => {
      this._event_handler("reset-sys", evt);
    });
  }

  _activateMountContextMenus(html: HTMLElement) {
    let mount_options: any[] = [];

    for (let selection of Object.values(MountType)) {
      mount_options.push({
        name: selection,
        icon: "",
        callback: async (html: JQuery) => {
          let mountPath = html[0].dataset.path ?? "";
          let mount = resolveDotpath(this.actor, mountPath) as any;
          if (!mount) {
            console.error("Bad mountpath:", mountPath);
          }

          let newSlots: SourceData.Mech["loadout"]["weapon_mounts"][0]["slots"] = [];
          let newSlotTypes = fittingsForMount(selection);
          newSlots = newSlots.splice(newSlotTypes.length);
          for (let i = 0; i < newSlotTypes.length; i++) {
            if (mount.slots[i]?.weapon?.value) {
              newSlots.push({
                mod: mount.slots[i].mod?.value?.id ?? null,
                size: newSlotTypes[i],
                weapon: mount.slots[i].weapon?.value?.id ?? null,
              });
            } else {
              newSlots.push({
                mod: null,
                size: newSlotTypes[i],
                weapon: null,
              });
            }
          }

          this.actor.update({
            [mountPath + ".type"]: selection,
            [mountPath + ".bracing"]: false,
            [mountPath + ".slots"]: newSlots,
          });
        },
      });
    }

    mount_options.push({
      name: "Superheavy Bracing",
      icon: "",
      callback: async (html: JQuery) => {
        let mountPath = html[0].dataset.path ?? "";
        let mount = resolveDotpath(this.actor, mountPath) as any;
        if (!mount) {
          console.error("Bad mountpath:", mountPath);
        }
        this.actor.update({
          [mountPath + ".type"]: MountType.Unknown,
          [mountPath + ".bracing"]: true,
          [mountPath + ".slots"]: [],
        });
      },
    });

    new foundry.applications.ux.ContextMenu.implementation(html, ".mount-type-ctx-root", mount_options, { jQuery: false });
  }

  async _event_handler(
    mode: "reset-wep" | "reset-all-weapon-mounts" | "reset-sys" | "overcharge" | "overcharge-rollback",
    evt: JQuery.ClickEvent
  ) {
    evt.stopPropagation();
    let mech = this.actor as LancerMECH;
    let path = evt.currentTarget?.dataset?.path;

    switch (mode) {
      case "reset-all-weapon-mounts":
        await this.actor.loadoutHelper.resetMounts();
        break;
      case "reset-sys":
        this.actor.update({ "system.loadout.systems": [] });
        break;
      case "reset-wep":
        if (!path) return;
        ui.notifications?.info("TODO: Reset the weapons");
        break;
      default:
        return;
    }
  }

  async _prepareContext(opts: any): Promise<object> {
    let data: any = await super._prepareContext(opts);
    data.pilot = this.actor.system.pilot?.value;
    data.is_active = this.actor.system.pilot?.value?.system.active_mech?.value == this.actor;
    data.stat_tooltips = buildMechStatTooltips(this.actor);
    return data;
  }
}
