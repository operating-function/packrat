// matomo.ts - Matomo tracking with opt-out and persistent user ID

import { getLocalOption, setLocalOption } from "./localstorage";

const MATOMO_URL = "https://analytics.vaporware.network/matomo.php";
const SITE_ID = "1";
const USER_ID_KEY = "matomoUserId";

/**
 * Ensure there is a persistent user ID in local storage.
 * If one doesn't exist, generate a random hex string, store it, and return it.
 */
async function getOrCreateUserId(): Promise<string> {
  let stored = await getLocalOption(USER_ID_KEY);
  if (stored && typeof stored === "string") {
    return stored;
  }

  // Generate a 16-byte (128-bit) hex string
  const randomId = Array.from({ length: 16 })
    .map(() =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

  await setLocalOption(USER_ID_KEY, randomId);
  return randomId;
}

/**
 * Reads the "analyticsEnabled" key via getLocalOption.
 * We expect it to be stored as "1" or "0".
 * Returns true only if the stored value is exactly "1".
 */
async function checkAnalyticsEnabled(): Promise<boolean> {
  const stored = await getLocalOption("analyticsEnabled");
  return stored === "1";
}

/**
 * Check if we're in the background/service worker context
 */
function isBackgroundContext(): boolean {
  // Check if we have access to chrome.tabs (only available in background)
  return typeof chrome !== "undefined" && chrome.tabs !== undefined;
}

/**
 * Send a simple event to Matomo, but only if analyticsEnabled === "1".
 * Includes a persistent user ID (uid) in every request.
 */
export async function trackEvent(
  category: string,
  action: string,
  name?: string,
): Promise<void> {
  try {
    const isEnabled = await checkAnalyticsEnabled();
    if (!isEnabled) {
      console.log("Matomo tracking is disabled; skipping event:", {
        category,
        action,
        name,
      });
      return;
    }

    const userId = await getOrCreateUserId();
    const params = new URLSearchParams({
      // Required
      idsite: SITE_ID,
      rec: "1",

      // Event parameters
      e_c: category,
      e_a: action,
      e_n: name || "",

      // Basic info
      url: "chrome-extension://" + chrome.runtime.id,
      _id: Math.random().toString(16).substr(2, 16),
      rand: Date.now().toString(),
      apiv: "1",

      // Don't return image
      send_image: "0",

      // Persistent user ID
      uid: userId,
    });

    const url = `${MATOMO_URL}?${params.toString()}`;
    console.log("Sending Matomo event:", {
      category,
      action,
      name,
      userId,
      url,
    });

    // If we're in the background context, use fetch directly
    if (isBackgroundContext()) {
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
      });
      console.log("Matomo event sent directly from background");
    } else {
      // Otherwise, try to send via message to background
      try {
        await chrome.runtime.sendMessage({
          type: "matomoTrack",
          url: url,
        });
        console.log("Matomo event sent via message");
      } catch (error) {
        // Fallback to image beacon if messaging fails
        const img = new Image();
        img.src = url;
        console.log("Matomo event sent via image beacon");
      }
    }

    console.log("Matomo event sent successfully");
  } catch (error) {
    console.error("Matomo tracking error:", error);
  }
}
