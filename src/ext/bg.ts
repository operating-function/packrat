import { BrowserRecorder } from "./browser-recorder";

import { CollectionLoader } from "@webrecorder/wabac/swlib";

import { listAllMsg } from "../utils";
import {
  getLocalOption,
  removeLocalOption,
  setLocalOption,
  getSharedArchives,
} from "../localstorage";
import { isValidUrl } from "../utils";
// ===========================================================================
self.recorders = {};
self.newRecId = null;

// @ts-expect-error - TS7034 - Variable 'newRecUrl' implicitly has type 'any' in some locations where its type cannot be determined.
let newRecUrl = null;
// @ts-expect-error - TS7034 - Variable 'newRecCollId' implicitly has type 'any' in some locations where its type cannot be determined.
let newRecCollId = null;

// @ts-expect-error - TS7034 - Variable 'defaultCollId' implicitly has type 'any' in some locations where its type cannot be determined.
let defaultCollId = null;
let autorun = false;
let isRecordingEnabled = false;
let skipDomains = [] as string[];

const openWinMap = new Map();

const collLoader = new CollectionLoader();

const disabledCSPTabs = new Set();

// @ts-expect-error - TS7034 - Variable 'sidepanelPort' implicitly has type 'any' in some locations where its type cannot be determined.
let sidepanelPort = null;

(async function loadSkipDomains() {
  // @ts-expect-error
  skipDomains = (await getLocalOption("skipDomains")) || [];
})();

// ===========================================================================

function main() {
  chrome.action.setBadgeBackgroundColor({ color: "#4d7c0f" });

  chrome.contextMenus.create({
    id: "toggle-rec",
    title: "Start Recording",
    contexts: ["browser_action"],
  });
  chrome.contextMenus.create({
    id: "view-rec",
    title: "View Web Archives",
    contexts: ["all"],
  });
}
// Side panel
chrome.sidePanel
  .setPanelBehavior({
    openPanelOnActionClick: true,
  })
  .catch((err: Error) => {
    console.error(err);
  });

// @ts-expect-error - TS7006 - Parameter 'port' implicitly has an 'any' type.
chrome.runtime.onConnect.addListener((port) => {
  switch (port.name) {
    case "sidepanel-port":
      sidepanelHandler(port);
      break;
  }
});

// @ts-expect-error - TS7006 - Parameter 'port' implicitly has an 'any' type.
function sidepanelHandler(port) {
  if (
    !port.sender ||
    port.sender.url !== chrome.runtime.getURL("sidepanel.html")
  ) {
    return;
  }

  // @ts-expect-error - TS7034 - Variable 'tabId' implicitly has type 'any' in some locations where its type cannot be determined.
  let tabId = null;

  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  port.onMessage.addListener(async (message) => {
    switch (message.type) {
      case "startUpdates":
        tabId = message.tabId;
        sidepanelPort = port;
        if (self.recorders[tabId]) {
          // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'BrowserRecorder'.
          self.recorders[tabId].port = port;
          self.recorders[tabId].doUpdateStatus();
        }
        port.postMessage(await listAllMsg(collLoader));
        break;

      case "getPages": {
        const defaultCollId = await getLocalOption("defaultCollId");
        if (!defaultCollId) {
          port.postMessage({ type: "pages", pages: [] });
          return;
        }

        const coll = await collLoader.loadColl(defaultCollId);
        if (coll?.store?.getAllPages) {
          const pages = await coll.store.getAllPages();
          port.postMessage({ type: "pages", pages });
        } else {
          port.postMessage({ type: "pages", pages: [] });
        }
        break;
      }

      case "deletePages": {
        const defaultCollId = await getLocalOption("defaultCollId");
        if (!defaultCollId) {
          return;
        }
        const coll = await collLoader.loadColl(defaultCollId);

        for (const id of message.pageIds) {
          await coll.store.deletePage(id);
        }

        // now re-send the new list of pages
        const pages = await coll.store.getAllPages();
        port.postMessage({ type: "pages", pages });
        break;
      }

      case "startRecording": {
        isRecordingEnabled = true;
        defaultCollId = message.collId;
        autorun = message.autorun;

        chrome.tabs.query(
          { active: true, currentWindow: true },
          //@ts-expect-error tabs has any type
          async (tabs) => {
            for (const tab of tabs) {
              if (!isValidUrl(tab.url, skipDomains)) continue;

              await startRecorder(
                tab.id,
                {
                  // @ts-expect-error - collId implicitly has an 'any' type.
                  collId: defaultCollId,
                  port: null,
                  autorun,
                },
                //@ts-expect-error - 2 parameters but 3
                tab.url,
              );
            }

            port.postMessage({
              type: "status",
              recording: true,
              autorun,
              // @ts-expect-error - defaultCollId implicitly has an 'any' type.
              collId: defaultCollId,
            });
          },
        );

        break;
      }

      case "stopRecording": {
        isRecordingEnabled = false;

        for (const [tabIdStr, rec] of Object.entries(self.recorders)) {
          const tabId = parseInt(tabIdStr);
          stopRecorder(tabId);
        }

        port.postMessage({
          type: "status",
          recording: false,
          autorun,
          // @ts-expect-error - defaultCollId implicitly has an 'any' type.
          collId: defaultCollId,
        });

        break;
      }

      case "toggleBehaviors":
        // @ts-expect-error - TS7005 - Variable 'tabId' implicitly has an 'any' type.
        toggleBehaviors(tabId);
        break;

      case "newColl": {
        const { name } = await collLoader.initNewColl({ title: message.title });
        defaultCollId = name;
        port.postMessage(await listAllMsg(collLoader, { defaultCollId }));
        await setLocalOption("defaultCollId", defaultCollId);
        break;
      }
      case "getSharedArchives": {
        const arr = await getSharedArchives();
        port.postMessage({ type: "sharedArchives", sharedArchives: arr });
        break;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    // @ts-expect-error - TS2538 - Type 'null' cannot be used as an index type.
    if (self.recorders[tabId]) {
      // @ts-expect-error - TS2538 - Type 'null' cannot be used as an index type.
      self.recorders[tabId].port = null;
    }
  });
}
// ===========================================================================
chrome.runtime.onMessage.addListener(
  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  (message /*sender, sendResponse*/) => {
    console.log("onMessage", message);
    switch (message.msg) {
      case "optionsChanged":
        for (const rec of Object.values(self.recorders)) {
          rec.initOpts();
          rec.doUpdateStatus();
        }
        break;

      case "startNew":
        (async () => {
          newRecUrl = message.url;
          newRecCollId = message.collId;
          autorun = message.autorun;
          defaultCollId = await getLocalOption("defaultCollId");
          chrome.tabs.create({ url: "about:blank" });
        })();
        break;

      case "disableCSP":
        disableCSPForTab(message.tabId);
        break;
    }
    return true;
  },
);
// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tab' implicitly has an 'any' type. | TS7006 - Parameter 'reason' implicitly has an 'any' type.
chrome.debugger.onDetach.addListener((tab, reason) => {
  // target closed, delete recorder as this tab will not be used again
  if (reason === "target_closed") {
    delete self.recorders[tab.id];
  }
});

// @ts-expect-error - TS7006 - Parameter 'tab' implicitly has an 'any' type.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // @ts-expect-error - TS7034 - Variable 'err' implicitly has type 'any' in some locations where its type cannot be determined.
  if (sidepanelPort) {
    sidepanelPort.postMessage({ type: "update" });
  }
  if (!isRecordingEnabled) return;

  // @ts-expect-error - chrome doesn't have type definitions
  const tab = await new Promise<chrome.tabs.Tab>((resolve) =>
    chrome.tabs.get(tabId, resolve),
  );

  if (!isValidUrl(tab.url, skipDomains)) return;
  if (!self.recorders[tabId]) {
    await startRecorder(
      tabId,
      {
        // @ts-expect-error - collId implicitly has an 'any' type.
        collId: defaultCollId,
        port: null,
        autorun,
      },

      // @ts-expect-error - 2 parameters but 3
      tab.url,
    );
  }
});

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tab' implicitly has an 'any' type.
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  let openUrl = null;
  let start = false;
  let waitForTabUpdate = true;
  let collId = null;

  // start recording from extension in new tab use case
  // @ts-expect-error - TS7005 - Variable 'newRecUrl' implicitly has an 'any' type.
  if (newRecUrl && tab.pendingUrl === "about:blank") {
    start = true;
    openUrl = newRecUrl;
    // @ts-expect-error - TS7005 - Variable 'newRecCollId' implicitly has an 'any' type. | TS7005 - Variable 'defaultCollId' implicitly has an 'any' type.
    collId = newRecCollId || defaultCollId;
    newRecUrl = null;
    newRecCollId = null;
  } else if (
    tab.openerTabId &&
    (!tab.pendingUrl || isValidUrl(tab.pendingUrl, skipDomains)) &&
    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
    self.recorders[tab.openerTabId]?.running
  ) {
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'.
    collId = self.recorders[tab.openerTabId].collId;

    start = true;
    if (tab.pendingUrl) {
      waitForTabUpdate = false;
      openUrl = tab.pendingUrl;
    }
  }

  if (start) {
    if (openUrl && !isValidUrl(openUrl, skipDomains)) {
      return;
    }
    startRecorder(
      tab.id,
      { waitForTabUpdate, collId, openUrl, autorun },
      // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
      openUrl,
    );
  }
});

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type. | TS7006 - Parameter 'changeInfo' implicitly has an 'any' type.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId && self.recorders[tabId]) {
    const recorder = self.recorders[tabId];
    if (changeInfo.url) {
      // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'BrowserRecorder'.
      recorder.failureMsg = null;
    }

    if (changeInfo.url && openWinMap.has(changeInfo.url)) {
      openWinMap.delete(changeInfo.url);
    }

    if (changeInfo.url && !isValidUrl(changeInfo.url, skipDomains)) {
      stopRecorder(tabId);
      delete self.recorders[tabId];
      // let the side-panel know the ’canRecord’/UI state changed
      // @ts-expect-error
      if (sidepanelPort) {
        sidepanelPort.postMessage({ type: "update" });
      }
      return;
    }

    // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
    if (recorder.waitForTabUpdate) {
      if (isValidUrl(changeInfo.url, skipDomains)) {
        recorder.attach();
      } else {
        // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
        recorder.waitForTabUpdate = false;
        delete self.recorders[tabId];
        return;
      }
    }
  } else if (changeInfo.url) {
    // @ts-expect-error - TS7034 - Variable 'err' implicitly has type 'any' in some locations where its type cannot be determined.
    if (sidepanelPort) {
      sidepanelPort.postMessage({ type: "update" });
    }
    if (
      isRecordingEnabled &&
      isValidUrl(changeInfo.url, skipDomains) &&
      !self.recorders[tabId]
    ) {
      // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
      startRecorder(tabId, { collId: defaultCollId, autorun }, changeInfo.url);
      return;
    }
    if (openWinMap.has(changeInfo.url)) {
      const collId = openWinMap.get(changeInfo.url);
      openWinMap.delete(changeInfo.url);
      if (!tabId || !isValidUrl(changeInfo.url, skipDomains)) return;

      // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
      startRecorder(tabId, { collId, autorun }, changeInfo.url);
    }
  }
});

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type.
chrome.tabs.onRemoved.addListener((tabId) => {
  delete self.recorders[tabId];
  removeLocalOption(`${tabId}-collId`);
});

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'info' implicitly has an 'any' type. | TS7006 - Parameter 'tab' implicitly has an 'any' type.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "view-rec":
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
      break;

    case "toggle-rec":
      if (!isRecording(tab.id)) {
        if (isValidUrl(tab.url, skipDomains)) {
          // @ts-expect-error - TS2554 - Expected 2 arguments, but got 1.
          startRecorder(tab.id);
        }
      } else {
        stopRecorder(tab.id);
      }
      break;
  }
});

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type. | TS7006 - Parameter 'opts' implicitly has an 'any' type.
async function startRecorder(tabId, opts) {
  if (!self.recorders[tabId]) {
    opts.collLoader = collLoader;
    opts.openWinMap = openWinMap;
    self.recorders[tabId] = new BrowserRecorder({ tabId }, opts);
  } else {
    self.recorders[tabId].setAutoRunBehavior(opts.autorun);
  }

  let err = null;
  // @ts-expect-error - TS7034 - Variable 'sidepanelPort' implicitly has type 'any' in some locations where its type cannot be determined.
  if (sidepanelPort) {
    sidepanelPort.postMessage({ type: "update" });
  }
  const { waitForTabUpdate } = opts;

  // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
  if (!waitForTabUpdate && !self.recorders[tabId].running) {
    try {
      self.recorders[tabId].setCollId(opts.collId);
      await self.recorders[tabId].attach();
    } catch (e) {
      console.warn(e);
      err = e;
    }
    return err;
  }
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type.
function stopRecorder(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].detach();
    return true;
  }

  return false;
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type.
function toggleBehaviors(tabId) {
  if (self.recorders[tabId]) {
    self.recorders[tabId].toggleBehaviors();
    return true;
  }

  return false;
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type.
function isRecording(tabId) {
  // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
  return self.recorders[tabId]?.running;
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'tabId' implicitly has an 'any' type.
async function disableCSPForTab(tabId) {
  if (disabledCSPTabs.has(tabId)) {
    return;
  }

  await new Promise((resolve) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
      resolve();
    });
  });

  await new Promise((resolve) => {
    chrome.debugger.sendCommand(
      { tabId },
      "Page.setBypassCSP",
      { enabled: true },
      // @ts-expect-error - TS7006 - Parameter 'resp' implicitly has an 'any' type.
      (resp) => resolve(resp),
    );
  });

  disabledCSPTabs.add(tabId);

  // hacky: don't detach if any recorders are running, otherwise will disconnect
  for (const rec of Object.values(self.recorders)) {
    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
    if (rec.running) {
      return;
    }
  }

  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
      resolve();
    });
  });
}

// ===========================================================================
chrome.runtime.onInstalled.addListener(main);

if (self.importScripts) {
  self.importScripts("sw.js");
}
