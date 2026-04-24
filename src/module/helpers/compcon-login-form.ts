import { populatePilotCache } from "../util/compcon";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class CompconLoginForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["lancer"],
    position: { width: 480, height: "auto" as const },
    window: { title: "COMP/CON Login" },
  };

  static PARTS = {
    body: { template: "systems/lancer/templates/window/compcon_login.hbs" },
  };

  async _prepareContext(_opts: any): Promise<object> {
    return { cssClass: "lancer" };
  }

  async _onRender(_context: object, _options: any): Promise<void> {
    this.element.querySelector<HTMLButtonElement>(".done-button")?.addEventListener("click", () => this._login());
  }

  private async _login(): Promise<void> {
    const form = this.element.querySelector<HTMLFormElement>("form");
    if (!form) return;
    const formData = new FormDataExtended(form).object as Record<string, string>;
    try {
      const { Auth } = await import("@aws-amplify/auth");
      let res = await Auth.signIn(formData.username, formData.password);
      ui.notifications!.info("Logged in as " + res.attributes.email);
      populatePilotCache();
      this.close();
    } catch (_e1) {
      try {
        const { Auth } = await import("@aws-amplify/auth");
        let res = await Auth.signIn(formData.username.toLocaleLowerCase(), formData.password);
        ui.notifications!.info("Logged in as " + res.attributes.email);
        populatePilotCache();
        this.close();
      } catch (e) {
        ui.notifications!.error(`Could not log in to Comp/Con: ${(e as any)?.message ?? e}`);
        console.error(e);
      }
    }
  }
}
