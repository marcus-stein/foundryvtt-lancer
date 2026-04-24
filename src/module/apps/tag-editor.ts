import { LANCER } from "../config";
import type { TagData, TagTemplateData } from "../models/bits/tag";
import { TargetedEditForm } from "./targeted-form-editor";

/**
 * A helper ApplicationV2 subclass for editing a tag
 */
export class TagEditForm extends TargetedEditForm<TagData> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "tag-editor"],
    position: { width: 400, height: "auto" as const },
    window: { title: "Tag Editing" },
  };

  static PARTS = {
    body: { template: "systems/lancer/templates/window/tag.hbs" },
  };

  protected getData() {
    let tc = game.settings.get(game.system.id, LANCER.setting_tag_config) as Record<string, TagTemplateData>;
    let lid_options: { [key: string]: string } = {};
    Object.entries(tc).forEach(tag => (lid_options[tag[1].name] = tag[0]));
    const base = super.getData();
    return {
      ...base,
      lid: (base.value as TagData).lid,
      lid_options,
    };
  }
}
