import { LANCER } from "../config";
const lp = LANCER.log_prefix;
import * as lancer_data from "@massif/lancer-data";
import { LancerActorSheet } from "./lancer-actor-sheet";
import type { HelperOptions } from "handlebars";
import { buildCounterHeader, buildCounterHTML } from "../helpers/item";
import { ref_params, resolve_ref_element } from "../helpers/refs";
import { inc_if, resolveDotpath } from "../helpers/commons";
import { LancerActor, type LancerMECH, type LancerPILOT } from "./lancer-actor";
import { fetchPilotViaCache, fetchPilotViaShareCode, getLoggedInUser, pilotCache, populatePilotCache } from "../util/compcon";
import type { LancerFRAME } from "../item/lancer-item";
import { clicker_num_input } from "../helpers/actor";
import type { ResolvedDropData } from "../helpers/dragdrop";
import { EntryType } from "../enums";
import type { PackedPilotData } from "../util/unpacking/packed-types";
import { importCC } from "./import";

const shareCodeMatcher = /^[A-Z0-9\d]{6}$/g;
const COUNTER_MAX = 8;

type StatLine = { label: string; value: number; replace: boolean };

function buildPilotStatTooltips(actor: LancerActor): Record<string, string> {
  if (!actor.is_pilot()) return {};
  const sys = actor.system;
  const rules = lancer_data.rules;

  const breakdowns: Record<string, { title: string; lines: StatLine[] }> = {
    "system.hp.max": {
      title: "Max HP",
      lines: [
        { label: "Base", value: rules.base_pilot_hp, replace: false },
        { label: "Grit", value: sys.grit, replace: false },
      ],
    },
    "system.armor": { title: "Armor", lines: [] },
    "system.evasion": { title: "Evasion", lines: [] },
    "system.edef": { title: "E-Defense", lines: [] },
    "system.speed": { title: "Speed", lines: [] },
    "system.save": {
      title: "Save Target",
      lines: [
        { label: "Base", value: rules.base_pilot_save_target, replace: false },
        { label: "Grit", value: sys.grit, replace: false },
      ],
    },
    "system.sensor_range": {
      title: "Sensor Range",
      lines: [{ label: "Base", value: rules.base_pilot_sensors, replace: false }],
    },
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
    const statKey = key.replace("system.", "").replace(".", "_");
    const lineStrings = lines.map(l => {
      if (l.replace) return `${l.value} ${l.label}`;
      const sign = l.label === "Base" ? "" : l.value >= 0 ? "+" : "";
      return `${sign}${l.value} ${l.label}`;
    });
    result[statKey] = `<b>${title}</b><br>${lineStrings.join("<br>")}`;
  }
  return result;
}

/**
 * Extend the basic ActorSheet
 */
export class LancerPilotSheet extends LancerActorSheet<EntryType.PILOT> {
  /**
   * Extend and override the default options used by the Pilot Sheet
   * @returns {Object}
   */
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "actor", "pilot"],
    position: { width: 1050, height: 800 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  protected get tabInitial(): string {
    return "tactical";
  }

  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    if (!this.isEditable) return;

    if (this.actor.isOwner) {
      const $html = $(this.element);
      let pilot = this.actor as LancerPILOT;

      // Cloud id select
      let cloudSelect = $html.find('select[name="selectCloudId"]');
      cloudSelect.on("change", evt => {
        evt.stopPropagation();
        pilot.update({ "system.cloud_id": (evt.target as HTMLSelectElement).value });
      });

      // Refresh pilot list from Comp/Con
      $html.find(".cloud-refresh-pilots").on("click", async ev => {
        ev.stopPropagation();
        const btn = ev.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';
        try {
          const pilots = await populatePilotCache();
          if (pilots.length === 0) {
            ui.notifications!.warn("No pilots found — are you logged in to Comp/Con?");
          } else {
            ui.notifications!.info(`Pilot list refreshed: ${pilots.length} pilot${pilots.length !== 1 ? "s" : ""} found.`);
          }
        } catch (e) {
          ui.notifications!.error(`Failed to refresh pilot list: ${(e as any)?.message ?? e}`);
        }
        this.render();
      });

      // Cloud download
      let download = $html.find('.cloud-control[data-action*="download"]');
      download.on("click", async ev => {
        ev.stopPropagation();
        const cloudId = pilot.system.cloud_id;
        if (!cloudId) {
          ui.notifications!.warn("No pilot selected. Choose one from the dropdown or enter a share code.");
          return;
        }

        let raw_pilot_data = null;
        if (cloudId.match(shareCodeMatcher)) {
          ui.notifications!.info("Importing character from share code...");
          console.log(`Attempting import with share code: ${cloudId}`);
          try {
            raw_pilot_data = await fetchPilotViaShareCode(cloudId);
          } catch (error) {
            ui.notifications!.error("Error importing from share code. Share code may need to be refreshed.");
            console.error(`Failed import with share code ${cloudId}, error:`, error);
            return;
          }
        } else {
          ui.notifications!.info("Importing character from COMP/CON account...");
          const cachedPilot = pilotCache().find(p => p.cloudID == cloudId);
          if (cachedPilot != undefined) {
            try {
              raw_pilot_data = await fetchPilotViaCache(cachedPilot);
            } catch (error) {
              ui.notifications!.error("Failed to fetch pilot data from Comp/Con. Try refreshing the pilot list.");
              console.error(`Failed to import vaultID ${cloudId} via pilot list, error:`, error);
              return;
            }
          } else {
            // Pilot not in cache — refresh and retry once
            ui.notifications!.info("Pilot not in cached list. Refreshing pilot list from Comp/Con...");
            try {
              await populatePilotCache();
            } catch (e) {
              ui.notifications!.error("Could not refresh pilot list — are you logged in to Comp/Con?");
              return;
            }
            const retryPilot = pilotCache().find(p => p.cloudID == cloudId);
            if (!retryPilot) {
              ui.notifications!.error(
                `Pilot ID "${cloudId}" not found in your Comp/Con account after refresh. ` +
                `Check that the pilot is marked active in Comp/Con, or log in again via Settings → COMP/CON Login.`
              );
              console.error(`Failed to find pilot in cache after refresh, vaultID: ${cloudId}`);
              return;
            }
            try {
              raw_pilot_data = await fetchPilotViaCache(retryPilot);
            } catch (error) {
              ui.notifications!.error("Failed to fetch pilot data from Comp/Con. Try refreshing the pilot list.");
              console.error(`Failed to import vaultID ${cloudId} after refresh, error:`, error);
              return;
            }
          }
        }
        await importCC(this.actor as LancerPILOT, raw_pilot_data);
      });

      // JSON Import
      const jsonImport = $html.find("input#pilot-json-import")[0] as HTMLInputElement | undefined;
      jsonImport?.addEventListener("change", ev => this._onPilotJsonUpload(ev));

      // editing rawID clears vaultID
      let rawInput = $html.find('input[name="rawID"]');
      rawInput.on("input", async ev => {
        if ((ev.target as any).value != "") {
          ($html.find('select[name="vaultID"]')[0] as any).value = "";
        }
      });

      // Mech swapping
      let mechActivators = $html.find(".activate-mech");
      mechActivators.on("click", async ev => {
        ev.stopPropagation();
        let mech = (await resolve_ref_element(ev.currentTarget.parentElement!)) as LancerActor | null;
        if (!mech || !mech.is_mech()) return;
        this.activateMech(mech);
      });

      let mechDeactivator = $html.find(".deactivate-mech");
      mechDeactivator.on("click", async ev => {
        ev.stopPropagation();
        this.deactivateMech();
      });
    }
  }

  _onPilotJsonUpload(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const jsonFile = input.files?.[0];
    if (!jsonFile) return;

    console.log(`${lp} Selected file changed`, jsonFile);
    const fr = new FileReader();
    fr.addEventListener("load", ev => {
      this._onPilotJsonParsed(ev.target?.result as string);
    });
    fr.readAsText(jsonFile);
  }

  async _onPilotJsonParsed(fileData: string | null) {
    if (!fileData) return;
    const pilotData = JSON.parse(fileData) as PackedPilotData;
    console.log(`${lp} Pilot Data of selected JSON:`, pilotData);

    if (!pilotData) return;
    ui.notifications!.info(`Starting import of ${pilotData.name}, Callsign ${pilotData.callsign}. Please wait.`);
    console.log(`${lp} Starting import of ${pilotData.name}, Callsign ${pilotData.callsign}.`);
    console.log(`${lp} Parsed Pilot Data pack:`, pilotData);

    await importCC(this.actor as LancerPILOT, pilotData);
    ui.notifications!.info(`Import of ${pilotData.name}, Callsign ${pilotData.callsign} complete.`);
    console.log(`${lp} Import of ${pilotData.name}, Callsign ${pilotData.callsign} complete.`);
    this.render();
  }

  activateMech(mech: LancerMECH) {
    let pilot = this.actor as LancerPILOT;
    // Set active mech
    pilot.update({ "system.active_mech": mech.uuid });
    mech.update({ "system.pilot": pilot.uuid });
  }

  async deactivateMech() {
    // Unset active mech
    await this.actor.update({
      "system.active_mech": null,
    });
  }

  async _prepareContext(opts: any): Promise<object> {
    const data: any = await super._prepareContext(opts);

    const cache = pilotCache();
    data.compConPilotList = cache
      .sort((p1, p2) => {
        if (p1.callsign < p2.callsign) return -1;
        if (p1.callsign > p2.callsign) return 1;
        if (p1.name < p2.name) return -1;
        if (p1.name > p2.name) return 1;
        return 0;
      })
      .reduce(
        (acc, pilot) => {
          acc[`${pilot.callsign} // ${pilot.name}`] = pilot.cloudID;
          return acc;
        },
        {} as Record<string, string>
      );

    data.cloudUser = await getLoggedInUser();
    data.cloudPilotCount = cache.length;
    data.stat_tooltips = buildPilotStatTooltips(this.actor);

    return data;
  }

  // Pilots can handle most stuff
  canRootDrop(item: ResolvedDropData): boolean {
    // Accept mechs, so as to change their pilot
    if (item.type === "Actor" && item.document.is_mech()) {
      return true;
    }

    // Accept pilot items
    if (
      item.type === "Item" &&
      (item.document.is_core_bonus() ||
        item.document.is_pilot_weapon() ||
        item.document.is_pilot_armor() ||
        item.document.is_pilot_gear() ||
        item.document.is_license() ||
        item.document.is_skill() ||
        item.document.is_talent() ||
        item.document.is_organization() ||
        item.document.is_reserve() ||
        item.document.is_bond() ||
        item.document.is_status())
    ) {
      return true;
    }

    // Reject anything else
    return false;
  }

  async onRootDrop(base_drop: ResolvedDropData, _event: DragEvent, _dest: HTMLElement): Promise<void> {
    if (!this.actor.is_pilot()) return; // Just for types really
    let pilot = this.actor as LancerPILOT;
    let loadout = pilot.system.loadout;
    let oldBonds = pilot.items.filter(i => i.is_bond());

    // Take posession
    let [drop, is_new] = await this.quickOwnDrop(base_drop);

    // Now, do sensible things with it
    if (drop.type == "Item") {
      // Handle all pilot item types
      if (drop.document.is_pilot_weapon()) {
        // If new weapon, try to equip to first empty slot / first post slot
        for (let i = 0; i < loadout.weapons.length || i <= 2; i++) {
          if (!loadout.weapons[i]) {
            await pilot.update({
              [`system.loadout.weapons.${i}`]: drop.document.id,
            });
            break;
          }
        }
      } else if (drop.document.is_pilot_gear()) {
        // If new gear, try to equip to first empty slot / first post slot
        for (let i = 0; i < loadout.gear.length || i <= 3; i++) {
          if (!loadout.gear[i]) {
            await pilot.update({
              [`system.loadout.gear.${i}`]: drop.document.id,
            });
            break;
          }
        }
      } else if (drop.document.is_pilot_armor()) {
        // If new armor, try to equip to first empty slot / first post slot
        for (let i = 0; i < loadout.armor.length || i <= 1; i++) {
          if (!loadout.armor[i]) {
            await pilot.update({
              [`system.loadout.armor.${i}`]: drop.document.id,
            });
            break;
          }
        }
      } else if ((is_new && drop.document.is_talent()) || drop.document.is_skill()) {
        // If new skill or talent, reset to level 1
        await drop.document.update({ "system.rank": 1 });
      } else if (is_new && drop.document.is_bond() && oldBonds.length > 0) {
        // Delete all other bond items
        for (let oldBond of oldBonds) {
          await pilot._safeDeleteDescendant("Item", [oldBond]);
        }
      }
    } else if (drop.type == "Actor" && drop.document.is_mech()) {
      this.activateMech(drop.document);
    }

    // TODO
    // If this isn't a new item and it's an NPC feature, we need to update the sorting
    // if (
    //   this.isEditable &&
    //   !is_new &&
    //   drop.type === "Item" &&
    //   (drop.document.is_pilot_gear() || drop.document.is_pilot_weapon() || drop.document.is_reserve())
    // ) {
    //   this._onSortItem(event, drop.document.toObject());
    // }
  }

  /* -------------------------------------------- */

  /**
   * Implement the _updateObject method as required by the parent class spec
   * This defines how to update the subject of the form when the form is submitted
   * @private
   */
  protected override async _processSubmitData(event: SubmitEvent, form: HTMLFormElement, submitData: any): Promise<void> {
    if (this.actor.is_pilot() && submitData["system.callsign"] && this.actor.system.callsign !== submitData["system.callsign"]) {
      submitData["prototypeToken.name"] = submitData["system.callsign"];
    }
    return super._processSubmitData(event, form, submitData);
  }
}

export function pilotCounters(pilot: LancerPILOT, _options: HelperOptions): string {
  let counter_detail = "";

  let counter_arr = pilot.system.custom_counters;

  for (let i = 0; i < counter_arr.length; i++) {
    // Only allow deletion if the Pilot is the source
    const counter = counter_arr[i];
    if (counter.max != null) {
      if (counter.max <= COUNTER_MAX) {
        counter_detail = counter_detail.concat(
          buildCounterHTML(counter, `system.custom_counters.${i}`, { canDelete: true })
        );
      } else {
        counter_detail = counter_detail.concat(
          buildCounterHeader(counter, `system.custom_counters.${i}`, { canDelete: true }),
          clicker_num_input(`system.custom_counters.${i}.value`, _options),
          "</div>"
        );
      }
    }
  }

  return `
  <div class="card clipped double">
    <span class="lancer-header lancer-primary submajor" style="padding-right: 5px">
      <span>COUNTERS</span>
      <a class="gen-control fas fa-plus" data-action="append" data-path="system.custom_counters" data-action-value="(struct)counter"></a>
    </span>
    <div class="wraprow double">
      ${counter_detail}
    </div>
  </div>`;
}

export function allMechPreview(_options: HelperOptions): string {
  let active_mech: LancerMECH | null = _options.data.root.system.active_mech?.value;

  /// I still feel like this is pretty inefficient... but it's probably the best we can do for now
  let owned_mechs = (game?.actors?.filter(
    (mech: LancerActor) =>
      mech.is_mech() &&
      mech.system.pilot?.status == "resolved" &&
      mech.system.pilot.value.id === _options.data.root.actor.id
  ) ?? []) as unknown as LancerMECH[];
  let as_html = [];
  for (let m of owned_mechs) {
    as_html.push(mech_preview(m, m == active_mech, _options));
  }
  return as_html.join("");
}

export function mech_preview(mech: LancerMECH, active: boolean, _options: HelperOptions): string {
  // Generate commons
  let frame = mech.items.find(i => i.type === EntryType.FRAME) as LancerFRAME | undefined;
  let mfr = frame?.system.manufacturer;

  // Making ourselves easy templates for the preview in case we want to switch in the future
  let preview_stats_arr = [
    { title: "HP", icon: "mdi mdi-heart-outline", path: "system.hp.value" },
    { title: "HEAT", icon: "cci cci-heat", path: "system.heat.value" },
    { title: "EVASION", icon: "cci cci-evasion", path: "system.evasion" },
    { title: "ARMOR", icon: "mdi mdi-shield-outline", path: "system.armor" },
    { title: "STRUCTURE", icon: "cci cci-structure", path: "system.structure.value" },
    { title: "STRESS", icon: "cci cci-reactor", path: "system.stress.value" },
    { title: "E-DEF", icon: "cci cci-edef", path: "system.edef" },
    { title: "SPEED", icon: "mdi mdi-arrow-right-bold-hexagon-outline", path: "system.speed" },
    { title: "SAVE", icon: "cci cci-save", path: "system.save" },
    { title: "SENSORS", icon: "cci cci-sensor", path: "system.sensor_range" },
  ];

  let stats_html = ``;

  for (let i = 0; i < preview_stats_arr.length; i++) {
    const builder = preview_stats_arr[i];
    stats_html = stats_html.concat(`
    <div class="mech-preview-stat-wrapper">
      <i class="${builder.icon} i--4 i--dark"> </i>
      <span class="major">${builder.title}</span>
      <span class="major">${resolveDotpath(mech, builder.path, 0)}</span>
    </div>`);
  }

  let button = active
    ? `<a class="deactivate-mech"><i class="cci cci-deactivate"></i></a>`
    : `<a class="activate-mech"><i class="cci cci-activate"></i></a>`;

  return `
  <div class="mech-preview lancer-border-${active ? "primary" : "dark-gray"}">
    <div class="mech-preview-titlebar ref set click-open ${active ? "active" : "inactive"}" ${ref_params(mech)}>
      ${button}
      <span>${mech.name}${inc_if(" // ACTIVE", active)}  --  ${mfr} ${frame?.name}</span>
    </div>
    <img src="${mech.img}"/>
    ${stats_html}
  </div>`;
}
