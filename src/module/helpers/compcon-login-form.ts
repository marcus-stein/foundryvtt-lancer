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
    const button = this.element.querySelector<HTMLButtonElement>(".done-button");
    if (button) {
      button.disabled = true;
      button.textContent = "Logging in…";
    }
    try {
      const { Auth } = await import("@aws-amplify/auth");
      // Amplify usernames are case-insensitive; try as-entered first, then lowercase
      let res: any;
      try {
        res = await Auth.signIn(formData.username, formData.password);
      } catch (e1) {
        const lower = formData.username.toLocaleLowerCase();
        if (lower === formData.username) throw e1; // already lowercase, don't retry
        res = await Auth.signIn(lower, formData.password);
      }
      const email: string = res.attributes?.email ?? res.username;
      ui.notifications!.info(`Logged in to Comp/Con as ${email}`);
      await populatePilotCache();
      this.close();
    } catch (e) {
      ui.notifications!.error(`Could not log in to Comp/Con: ${(e as any)?.message ?? e}`);
      console.error(e);
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-save"></i> Login';
      }
    }
  }
}
