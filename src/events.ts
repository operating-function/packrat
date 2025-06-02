import { trackEvent } from "./matomo";
import { getLocalOption } from "./localstorage";

// Track when a user clicks on an archived page to view it
export async function onPageClicked(pageUrl: string): Promise<void> {
  console.log("onPageClicked called with URL:", pageUrl);
  await trackEvent("Archive", "ViewPage", pageUrl);
}

// Track when a torrent is created for sharing
export async function onTorrentCreated(numPages: number): Promise<void> {
  console.log("onTorrentCreated called with pages:", numPages);
  await trackEvent("Sharing", "TorrentCreated", `${numPages} pages`);
}

// Track when a page is successfully archived
export async function onPageArchived(
  pageUrl: string,
  pageSize?: number,
): Promise<void> {
  console.log("onPageArchived called:", pageUrl, pageSize);
  await trackEvent("Archive", "PageArchived", pageUrl);

  // If page size is provided, track it separately
  if (pageSize !== undefined) {
    await trackEvent("Archive", "PageSize", `${Math.round(pageSize / 1024)}KB`);
  }
}

// Track settings changes
export async function onSettingsChanged(
  settingName: string,
  value: string | boolean | number,
): Promise<void> {
  console.log("onSettingsChanged:", settingName, value);
  await trackEvent("Settings", settingName, String(value));
}

// Track total archive size
export async function trackArchiveSize(totalSizeBytes: number): Promise<void> {
  const sizeMB = Math.round(totalSizeBytes / (1024 * 1024));
  console.log("trackArchiveSize:", sizeMB, "MB");
  await trackEvent("Archive", "TotalSize", `${sizeMB}MB`);
}

// Track when archiving starts
export async function onArchivingStarted(pageUrl: string): Promise<void> {
  console.log("onArchivingStarted:", pageUrl);
  await trackEvent("Archive", "Started", pageUrl);
}

// Track when archiving stops
export async function onArchivingStopped(
  reason: string = "manual",
): Promise<void> {
  console.log("onArchivingStopped:", reason);
  await trackEvent("Archive", "Stopped", reason);
}
