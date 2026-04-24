import { LancerActor } from "../actor/lancer-actor";
import { drilldownDocument, resolveDotpath } from "../helpers/commons";
import { LancerItem } from "../item/lancer-item";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A helper ApplicationV2 subclass for editing a particular path on an actor or item.
 */
export class TargetedEditForm<T> extends HandlebarsApplicationMixin(ApplicationV2) {
  value: T;
  value_path: string;
  target: LancerItem | LancerActor;
  resolve: () => any;

  constructor(
    target: LancerItem | LancerActor,
    value_path: string,
    options: Partial<foundry.applications.api.ApplicationV2.Configuration> = {},
    resolve_func: () => any
  ) {
    super(options);
    this.target = target;
    this.value_path = value_path;
    this.value = resolveDotpath(target, value_path) as T;
    this.resolve = resolve_func;
  }

  static DEFAULT_OPTIONS = {
    classes: ["lancer", "targeted-form-editor"],
    position: { width: 400, height: "auto" as const },
    window: { title: "Editing" },
  };

  static PARTS = {} as Record<string, any>;

  protected getData(): Record<string, unknown> {
    return {
      value: this.value,
      path: this.value_path,
      cssClass: this.options.classes?.join(" ") ?? "",
    };
  }

  async _prepareContext(_opts: any): Promise<object> {
    return this.getData();
  }

  async _onRender(_context: object, _options: any): Promise<void> {
    this.element
      .querySelector<HTMLButtonElement>("[data-button='confirm']")
      ?.addEventListener("click", () => this._saveForm());
    this.element
      .querySelector<HTMLButtonElement>("[data-button='cancel']")
      ?.addEventListener("click", () => this.close());
  }

  protected async _saveForm(): Promise<void> {
    const form = this.element.querySelector<HTMLFormElement>("form");
    if (!form) return;
    let form_data = new FormDataExtended(form).object as Record<string, string | number | boolean>;
    form_data = this.fixupForm(form_data);

    const new_result: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(form_data)) {
      new_result[`${this.value_path}.${k}`] = v;
    }

    await this.target.update(new_result).then(this.resolve);
    this.close();
  }

  fixupForm(form_data: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
    return form_data;
  }

  static handle(html: JQuery, selector: string, root_doc: LancerItem | LancerActor) {
    html.find(selector).on("click", async evt => {
      evt.stopPropagation();
      const elt = evt.currentTarget;
      const path = elt.dataset.path;
      if (path) {
        let dd = drilldownDocument(root_doc, path);
        return this.edit(dd.sub_doc, dd.sub_path);
      }
    });
  }

  static async edit(doc: LancerItem | LancerActor, path: string): Promise<void> {
    return new Promise((resolve, _reject) => {
      const app = new this(doc, path, {}, resolve);
      app.render({ force: true });
    });
  }
}
