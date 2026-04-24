import { ActivationType } from "../enums";
import type { ActionData } from "../models/bits/action";
import { TargetedEditForm } from "./targeted-form-editor";

/**
 * A helper ApplicationV2 subclass for editing an action
 */
export class ActionEditDialog extends TargetedEditForm<ActionData> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "action-editor"],
    position: { width: 400, height: "auto" as const },
    window: { title: "Action Editing" },
  };

  static PARTS = {
    body: { template: "systems/lancer/templates/window/action_editor.hbs" },
  };

  protected getData() {
    let activation_type: { [key: string]: string } = {};
    Object.entries(ActivationType).forEach(activation => (activation_type[activation[1]] = activation[1]));
    return {
      ...super.getData(),
      action: this.value,
      activation_type,
      path: this.value_path,
    };
  }

  fixupForm(form_data: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
    let newAction: ActionData = {
      lid: form_data["action.lid"] as string,
      name: form_data["action.name"] as string,
      activation: form_data["action.activation"] as ActivationType,
      cost: form_data["action.cost"] as number,
      frequency: form_data["action.frequency"] as string,
      init: form_data["action.init"] as string,
      trigger: form_data["action.trigger"] as string,
      terse: form_data["action.terse"] as string,
      heat_cost: form_data["action.heat_cost"] as number,
      tech_attack: form_data["action.tech_attack"] as boolean,
      detail: this.value.detail,
      pilot: !!this.value.pilot,
      mech: !!this.value.mech,
      synergy_locations: this.value.synergy_locations || [],
      damage: this.value.damage || [],
      range: this.value.range || [],
    };
    return newAction as any;
  }
}
