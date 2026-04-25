import { EntryType } from "../enums";
import { fromLidMany } from "../helpers/from-lid";
import { LancerItemSheet } from "./item-sheet";

/**
 * Extend the generic Lancer item sheet for Frames.
 */
export class LancerFrameSheet extends LancerItemSheet<EntryType.FRAME> {
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
    (data as any).coreDeployables = await fromLidMany((this.item.system as any).core_system.deployables);
    return data;
  }

  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    if (!this.isEditable) return;

    // Watch for select delete on mount
    const html = $(this.element);
    html.find(".mount-selector").on("change", e => this._onChangeMount(e));
  }

  private async _onChangeMount(event: any) {
    const elt = $(event.currentTarget);
    const index = elt.prop("index");
    const value = elt.prop("value");
    if (value == "delete") {
      event.stopPropagation();
      const mounts = [...(this.item.system as any).mounts];
      mounts.splice(index, 1);
      this.item.update({ "system.mounts": mounts });
    }
  }
}
