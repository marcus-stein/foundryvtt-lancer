import { LANCER } from "../config";
import { LancerActorSheet } from "./lancer-actor-sheet";
import type { ResolvedDropData } from "../helpers/dragdrop";
import { EntryType } from "../enums";
const lp = LANCER.log_prefix;

/**
 * Extend the basic ActorSheet for Lancer NPCs.
 */
export class LancerNPCSheet extends LancerActorSheet<EntryType.NPC> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "actor", "npc"],
    position: { width: 800, height: 800 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  protected get tabInitial(): string {
    return "mech";
  }

  /* -------------------------------------------- */

  async _onRender(context: object, options: any): Promise<void> {
    await super._onRender(context, options);

    if (!this.isEditable) return;

    if (this.actor.isOwner) {
      const $html = $(this.element);

      // Macros that can be handled via the generic item interface
      let itemMacros = $html.find(".item-macro");
      itemMacros.on("click", (ev: any) => {
        ev.stopPropagation();
        const el = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
        // prepareItemMacro(el.dataset.uuid!, { display: true });
      });

      // Tech rollers
      let techMacro = $html.find(".roll-tech");
      techMacro.on("click", ev => {
        if (!ev.currentTarget) return;
        ev.stopPropagation();
        const techElement = $(ev.currentTarget).closest("[data-uuid]")[0] as HTMLElement;
        let techId = techElement?.dataset.uuid;
        // prepareItemMacro(techId!);
      });

      // Item/Macroable Dragging
      $html
        .find('li[class*="item"]')
        .add('span[class*="item"]')
        .each((_i: number, item: any) => {
          if (item.classList.contains("inventory-header")) return;
          if (item.classList.contains("roll-stat"))
            item.addEventListener("dragstart", this._onDragMacroableStart.bind(this), false);
          item.setAttribute("draggable", "true");
        });
    }
  }

  _onDragMacroableStart(event: DragEvent) {
    event.stopPropagation();
    let statInput = getStatInput(event);
    if (!statInput) return ui.notifications!.error("Error finding stat input for macro.");

    let tSplit = statInput.id.split(".");
    let data = {
      title: tSplit[tSplit.length - 1].toUpperCase(),
      dataPath: statInput.id,
      type: "actor",
      actorId: this.actor.id,
    };

    event.dataTransfer?.setData("text/plain", JSON.stringify(data));
  }

  /* -------------------------------------------- */

  canRootDrop(item: ResolvedDropData): boolean {
    return (
      item.type === "Item" &&
      (item.document.is_npc_class() ||
        item.document.is_npc_feature() ||
        item.document.is_npc_template() ||
        item.document.is_status())
    );
  }

  async onRootDrop(base_drop: ResolvedDropData, _event: DragEvent, _dest: HTMLElement): Promise<void> {
    if (!this.actor.is_npc()) return;

    let [drop, is_new] = await this.quickOwnDrop(base_drop);

    let needs_refresh =
      is_new && drop.type == "Item" && (drop.document.is_npc_class() || drop.document.is_npc_template());

    if (is_new && drop.type == "Item") {
      let doc = drop.document;
      if (doc.is_npc_class()) {
        await this.actor.swapFrameImage(doc);
        await this.actor.updateTokenSize(doc);
      }
    }

    if (needs_refresh) {
      await this.actor.update({
        "system.hp.value": this.actor.system.hp.max,
        "system.stress.value": this.actor.system.stress.max,
        "system.structure.value": this.actor.system.structure.max,
      });
    }
  }
}

function getStatInput(event: Event): HTMLInputElement | HTMLDataElement | null {
  if (!event.currentTarget) return null;
  return $(event.currentTarget).closest(".stat-container").find(".lancer-stat")[0] as
    | HTMLInputElement
    | HTMLDataElement;
}
