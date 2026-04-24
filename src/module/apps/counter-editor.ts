import type { CounterData } from "../models/bits/counter";
import { TargetedEditForm } from "./targeted-form-editor";

/**
 * A helper ApplicationV2 subclass for editing a counter
 */
export class CounterEditForm extends TargetedEditForm<CounterData> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "counter-editor"],
    position: { width: 400, height: "auto" as const },
    window: { title: "Counter Editing" },
  };

  static PARTS = {
    body: { template: "systems/lancer/templates/window/counter.hbs" },
  };

  fixupForm(form_data: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
    let name = form_data.name as string;
    let min = form_data.min as number;
    let max = form_data.max as number;
    let value = form_data.value as number;

    let invalid = [min, max, value].find(x => Number.isNaN(x));
    if (invalid !== undefined) {
      let message = `${invalid} is not a valid numeric value`;
      ui.notifications?.error(message);
      throw new Error(message);
    }
    name = name.trim();

    if (max < min) {
      max = min;
    }
    if (value < min) {
      value = min;
    }
    if (value > max) {
      value = max;
    }

    return { name, min, max, value };
  }
}
