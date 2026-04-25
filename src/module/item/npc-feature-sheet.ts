import { EntryType, NpcFeatureType } from "../enums";
import type { SystemTemplates } from "../system-template";
import { LancerItemSheet } from "./item-sheet";
import * as defaults from "../util/unpacking/defaults";
import { Damage } from "../models/bits/damage";

/**
 * Extend the generic Lancer item sheet for NPC Features.
 */
export class LancerNPCFeatureSheet extends LancerItemSheet<EntryType.NPC_FEATURE> {
  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    if (!this.isEditable) return;

    // Watch for damage append — can't use gen-control since it inserts into 3 arrays simultaneously
    $(this.element)
      .find(".npc-damage-append")
      .on("click", _e => {
        console.log("NPC damage append");
        if (!this.item.is_npc_feature() || this.item.system.type !== NpcFeatureType.Weapon) return;
        const damages = (this.item.system as unknown as SystemTemplates.NPC.WeaponData).damage;
        damages[0].push(new Damage(defaults.DAMAGE()));
        damages[1].push(new Damage(defaults.DAMAGE()));
        damages[2].push(new Damage(defaults.DAMAGE()));
        console.log("new damages", damages);
        this.item.update({ "system.damage": damages });
      });
  }
}
