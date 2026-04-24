// Import TypeScript modules
import { LANCER } from "../config";
import { LancerItem } from "../item/lancer-item";
import type { LancerActor } from "../actor/lancer-actor";
import { renderTemplateStep } from "./_render";
import { LancerFlowState } from "./interfaces";
import { Flow, type FlowState, type Step } from "./flow";
import type { UUIDRef } from "../source-template";

const lp = LANCER.log_prefix;

export function registerFullRepairSteps(flowSteps: Map<string, Step<any, any> | Flow<any>>) {
  flowSteps.set("displayFullRepairDialog", displayFullRepairDialog);
  flowSteps.set("executeFullRepair", executeFullRepair);
}

export class FullRepairFlow extends Flow<LancerFlowState.TextRollData> {
  static steps = ["displayFullRepairDialog", "executeFullRepair"];

  constructor(uuid: UUIDRef | LancerItem | LancerActor, data?: Partial<LancerFlowState.TextRollData>) {
    // Initialize data if not provided
    const initialData: LancerFlowState.TextRollData = {
      title: data?.title || "",
      description: data?.description || "",
      tags: data?.tags || [],
    };

    super(uuid, initialData);
  }
}

export async function displayFullRepairDialog(state: FlowState<LancerFlowState.TextRollData>): Promise<boolean> {
  if (!state.data) throw new TypeError(`Full Repair flow state missing!`);

  return (
    (await foundry.applications.api.DialogV2.confirm({
      window: { title: `FULL REPAIR - ${state.actor.name}` },
      content: `<h3>Are you sure you want to fully repair the ${state.actor?.type} "${state.actor?.name}"?</h3>`,
      yes: { icon: "fas fa-check", label: "Yes" },
      no: { icon: "fas fa-times", label: "No" },
      rejectClose: false,
    })) ?? false
  );
}

export async function executeFullRepair(state: FlowState<LancerFlowState.TextRollData>): Promise<boolean> {
  if (!state.data) throw new TypeError(`Full Repair flow state missing!`);

  const template = `systems/${game.system.id}/templates/chat/generic-card.hbs`;
  const flags = {};
  let data = {
    title: state.data.title,
    description: state.data.description,
    tags: state.data.tags,
  };
  await state.actor.loadoutHelper.fullRepair();
  data.title = "FULL REPAIR";
  data.description = `Notice: ${state.actor.name} has been fully repaired.`;
  await renderTemplateStep(state.actor, template, data, flags);

  return true;
}
