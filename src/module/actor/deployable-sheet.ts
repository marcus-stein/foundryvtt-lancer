import { LancerActorSheet } from "./lancer-actor-sheet";
import type { ResolvedDropData } from "../helpers/dragdrop";
import { EntryType } from "../enums";

/**
 * Extend the basic ActorSheet for Lancer deployables.
 */
export class LancerDeployableSheet extends LancerActorSheet<EntryType.DEPLOYABLE> {
  static DEFAULT_OPTIONS = {
    classes: ["lancer", "sheet", "actor", "deployable"],
    position: { width: 800, height: 800 },
    tag: "form" as const,
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  protected get tabInitial(): string {
    return "status";
  }

  canRootDrop(item: ResolvedDropData): boolean {
    return (
      (item.type === "Actor" &&
        [EntryType.PILOT, EntryType.MECH, EntryType.NPC].includes(item.document.type as EntryType)) ||
      (item.type === "Item" && item.document.is_status())
    );
  }

  async onRootDrop(drop: ResolvedDropData, _event: DragEvent, _dest: HTMLElement): Promise<void> {
    if (drop.type == "Actor" && drop.document != this.actor) {
      this.actor.update({ "system.owner": drop.document.uuid });
    }
  }
}
