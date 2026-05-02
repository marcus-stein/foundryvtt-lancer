import type { CachedCloudPilot } from "../interfaces";
import type { PackedPilotData } from "./unpacking/packed-types";

// we only cache the id, cloud ids, and name; we're going to fetch all other data on user input
// the point of the cache is not have the pilot actor window to wait for network calls

let _cache: CachedCloudPilot[] = [];

export function cleanCloudOwnerID(str: string): string {
  return str.substring(0, 10) == "us-east-1:" ? str.substring(10) : str;
}

/** Returns the currently signed-in Comp/Con email, or null if not logged in. */
export async function getLoggedInUser(): Promise<string | null> {
  try {
    const { Auth } = await import("@aws-amplify/auth");
    const user = await Auth.currentAuthenticatedUser();
    return user?.attributes?.email ?? user?.username ?? null;
  } catch {
    return null;
  }
}

export async function populatePilotCache(): Promise<CachedCloudPilot[]> {
  const { Auth } = await import("@aws-amplify/auth");
  const { Storage } = await import("@aws-amplify/storage");
  try {
    await Auth.currentSession(); // refresh the token if we need to
  } catch (e) {
    console.warn(`AWS Auth failed: ${e}`);
    return [];
  }
  const res = await Storage.list("pilot", {
    level: "protected",
    cacheControl: "no-cache",
    // Filter out deleted pilots (tagged with "delete" or "s3-remove-flag"), we want "active"
  }).then(result => {
    console.log(`Found ${result.results.length} pilot files in cloud storage`);
    return result.results.filter(x => x.key?.endsWith("--active"));
  });

  console.log(`After filtering for active pilots: ${res.length} remaining`);
  res.forEach(pilot => console.log(`  - ${pilot.key}`));

  const settled = await Promise.allSettled(res.map(obj => (obj.key ? fetchPilot(obj.key) : null)));
  const fulfilled = settled.filter((r): r is PromiseFulfilledResult<PackedPilotData> => r.status === "fulfilled" && r.value !== null);
  const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  
  console.log(`Pilot fetch results: ${fulfilled.length} successful, ${rejected.length} failed`);
  if (rejected.length > 0) {
    console.log("Failed pilot fetches:");
    rejected.forEach((r, i) => console.log(`  - ${res[i]?.key}: ${r.reason}`));
  }

  const data = fulfilled.map(r => r.value);

  console.log(`Processing ${data.length} successfully fetched pilots:`);
  data.forEach(pilot => {
    pilot.mechs = [];
    pilot.cloudOwnerID = pilot.cloudOwnerID != null ? cleanCloudOwnerID(pilot.cloudOwnerID) : "";
    pilot.cloudID = pilot.cloudID != null ? pilot.cloudID : pilot.id;
    console.log(`  - ${pilot.name} (${pilot.id})`);
  });
  _cache = data;
  return data;
}

export function pilotCache(): CachedCloudPilot[] {
  return _cache;
}

export async function fetchPilotViaShareCode(sharecode: string): Promise<PackedPilotData> {
  const shareCodeResponse = await fetch("https://api.compcon.app/share?code=" + sharecode, {
    headers: {
      "x-api-key": "fcFvjjrnQy2hypelJQi4X9dRI55r5KuI4bC07Maf",
    },
  });

  const shareObj = await shareCodeResponse.json();
  const pilotResponse = await fetch(shareObj["presigned"]);
  return await pilotResponse.json();
}

export async function fetchPilotViaCache(cachedPilot: CachedCloudPilot): Promise<PackedPilotData> {
  const sanitizedName = cachedPilot.name.replace(/[^a-zA-Z\d\s:]/g, " ");
  const documentID = `pilot/${sanitizedName}--${cachedPilot.id}--active`;
  const { Storage } = await import("@aws-amplify/storage");
  const req: any = {
    level: "protected",
    download: true,
    cacheControl: "no-cache",
  };

  const res = (await Storage.get(documentID, req)) as any;
  const text = await res.Body.text();
  const json = JSON.parse(text);
  return json;
}

export async function fetchPilot(cloudID: string, cloudOwnerID?: string): Promise<PackedPilotData> {
  // we're just gonna. accept all possible forms of this. let's not fuss.
  if (!cloudOwnerID && cloudID.includes("//")) {
    // only one argument, new-style vault id
    [cloudOwnerID, cloudID] = cloudID.split("//");
  }
  if (cloudID.substring(0, 6) != "pilot/") {
    cloudID = "pilot/" + cloudID;
  }
  if (cloudOwnerID && cloudOwnerID.substring(0, 10) != "us-east-1:") {
    cloudOwnerID = "us-east-1:" + cloudOwnerID;
  }
  try {
    const { Auth } = await import("@aws-amplify/auth");
    await Auth.currentSession(); // refresh the token if we need to
  } catch (e) {
    ui.notifications!.error("Sync failed - you aren't logged into a Comp/Con account.");
    throw e;
  }

  const { Storage } = await import("@aws-amplify/storage");
  const req: any = {
    level: "protected",
    download: true,
    cacheControl: "no-cache",
  };
  if (cloudOwnerID) {
    req.identityId = cloudOwnerID;
  }
  const res = (await Storage.get(cloudID, req)) as any;
  const text = await res.Body.text();
  return JSON.parse(text);
}
