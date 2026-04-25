import { EntryType } from "../enums";
import { handleDocDropping } from "../helpers/dragdrop";
import { handleContextMenus } from "../helpers/item";
import { get_pack_id } from "../util/doc";
import { LancerItemSheet } from "./item-sheet";
import { LancerItem } from "./lancer-item";

/**
 * Extend the generic Lancer item sheet for Licenses.
 */
export class LancerLicenseSheet extends LancerItemSheet<EntryType.LICENSE> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "item"],
    position: { width: 700, height: 750 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  async _prepareContext(opts: any): Promise<object> {
    const data = await super._prepareContext(opts);

    const unlocks: LancerItem[][] = [[]];
    for (let et of [EntryType.FRAME, EntryType.MECH_SYSTEM, EntryType.MECH_WEAPON, EntryType.WEAPON_MOD]) {
      const pack = game.packs.get(get_pack_id(et));
      if (pack) {
        const index = await pack.getIndex();
        const key = this.item.system.key;
        for (const [id, indexData] of index.entries()) {
          const itemLicense = (indexData as any).system?.license as string | undefined;
          if (itemLicense !== key) continue;
          const doc = (await pack.getDocument(id)) as unknown as LancerItem;
          const rank = (doc.system as any).license_level as number;
          while (unlocks.length <= rank) unlocks.push([]);
          if (unlocks[rank].some(i => i.id === doc.id)) continue;
          unlocks[rank].push(doc);
        }
      }
    }
    for (let i = 0; i < unlocks.length; i++) {
      unlocks[i].sort((a, b) => {
        if (a.is_frame() && !b.is_frame()) return -1;
        if (!a.is_frame() && b.is_frame()) return 1;
        return a.name!.localeCompare(b.name!);
      });
    }
    (data as any).unlocks = unlocks;
    return data;
  }

  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    // License sheet shows context menus in view-only mode
    const html = $(this.element);
    handleContextMenus(html, this.item, true);

    // If an item is dropped on it, set its license & manufacturer to match
    handleDocDropping(html, (doc, _dest, _evt) => {
      if (doc.type == "Item") {
        doc.document.update({
          system: {
            license: this.item.system.key,
            manufacturer: (this.item.system as any).manufacturer,
          },
        });
      }
    });
  }
}
