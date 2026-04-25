import { EntryType } from "../enums";
import { fromLid } from "../helpers/from-lid";
import { LancerItemSheet } from "./item-sheet";
import type { LancerNPC_CLASS, LancerNPC_TEMPLATE } from "./lancer-item";

/**
 * Extend the generic Lancer item sheet for NPC Classes and Templates.
 */
export class LancerNPCClassSheet extends LancerItemSheet<EntryType.NPC_CLASS | EntryType.NPC_TEMPLATE> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "item"],
    position: { width: 900, height: 750 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  async _prepareContext(opts: any): Promise<object> {
    const data = await super._prepareContext(opts);
    const item = this.item as LancerNPC_CLASS | LancerNPC_TEMPLATE;
    (data as any).base_features = await Promise.all(Array.from(item.system.base_features).map(lid => fromLid(lid)));
    (data as any).optional_features = await Promise.all(
      Array.from(item.system.optional_features).map(lid => fromLid(lid))
    );
    return data;
  }
}
