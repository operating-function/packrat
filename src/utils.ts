import { getCollData } from "@webrecorder/wabac";
import { getLocalOption, setLocalOption } from "./localstorage";

export function isValidUrl(url: string, skipDomains: string[]): Boolean {
  if (!isSupportedScheme(url)) {
    return false;
  }

  if (isUrlInSkipList(url, skipDomains)) {
    return false;
  }

  return true;
}

function isSupportedScheme(url: string): boolean {
  return (
    url === "about:blank" || url.startsWith("http:") || url.startsWith("https:")
  );
}

export function isUrlInSkipList(url: string, skipDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return skipDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch (e) {
    console.log("utils: Malformed URL in skip check:", e);
    return false;
  }
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'collLoader' implicitly has an 'any' type.
export async function ensureDefaultColl(collLoader) {
  let colls = await collLoader.listAll();

  if (!colls.length) {
    const metadata = { title: "My Archive" };
    const result = await collLoader.initNewColl(metadata);

    await setLocalOption("defaultCollId", result.name);

    colls = [result];
  } else {
    const defaultId = await getLocalOption("defaultCollId");

    for (const coll of colls) {
      if (coll.name === defaultId) {
        return colls;
      }
    }

    await setLocalOption("defaultCollId", colls[0].name);
  }

  return colls;
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'collLoader' implicitly has an 'any' type.
export async function listAllMsg(collLoader, { defaultCollId = null } = {}) {
  let colls = await ensureDefaultColl(collLoader);

  // @ts-expect-error - TS7006 - Parameter 'x' implicitly has an 'any' type.
  colls = colls.map((x) => getCollData(x));

  // sort same way as the UI collections index
  const sortKey = await getLocalOption("index:sortKey");
  const sortDesc = (await getLocalOption("index:sortDesc")) === "1";

  // @ts-expect-error - TS7006 - Parameter 'first' implicitly has an 'any' type. | TS7006 - Parameter 'second' implicitly has an 'any' type.
  colls.sort((first, second) => {
    // @ts-expect-error - TS2538 - Type 'unknown' cannot be used as an index type. | TS2538 - Type 'unknown' cannot be used as an index type.
    if (first[sortKey] === second[sortKey]) {
      return 0;
    }

    // @ts-expect-error - TS2538 - Type 'unknown' cannot be used as an index type. | TS2538 - Type 'unknown' cannot be used as an index type.
    return sortDesc == first[sortKey] < second[sortKey] ? 1 : -1;
  });

  const msg = { type: "collections" };
  // @ts-expect-error - TS2339 - Property 'collId' does not exist on type '{ type: string; }'.
  msg.collId = defaultCollId || (await getLocalOption("defaultCollId"));
  // @ts-expect-error - TS2339 - Property 'collections' does not exist on type '{ type: string; }'.
  msg.collections = colls.map((coll) => ({
    id: coll.id,
    title: coll.title || coll.filename,
  }));

  return msg;
}

export function mapIntegerToRange(integer: number) {
  // Calculate distance from 0 (use absolute value for negative numbers)
  const distance = Math.abs(integer);

  // Use our calculated decay constant for appropriate distribution
  const decayConstant = 0.014505;

  // Calculate result using exponential decay
  const result = 0.1 + 0.9 * Math.exp(-decayConstant * distance);

  // Ensure the result is between 0.1 and 1
  return Math.max(0.1, Math.min(1, result));
}

export function truncateString(str: string) {
  const maxLength = 100;
  // If string is shorter than or equal to maxLength, return it as is
  if (str.length <= maxLength) {
    return str;
  }

  // Otherwise, truncate to maxLength - 3 characters and add "..."
  // This ensures the total length (including "...") doesn't exceed maxLength
  return str.substring(0, maxLength - 3) + "...";
}
