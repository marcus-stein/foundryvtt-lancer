import { LancerItem, type LancerItemType, type LancerLICENSE } from "./item/lancer-item";
import {
  LancerActor,
  type LancerActorType,
  type LancerDEPLOYABLE,
  type LancerMECH,
  type LancerPILOT,
} from "./actor/lancer-actor";
import { LancerActiveEffect } from "./effects/lancer-active-effect";
import type { CollapseRegistry } from "./helpers/collapse";

// ------------------------------------------------------
// |       SHEET DATA TYPES                             |
// ------------------------------------------------------

// Context type for LancerItemSheet._prepareContext
export interface LancerItemSheetData<T extends LancerItemType> {
  item: LancerItem;
  system: Item.SystemOfType<T>;
  editable: boolean;
  collapse: CollapseRegistry;
  deployables: Record<string, LancerDEPLOYABLE>;
  license: LancerLICENSE | null;
  org_types?: { [key: string]: string };
  status_types?: { [key: string]: string };
}

export type CachedCloudPilot = {
  id: string;
  name: string;
  callsign: string;
  cloudID: string;
  cloudOwnerID: string;
};

export interface LancerActorSheetData<T extends LancerActorType> {
  document: LancerActor;
  editable: boolean;
  system: Actor.SystemOfType<T>;
  itemTypes: LancerActor["itemTypes"];
  collapse: CollapseRegistry;
  deployables: Record<string, LancerDEPLOYABLE>;
  effect_categories: ReturnType<(typeof LancerActiveEffect)["prepareActiveEffectCategories"]>;
  actor: LancerActor;
  active_mech?: LancerMECH;
  pilot?: LancerPILOT;
  compConPilotList?: Record<string, string>;
}

export interface GenControlContext {
  // T is whatever is yielded by get_data/handled by commit_func
  // Raw information
  elt: HTMLElement; // The control element which fired this control event
  base_document: LancerActor | LancerItem; // The base document of this sheet
  path: string; // The data path stored on the control
  action: "delete" | "null" | "splice" | "set" | "append" | "insert"; // The action stored on the control
  raw_val?: string; // The unprocessed val stored on the control, if applicable

  // Deduced information
  path_target: null | any; // What path resolved to on data, if anything
  target_document: LancerActor | LancerItem; // The last document we were able to resolve on the path. Will be the target of our update
  relative_path: string; // Our update path relative to document
  parsed_val?: any; // Parsed version of raw_val
}
