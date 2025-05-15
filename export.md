# Project Structure

```
.github/
  workflows/
    buildapp.yaml
    buildext.yaml
    npm-release.yaml
ruffle/
  .gitignore
  download-latest-ruffle.sh
  LICENSE_MIT
src/
  assets/
    brand/
      archivewebpage-icon-color.svg
      archivewebpage-lockup-color-dynamic.svg
      archivewebpage-lockup-color.svg
    icons/
      recLogo.svg
  electron/
    app-popup.ts
    electron-rec-main.ts
    electron-rec-preload.ts
    electron-recorder-app.ts
    electron-recorder.ts
    rec-preload.ts
    rec-window.html
    rec-window.ts
  ext/
    bg-types.d.ts
    bg.ts
    browser-recorder.ts
    manifest.json
  sw/
    api.ts
    downloader.ts
    globals.d.ts
    ipfsutils.ts
    keystore.ts
    main.ts
    recproxy.ts
  types/
    webtorrent-browser.d.ts
    webtorrent-global.d.ts
  ui/
    app.ts
    coll-index.ts
    coll-info.ts
    coll.ts
    recordembed.ts
    upload.ts
  argo-archive-list.ts
  consts.ts
  embed.html
  globals.d.ts
  localstorage.ts
  popup.ts
  recorder.ts
  requestresponseinfo.ts
  sidepanel.ts
  types.ts
  utils.ts
static/
  lib/
    webtorrent.min.js
  pdf/
    pdf.min.js
    pdf.worker.min.js
  replay/
    icon.png
    index.html
  ruffle/
    LICENSE_MIT
  brave-ipfs.json
  extractPDF.js
  icon-dev.png
  icon.png
  index.html
  popup.html
  replayIcon.png
  sidepanel.html
.eslintignore
.eslintrc.js
.export-include
.gitignore
.prettierignore
.prettierrc
build-replay.sh
build.sh
LICENSE.md
package.json
README.md
tsconfig.eslint.json
tsconfig.json
webpack.config.js
yarn.lock
```


## src\electron\rec-window.html

```html
<!doctype html>
<html>
  <head>
    <style>
      html,
      body {
        width: 100vw;
        height: 100vh;
        overflow-y: hidden;
        padding: 0px;
        margin: 0px;
        background-color: white;
      }
    </style>
    <script src="./rec-window.js"></script>
  </head>

  <body>
    <wr-rec-ui></wr-rec-ui>
  </body>
</html>
```


## src\ext\bg-types.d.ts

```ts
import "../globals";

import type { BrowserRecorder } from "./browser-recorder";

declare global {
  interface Window {
    recorders: Record<string, BrowserRecorder>;
    newRecId: string | null;
  }
  let chrome: TODOFixMe;
}
```


## src\ext\bg.ts

```ts
import { BrowserRecorder } from "./browser-recorder";

import { CollectionLoader } from "@webrecorder/wabac/swlib";

import { listAllMsg } from "../utils";

import {
  getLocalOption,
  removeLocalOption,
  setLocalOption,
} from "../localstorage";

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

const openWinMap = new Map();

const collLoader = new CollectionLoader();

const disabledCSPTabs = new Set();

// @ts-expect-error - TS7034 - Variable 'sidepanelPort' implicitly has type 'any' in some locations where its type cannot be determined.
let sidepanelPort = null;

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

      case "startRecording": {
        isRecordingEnabled = true;
        defaultCollId = message.collId;
        autorun = message.autorun;

        // @ts-expect-error - tabs doesn't have type definitions
        chrome.tabs.query(
          { active: true, currentWindow: true },
          async (tabs) => {
            for (const tab of tabs) {
              if (!isValidUrl(tab.url)) continue;

              // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
              await startRecorder(
                tab.id,
                { collId: defaultCollId, port: null, autorun },
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

  if (!isValidUrl(tab.url)) return;
  if (!self.recorders[tabId]) {
    // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
    await startRecorder(
      tabId,
      { collId: defaultCollId, port: null, autorun },
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
    (!tab.pendingUrl || isValidUrl(tab.pendingUrl)) &&
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
    if (openUrl && !isValidUrl(openUrl)) {
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

    // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
    if (recorder.waitForTabUpdate) {
      if (isValidUrl(changeInfo.url)) {
        recorder.attach();
      } else {
        // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
        recorder.waitForTabUpdate = false;
        delete self.recorders[tabId];
        return;
      }
    }
  } else if (changeInfo.url) {
    if (
      isRecordingEnabled &&
      isValidUrl(changeInfo.url) &&
      !self.recorders[tabId]
    ) {
      // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
      startRecorder(tabId, { collId: defaultCollId, autorun }, changeInfo.url);
      return;
    }
    if (openWinMap.has(changeInfo.url)) {
      const collId = openWinMap.get(changeInfo.url);
      openWinMap.delete(changeInfo.url);
      if (!tabId || !isValidUrl(changeInfo.url)) return;

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
        if (isValidUrl(tab.url)) {
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
// @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type.
function isValidUrl(url) {
  return (
    url &&
    (url === "about:blank" ||
      url.startsWith("https:") ||
      url.startsWith("http:"))
  );
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
```


## src\ext\browser-recorder.ts

```ts
"use strict";

import { BEHAVIOR_RUNNING } from "../consts";
import { Recorder } from "../recorder";

// ===========================================================================
const DEBUG = false;

const IS_AGREGORE = navigator.userAgent.includes("agregore-browser");

// ===========================================================================
class BrowserRecorder extends Recorder {
  constructor(
    // @ts-expect-error - TS7006 - Parameter 'debuggee' implicitly has an 'any' type.
    debuggee,
    {
      // @ts-expect-error - TS7031 - Binding element 'collId' implicitly has an 'any' type.
      collId,
      // @ts-expect-error - TS7031 - Binding element 'collLoader' implicitly has an 'any' type.
      collLoader,
      waitForTabUpdate = false,
      openUrl = null,
      port = null,
      openWinMap = null,
      autorun = false,
    },
  ) {
    super();

    // @ts-expect-error - TS2339 - Property 'openUrl' does not exist on type 'BrowserRecorder'.
    this.openUrl = openUrl;
    // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
    this.waitForTabUpdate = waitForTabUpdate;
    // @ts-expect-error - TS2339 - Property 'debuggee' does not exist on type 'BrowserRecorder'.
    this.debuggee = debuggee;
    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
    this.tabId = debuggee.tabId;
    // @ts-expect-error - TS2339 - Property 'openWinMap' does not exist on type 'BrowserRecorder'.
    this.openWinMap = openWinMap;
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'BrowserRecorder'.
    this.autorun = autorun;
    // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
    this.isAttached = false;

    // @ts-expect-error - TS2339 - Property 'flatMode' does not exist on type 'BrowserRecorder'.
    this.flatMode = IS_AGREGORE;

    // @ts-expect-error - TS2339 - Property 'collLoader' does not exist on type 'BrowserRecorder'.
    this.collLoader = collLoader;
    this.setCollId(collId);

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'BrowserRecorder'.
    this.port = port;

    // this.recordStorage = true;
    //getLocalOption("recordStorage").then((res) => (this.recordStorage = !!res));

    // @ts-expect-error - TS2551 - Property '_onDetached' does not exist on type 'BrowserRecorder'. Did you mean '_doDetach'?
    this._onDetached = (tab, reason) => {
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
      if (tab && this.tabId !== tab.tabId) {
        return;
      }

      // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
      this.isAttached = false;

      if (reason === "target_closed") {
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
        this.tabId = 0;
      }

      this._stop();
    };

    // @ts-expect-error - TS2339 - Property '_onCanceled' does not exist on type 'BrowserRecorder'.
    this._onCanceled = (details) => {
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
      if (details && details.tabId == this.tabId) {
        this.detach();
      }
    };

    // @ts-expect-error - TS2339 - Property '_onEvent' does not exist on type 'BrowserRecorder'.
    this._onEvent = async (tab, message, params, sessionId) => {
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
      if (this.tabId === tab.tabId) {
        try {
          const sessions = sessionId ? [sessionId] : [];
          await this.processMessage(message, params, sessions);
        } catch (e) {
          console.warn(e);
          console.log(message);
          console.log(params);
        }
      }
    };
  }

  // @ts-expect-error - TS7006 - Parameter 'path' implicitly has an 'any' type.
  getExternalInjectURL(path) {
    return chrome.runtime.getURL(path);
  }

  // @ts-expect-error - TS7006 - Parameter 'collId' implicitly has an 'any' type.
  setCollId(collId) {
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
    if (collId !== this.collId || !this.db) {
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'.
      this.collId = collId;
      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      this.db = null;
      // @ts-expect-error - TS2339 - Property '_initDB' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'collLoader' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'.
      this._initDB = this.collLoader.loadColl(this.collId);
    }
  }

  _doDetach() {
    let numOtherRecorders = 0;
    for (const rec of Object.values(self.recorders)) {
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
      if (rec.tabId !== this.tabId && rec.running) {
        numOtherRecorders++;
      }
    }

    if (numOtherRecorders > 0) {
      console.log(
        `closing session, not detaching, ${numOtherRecorders} other recording tab(s) left`,
      );
      return this.sessionClose([]);
    } else {
      console.log("detaching debugger, already tabs stopped");
    }

    return new Promise((resolve) => {
      // @ts-expect-error - TS2339 - Property 'debuggee' does not exist on type 'BrowserRecorder'.
      chrome.debugger.detach(this.debuggee, () => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError.message);
        }
        // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
        this.isAttached = false;
        // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
        resolve();
      });
    });
  }

  _doStop() {
    //chrome.tabs.sendMessage(this.tabId, {"msg": "stopRecord"});

    // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
    if (!this.isAttached) {
      // @ts-expect-error - TS2551 - Property '_onDetached' does not exist on type 'BrowserRecorder'. Did you mean '_doDetach'?
      chrome.debugger.onDetach.removeListener(this._onDetached);
    }
    // @ts-expect-error - TS2339 - Property '_onEvent' does not exist on type 'BrowserRecorder'.
    chrome.debugger.onEvent.removeListener(this._onEvent);

    // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
    if (this.db) {
      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      this.db.close();
      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      this.db = null;
      // @ts-expect-error - TS2339 - Property '_initDB' does not exist on type 'BrowserRecorder'.
      this._initDB = null;
    }

    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
    if (!this.tabId) {
      return;
    }

    this.doUpdateStatus();
  }

  async _doAttach() {
    // @ts-expect-error - TS2339 - Property 'waitForTabUpdate' does not exist on type 'BrowserRecorder'.
    this.waitForTabUpdate = false;

    // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
    if (!this.isAttached) {
      // @ts-expect-error - TS2551 - Property '_onDetached' does not exist on type 'BrowserRecorder'. Did you mean '_doDetach'?
      chrome.debugger.onDetach.addListener(this._onDetached);
    }
    // @ts-expect-error - TS2339 - Property '_onEvent' does not exist on type 'BrowserRecorder'.
    chrome.debugger.onEvent.addListener(this._onEvent);

    // @ts-expect-error - TS2339 - Property '_initDB' does not exist on type 'BrowserRecorder'.
    const coll = await this._initDB;
    if (!coll) {
      throw new Error("Collection Not Found");
    }

    // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
    this.db = coll.store;

    try {
      // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
      if (!this.isAttached) {
        await new Promise((resolve, reject) => {
          // @ts-expect-error - TS2339 - Property 'debuggee' does not exist on type 'BrowserRecorder'.
          chrome.debugger.attach(this.debuggee, "1.3", () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
            }
            // @ts-expect-error - TS2339 - Property 'isAttached' does not exist on type 'BrowserRecorder'.
            this.isAttached = true;
            // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
            resolve();
          });
        });
      }

      await this.start();
      // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'BrowserRecorder'.
      this.failureMsg = null;

      // @ts-expect-error - TS2339 - Property 'openUrl' does not exist on type 'BrowserRecorder'.
      if (this.openUrl) {
        // @ts-expect-error - TS2345 - Argument of type '{ url: any; }' is not assignable to parameter of type 'null | undefined'.
        await this.send("Page.navigate", {
          // @ts-expect-error - TS2339 - Property 'openUrl' does not exist on type 'BrowserRecorder'.
          url: this.openUrl,
        });
      } else {
        // @ts-expect-error - TS2345 - Argument of type '{ ignoreCache: boolean; scriptToEvaluateOnLoad: string; }' is not assignable to parameter of type 'null | undefined'.
        await this.send("Page.reload", {
          ignoreCache: true,
          scriptToEvaluateOnLoad: this.getInjectScript(),
        });
      }

      this.doUpdateStatus();
    } catch (msg) {
      // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'BrowserRecorder'.
      this.failureMsg = chrome.runtime.lastError
        ? chrome.runtime.lastError.message
        : msg;
      this.doUpdateStatus();
      throw msg;
    }
  }

  doUpdateStatus() {
    let title, color, text;
    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
    const tabId = this.tabId;

    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'BrowserRecorder'.
    if (this.running) {
      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'BrowserRecorder'.
      if (this.behaviorState === BEHAVIOR_RUNNING) {
        title = "Archiving: Autopilot Running!";
        color = "#0096ff";
        text = " ";
        // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'BrowserRecorder'.
      } else if (this.numPending === 0) {
        title = "Archiving: No URLs pending, can continue";
        color = "#4d7c0f";
        text = "✓";
      } else {
        // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'BrowserRecorder'.
        title = `Archiving: ${this.numPending} URLs pending, please wait`;
        color = "#c5a802";
        // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'BrowserRecorder'.
        text = "" + this.numPending;
      }
      // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'BrowserRecorder'.
    } else if (this.failureMsg) {
      title = "Error: Can't Archive this page";
      text = "X";
      color = "#d30808";
    } else {
      title = "Not Archiving";
      text = "";
      color = "#4d7c0f";
    }

    chrome.action.setTitle({ title, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
    chrome.action.setBadgeText({ text, tabId });

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'BrowserRecorder'.
    if (this.port) {
      const status = this.getStatusMsg();
      // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'BrowserRecorder'.
      this.port.postMessage(status);
    }
  }

  getFavIcon() {
    return new Promise((resolve) => {
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'BrowserRecorder'.
      chrome.tabs.get(this.tabId, (tab) => {
        resolve(tab.favIconUrl);
      });
    });
  }

  // @ts-expect-error - TS7006 - Parameter 'data' implicitly has an 'any' type.
  async _doAddResource(data) {
    //console.log(`Commit ${url} @ ${ts}, cookie: ${cookie}, sw: ${reqresp.fromServiceWorker}`);
    let writtenSize = 0;
    const payloadSize = data.payload.length;

    try {
      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      await this.db.initing;

      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      if (await this.db.addResource(data)) {
        writtenSize = payloadSize;
      }
    } catch (e) {
      console.warn(`Commit error for ${data.url} @ ${data.ts} ${data.mime}`);
      console.warn(e);
      return;
    }

    // TODO: more accurate size calc?
    //const headerSize = 0;//JSON.stringify(data.respHeaders).length + JSON.stringify(data.reqHeaders).length;

    // increment size counter only if committed
    //incrArchiveSize('dedup', writtenSize);
    //incrArchiveSize('total', payloadSize);
    // this.collLoader.updateSize(this.collId, payloadSize, writtenSize);

    // increment page size
    // await this._doAddPage(this.pageInfo);

    return writtenSize;
  }

  // @ts-expect-error - TS7006 - Parameter 'pageInfo' implicitly has an 'any' type.
  _doAddPage(pageInfo) {
    if (!pageInfo.url) {
      console.warn("Empty Page, Skipping");
      return;
    }
    // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
    if (this.db) {
      // @ts-expect-error - TS2339 - Property 'db' does not exist on type 'BrowserRecorder'.
      const result = this.db.addPage(pageInfo);

      chrome.runtime.sendMessage({ type: "pageAdded" });
      return result;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'totalSize' implicitly has an 'any' type. | TS7006 - Parameter 'writtenSize' implicitly has an 'any' type.
  _doIncSizes(totalSize, writtenSize) {
    // @ts-expect-error - TS2339 - Property 'collLoader' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'.
    this.collLoader.updateSize(this.collId, totalSize, writtenSize);
  }

  // @ts-expect-error - TS7006 - Parameter 'method' implicitly has an 'any' type. | TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'promise' implicitly has an 'any' type.
  _doSendCommand(method, params, promise) {
    // @ts-expect-error - TS7034 - Variable 'prr' implicitly has type 'any' in some locations where its type cannot be determined.
    let prr;
    const p = new Promise((resolve, reject) => {
      prr = { resolve, reject, method };
    });

    if (!promise) {
      promise = p;
    }

    // @ts-expect-error - TS7006 - Parameter 'res' implicitly has an 'any' type.
    const callback = (res) => {
      if (res) {
        // @ts-expect-error - TS7005 - Variable 'prr' implicitly has an 'any' type.
        prr.resolve(res);
      } else {
        // @ts-expect-error - TS7005 - Variable 'prr' implicitly has an 'any' type.
        prr.reject(
          chrome.runtime.lastError ? chrome.runtime.lastError.message : "",
        );
      }
    };

    if (DEBUG) {
      console.log("SEND " + JSON.stringify({ command: method, params }));
    }

    // @ts-expect-error - TS2339 - Property 'debuggee' does not exist on type 'BrowserRecorder'.
    chrome.debugger.sendCommand(this.debuggee, method, params, callback);
    return promise;
  }

  // @ts-expect-error - TS7006 - Parameter 'method' implicitly has an 'any' type. | TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessionId' implicitly has an 'any' type.
  _doSendCommandFlat(method, params, sessionId) {
    if (DEBUG) {
      console.log("SEND " + JSON.stringify({ command: method, params }));
    }

    try {
      return chrome.debugger.sendCommand(
        // @ts-expect-error - TS2339 - Property 'debuggee' does not exist on type 'BrowserRecorder'.
        this.debuggee,
        method,
        params,
        sessionId,
      );
    } catch (e) {
      console.warn(e);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  handleWindowOpen(url, sessions) {
    super.handleWindowOpen(url, sessions);
    // @ts-expect-error - TS2339 - Property 'openWinMap' does not exist on type 'BrowserRecorder'. | TS2339 - Property 'collId' does not exist on type 'BrowserRecorder'.
    this.openWinMap.set(url, this.collId);
  }
}

export { BrowserRecorder };
```


## src\sw\api.ts

```ts
import { API, type SWCollections, tsToDate } from "@webrecorder/wabac/swlib";

import { Downloader, type Metadata } from "./downloader";
import { Signer } from "./keystore";
import { ipfsAdd, ipfsRemove, setAutoIPFSUrl } from "./ipfsutils";
import { RecProxy } from "./recproxy";
import { type Collection } from "@webrecorder/wabac/swlib";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteMatch = Record<string, any>;

declare let self: ServiceWorkerGlobalScope;

const DEFAULT_SOFTWARE_STRING = `Webrecorder ArchiveWeb.page ${__AWP_VERSION__}, using warcio.js ${__WARCIO_VERSION__}`;

// ===========================================================================
class ExtAPI extends API {
  softwareString = "";
  uploading: Map<string, CountingStream> = new Map<string, CountingStream>();

  constructor(
    collections: SWCollections,
    { softwareString = "", replaceSoftwareString = false } = {},
  ) {
    super(collections);
    this.softwareString = replaceSoftwareString
      ? softwareString
      : softwareString + DEFAULT_SOFTWARE_STRING;
  }

  override get routes(): Record<string, string | [string, string]> {
    return {
      ...super.routes,
      downloadPages: "c/:coll/dl",
      upload: ["c/:coll/upload", "POST"],
      uploadStatus: "c/:coll/upload",
      uploadDelete: ["c/:coll/upload", "DELETE"],
      recPending: "c/:coll/recPending",
      pageTitle: ["c/:coll/pageTitle", "POST"],
      ipfsAdd: ["c/:coll/ipfs", "POST"],
      ipfsRemove: ["c/:coll/ipfs", "DELETE"],
      ipfsDaemonUrl: ["ipfs/daemonUrl", "POST"],
      publicKey: "publicKey",
    };
  }

  downloaderOpts() {
    const softwareString = this.softwareString;

    const signer = new Signer(softwareString, { cacheSig: true });

    return { softwareString, signer };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async handleApi(request: Request, params: any, event: FetchEvent) {
    switch (params._route) {
      case "downloadPages":
        return await this.handleDownload(params);

      case "upload":
        return await this.handleUpload(params, request, event);

      case "uploadStatus":
        return await this.getUploadStatus(params);

      case "uploadDelete":
        return await this.deleteUpload(params);

      case "recPending":
        return await this.recordingPending(params);

      case "pageTitle":
        return await this.updatePageTitle(params.coll, request);

      case "publicKey":
        return await this.getPublicKey();

      case "ipfsAdd":
        //return await this.startIpfsAdd(event, request, params.coll);
        return {};

      case "ipfsRemove":
        //return await this.ipfsRemove(request, params.coll);
        return {};

      case "ipfsDaemonUrl":
        return await this.setIPFSDaemonUrlFromBody(request);

      default:
        return await super.handleApi(request, params, event);
    }
  }

  async handleDownload(params: RouteMatch) {
    const { dl, error } = await this.getDownloader(params);
    if (error) {
      return error;
    }
    return dl.download();
  }

  async getDownloader(params: RouteMatch) {
    const coll = await this.collections.loadColl(params.coll);
    if (!coll) {
      return { error: { error: "collection_not_found" } };
    }

    const pageQ = params["_query"].get("pages");
    const pageList = pageQ === "all" ? null : pageQ.split(",");

    const format = params["_query"].get("format") || "wacz";
    const filename = params["_query"].get("filename");

    return {
      dl: new Downloader({
        ...this.downloaderOpts(),
        coll,
        format,
        filename,
        pageList,
      }),
    };
  }

  async handleUpload(params: RouteMatch, request: Request, event: FetchEvent) {
    const uploading = this.uploading;

    const prevUpload = uploading.get(params.coll);

    const { url, headers, abortUpload } = await request.json();

    if (prevUpload && prevUpload.status === "uploading") {
      if (abortUpload && prevUpload.abort) {
        prevUpload.abort();
        return { aborted: true };
      }
      return { error: "already_uploading" };
    } else if (abortUpload) {
      return { error: "not_uploading" };
    }

    const { dl, error } = await this.getDownloader(params);
    if (error) {
      return error;
    }
    const dlResp = await dl.download();
    if (!(dlResp instanceof Response)) {
      return dlResp;
    }
    const filename = dlResp.filename || "";

    const abort = new AbortController();
    const signal = abort.signal;

    const counter = new CountingStream(dl.metadata.size, abort);

    const body = dlResp.body!.pipeThrough(counter.transformStream());

    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set("filename", filename || "");
      urlObj.searchParams.set("name", dl.metadata["title"] || filename || "");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const fetchPromise = fetch(urlObj.href, {
        method: "PUT",
        headers,
        duplex: "half",
        body,
        signal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      uploading.set(params.coll, counter);
      if (event.waitUntil) {
        event.waitUntil(
          this.uploadFinished(
            fetchPromise,
            params.coll,
            dl.metadata,
            filename,
            counter,
          ),
        );
      }
      return { uploading: true };
    } catch (e: unknown) {
      uploading.delete(params.coll);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { error: "upload_failed", details: (e as any).toString() };
    }
  }

  async uploadFinished(
    fetchPromise: Promise<Response>,
    collId: string,
    metadata: Metadata,
    filename: string,
    counter: CountingStream,
  ) {
    try {
      const resp = await fetchPromise;
      const json = await resp.json();

      console.log(`Upload finished for ${filename} ${collId}`);

      metadata.uploadTime = new Date().getTime();
      metadata.uploadId = json.id;
      if (!metadata.mtime) {
        metadata.mtime = metadata.uploadTime;
      }
      if (!metadata.ctime) {
        metadata.ctime = metadata.uploadTime;
      }
      await this.collections.updateMetadata(
        collId,
        metadata as Record<string, string>,
      );
      counter.status = "done";
    } catch (e) {
      console.log(`Upload failed for ${filename} ${collId}`);
      console.log(e);
      counter.status = counter.aborted ? "aborted" : "failed";
    }
  }

  async deleteUpload(params: RouteMatch) {
    const collId = params.coll;

    this.uploading.delete(collId);

    const coll = await this.collections.loadColl(collId);

    if (coll?.metadata) {
      coll.metadata.uploadTime = null;
      coll.metadata.uploadId = null;
      await this.collections.updateMetadata(collId, coll.metadata);
      return { deleted: true };
    }

    return { deleted: false };
  }

  async getUploadStatus(params: RouteMatch) {
    let result: Metadata = {};
    const counter = this.uploading.get(params.coll);

    if (!counter) {
      result = { status: "idle" };
    } else {
      const { size, totalSize, status } = counter;
      result = { status, size, totalSize };

      if (status !== "uploading") {
        this.uploading.delete(params.coll);
      }
    }

    const coll = await this.collections.loadColl(params.coll);

    if (coll?.metadata) {
      result.uploadTime = coll.metadata.uploadTime;
      result.uploadId = coll.metadata.uploadId;
      result.ctime = coll.metadata.ctime;
      result.mtime = coll.metadata.mtime;
    }

    return result;
  }

  async recordingPending(params: RouteMatch) {
    const coll = await this.collections.loadColl(params.coll);
    if (!coll) {
      return { error: "collection_not_found" };
    }

    if (!(coll.store instanceof RecProxy)) {
      return { error: "invalid_collection" };
    }

    const numPending = await coll.store.getCounter();

    return { numPending };
  }

  async prepareColl(collId: string, request: Request) {
    const coll = await this.collections.loadColl(collId);
    if (!coll) {
      return { error: "collection_not_found" };
    }

    const body = await this.setIPFSDaemonUrlFromBody(request);

    return { coll, body };
  }

  async setIPFSDaemonUrlFromBody(request: Request) {
    let body;

    try {
      body = await request.json();
      if (body.ipfsDaemonUrl) {
        setAutoIPFSUrl(body.ipfsDaemonUrl);
      }
    } catch (_e: unknown) {
      body = {};
    }

    return body;
  }

  async startIpfsAdd(event: FetchEvent, request: Request, collId: string) {
    const { coll, body } = await this.prepareColl(collId, request);

    const client = await self.clients.get(event.clientId);

    const p = runIPFSAdd(
      collId,
      coll,
      client,
      this.downloaderOpts(),
      this.collections,
      body,
    );

    if (event.waitUntil) {
      event.waitUntil(p);
    }

    try {
      await p;
    } catch (_e) {
      return { error: "ipfs_not_available" };
    }

    return { collId };
  }

  async ipfsRemove(request: Request, collId: string) {
    const { coll } = await this.prepareColl(collId, request);

    if (await ipfsRemove(coll)) {
      await this.collections.updateMetadata(coll.name, coll.config.metadata);
      return { removed: true };
    }

    return { removed: false };
  }

  async updatePageTitle(collId: string, request: Request) {
    const json = await request.json();
    const { url, title } = json;
    let { ts } = json;

    ts = tsToDate(ts).getTime();

    const coll = await this.collections.loadColl(collId);
    if (!coll) {
      return { error: "collection_not_found" };
    }

    //await coll.store.db.init();

    const result = await coll.store.lookupUrl(url, ts);

    if (!result) {
      return { error: "page_not_found" };
    }

    // drop to second precision for comparison
    const roundedTs = Math.floor(result.ts / 1000) * 1000;
    if (url !== result.url || ts !== roundedTs) {
      return { error: "no_exact_match" };
    }

    const page = await coll.store.db.getFromIndex("pages", "url", url);
    if (!page) {
      return { error: "page_not_found" };
    }
    page.title = title;
    await coll.store.db.put("pages", page);

    return { added: true };
  }

  async getPublicKey() {
    const { signer } = this.downloaderOpts();
    const keys = await signer.loadKeys();
    if (!keys?.public) {
      return {};
    } else {
      return { publicKey: keys.public };
    }
  }
}

// ===========================================================================
async function runIPFSAdd(
  collId: string,
  coll: Collection,
  client: Client | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any,
  collections: SWCollections,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replayOpts: any,
) {
  let size = 0;
  let totalSize = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = (type: string, result: any = null) => {
    if (client) {
      client.postMessage({
        type,
        collId,
        size,
        result,
        totalSize,
      });
    }
  };

  const { url, cid } = await ipfsAdd(
    coll,
    opts,
    replayOpts,
    (incSize: number, _totalSize: number) => {
      size += incSize;
      totalSize = _totalSize;
      sendMessage("ipfsProgress");
    },
  );

  const result = { cid, ipfsURL: url };

  sendMessage("ipfsAdd", result);

  if (coll.config.metadata) {
    await collections.updateMetadata(coll.name, coll.config.metadata);
  }
}

// ===========================================================================
class CountingStream {
  totalSize: number;
  status: string;
  size = 0;
  _abort?: AbortController;
  aborted: boolean;

  constructor(totalSize?: number, abort?: AbortController) {
    this.totalSize = totalSize || 0;
    this.status = "uploading";
    this.size = 0;
    this._abort = abort;
    this.aborted = false;
  }

  abort() {
    if (this._abort) {
      this._abort.abort();
      this.aborted = true;
    }
  }

  transformStream() {
    const counterStream = this;

    return new TransformStream({
      start() {
        counterStream.size = 0;
      },

      transform(chunk, controller) {
        counterStream.size += chunk.length;
        //console.log(`Uploaded: ${counterStream.size}`);
        controller.enqueue(chunk);
      },
    });
  }
}

export { ExtAPI };
```


## src\sw\downloader.ts

```ts
import { makeZip } from "client-zip";

import { Deflate } from "pako";

import { v5 as uuidv5 } from "uuid";

import { createSHA256 } from "hash-wasm";
import { type IHasher } from "hash-wasm/dist/lib/WASMInterface.js";

import { getSurt, WARCRecord, WARCSerializer } from "warcio";

import {
  getTSMillis,
  getStatusText,
  digestMessage,
  type Collection,
  type ArchiveDB,
  type ResourceEntry,
} from "@webrecorder/wabac/swlib";
import { type DataSignature, type Signer } from "./keystore";
import { type ExtPageEntry } from "./recproxy";

export type SizeCallback = (size: number) => void;

export type ResponseWithFilename = Response & {
  filename?: string;
};

type ClientZipEntry = {
  name: string;
  lastModified: Date;
  input: AsyncGenerator<Uint8Array>;
};

type FileStats = {
  filename: string;
  size: number;
  hash?: string;
};

export type DownloaderOpts = {
  coll: Collection;
  format: string;
  filename?: string;
  pageList?: string[];
  signer?: Signer;
  softwareString?: string;
  gzip?: boolean;
  uuidNamespace?: string;
  markers?: Markers;
};

export type Markers = {
  ZIP?: Uint8Array;
  WARC_PAYLOAD?: Uint8Array;
  WARC_GROUP?: Uint8Array;
};

type DLResourceEntry = ResourceEntry & {
  offset?: number;
  length?: number;
  timestamp?: string;
  skipped?: boolean;
  text?: string;

  pageId: string;
  digest: string;
};

type CDXJEntry = {
  url: string;
  digest: string;
  mime: string;
  offset: number;
  length: number;
  recordDigest: string;
  status: number;

  method?: string;
  filename?: string;
  requestBody?: string;
};

type DLPageData = {
  title: string;
  url: string;
  id: string;
  size: number;
  ts: string;

  favIconUrl?: string;
  text?: string;
};

type Gen =
  | AsyncGenerator<Uint8Array>
  | AsyncGenerator<string>
  | Generator<Uint8Array>
  | Generator<string>;

type WARCVersion = "WARC/1.0" | "WARC/1.1";

type DigestCache = {
  url: string;
  date: string;
  payloadDigest?: string;
};

type DataPackageJSON = {
  profile: string;
  resources: {
    name: string;
    path: string;
    hash: string;
    bytes: number;
  }[];

  wacz_version: string;
  software: string;
  created: string;

  title?: string;
  description?: string;
  modified?: string;
};

export type Metadata = {
  uploadId?: string;
  uploadTime?: number;
  ctime?: number;
  mtime?: number;
  size?: number;
  title?: string;
  desc?: string;
  status?: string;
  totalSize?: number;
};

// ===========================================================================
const WACZ_VERSION = "1.1.1";

const SPLIT_REQUEST_Q_RX = /(.*?)[?&](?:__wb_method=|__wb_post=)[^&]+&(.*)/;

const LINES_PER_BLOCK = 1024;
const RESOURCE_BATCH_SIZE = LINES_PER_BLOCK * 8;

const DEFAULT_UUID_NAMESPACE = "f9ec3936-7f66-4461-bec4-34f4495ea242";

const DATAPACKAGE_FILENAME = "datapackage.json";
const DIGEST_FILENAME = "datapackage-digest.json";

const encoder = new TextEncoder();

const EMPTY = new Uint8Array([]);

async function* getPayload(payload: Uint8Array) {
  yield payload;
}

async function* hashingGen(
  gen: Gen,
  stats: FileStats,
  hasher: IHasher,
  sizeCallback: SizeCallback | null,
  zipMarker?: Uint8Array,
) {
  stats.size = 0;

  hasher.init();

  if (zipMarker) {
    yield zipMarker;
  }

  for await (let chunk of gen) {
    if (typeof chunk === "string") {
      chunk = encoder.encode(chunk);
    }

    yield chunk;
    stats.size += chunk.byteLength;
    if (sizeCallback) {
      sizeCallback(chunk.byteLength);
    }
    hasher.update(chunk);
  }

  if (zipMarker) {
    yield zipMarker;
  }

  stats.hash = hasher.digest("hex");
}

// ===========================================================================
class Downloader {
  db: ArchiveDB;
  pageList: string[] | null;
  collId: string;
  metadata: Metadata;
  gzip: boolean;

  markers: Markers;
  warcName: string;
  alreadyDecoded: boolean;

  softwareString: string;
  uuidNamespace: string;

  createdDateDt: Date;
  createdDate: string;
  modifiedDate: string | null;

  format: string;
  warcVersion: WARCVersion;

  digestOpts: {
    algo: string;
    prefix: string;
    base32?: boolean;
  };

  filename: string;

  signer: Signer | null;

  offset = 0;
  firstResources: ResourceEntry[] = [];
  textResources: DLResourceEntry[] = [];
  cdxjLines: string[] = [];

  // compressed index (idx) entries
  indexLines: string[] = [];

  digestsVisted: Record<string, DigestCache> = {};
  fileHasher: IHasher | null = null;
  recordHasher: IHasher | null = null;

  datapackageDigest = "";

  fileStats: FileStats[] = [];
  hashType = "";

  lastUrl?: string;
  lastPageId?: string;

  constructor({
    coll,
    format = "wacz",
    filename,
    pageList,
    signer,
    softwareString,
    gzip = true,
    uuidNamespace,
    markers,
  }: DownloaderOpts) {
    this.db = coll.store;
    this.pageList = pageList || null;
    this.collId = coll.name;
    this.metadata = coll.config.metadata || {};
    this.gzip = gzip;

    this.markers = markers || {};

    this.warcName = this.gzip ? "data.warc.gz" : "data.warc";

    this.alreadyDecoded = !coll.config["decode"] && !coll.config["loadUrl"];

    this.softwareString = softwareString || "ArchiveWeb.page";

    this.uuidNamespace = uuidNamespace || DEFAULT_UUID_NAMESPACE;

    this.createdDateDt = new Date(coll.config.ctime!);
    this.createdDate = this.createdDateDt.toISOString();
    this.modifiedDate = coll.config.metadata!.mtime
      ? new Date(coll.config.metadata!.mtime).toISOString()
      : null;

    this.format = format;
    this.warcVersion = format === "warc1.0" ? "WARC/1.0" : "WARC/1.1";

    if (format === "warc1.0") {
      this.digestOpts = { algo: "sha-1", prefix: "sha1:", base32: true };
    } else {
      this.digestOpts = { algo: "sha-256", prefix: "sha256:" };
    }

    // determine filename from title, if it exists
    if (!filename && coll.config.metadata!.title) {
      filename = encodeURIComponent(
        coll.config.metadata!.title.toLowerCase().replace(/\s/g, "-"),
      );
    }

    if (!filename) {
      filename = "webarchive";
    }
    this.filename = filename;

    this.signer = signer || null;
  }

  async download(sizeCallback: SizeCallback | null = null) {
    switch (this.format) {
      case "wacz":
        return this.downloadWACZ(this.filename, sizeCallback);

      case "warc":
      case "warc1.0":
        return this.downloadWARC(this.filename, sizeCallback);

      default:
        return { error: "invalid 'format': must be wacz or warc" };
    }
  }

  downloadWARC(filename: string, sizeCallback: SizeCallback | null = null) {
    filename = (filename || "webarchive").split(".")[0] + ".warc";

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const dl = this;

    const rs = new ReadableStream({
      async start(controller) {
        await dl.queueWARC(controller, filename, sizeCallback);
      },
    });

    const headers = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/octet-stream",
    };

    const resp: ResponseWithFilename = new Response(rs, { headers });
    resp.filename = filename;
    return resp;
  }

  async loadResourcesBlock(
    start: [string, number] | [] = [],
  ): Promise<ResourceEntry[]> {
    return await this.db.db!.getAll(
      "resources",
      IDBKeyRange.lowerBound(start, true),
      RESOURCE_BATCH_SIZE,
    );
  }

  async *iterResources(resources: ResourceEntry[]) {
    let start: [string, number] | [] = [];
    //let count = 0;

    while (resources.length) {
      const last: ResourceEntry = resources[resources.length - 1]!;

      if (this.pageList) {
        resources = resources.filter((res) =>
          this.pageList!.includes(res.pageId || ""),
        );
      }
      //count += resources.length;
      yield* resources;

      start = [last.url, last.ts];
      resources = await this.loadResourcesBlock(start);
    }
    // if (count !== this.numResources) {
    //   console.warn(`Iterated ${count}, but expected ${this.numResources}`);
    // }
  }

  async queueWARC(
    controller: ReadableStreamDefaultController,
    filename: string,
    sizeCallback: SizeCallback | null,
  ) {
    this.firstResources = await this.loadResourcesBlock();

    for await (const chunk of this.generateWARC(filename)) {
      controller.enqueue(chunk);
      if (sizeCallback) {
        sizeCallback(chunk.length);
      }
    }

    for await (const chunk of this.generateTextWARC(filename)) {
      controller.enqueue(chunk);
      if (sizeCallback) {
        sizeCallback(chunk.length);
      }
    }

    controller.close();
  }

  addFile(
    zip: ClientZipEntry[],
    filename: string,
    generator: Gen,
    sizeCallback: SizeCallback | null,
  ) {
    const stats: FileStats = { filename, size: 0 };

    if (filename !== DATAPACKAGE_FILENAME && filename !== DIGEST_FILENAME) {
      this.fileStats.push(stats);
    }

    zip.push({
      name: filename,
      lastModified: this.createdDateDt,
      input: hashingGen(
        generator,
        stats,
        this.fileHasher!,
        sizeCallback,
        this.markers.ZIP,
      ),
    });
  }

  recordDigest(data: Uint8Array | string) {
    this.recordHasher!.init();
    this.recordHasher!.update(data);
    return this.hashType + ":" + this.recordHasher!.digest("hex");
  }

  getWARCRecordUUID(name: string) {
    return `<urn:uuid:${uuidv5(name, this.uuidNamespace)}>`;
  }

  async downloadWACZ(filename: string, sizeCallback: SizeCallback | null) {
    filename = (filename || "webarchive").split(".")[0] + ".wacz";

    this.fileHasher = await createSHA256();
    this.recordHasher = await createSHA256();
    this.hashType = "sha256";

    const zip: ClientZipEntry[] = [];

    this.firstResources = await this.loadResourcesBlock();

    this.addFile(zip, "pages/pages.jsonl", this.generatePages(), sizeCallback);
    this.addFile(
      zip,
      `archive/${this.warcName}`,
      this.generateWARC(filename + `#/archive/${this.warcName}`, true),
      sizeCallback,
    );
    //this.addFile(zip, "archive/text.warc", this.generateTextWARC(filename + "#/archive/text.warc"), false);

    // don't use compressed index if we'll have a single block, need to have at least enough for 2 blocks
    if (this.firstResources.length < 2 * LINES_PER_BLOCK) {
      this.addFile(zip, "indexes/index.cdx", this.generateCDX(), sizeCallback);
    } else {
      this.addFile(
        zip,
        "indexes/index.cdx.gz",
        this.generateCompressedCDX("index.cdx.gz"),
        sizeCallback,
      );
      this.addFile(zip, "indexes/index.idx", this.generateIDX(), sizeCallback);
    }

    this.addFile(
      zip,
      DATAPACKAGE_FILENAME,
      this.generateDataPackage(),
      sizeCallback,
    );

    this.addFile(
      zip,
      DIGEST_FILENAME,
      this.generateDataManifest(),
      sizeCallback,
    );

    const headers = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/zip",
    };

    const rs = makeZip(zip);
    const response: ResponseWithFilename = new Response(rs, { headers });
    response.filename = filename;
    return response;
  }

  async *generateWARC(
    filename: string,
    digestRecordAndCDX = false,
  ): AsyncGenerator<Uint8Array> {
    try {
      let offset = 0;

      // if filename provided, add warcinfo
      if (filename) {
        const warcinfo = await this.createWARCInfo(filename);
        yield warcinfo;
        offset += warcinfo.length;
      }

      if (this.markers.WARC_GROUP) {
        yield this.markers.WARC_GROUP;
      }

      for await (const res of this.iterResources(this.firstResources)) {
        const resource: DLResourceEntry = res as DLResourceEntry;
        resource.offset = offset;
        const records = await this.createWARCRecord(resource);
        if (!records) {
          resource.skipped = true;
          continue;
        }

        // response record
        const responseData: { length: number; digest?: string } = { length: 0 };
        yield* this.emitRecord(records[0]!, digestRecordAndCDX, responseData);
        offset += responseData.length;
        resource.length = responseData.length;
        if (digestRecordAndCDX && !resource.recordDigest) {
          //resource.recordDigest = this.recordDigest(records[0]);
          resource.recordDigest = responseData.digest;
        }

        // request record, if any
        if (records.length > 1) {
          const requestData = { length: 0 };
          yield* this.emitRecord(records[1]!, false, requestData);
          offset += requestData.length;
        }

        if (digestRecordAndCDX) {
          this.cdxjLines.push(this.getCDXJ(resource, this.warcName));
        }

        if (this.markers.WARC_GROUP) {
          yield this.markers.WARC_GROUP;
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async *emitRecord(
    record: WARCRecord,
    doDigest: boolean,
    output: { length: number; digest?: string },
  ) {
    const opts = { gzip: this.gzip, digest: this.digestOpts };
    const s = new WARCSerializer(record, opts);

    const chunks = [];
    if (doDigest) {
      this.recordHasher!.init();
    }

    for await (const chunk of s) {
      if (doDigest) {
        this.recordHasher!.update(chunk as Uint8Array);
      }
      chunks.push(chunk);
      output.length += chunk.length;
    }

    if (doDigest) {
      output.digest = this.hashType + ":" + this.recordHasher!.digest("hex");
    }

    if (
      !this.gzip &&
      this.markers.WARC_PAYLOAD &&
      record.warcType !== "request" &&
      (chunks.length === 5 || chunks.length === 4)
    ) {
      if (chunks.length === 5) {
        yield chunks[0];
        yield chunks[1];
        yield chunks[2];
        yield this.markers.WARC_PAYLOAD;
        if (chunks[3].length) {
          yield chunks[3];
          yield this.markers.WARC_PAYLOAD;
        }
        yield chunks[4];
      } else {
        yield chunks[0];
        yield chunks[1];
        yield this.markers.WARC_PAYLOAD;
        if (chunks[2].length) {
          yield chunks[2];
          yield this.markers.WARC_PAYLOAD;
        }
        yield chunks[3];
      }
    } else {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  }

  async *generateTextWARC(filename: string) {
    try {
      let offset = 0;

      // if filename provided, add warcinfo
      if (filename) {
        const warcinfo = await this.createWARCInfo(filename);
        yield warcinfo;
        offset += warcinfo.length;
      }

      for (const resource of this.textResources) {
        resource.offset = offset;
        const chunk = await this.createTextWARCRecord(resource);
        yield chunk;
        offset += chunk.length;
        resource.length = chunk.length;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  getCDXJ(resource: DLResourceEntry, filename: string): string {
    const data: CDXJEntry = {
      url: resource.url,
      digest: resource.digest,
      mime: resource.mime!,
      offset: resource.offset!,
      length: resource.length!,
      recordDigest: resource.recordDigest!,
      status: resource.status!,
    };

    if (filename) {
      data.filename = filename;
    }

    if (resource.method && resource.method !== "GET") {
      const m = resource.url.match(SPLIT_REQUEST_Q_RX);
      if (m) {
        data.url = m[1]!;
        // resource.requestBody is the raw payload, use the converted one from the url for the cdx
        data.requestBody = m[2];
      }
      data.method = resource.method;
    }

    return `${getSurt(resource.url)} ${resource.timestamp} ${JSON.stringify(
      data,
    )}\n`;
  }

  *generateCDX() {
    this.cdxjLines.sort();

    yield* this.cdxjLines;
  }

  *generateCompressedCDX(filename: string) {
    let offset = 0;

    let chunkDeflater: Deflate | null = null;
    let count = 0;
    let key = "";

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const dl = this;

    const finishChunk = () => {
      const data = chunkDeflater!.result as Uint8Array;
      const length = data.length;
      const digest = dl.recordDigest(data);

      const idx =
        key + " " + JSON.stringify({ offset, length, digest, filename });

      dl.indexLines.push(idx);

      offset += length;

      chunkDeflater = null;
      count = 0;
      key = "";

      return data;
    };

    for (const cdx of this.generateCDX()) {
      if (!chunkDeflater) {
        chunkDeflater = new Deflate({ gzip: true });
      }

      if (!key) {
        key = cdx.split(" {", 1)[0] || "";
      }

      if (++count === LINES_PER_BLOCK) {
        chunkDeflater.push(cdx, true);
        yield finishChunk();
      } else {
        chunkDeflater.push(cdx);
      }
    }

    if (chunkDeflater) {
      chunkDeflater.push(EMPTY, true);
      yield finishChunk();
    }
  }

  async *generateDataManifest() {
    const hash = this.datapackageDigest;

    const path = DATAPACKAGE_FILENAME;

    const data: { path: string; hash: string; signedData?: DataSignature } = {
      path,
      hash,
    };

    if (this.signer) {
      try {
        data.signedData = await this.signer.sign(hash, this.createdDate);

        this.signer.close();
        this.signer = null;
      } catch (e) {
        // failed to sign
        console.log(e);
      }
    }

    const res = JSON.stringify(data, null, 2);

    yield res;
  }

  async *generateDataPackage() {
    const root: DataPackageJSON = {
      profile: "data-package",

      resources: this.fileStats.map((stats) => {
        const path = stats.filename;
        return {
          name: path.slice(path.lastIndexOf("/") + 1),
          path,
          hash: this.hashType + ":" + stats.hash,
          bytes: stats.size,
        };
      }),

      wacz_version: WACZ_VERSION,
      software: this.softwareString,
      created: this.createdDate,
    };

    if (this.metadata.title) {
      root.title = this.metadata.title;
    }
    if (this.metadata.desc) {
      root.description = this.metadata.desc;
    }

    if (this.modifiedDate) {
      root.modified = this.modifiedDate;
    }

    const datapackageText = JSON.stringify(root, null, 2);
    this.datapackageDigest = this.recordDigest(datapackageText);
    yield datapackageText;
  }

  async *generatePages() {
    const pageIter: ExtPageEntry[] = (
      this.pageList
        ? await this.db.getPages(this.pageList)
        : await this.db.getAllPages()
    ) as ExtPageEntry[];

    yield JSON.stringify({
      format: "json-pages-1.0",
      id: "pages",
      title: "All Pages",
      hasText: true,
    });

    for (const page of pageIter) {
      const ts = new Date(page.ts).toISOString();

      const pageData: DLPageData = {
        title: page.title,
        url: page.url,
        id: page.id,
        size: page.size,
        ts,
      };

      if (page.favIconUrl) {
        pageData.favIconUrl = page.favIconUrl;
      }
      if (page.text) {
        pageData.text = page.text;
      }

      yield "\n" + JSON.stringify(pageData);

      if (page.text) {
        this.textResources.push({
          url: page.url,
          ts: page.ts,
          text: page.text,
          pageId: page.id,
          digest: "",
        });
      }
    }
  }

  /*
  async getLists() {
    try {
      const lists = await this.db.getAllCuratedByList();
      console.log(lists);
      return yaml.safeDump(lists, {skipInvalid: true});
    } catch (e) {
      console.log(e);
    }
  }
*/
  async *generateIDX() {
    yield this.indexLines.join("\n");
  }

  async createWARCInfo(filename: string) {
    const warcVersion = this.warcVersion;
    const type = "warcinfo";

    const info = {
      software: this.softwareString,
      format:
        warcVersion === "WARC/1.0"
          ? "WARC File Format 1.0"
          : "WARC File Format 1.1",
      isPartOf: this.metadata["title"] || this.collId,
    };

    //info["json-metadata"] = JSON.stringify(metadata);

    const warcHeaders = {
      "WARC-Record-ID": this.getWARCRecordUUID(JSON.stringify(info)),
    };

    const date = this.createdDate;

    const record = WARCRecord.createWARCInfo(
      { filename, type, date, warcHeaders, warcVersion },
      info,
    );
    const buffer = await WARCSerializer.serialize(record, {
      gzip: this.gzip,
      digest: this.digestOpts,
    });
    return buffer;
  }

  fixupHttpHeaders(headersMap: Record<string, string>, length: number) {
    // how many headers are we parsing here
    const numHeaders = this.alreadyDecoded ? 3 : 1;

    let count = 0;
    for (const [name] of Object.entries(headersMap)) {
      const lowerName = name.toLowerCase();
      switch (lowerName) {
        case "content-encoding":
        case "transfer-encoding":
          if (this.alreadyDecoded) {
            headersMap["x-orig-" + name] = headersMap[name]!;
            delete headersMap[name];
            ++count;
          }
          break;

        case "content-length":
          headersMap[name] = "" + length;
          ++count;
          break;
      }
      if (count === numHeaders) {
        break;
      }
    }
  }

  async createWARCRecord(resource: DLResourceEntry) {
    let url = resource.url;
    const date = new Date(resource.ts).toISOString();
    resource.timestamp = getTSMillis(date);
    const httpHeaders = resource.respHeaders || {};
    const warcVersion = this.warcVersion;

    const pageId = resource.pageId;

    let payload: Uint8Array | null | undefined = resource.payload;
    let type: "response" | "request" | "resource" | "revisit";

    let refersToUrl, refersToDate;
    let refersToDigest;
    let storeDigest: DigestCache | null = null;

    let method = "GET";
    let requestBody;

    // non-GET request/response:
    // if original request body + original requestURL is preserved, write that with original method
    // otherwise, just serialize the converted-to-GET form
    if (
      resource.method &&
      resource.method !== "GET" &&
      resource.requestBody &&
      resource.requestUrl
    ) {
      // ensure payload is an arraybuffer
      requestBody =
        typeof resource.requestBody === "string"
          ? encoder.encode(resource.requestBody)
          : resource.requestBody;
      method = resource.method;
      url = resource.requestUrl;
    } else {
      requestBody = new Uint8Array([]);
    }

    if (!resource.digest && resource.payload) {
      resource.digest = await digestMessage(resource.payload, "sha-256");
    }

    const digestOriginal = this.digestsVisted[resource.digest];

    if (resource.digest && digestOriginal) {
      // if exact resource in a row, and same page, then just skip instead of writing revisit
      if (
        url === this.lastUrl &&
        method === "GET" &&
        pageId === this.lastPageId
      ) {
        //console.log("Skip Dupe: " + url);
        return null;
      }

      type = "revisit";
      resource.mime = "warc/revisit";
      payload = EMPTY;

      refersToUrl = digestOriginal.url;
      refersToDate = digestOriginal.date;
      refersToDigest = digestOriginal.payloadDigest || resource.digest;
    } else if (resource.origURL && resource.origTS) {
      if (!resource.digest || !digestOriginal) {
        //console.log("Skip fuzzy resource with no digest");
        return null;
      }

      type = "revisit";
      resource.mime = "warc/revisit";
      payload = EMPTY;

      refersToUrl = resource.origURL;
      refersToDate = new Date(resource.origTS).toISOString();
      refersToDigest = digestOriginal.payloadDigest || resource.digest;
    } else {
      type = "response";
      if (!payload) {
        payload = (await this.db.loadPayload(
          resource,
          {},
        )) as Uint8Array | null;
      }

      if (!payload) {
        //console.log("Skipping No Payload For: " + url, resource);
        return null;
      }

      if (method === "GET") {
        storeDigest = { url, date };
        this.digestsVisted[resource.digest] = storeDigest;
      }
    }

    const status = resource.status || 200;
    const statusText = resource.statusText || getStatusText(status);

    const statusline = `HTTP/1.1 ${status} ${statusText}`;

    const responseRecordId = this.getWARCRecordUUID(
      type + ":" + resource.timestamp + "/" + resource.url,
    );

    const warcHeaders: Record<string, string> = {
      "WARC-Record-ID": responseRecordId,
    };

    if (pageId) {
      warcHeaders["WARC-Page-ID"] = pageId;
    }

    if (resource.extraOpts && Object.keys(resource.extraOpts).length) {
      warcHeaders["WARC-JSON-Metadata"] = JSON.stringify(resource.extraOpts);
    }

    if (refersToDigest) {
      warcHeaders["WARC-Payload-Digest"] = refersToDigest;
    }

    // remove encoding, set content-length as encoding never preserved in browser-based capture
    this.fixupHttpHeaders(httpHeaders, payload.length);

    const record = WARCRecord.create(
      {
        url,
        date,
        type,
        warcVersion,
        warcHeaders,
        statusline,
        httpHeaders,
        refersToUrl,
        refersToDate,
      },
      getPayload(payload),
    );

    //const buffer = await WARCSerializer.serialize(record, {gzip: this.gzip, digest: this.digestOpts});
    if (!resource.digest && record.warcPayloadDigest) {
      resource.digest = record.warcPayloadDigest;
    }
    if (storeDigest && record.warcPayloadDigest) {
      storeDigest.payloadDigest = record.warcPayloadDigest;
    }

    this.lastPageId = pageId;
    this.lastUrl = url;

    const records = [record];

    if (resource.reqHeaders) {
      const type = "request";
      const reqWarcHeaders: Record<string, string> = {
        "WARC-Record-ID": this.getWARCRecordUUID(
          type + ":" + resource.timestamp + "/" + resource.url,
        ),
        "WARC-Page-ID": pageId,
        "WARC-Concurrent-To": responseRecordId,
      };

      const urlParsed = new URL(url);
      const statusline = `${method} ${url.slice(
        urlParsed.origin.length,
      )} HTTP/1.1`;

      const reqRecord = WARCRecord.create(
        {
          url,
          date,
          warcVersion,
          type,
          warcHeaders: reqWarcHeaders,
          httpHeaders: resource.reqHeaders,
          statusline,
        },
        getPayload(requestBody),
      );

      //records.push(await WARCSerializer.serialize(reqRecord, {gzip: this.gzip, digest: this.digestOpts}));
      records.push(reqRecord);
    }

    return records;
  }

  async createTextWARCRecord(resource: DLResourceEntry) {
    const date = new Date(resource.ts).toISOString();
    const timestamp = getTSMillis(date);
    resource.timestamp = timestamp;
    const url = `urn:text:${timestamp}/${resource.url}`;
    resource.url = url;

    const type = "resource";
    const warcHeaders = { "Content-Type": 'text/plain; charset="UTF-8"' };
    const warcVersion = this.warcVersion;

    const payload = getPayload(encoder.encode(resource.text));

    const record = WARCRecord.create(
      { url, date, warcHeaders, warcVersion, type },
      payload,
    );

    const buffer = await WARCSerializer.serialize(record, {
      gzip: this.gzip,
      digest: this.digestOpts,
    });
    if (!resource.digest && record.warcPayloadDigest) {
      resource.digest = record.warcPayloadDigest;
    }
    return buffer;
  }
}

export { Downloader };
```


## src\sw\globals.d.ts

```ts
declare const __SW_NAME__: string;
declare const __WARCIO_VERSION__: string;
declare const __AWP_VERSION__: string;
declare const __VERSION__: string;
declare const __WEB3_STORAGE_TOKEN__: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type TODOFixMe = any;
```


## src\sw\ipfsutils.ts

```ts
import { type CollMetadata, type Collection } from "@webrecorder/wabac/swlib";
import { Downloader, type DownloaderOpts, type Markers } from "./downloader";

// @ts-expect-error no types
import { create as createAutoIPFS } from "auto-js-ipfs";

import * as UnixFS from "@ipld/unixfs";
import { CarWriter } from "@ipld/car/writer";
import Queue from "p-queue";

import { type Link } from "@ipld/unixfs/file/layout/queue";
import { type FileLink } from "@ipld/unixfs/directory";

const autoipfsOpts = {
  web3StorageToken: __WEB3_STORAGE_TOKEN__,
  daemonURL: "",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoipfs: any = null;

type ReplayOpts = {
  filename?: string;
  customSplits?: boolean;
  gzip?: boolean;
  replayBaseUrl?: string;
  showEmbed?: boolean;
  pageUrl?: string;
  pageTitle?: string;
  deepLink?: boolean;
  loading?: boolean;
};

type MetadataWithIPFS = CollMetadata & {
  ipfsPins?: { url: string; cid: string }[] | null;
};

export async function setAutoIPFSUrl(url: string) {
  if (autoipfsOpts.daemonURL !== url) {
    autoipfs = null;
  }
  autoipfsOpts.daemonURL = url;
}

export async function ipfsAdd(
  coll: Collection,
  downloaderOpts: DownloaderOpts,
  replayOpts: ReplayOpts = {},
  progress: (incSize: number, totalSize: number) => void,
) {
  if (!autoipfs) {
    autoipfs = await createAutoIPFS(autoipfsOpts);
  }

  const filename = replayOpts.filename || "webarchive.wacz";

  if (replayOpts.customSplits) {
    const ZIP = new Uint8Array([]);
    const WARC_PAYLOAD = new Uint8Array([]);
    const WARC_GROUP = new Uint8Array([]);
    downloaderOpts.markers = { ZIP, WARC_PAYLOAD, WARC_GROUP };
  }

  const gzip = replayOpts.gzip !== undefined ? replayOpts.gzip : true;

  const dl = new Downloader({ ...downloaderOpts, coll, filename, gzip });
  const dlResponse = await dl.download();

  if (!(dlResponse instanceof Response)) {
    throw new Error(dlResponse.error);
  }

  const metadata: MetadataWithIPFS = coll.config.metadata || {};

  if (!metadata.ipfsPins) {
    metadata.ipfsPins = [];
  }

  let concur;
  let shardSize;
  let capacity;

  if (autoipfs.type === "web3.storage") {
    // for now, web3storage only allows a single-shard uploads, so set this high.
    concur = 1;
    shardSize = 1024 * 1024 * 10000;
    capacity = 1048576 * 200;
  } else {
    concur = 3;
    shardSize = 1024 * 1024 * 5;
    // use default capacity
    // capacity = undefined;
    capacity = 1048576 * 200;
  }

  const { readable, writable } = new TransformStream(
    {},
    UnixFS.withCapacity(capacity),
  );

  const baseUrl = replayOpts.replayBaseUrl || self.location.href;

  const swContent = await fetchBuffer("sw.js", baseUrl);
  const uiContent = await fetchBuffer("ui.js", baseUrl);

  let favicon = null;

  try {
    favicon = await fetchBuffer("icon.png", baseUrl);
  } catch (_e) {
    console.warn("Couldn't load favicon");
  }

  const htmlContent = getReplayHtml(dlResponse.filename!, replayOpts);

  let totalSize = 0;

  if (coll.config.metadata?.size) {
    totalSize =
      coll.config.metadata.size +
      swContent.length +
      uiContent.length +
      (favicon ? favicon.length : 0) +
      htmlContent.length;
  }

  progress(0, totalSize);

  let url = "";
  let cid = "";

  let reject: ((reason?: string) => void) | null = null;

  const p2 = new Promise((res, rej) => (reject = rej));

  const p = readable
    .pipeThrough(new ShardingStream(shardSize))
    .pipeThrough(new ShardStoringStream(autoipfs, concur, reject!))
    .pipeTo(
      new WritableStream({
        write: (res: { url: string; cid: string; size: number }) => {
          if (res.url && res.cid) {
            url = res.url;
            cid = res.cid;
          }
          if (res.size) {
            progress(res.size, totalSize);
          }
        },
      }),
    );

  ipfsGenerateCar(
    writable,
    dlResponse.filename || "",
    dlResponse.body!,
    swContent,
    uiContent,
    htmlContent,
    replayOpts,
    downloaderOpts.markers!,
    favicon,
  ).catch((e: unknown) => console.log("generate car failed", e));

  await Promise.race([p, p2]);

  const res = { cid: cid.toString(), url };

  metadata.ipfsPins.push(res);

  console.log("ipfs cid added " + url);

  return res;
}

export async function ipfsRemove(coll: Collection) {
  if (!autoipfs) {
    autoipfs = await createAutoIPFS(autoipfsOpts);
  }

  const metadata: MetadataWithIPFS = coll.config.metadata || {};

  if (metadata.ipfsPins) {
    for (const { url } of metadata.ipfsPins) {
      try {
        await autoipfs.clear(url);
      } catch (_e) {
        console.log("Failed to unpin");
        autoipfsOpts.daemonURL = "";
        return false;
      }
    }

    metadata.ipfsPins = null;
    return true;
  }

  return false;
}

async function fetchBuffer(filename: string, replayBaseUrl: string) {
  const resp = await fetch(new URL(filename, replayBaseUrl).href);

  return new Uint8Array(await resp.arrayBuffer());
}

async function ipfsWriteBuff(
  writer: UnixFS.View<Uint8Array>,
  name: string,
  content: Uint8Array | AsyncIterable<Uint8Array>,
  dir: UnixFS.DirectoryWriterView<Uint8Array>,
) {
  const file = UnixFS.createFileWriter(writer);
  if (content instanceof Uint8Array) {
    await file.write(content);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (content[Symbol.asyncIterator]) {
    for await (const chunk of content) {
      await file.write(chunk);
    }
  }
  const link = await file.close();
  dir.set(name, link);
}

// ===========================================================================
export async function ipfsGenerateCar(
  writable: WritableStream<UnixFS.Block>,
  waczPath: string,
  waczContent: ReadableStream<Uint8Array>,
  swContent: Uint8Array,
  uiContent: Uint8Array,
  htmlContent: string,
  replayOpts: ReplayOpts,
  markers: Markers | null,
  favicon: Uint8Array | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const writer = UnixFS.createWriter<Uint8Array>({ writable });

  const rootDir = UnixFS.createDirectoryWriter<Uint8Array>(writer);

  const encoder = new TextEncoder();

  await ipfsWriteBuff(writer, "ui.js", uiContent, rootDir);

  if (replayOpts.showEmbed) {
    const replayDir = UnixFS.createDirectoryWriter(writer);
    await ipfsWriteBuff(writer, "sw.js", swContent, replayDir);
    rootDir.set("replay", await replayDir.close());
  } else {
    await ipfsWriteBuff(writer, "sw.js", swContent, rootDir);
  }

  if (favicon) {
    await ipfsWriteBuff(writer, "favicon.ico", favicon, rootDir);
  }

  await ipfsWriteBuff(
    writer,
    "index.html",
    encoder.encode(htmlContent),
    rootDir,
  );

  if (!markers) {
    await ipfsWriteBuff(writer, waczPath, iterate(waczContent), rootDir);
  } else {
    await splitByWarcRecordGroup(
      writer,
      waczPath,
      iterate(waczContent),
      rootDir,
      markers,
    );
  }

  const { cid } = await rootDir.close();

  await writer.close();

  return cid;
}

async function splitByWarcRecordGroup(
  writer: UnixFS.View<Uint8Array>,
  waczPath: string,
  warcIter: AsyncGenerator<Uint8Array>,
  rootDir: UnixFS.DirectoryWriterView<Uint8Array>,
  markers: Markers,
) {
  let links: FileLink[] = [];
  const fileLinks: FileLink[] = [];
  let secondaryLinks: FileLink[] = [];

  let inZipFile = false;
  let lastChunk = null;
  let currName = "";

  const decoder = new TextDecoder();

  const dirs: Record<string, UnixFS.DirectoryWriterView<Uint8Array>> = {};

  const { ZIP, WARC_PAYLOAD, WARC_GROUP } = markers;

  let file = UnixFS.createFileWriter(writer);

  function getDirAndName(fullpath: string): [string, string] {
    const parts = fullpath.split("/");
    const filename = parts.pop() || "";
    return [parts.join("/"), filename];
  }

  const waczDir = UnixFS.createDirectoryWriter(writer);

  let count = 0;

  for await (const chunk of warcIter) {
    if (chunk === ZIP && !inZipFile) {
      if (lastChunk) {
        currName = decoder.decode(lastChunk);
      }
      inZipFile = true;

      if (count) {
        fileLinks.push(await file.close());
        count = 0;
        file = UnixFS.createFileWriter(writer);
      }
    } else if (chunk === ZIP && inZipFile) {
      if (count) {
        links.push(await file.close());
        count = 0;
        file = UnixFS.createFileWriter(writer);
      }

      let link;

      if (secondaryLinks.length) {
        if (links.length) {
          throw new Error("invalid state, secondaryLinks + links?");
        }
        link = await concat(writer, secondaryLinks);
        secondaryLinks = [];
      } else {
        link = await concat(writer, links);
        links = [];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      fileLinks.push(link);

      const [dirName, filename] = getDirAndName(currName);
      currName = "";

      let dir;

      if (!dirName) {
        dir = waczDir;
      } else {
        if (!dirs[dirName]) {
          dirs[dirName] = UnixFS.createDirectoryWriter(writer);
        }
        dir = dirs[dirName];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dir.set(filename, link);

      inZipFile = false;
    } else if (chunk === WARC_PAYLOAD || chunk === WARC_GROUP) {
      if (!inZipFile) {
        throw new Error("invalid state");
      }

      if (count) {
        links.push(await file.close());
        count = 0;
        file = UnixFS.createFileWriter(writer);

        if (chunk === WARC_GROUP) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          secondaryLinks.push(await concat(writer, links));
          links = [];
        }
      }
    } else if (chunk.length > 0) {
      if (!inZipFile) {
        lastChunk = chunk;
      }
      await file.write(chunk);
      count++;
    }
  }

  fileLinks.push(await file.close());

  for (const [name, dir] of Object.entries(dirs)) {
    waczDir.set(name, await dir.close());
  }

  // for await (const chunk of iterate(waczContent)) {
  //   if (chunk === splitMarker) {
  //     links.push(await file.close());
  //     file = UnixFS.createFileWriter(writer);
  //   } else {
  //     file.write(chunk);
  //   }
  // }

  // const rootDir = UnixFS.createDirectoryWriter(writer);

  // await ipfsWriteBuff(writer, "ui.js", uiContent, rootDir);
  // await ipfsWriteBuff(writer, "sw.js", swContent, rootDir);
  // await ipfsWriteBuff(writer, "index.html", encoder.encode(htmlContent), rootDir);

  rootDir.set("webarchive", await waczDir.close());

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  rootDir.set(waczPath, await concat(writer, fileLinks));
}

async function concat(
  writer: UnixFS.View<Uint8Array>,
  links: Link[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  //TODO: is this the right way to do this?
  const { fileEncoder, hasher, linker } = writer.settings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advanced = (fileEncoder as any).createAdvancedFile(links);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const bytes = fileEncoder.encode(advanced);
  const hash = await hasher.digest(bytes);
  const cid = linker.createLink(fileEncoder.code, hash);
  const block = { bytes, cid };
  writer.writer.write(block);

  const link = {
    cid,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentByteLength: (fileEncoder as any).cumulativeContentByteLength(links),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dagByteLength: (fileEncoder as any).cumulativeDagByteLength(bytes, links),
  };

  return link;
}

export const iterate = async function* (stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const next = await reader.read();
    if (next.done) {
      return;
    } else {
      yield next.value;
    }
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function encodeBlocks(blocks: UnixFS.Block[], root?: any) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { writer, out } = CarWriter.create(root);
  /** @type {Error?} */
  let error;
  void (async () => {
    try {
      for await (const block of blocks) {
        // @ts-expect-error
        await writer.put(block);
      }
    } catch (err: unknown) {
      error = err;
    } finally {
      await writer.close();
    }
  })();
  const chunks = [];
  for await (const chunk of out) chunks.push(chunk);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (error != null) throw error;
  const roots = root != null ? [root] : [];
  console.log("chunks", chunks.length);
  return Object.assign(new Blob(chunks), { version: 1, roots });
}

function getReplayHtml(waczPath: string, replayOpts: ReplayOpts = {}) {
  const { showEmbed, pageUrl, pageTitle, deepLink, loading } = replayOpts;

  return `
<!doctype html>
  <html class="no-overflow">
  <head>
    <title>${pageTitle || "ReplayWeb.page"}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="./ui.js"></script>
    <style>
      html, body, replay-web-page, replay-app-main {
        width: 100%;
        height: 100%;
        overflow: hidden;
        margin: 0px;
        padding: 0px;
      }
    </style>
  </head>
  <body>${
    showEmbed
      ? `
    <replay-web-page ${deepLink ? 'deepLink="true" ' : ""} ${
      pageUrl ? `url="${pageUrl}"` : ""
    } loading="${
      loading || ""
    }" embed="replay-with-info" src="${waczPath}"></replay-web-page>`
      : `
    <replay-app-main skipRuffle source="${waczPath}"></replay-app-main>`
  }
  </body>
</html>`;
}

// Copied from https://github.com/web3-storage/w3protocol/blob/main/packages/upload-client/src/sharding.js

/**
 * Shard a set of blocks into a set of CAR files. The last block is assumed to
 * be the DAG root and becomes the CAR root CID for the last CAR output.
 *
 * @extends {TransformStream<import('@ipld/unixfs').Block, import('./types').CARFile>}
 */
export class ShardingStream extends TransformStream {
  /**
   * @param {import('./types').ShardingOptions} [options]
   */
  constructor(shardSize: number) {
    /** @type {import('@ipld/unixfs').Block[]} */
    let shard: UnixFS.Block[] = [];
    /** @type {import('@ipld/unixfs').Block[] | null} */
    let readyShard: UnixFS.Block[] | null = null;
    let readySize = 0;

    let currSize = 0;

    super({
      async transform(block, controller) {
        if (readyShard != null) {
          const blocks = await encodeBlocks(readyShard);
          const size = readySize;
          controller.enqueue({ blocks, size });
          readyShard = null;
        }
        if (shard.length && currSize + block.bytes.length > shardSize) {
          readyShard = shard;
          readySize = currSize;
          shard = [];
          currSize = 0;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        shard.push(block);
        currSize += block.bytes.length;
      },

      async flush(controller) {
        if (readyShard != null) {
          const blocks = await encodeBlocks(readyShard);
          const size = readySize;
          controller.enqueue({ blocks, size });
        }

        const rootBlock = shard.at(-1);
        if (rootBlock != null) {
          const blocks = await encodeBlocks(shard, rootBlock.cid);
          const size = currSize;
          controller.enqueue({ blocks, size });
        }
      },
    });
  }
}

/**
 * Upload multiple DAG shards (encoded as CAR files) to the service.
 *
 * Note: an "upload" must be registered in order to link multiple shards
 * together as a complete upload.
 *
 * The writeable side of this transform stream accepts CAR files and the
 * readable side yields `CARMetadata`.
 *
 * @extends {TransformStream<import('./types').CARFile, import('./types').CARMetadata>}
 */
export class ShardStoringStream extends TransformStream {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoipfs: any,
    concurrency: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject: (reason?: any) => void,
  ) {
    const queue = new Queue({ concurrency });
    const abortController = new AbortController();
    super({
      async transform({ blocks, size }, controller) {
        void queue.add(
          async () => {
            try {
              const cid = blocks.roots[0];

              const resUrls = await autoipfs.uploadCAR(blocks);
              const url = resUrls[0];

              controller.enqueue({ cid, url, size });

              //const { version, roots, size } = car
              //controller.enqueue({ version, roots, cid, size })
            } catch (err) {
              controller.error(err);
              abortController.abort(err);
              autoipfsOpts.daemonURL = "";
              reject(err);
            }
          },
          { signal: abortController.signal },
        );

        // retain backpressure by not returning until no items queued to be run
        await queue.onSizeLessThan(1);
      },
      async flush() {
        // wait for queue empty AND pending items complete
        await queue.onIdle();
      },
    });
  }
}
```


## src\sw\keystore.ts

```ts
import { openDB } from "idb/with-async-ittr";
import {
  fromByteArray as encodeBase64,
  toByteArray as decodeBase64,
} from "base64-js";
import { type IDBPDatabase } from "idb";

type KeyPair = {
  public: string;
  private: string;
};

type IdSig = {
  id: string;
  sig?: string;
  keys?: KeyPair;
};

export type DataSignature = {
  hash: string;
  signature: string;
  publicKey: string;
  created: string;
  software: string;
};

// ====================================================================
export class KeyStore {
  dbname: string;
  mainStore: string;
  key: string;
  version: number;
  _ready: Promise<void>;
  db: IDBPDatabase | null = null;

  constructor({
    dbname = "_keystore",
    mainStore = "store",
    key = "id",
    version = 1,
  } = {}) {
    this.dbname = dbname;
    this.mainStore = mainStore;
    this.key = key;
    this.version = version;
    this._ready = this.init();
  }

  async init() {
    //let oldVersion = 0;

    this.db = await openDB(this.dbname, this.version, {
      upgrade: (db, oldV, _newV, _tx) => {
        //oldVersion = oldV;
        this._initDB(db, oldV);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocking: (e: any) => {
        if (!e || e.newVersion === null) {
          this.close();
        }
      },
    });
  }

  _initDB(db: IDBPDatabase, oldV: number /*, newV, tx*/) {
    if (!oldV) {
      db.createObjectStore(this.mainStore, { keyPath: this.key });
    }
  }

  async listAll() {
    await this._ready;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.db!.getAll(this.mainStore);
  }

  async get(name: string) {
    await this._ready;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.db!.get(this.mainStore, name);
  }

  async delete(name: string) {
    await this._ready;
    return this.db!.delete(this.mainStore, name);
  }

  async put(value: IdSig) {
    await this._ready;
    return await this.db!.put(this.mainStore, value);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ====================================================================
export class Signer {
  softwareString: string;
  _store: KeyStore | null;
  cacheSig: boolean;

  constructor(softwareString: string, opts: { cacheSig?: boolean } = {}) {
    this._store = new KeyStore();
    this.softwareString = softwareString || "ArchiveWeb.page";
    this.cacheSig = opts.cacheSig || false;
  }

  close() {
    if (this._store) {
      this._store.close();
      this._store = null;
    }
  }

  async sign(string: string, created: string): Promise<DataSignature> {
    let keyPair: CryptoKeyPair;
    let keys = await this.loadKeys();

    const ecdsaImportParams = {
      name: "ECDSA",
      namedCurve: "P-384",
    };

    const extractable = true;
    const usage = ["sign", "verify"] as KeyUsage[];

    const ecdsaSignParams = {
      name: "ECDSA",
      hash: "SHA-256",
    };

    if (!keys) {
      keyPair = await crypto.subtle.generateKey(
        ecdsaImportParams,
        extractable,
        usage,
      );

      const privateKey = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey,
      );
      const publicKey = await crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey,
      );
      keys = {
        private: encodeBase64(new Uint8Array(privateKey)),
        public: encodeBase64(new Uint8Array(publicKey)),
      };

      await this.saveKeys(keys);
    } else {
      const privateDecoded = decodeBase64(keys.private);
      const publicDecoded = decodeBase64(keys.public);

      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        privateDecoded,
        ecdsaImportParams,
        true,
        ["sign"],
      );
      const publicKey = await crypto.subtle.importKey(
        "spki",
        publicDecoded,
        ecdsaImportParams,
        true,
        ["verify"],
      );
      keyPair = { privateKey, publicKey };
    }

    let signature: string | null = this.cacheSig
      ? await this.loadSig(string)
      : null;

    if (!signature) {
      const data = new TextEncoder().encode(string);
      const signatureBuff = await crypto.subtle.sign(
        ecdsaSignParams,
        keyPair.privateKey,
        data,
      );
      signature = encodeBase64(new Uint8Array(signatureBuff));
      await this.saveSig(string, signature);
    }

    //console.log("verify", await crypto.subtle.verify(ecdsaSignParams, keyPair.publicKey, signature, data));

    return {
      hash: string,
      signature,
      publicKey: keys.public,
      created,
      software: this.softwareString,
    };
  }

  async saveSig(id: string, sig: string) {
    return await this._store!.put({ id, sig });
  }

  async loadSig(id: string): Promise<string> {
    const res = await this._store!.get(id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res?.sig;
  }

  async saveKeys(keys: KeyPair, id = "_userkey") {
    return await this._store!.put({ id, keys });
  }

  async loadKeys(id = "_userkey"): Promise<KeyPair | null> {
    const res = await this._store!.get(id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res?.keys;
  }
}
```


## src\sw\main.ts

```ts
import { SWReplay, WorkerLoader } from "@webrecorder/wabac/swlib";

import { ExtAPI } from "./api";
import { RecordingCollections } from "./recproxy";

import REC_INDEX_HTML from "@/static/index.html";
import RWP_INDEX_HTML from "replaywebpage/index.html";

declare let self: ServiceWorkerGlobalScope;

if (self.registration) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultConfig: Record<string, any> = {
    baseUrlSourcePrefix: "/replay/index.html",
    convertPostToGet: false,
  };

  if (self.location.origin.startsWith("chrome-extension://")) {
    defaultConfig["injectScripts"] = ["/ruffle/ruffle.js"];
  }

  const staticData = new Map();

  const prefix = self.registration.scope;

  // for backwards compatibility to support <replay-web-page> tag
  staticData.set(prefix + "replay.html", {
    type: "text/html",
    content: RWP_INDEX_HTML,
  });

  // for use with <record-web-page> tag
  staticData.set(prefix + "record.html", {
    type: "text/html",
    content: REC_INDEX_HTML,
  });

  const ApiClass = ExtAPI;
  const CollectionsClass = RecordingCollections;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).sw = new SWReplay({
    ApiClass,
    staticData,
    defaultConfig,
    CollectionsClass,
  });
} else {
  new WorkerLoader(self);
}
```


## src\sw\recproxy.ts

```ts
import {
  type ADBType,
  ArchiveDB,
  type ArchiveRequest,
  type ArchiveResponse,
  type CollectionLoader,
  type PageEntry,
  LiveProxy,
  SWCollections,
  randomId,
} from "@webrecorder/wabac/swlib";

//declare let self: ServiceWorkerGlobalScope;

import { type IDBPDatabase, type IDBPTransaction } from "idb";
import { postToGetUrl } from "warcio";

//export interface RecDBType extends ADBType {
export type RecDBType = ADBType & {
  rec: {
    key: string;
  };
};

export type ExtPageEntry = PageEntry & {
  id: string;
  title: string;
  size: number;
  ts: number;

  favIconUrl?: string;
  text?: string;
};

// ===========================================================================
export class RecProxy extends ArchiveDB {
  collLoader: CollectionLoader;
  recordProxied: boolean;
  liveProxy: LiveProxy;
  pageId: string;
  isNew = true;
  firstPageOnly: boolean;
  counter = 0;
  isRecording = true;
  allPages = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: any, collLoader: CollectionLoader) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super(config.dbname);

    this.name = config.dbname.slice(3);

    this.collLoader = collLoader;

    this.recordProxied = config.extraConfig.recordProxied || false;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.liveProxy = new LiveProxy(config.extraConfig, {
      cloneResponse: true,
      allowBody: true,
    });

    this.pageId = randomId();
    this.isNew = true;
    this.firstPageOnly = config.extraConfig.firstPageOnly || false;

    this.counter = 0;
  }

  override _initDB(
    db: IDBPDatabase<ADBType>,
    oldV: number,
    newV: number | null,
    tx: IDBPTransaction<
      ADBType,
      (keyof ADBType)[],
      "readwrite" | "versionchange"
    >,
  ) {
    super._initDB(db, oldV, newV, tx);
    //TODO: fix
    (db as unknown as IDBPDatabase<RecDBType>).createObjectStore("rec");
  }

  async decCounter() {
    this.counter--;
    //console.log("rec counter", this.counter);
    //TODO: fix
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.db! as any).put("rec", this.counter, "numPending");
  }

  async getCounter(): Promise<number | undefined> {
    //TODO: fix
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    return await (this.db! as any).get("rec", "numPending");
  }

  override async getResource(
    request: ArchiveRequest,
    prefix: string,
    event: FetchEvent,
  ) {
    if (!this.isRecording) {
      return await super.getResource(request, prefix, event);
    }

    let req;

    if (request.method === "POST" || request.method === "PUT") {
      req = request.request.clone();
    } else {
      req = request.request;
    }

    let response: ArchiveResponse | null = null;

    try {
      this.counter++;
      response = await this.liveProxy.getResource(request, prefix);
    } catch (_e) {
      await this.decCounter();
      return null;
    }

    // error response, don't record
    if (response?.noRW && response.status >= 400) {
      await this.decCounter();
      return response;
    }

    // don't record content proxied from specified hosts
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.recordProxied && this.liveProxy.hostProxy) {
      const parsedUrl = new URL(response!.url);
      if (this.liveProxy.hostProxy[parsedUrl.host]) {
        await this.decCounter();
        return response;
      }
    }

    this.doRecord(response!, req, request.mod)
      .catch(() => {})
      .finally(async () => this.decCounter());

    return response;
  }

  async doRecord(response: ArchiveResponse, request: Request, mod: string) {
    let url = response.url;
    const ts = response.date.getTime();

    const mime = (response.headers.get("content-type") || "").split(";")[0];

    const range = response.headers.get("content-range");

    if (range && !range.startsWith("bytes 0-")) {
      console.log("skip range request: " + range);
      return;
    }

    const status = response.status;
    const statusText = response.statusText;

    const respHeaders = Object.fromEntries(response.headers.entries());
    const reqHeaders = Object.fromEntries(request.headers.entries());

    const payload = new Uint8Array(
      await response.clonedResponse!.arrayBuffer(),
    );

    if (range) {
      const expectedRange = `bytes 0-${payload.length - 1}/${payload.length}`;
      if (range !== expectedRange) {
        console.log("skip range request: " + range);
        return;
      }
    }

    if (request.mode === "navigate" && mod === "mp_") {
      this.pageId = randomId();
      if (!this.firstPageOnly) {
        this.isNew = true;
      }
    }

    const pageId = this.pageId;
    const referrer = request.referrer;

    if (request.method === "POST" || request.method === "PUT") {
      const data = {
        method: request.method,
        postData: await request.text(),
        headers: request.headers,
        url,
      };

      if (postToGetUrl(data)) {
        url = new URL(data.url).href;
      }
    }

    const data = {
      url,
      ts,
      status,
      statusText,
      pageId,
      payload,
      mime,
      respHeaders,
      reqHeaders,
      referrer,
    };

    await this.addResource(data);

    await this.collLoader.updateSize(this.name, payload.length, payload.length);

    // don't add page for redirects
    if (this.isPage(url, request, status, referrer, mod)) {
      await this.addPages([{ id: pageId, url, ts }]);
      this.allPages.set(url, pageId);
      this.isNew = false;
    } else {
      console.log("not page", url);
    }
  }

  isPage(
    url: string,
    request: Request,
    status: number,
    referrer: string,
    mod: string,
  ) {
    if (!this.isNew) {
      return false;
    }

    if ((status >= 301 && status < 400) || status === 204) {
      return false;
    }

    if (request.mode !== "navigate" || mod !== "mp_") {
      return false;
    }

    if (!referrer) {
      return true;
    }

    const inx = referrer.indexOf("mp_/");
    if (inx > 0) {
      const refUrl = referrer.slice(inx + 4);
      return url === refUrl || this.allPages.has(refUrl);
    } else if (referrer.indexOf("if_/") > 0) {
      return false;
    } else if (referrer.indexOf("?source=")) {
      return true;
    } else {
      return false;
    }
  }

  async updateFavIcon(url: string, favIconUrl: string) {
    const pageId = this.allPages.get(url);
    if (!pageId) {
      return;
    }
    const page = (await this.db!.get("pages", pageId)) as
      | ExtPageEntry
      | undefined;
    if (!page) {
      return;
    }
    page.favIconUrl = favIconUrl;
    try {
      await this.db!.put("pages", page);
    } catch (_e: unknown) {
      // ignore
    }
  }
}

// ===========================================================================
export class RecordingCollections extends SWCollections {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async _initStore(type: string, config: any): Promise<any> {
    let store;

    switch (type) {
      case "recordingproxy":
        store = new RecProxy(config, this);
        await store.initing;
        return store;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return await super._initStore(type, config);
  }

  override async _handleMessage(event: MessageEvent) {
    let coll;

    switch (event.data.msg_type) {
      case "toggle-record":
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        coll = await this.getColl(event.data.id);
        if (coll && coll.store instanceof RecProxy) {
          console.log("Recording Toggled!", event.data.isRecording);
          coll.store.isRecording = event.data.isRecording;
        }
        break;

      case "update-favicon":
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        coll = await this.getColl(event.data.id);
        if (coll && coll.store instanceof RecProxy) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await coll.store.updateFavIcon(event.data.url, event.data.favIconUrl);
        }
        break;

      default:
        return await super._handleMessage(event);
    }
  }
}
```


## src\ui\app.ts

```ts
import { html, css, wrapCss, IS_APP, apiPrefix } from "replaywebpage";

// replaywebpage imports
import { ReplayWebApp, Embed, Loader } from "replaywebpage";

import { SWManager } from "replaywebpage";

import fasHelp from "@fortawesome/fontawesome-free/svgs/solid/question-circle.svg";
import fasPlus from "@fortawesome/fontawesome-free/svgs/solid/plus.svg";

import fasUpload from "@fortawesome/fontawesome-free/svgs/solid/upload.svg";
import fasCog from "@fortawesome/fontawesome-free/svgs/solid/cog.svg";

import "./coll";
import "./coll-info";
import "./recordembed";
import "./coll-index";

import { BtrixClient } from "./upload";

import wrRec from "../assets/icons/recLogo.svg";
import awpLogo from "../assets/brand/archivewebpage-icon-color.svg";
import awpBrandLockupColor from "../assets/brand/archivewebpage-lockup-color.svg";
import prettyBytes from "pretty-bytes";

import {
  create as createAutoIpfs,
  DaemonAPI,
  Web3StorageAPI,
  // @ts-expect-error - TS7016 - Could not find a declaration file for module 'auto-js-ipfs'. '/Users/emma/Work/Webrecorder/archiveweb.page/node_modules/auto-js-ipfs/index.js' implicitly has an 'any' type.
} from "auto-js-ipfs";
import { getLocalOption, setLocalOption } from "../localstorage";
import { type BtrixOpts } from "../types";

const VERSION = __AWP_VERSION__;

const DEFAULT_GATEWAY_URL = "https://w3s.link/ipfs/";

const DEFAULT_BTRIX_URL = "https://app.browsertrix.com";

//============================================================================
class ArchiveWebApp extends ReplayWebApp {
  showCollDrop: boolean;
  colls: { id: string; title?: string; loadUrl?: string }[];
  autorun: boolean;
  settingsError: string;
  settingsTab: string;
  ipfsOpts: {
    daemonUrl: string;
    message?: string;
    useCustom: boolean;
    autoDetect: boolean;
    gatewayUrl: string;
  };
  btrixOpts: BtrixOpts | null;
  loadedCollId?: string | null;
  showImport?: boolean;

  archiveCookies: boolean | null = null;
  archiveStorage: boolean | null = null;
  archiveFlash: boolean | null = null;
  archiveScreenshots: boolean | null = null;
  archivePDF: boolean | null = null;

  showIpfsShareFailed = false;

  constructor() {
    super();

    this.navMenuShown = false;
    this.showCollDrop = false;
    this.colls = [];
    this.autorun = false;

    this.settingsError = "";

    this.settingsTab = localStorage.getItem("settingsTab") || "prefs";

    try {
      const res = localStorage.getItem("ipfsOpts");
      this.ipfsOpts = JSON.parse(res!);
    } catch (e) {
      // ignore empty
    }

    this.ipfsOpts ||= {
      daemonUrl: "",
      message: "",
      useCustom: false,
      autoDetect: false,
      gatewayUrl: DEFAULT_GATEWAY_URL,
    };

    try {
      const res = localStorage.getItem("btrixOpts");
      // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'ArchiveWebApp'. | TS2345 - Argument of type 'string | null' is not assignable to parameter of type 'string'.
      this.btrixOpts = JSON.parse(res);
      this.doBtrixLogin();
    } catch (e) {
      this.btrixOpts = null;
    }

    if (window.archivewebpage) {
      // @ts-expect-error - TS7006 - Parameter 'progress' implicitly has an 'any' type.
      window.archivewebpage.setDownloadCallback((progress) =>
        this.onDownloadProgress(progress),
      );
    }

    void this.initOpts();
  }

  async initOpts() {
    this.autorun = (await getLocalOption("autorunBehaviors")) === "1";

    const archiveCookies = await getLocalOption("archiveCookies");

    // default to true if unset to match existing behavior
    if (archiveCookies === null || archiveCookies === undefined) {
      await setLocalOption("archiveCookies", "1");
      this.archiveCookies = true;
    } else {
      this.archiveCookies = archiveCookies === "1";
    }

    this.archiveStorage = (await getLocalOption("archiveStorage")) === "1";

    this.archiveFlash = (await getLocalOption("archiveFlash")) === "1";

    const archiveScreenshots = await getLocalOption("archiveScreenshots");

    // default to true if unset to enable screenshots!
    if (archiveScreenshots === null || archiveScreenshots === undefined) {
      await setLocalOption("archiveScreenshots", "1");
      this.archiveScreenshots = true;
    } else {
      this.archiveScreenshots = archiveScreenshots === "1";
    }

    this.archivePDF = (await getLocalOption("archivePDF")) === "1";
  }

  async doBtrixLogin() {
    try {
      // @ts-expect-error - TS2531 - Object is possibly 'null'. | TS2345 - Argument of type 'BtrixOpts | null' is not assignable to parameter of type '{ url: any; username: any; password: any; orgName: any; }'.
      this.btrixOpts.client = await BtrixClient.login(this.btrixOpts);
    } catch (e) {
      this.btrixOpts = null;
    }
  }

  // get appName() {
  //   return "ArchiveWeb.page";
  // }

  static get properties() {
    return {
      ...ReplayWebApp.properties,

      showStartRecord: { type: Boolean },
      showCollDrop: { type: Boolean },
      colls: { type: Array },
      selCollId: { type: String },
      selCollTitle: { type: String },
      recordUrl: { type: String },
      autorun: { type: Boolean },

      showNew: { type: String },
      showImport: { type: Boolean },
      isImportExisting: { type: Boolean },

      loadedCollId: { type: String },

      showDownloadProgress: { type: Boolean },
      download: { type: Object },

      ipfsOpts: { type: Object },
      btrixOpts: { type: Object },

      uploadCollOpts: { type: Object },

      showSettings: { type: Boolean },
      settingsTab: { type: String },
      settingsError: { type: String },

      showIpfsShareFailed: { type: Boolean },
    };
  }

  initRoute() {
    const pageParams = new URLSearchParams(window.location.search);

    if (pageParams.has("config")) {
      super.initRoute();

      this.handleMessages();
    } else {
      this.inited = true;
      this.sourceUrl = pageParams.get("source") || "";
    }

    if (!this.embed) {
      this.checkIPFS();
    }
  }

  async checkSW() {
    const regs = await navigator.serviceWorker.getRegistrations();
    // Remove double SW
    for (const reg of regs) {
      if (reg.active && reg.active.scriptURL.endsWith("/replay/sw.js")) {
        if (await reg.unregister()) {
          self.location.reload();
        }
      }
    }

    // For App: If no SW, register here
    if (IS_APP && !regs.length) {
      const qp = new URLSearchParams();
      qp.set("injectScripts", "ruffle/ruffle.js");

      this.swmanager = new SWManager({
        name: this.swName + "?" + qp.toString(),
        appName: this.appName,
      });
      this.swmanager
        .register()
        .catch(
          () =>
            (this.swErrorMsg =
              this.swmanager?.renderErrorReport(this.mainLogo) || ""),
        );
    }
  }

  firstUpdated() {
    this.embed = this.pageParams.get("embed") || "";

    if (this.embed) {
      return super.firstUpdated();
    }

    this.checkSW();

    this.initRoute();

    window.addEventListener("popstate", () => {
      this.initRoute();
    });
  }

  handleMessages() {
    // support upload
    window.addEventListener("message", async (event) => {
      if (
        this.embed &&
        this.loadedCollId &&
        typeof event.data === "object" &&
        event.data.msg_type === "downloadToBlob"
      ) {
        const download = await fetch(
          `${apiPrefix}/c/${this.loadedCollId}/dl?format=wacz&pages=all`,
        );
        const blob = await download.blob();
        event.source?.postMessage({
          msg_type: "downloadedBlob",
          coll: this.loadedCollId,
          url: URL.createObjectURL(blob),
        });
      }
    });
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onStartLoad(event) {
    if (this.embed) {
      return;
    }

    this.showImport = false;
    this.sourceUrl = event.detail.sourceUrl;
    this.loadInfo = event.detail;

    // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
    if (this.isImportExisting && this.selCollId) {
      // @ts-expect-error - TS2339 - Property 'loadInfo' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
      this.loadInfo.importCollId = this.selCollId;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onCollLoaded(event) {
    if (this.loadInfo?.importCollId) {
      if (navigator.serviceWorker.controller) {
        const msg = {
          msg_type: "reload",
          full: true,
          name: this.loadInfo.importCollId,
        };
        navigator.serviceWorker.controller.postMessage(msg);
      }
    }

    if (this.embed) {
      this.loadedCollId = event.detail.collInfo?.coll;
    }

    super.onCollLoaded(event);

    if (
      !event.detail.alreadyLoaded &&
      event.detail.sourceUrl &&
      event.detail.sourceUrl !== this.sourceUrl
    ) {
      this.sourceUrl = event.detail.sourceUrl;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLoadInfo(sourceUrl: string): any {
    this.disableCSP();

    if (this.loadInfo) {
      return this.loadInfo;
    }

    const customColl = sourceUrl.startsWith("local://")
      ? sourceUrl.slice("local://".length)
      : sourceUrl;

    return { customColl };
  }

  async disableCSP() {
    // necessary for chrome 94> up due to new bug introduced
    //
    // @ts-expect-error - TS2339 - Property 'embed' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
    if (this.embed || !self.chrome?.runtime) {
      return;
    }

    const m = navigator.userAgent.match(/Chrome\/([\d]+)/);
    if (!m || Number(m[1]) < 94) {
      return;
    }

    console.log("attempt to disable CSP to ensure replay works");
    const tabId = await new Promise((resolve) => {
      // @ts-expect-error - TS7006 - Parameter 'msg' implicitly has an 'any' type.
      chrome.tabs.getCurrent((msg) => resolve(msg.id));
    });

    chrome.runtime.sendMessage({
      msg: "disableCSP",
      tabId,
    });
  }

  static get styles() {
    return wrapCss(ArchiveWebApp.appStyles);
  }

  static get appStyles() {
    return wrapCss(css`
      :host {
        font-size: initial;
        overflow: auto;
      }

      wr-rec-coll {
        height: 100%;
        width: 100%;
      }

      .recorder .modal-background {
        background-color: rgba(10, 10, 10, 0.5);
      }

      .recorder .modal-card-head {
        background-color: #97a1ff;
      }

      .extra-padding {
        padding: 1em;
      }

      .less-padding {
        padding-top: 1em;
        padding-bottom: 1em;
      }

      div.field.has-addons {
        flex: auto;
      }

      form {
        flex-grow: 1;
        flex-shrink: 0;
        margin: 0px;
      }

      .dropdown-row {
        display: flex;
        align-items: center;
        margin-bottom: 0.5em;
      }

      .infomsg {
        max-width: 300px;
        padding-right: 8px;
      }

      .rightbar {
        margin-left: auto;
        display: flex;
      }

      .dl-progress {
        display: flex;
        flex-direction: column;
      }

      @media screen and (max-width: 768px) {
        #url {
          border-bottom-right-radius: 4px;
          border-top-right-radius: 4px;
        }

        .no-pad-mobile {
          padding-right: 2px;
        }
      }

      ${ReplayWebApp.appStyles}
    `);
  }

  // HACK: returns the logo requested by ReplayWeb.page's nav as nothing now that the new logo includes both graphics and text. Probably best to refactor this behavior.
  get mainLogo() {
    return "";
  }

  renderNavEnd() {
    return html` <!-- <a
        href="https://archiveweb.page/guide"
        target="_blank"
        class="navbar-item is-size-6"
      >
        <fa-icon .svg="${fasHelp}" aria-hidden="true"></fa-icon
        ><span>&nbsp;User Guide</span>
      </a> -->
      <a
        href="?about"
        @click="${
          // @ts-expect-error - TS7006 - Parameter 'e' implicitly has an 'any' type.
          (e) => {
            e.preventDefault();
            this.showAbout = true;
          }
        }"
        class="navbar-item is-size-6"
        >About
      </a>`;
  }

  // renderNavBrand() {
  //   return html` <fa-icon
  //     .svg="${awpBrandLockupColor}"
  //     size=""
  //     width="9.5rem"
  //     height="1.25rem"
  //     aria-hidden="true"
  //   ></fa-icon>`;
  // }

  renderHomeIndex() {
    return html`
      <section class="section less-padding">
        <div class="message is-small">
          <div class="message-body">
            <div class="buttons">
              <button
                class="button is-small no-pad-mobile"
                title="New Archiving Session"
                @click="${
                  // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
                  () => (this.showNew = "show")
                }"
              >
                <span class="icon">
                  <fa-icon .svg=${fasPlus}></fa-icon>
                </span>
                <span class="is-hidden-mobile">New Archiving Session</span>
              </button>
              <button
                class="button is-small no-pad-mobile"
                title="Import File"
                @click="${() => (this.showImport = true)}"
              >
                <span class="icon">
                  <fa-icon .svg=${fasUpload}></fa-icon>
                </span>
                <span class="is-hidden-mobile">Import File</span>
              </button>
              <!-- <button
                class="button is-small no-pad-mobile"
                title="Start Archiving"
                ?disabled="${!this.colls}"
                @click="${this.onShowStart}"
              >
                <span class="icon">
                  <fa-icon
                    size="1.0em"
                    aria-hidden="true"
                    .svg="${wrRec}"
                  ></fa-icon>
                </span>
                <span class="is-hidden-mobile">Start Archiving</span>
              </button>
              <div class="rightbar">
                <div class="infomsg is-hidden-mobile">
                  The ArchiveWeb.page ${IS_APP ? "App" : "Extension"} allows you
                  to archive webpages directly in your browser!
                </div>
                <button
                  class="button is-small"
                  @click="${
                    // @ts-expect-error - TS2339 - Property 'showSettings' does not exist on type 'ArchiveWebApp'.
                    () => (this.showSettings = true)
                  }"
                >
                  <fa-icon .svg=${fasCog}></fa-icon>
                </button> -->
              </div>
            </div>
          </div>
        </div>
      </section>

      <wr-rec-coll-index
        dateName="Date Created"
        headerName="Archived Items"
        .shareOpts=${{ ipfsOpts: this.ipfsOpts, btrixOpts: this.btrixOpts }}
        @show-start=${this.onShowStart}
        @show-import=${this.onShowImport}
        @colls-updated=${this.onCollsLoaded}
        @ipfs-share-failed=${() => (this.showIpfsShareFailed = true)}
        @do-upload=${
          // @ts-expect-error - TS2339 - Property 'uploadCollOpts' does not exist on type 'ArchiveWebApp'.
          (e) => (this.uploadCollOpts = e.detail)
        }
        style="overflow: visible"
      >
      </wr-rec-coll-index>
    `;
  }

  render() {
    // @ts-expect-error - TS2551 - Property 'showStartRecord' does not exist on type 'ArchiveWebApp'. Did you mean 'onStartRecord'?
    return html` ${this.showStartRecord ? this.renderStartModal() : ""}
    ${
      // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
      this.showNew ? this.renderNewCollModal() : ""
    }
    ${this.showImport ? this.renderImportModal() : ""}
    ${
      // @ts-expect-error - TS2551 - Property 'showDownloadProgress' does not exist on type 'ArchiveWebApp'. Did you mean 'onDownloadProgress'? | TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
      this.showDownloadProgress && this.download
        ? this.renderDownloadModal()
        : ""
    }
    ${
      // @ts-expect-error - TS2339 - Property 'showSettings' does not exist on type 'ArchiveWebApp'.
      this.showSettings ? this.renderSettingsModal() : ""
    }
    ${this.showIpfsShareFailed ? this.renderIPFSShareFailedModal() : ""}
    ${
      // @ts-expect-error - TS2339 - Property 'uploadCollOpts' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'btrixOpts' does not exist on type 'ArchiveWebApp'.
      this.uploadCollOpts && this.btrixOpts ? this.renderBtrixUploadModal() : ""
    }
    ${super.render()}`;
  }

  renderColl() {
    return html` <wr-rec-coll
      .editable="${true}"
      .clearable="${false}"
      .browsable="${!this.embed}"
      .loadInfo="${this.getLoadInfo(this.sourceUrl || "")}"
      .appLogo="${this.mainLogo}"
      .autoUpdateInterval=${
        // @ts-expect-error - TS2339 - Property 'embed' does not exist on type 'ArchiveWebApp'. | TS2551 - Property 'showDownloadProgress' does not exist on type 'ArchiveWebApp'. Did you mean 'onDownloadProgress'?
        this.embed || this.showDownloadProgress ? 0 : 10
      }
      .shareOpts=${{ ipfsOpts: this.ipfsOpts, btrixOpts: this.btrixOpts }}
      .swName=${this.swName ?? null}
      .embed="${this.embed}"
      .sourceUrl="${this.sourceUrl}"
      appName="${this.appName}"
      appVersion=${VERSION}
      @replay-favicons=${this.onFavIcons}
      @update-title=${this.onTitle}
      @coll-loaded=${this.onCollLoaded}
      @show-start=${this.onShowStart}
      @show-import=${this.onShowImport}
      @do-upload=${
        // @ts-expect-error - TS2339 - Property 'uploadCollOpts' does not exist on type 'ArchiveWebApp'.
        (e) => (this.uploadCollOpts = e.detail)
      }
      @about-show=${() => (this.showAbout = true)}
    ></wr-rec-coll>`;
  }

  renderCollList(text = "") {
    return html`
      <div class="dropdown-row">
        <span>${text}&nbsp;</span>
        <div class="select is-small">
          <select @change="${this.onSelectColl}">
            ${this.colls?.map(
              (coll) =>
                html` <option
                  value="${coll.id}"
                  ?selected="${
                    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
                    this.selCollId === coll.id
                  }"
                >
                  ${coll.title || coll.loadUrl}
                </option>`,
            )}
          </select>
        </div>
      </div>
    `;
  }

  renderStartModal() {
    return html` <wr-modal
      @modal-closed="${
        // @ts-expect-error - TS2551 - Property 'showStartRecord' does not exist on type 'ArchiveWebApp'. Did you mean 'onStartRecord'?
        () => (this.showStartRecord = false)
      }"
      title="Start Archiving"
    >
      ${this.renderCollList("Save To:")}
      <div class="field">
        <label class="checkbox is-size-7">
          <input
            type="checkbox"
            ?checked="${this.autorun}"
            @change="${
              // @ts-expect-error - TS7006 - Parameter 'e' implicitly has an 'any' type.
              (e) => (this.autorun = e.currentTarget.checked)
            }"
          />
          Start With Autopilot
        </label>
      </div>

      <form
        class="is-flex is-flex-direction-column"
        @submit="${this.onStartRecord}"
      >
        <div class="field has-addons">
          <p class="control is-expanded">
            <input
              class="input"
              type="url"
              required
              name="url"
              id="url"
              value="${
                // @ts-expect-error - TS2339 - Property 'recordUrl' does not exist on type 'ArchiveWebApp'.
                this.recordUrl
              }"
              placeholder="Enter a URL to Start Archiving"
            />
          </p>
          <div class="control">
            <button
              type="submit"
              class="button is-hidden-mobile is-outlined is-link"
            >
              <span class="icon">
                <fa-icon
                  size="1.0em"
                  aria-hidden="true"
                  .svg="${wrRec}"
                ></fa-icon>
              </span>
              <span>Go!</span>
            </button>
          </div>
        </div>
        ${IS_APP
          ? html` <label class="checkbox">
              <input id="preview" type="checkbox" /><span
                >&nbsp;Start in Preview Mode (without archiving.)</span
              >
            </label>`
          : ""}
      </form>
    </wr-modal>`;
  }

  renderNewCollModal() {
    return html` <wr-modal
      @modal-closed="${
        // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
        () => (this.showNew = null)
      }"
      title="New Archiving Session"
    >
      <form @submit="${this.onNewColl}" class="create-new">
        <div class="field has-addons">
          <p class="control is-expanded">
            <input
              type="text"
              id="new-title"
              name="new-title"
              class="input"
              required
              placeholder="Give this archiving session a name"
            />
          </p>
          <div class="control">
            <button
              type="submit"
              class="button is-hidden-mobile is-primary ${
                // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
                this.showNew === "loading" ? "is-loading " : ""
              }"
              ?disabled="${
                // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
                this.showNew === "loading"
              }"
            >
              Create
            </button>
          </div>
        </div>
      </form>
    </wr-modal>`;
  }

  renderImportModal() {
    return html` <wr-modal
      style="--modal-width: 740px"
      @modal-closed="${() => (this.showImport = false)}"
      title="Import File"
    >
      <wr-chooser
        style="flex: auto"
        .newFullImport="${true}"
        noHead="${true}"
        @load-start=${this.onStartLoad}
      >
      </wr-chooser>
      <div class="is-flex is-flex-wrap-wrap is-align-items-baseline my-2">
        <div class="control">
          <label class="checkbox">
            <input
              type="checkbox"
              name="add-existing"
              .checked="${
                // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'.
                this.isImportExisting
              }"
              @change="${
                // @ts-expect-error - TS7006 - Parameter 'e' implicitly has an 'any' type.
                (e) =>
                  // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'.
                  (this.isImportExisting = e.currentTarget.checked)
              }"
            />
            Add to an existing archived
            item${
              // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'.
              this.isImportExisting ? ":" : ""
            }
          </label>
        </div>
        ${
          // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'.
          this.isImportExisting ? this.renderCollList() : ""
        }
      </div>
    </wr-modal>`;
  }

  renderIPFSShareFailedModal() {
    return html`<wr-modal
      @modal-closed="${() => (this.showIpfsShareFailed = false)}"
      title="IPFS Connection Failed"
    >
      <div>
        <p>
          Sorry, IPFS sharing / unsharing failed as IPFS could not be reached.
        </p>
        <p>(Check the IPFS settings and try again.)</p>
      </div>
    </wr-modal>`;
  }

  renderBtrixUploadModal() {
    return html` <wr-btrix-upload
      .btrixOpts=${this.btrixOpts}
      .uploadColl=${
        // @ts-expect-error - TS2339 - Property 'uploadCollOpts' does not exist on type 'ArchiveWebApp'.
        this.uploadCollOpts
      }
    >
    </wr-btrix-upload>`;
  }

  renderDownloadModal() {
    const renderDLStatus = () => {
      // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
      switch (this.download.state) {
        case "progressing":
          return html`
            <button @click="${this.onDownloadCancel}" class="button is-danger">
              Cancel Download
            </button>
          `;

        case "interrupted":
          return html`
            <p class="has-text-weight-bold has-text-danger">
              The download was interrupted
            </p>
            <button @click="${this.onDownloadCancel}" class="button">
              Close
            </button>
          `;

        case "cancelled":
          return html`
            <p class="has-text-weight-bold has-text-danger">
              The download was canceled
            </p>
            <button @click="${this.onDownloadCancel}" class="button">
              Close
            </button>
          `;

        case "completed":
          return html`
            <p class="has-text-weight-bold has-text-primary">
              Download Completed!
            </p>
            <button @click="${this.onDownloadCancel}" class="button">
              Close
            </button>
          `;
      }
    };

    return html` <wr-modal
      .noBgClose=${true}
      style="--modal-width: 740px"
      @modal-closed="${
        // @ts-expect-error - TS2551 - Property 'showDownloadProgress' does not exist on type 'ArchiveWebApp'. Did you mean 'onDownloadProgress'?
        () => (this.showDownloadProgress = false)
      }"
      title="Download Progress"
    >
      <div class="dl-progress">
        <div>
          Downloading to:
          <i
            >${
              // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
              this.download.filename
            }</i
          >
        </div>
        <div>
          Size Downloaded:
          <b
            >${
              // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
              prettyBytes(this.download.currSize)
            }</b
          >
        </div>
        <div>
          Time Elapsed:
          ${
            // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
            Math.round(Date.now() / 1000 - this.download.startTime)
          }
          seconds
        </div>

        <div class="has-text-centered">${renderDLStatus()}</div>
      </div>
    </wr-modal>`;
  }

  // @ts-expect-error - TS7006 - Parameter 'progress' implicitly has an 'any' type.
  onDownloadProgress(progress) {
    if (progress.filename) {
      // @ts-expect-error - TS2551 - Property 'showDownloadProgress' does not exist on type 'ArchiveWebApp'. Did you mean 'onDownloadProgress'?
      this.showDownloadProgress = true;
      // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
      this.download = progress;
      // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
    } else if (this.download) {
      // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
      this.download = { ...this.download, state: progress.state };
    }
  }

  onDownloadCancel() {
    if (window.archivewebpage) {
      // @ts-expect-error - TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
      if (this.download && this.download.state === "progressing") {
        // @ts-expect-error - TS2339 - Property 'archivewebpage' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'download' does not exist on type 'ArchiveWebApp'.
        window.archivewebpage.downloadCancel(this.download);
      } else {
        // @ts-expect-error - TS2551 - Property 'showDownloadProgress' does not exist on type 'ArchiveWebApp'. Did you mean 'onDownloadProgress'?
        this.showDownloadProgress = false;
      }
    }
  }

  getDeployType() {
    if (IS_APP) {
      return "App";
    }

    if (this.embed) {
      return "Embedded";
    }

    return "Extension";
  }

  // renderAbout() {
  //   return html`
  //     <div class="modal is-active">
  //       <div class="modal-background" @click="${this.onAboutClose}"></div>
  //         <div class="modal-card">
  //           <header class="modal-card-head">
  //             <p class="modal-card-title">About ArchiveWeb.page ${this.getDeployType()}</p>
  //             <button class="delete" aria-label="close" @click="${
  //               this.onAboutClose
  //             }"></button>
  //           </header>
  //           <section class="modal-card-body">
  //             <div class="container">
  //               <div class="content">
  //                 <div class="is-flex">
  //                   <div class="has-text-centered" style="width: 220px">
  //                     <fa-icon class="logo" size="48px" .svg="${awpLogo}"></fa-icon>
  //                     <div style="font-size: smaller; margin-bottom: 1em">${this.getDeployType()} v${VERSION}</div>
  //                   </div>

  //                   ${
  //                     IS_APP
  //                       ? html`
  //                           <p>
  //                             ArchiveWeb.page App is a standalone app for Mac,
  //                             Windows and Linux that allows users to archive
  //                             webpages as they browse
  //                           </p>
  //                         `
  //                       : html` <p>
  //                           ArchiveWeb.page allows users to archive webpages
  //                           directly in your browser!
  //                         </p>`
  //                   }
  //                 </div>

  //                 <p>See the <a href="https://archiveweb.page/guide" target="_blank">ArchiveWeb.page Guide</a> for more info on how to use this tool.</p>

  //                 <p>Full source code is available at:
  //                   <a href="https://github.com/webrecorder/archiveweb.page" target="_blank">https://github.com/webrecorder/archiveweb.page</a>
  //                 </p>

  //                 <p>ArchiveWeb.page is part of the <a href="https://webrecorder.net/" target="_blank">Webrecorder Project</a>.</p>

  //                 <h3>Privacy Policy</h3>
  //                 <p class="is-size-7">ArchiveWeb.page allows users to archive what they browse, storing captured data directly in the browser.
  //                 Users can downloaded this data as files to their hard drive. Users can also delete any and all archived data at any time.
  //                 ArchiveWeb.page does not collect any usage or tracking data.</p>

  //                 <p class="is-size-7">ArchiveWeb.page includes an experimental sharing option for each archive collection. Users can choose to share select archives on a peer-to-peer network (IPFS) via a unique id.
  //                 Once shared on this network, the data may become accessible to others.
  //                 All archived items are private and not shared by default, unless explicitly opted-in by the user. (A warning is displayed when sharing via IPFS.)</p>

  //                 <h4>Disclaimer of Warranties</h4>
  //                 <p class="is-size-7">The application is provided "as is" without any guarantees.</p>
  //                 <details class="is-size-7">
  //                   <summary>Legalese:</summary>
  //                   <p style="font-size: 0.8rem">DISCLAIMER OF SOFTWARE WARRANTY. WEBRECORDER SOFTWARE PROVIDES THIS SOFTWARE TO YOU "AS AVAILABLE"
  //                   AND WITHOUT WARRANTY OF ANY KIND, EXPRESS, IMPLIED OR OTHERWISE,
  //                   INCLUDING WITHOUT LIMITATION ANY WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.</p>
  //                 </details>

  //                 <div class="has-text-centered">
  //                   <a class="button is-warning" href="#" @click="${
  //                     this.onAboutClose
  //                   }">Close</a>
  //                 </div>
  //               </div>
  //             </div>
  //           </section>
  //         </div>
  //       </div>
  //     </div>`;
  // }

  renderSettingsModal() {
    return html`
      <wr-modal @modal-closed="${this.onCancelSettings}" title="Settings">
        <div class="tabs mb-3">
          <ul>
            <li class="${this.settingsTab === "prefs" ? "is-active" : ""}">
              <a @click=${() => (this.settingsTab = "prefs")}
                >Archiving Settings</a
              >
            </li>
            <li
              class="${this.settingsTab === "browsertrix" ? "is-active" : ""}"
            >
              <a @click=${() => (this.settingsTab = "browsertrix")}
                >Browsertrix</a
              >
            </li>
            <li class="${this.settingsTab === "ipfs" ? "is-active" : ""}">
              <a @click=${() => (this.settingsTab = "ipfs")}>IPFS</a>
            </li>
          </ul>
        </div>

        <form
          class="is-flex is-flex-direction-column is-size-7"
          @submit="${this.onSaveSettings}"
        >
          ${this.settingsTab === "prefs"
            ? html`<fieldset>
                <div class="is-size-6 mt-4">Optional archiving features:</div>
                <div class="field is-size-6 mt-4">
                  <input
                    name="prefArchiveScreenshots"
                    id="archiveScreenshots"
                    class="checkbox"
                    type="checkbox"
                    ?checked="${this.archiveScreenshots}"
                  /><span class="ml-1">Save Screenshots</span>
                  <p class="is-size-7 mt-1">
                    Save screenshot + thumbnail of every page on load.
                    Screenshot will be saved as soon as page is done loading.
                  </p>
                </div>
                <div class="field is-size-6 mt-4">
                  <input
                    name="prefArchivePDF"
                    id="archivePDF"
                    class="checkbox"
                    type="checkbox"
                    ?checked="${this.archivePDF}"
                  /><span class="ml-1">Save PDFs</span>
                  <p class="is-size-7 mt-1">
                    Save PDF of each page after page loads (experimental).
                  </p>
                </div>
                <div class="field is-size-6 mt-4">
                  <input
                    name="prefArchiveFlash"
                    id="archiveFlash"
                    class="checkbox"
                    type="checkbox"
                    ?checked="${this.archiveFlash}"
                  /><span class="ml-1">Enable Ruffle for Flash</span>
                  <p class="is-size-7 mt-1">
                    Enables archiving Flash content via injecting the Ruffle
                    emulator into the page. May cause issues with some pages,
                    enable only when archiving websites that contain Flash.
                  </p>
                </div>
                <hr />
                <div class="is-size-6">Privacy related settings:</div>
                <div class="field is-size-6 mt-4">
                  <input
                    name="prefArchiveCookies"
                    id="archiveCookies"
                    class="checkbox"
                    type="checkbox"
                    ?checked="${this.archiveCookies}"
                  /><span class="ml-1">Archive cookies</span>
                  <p class="is-size-7 mt-1">
                    Archiving cookies may expose private information that is
                    <em>normally only shared with the site</em>. When enabled,
                    users should exercise caution about sharing these archived
                    items publicly.
                  </p>
                </div>
                <div class="field is-size-6 mt-4">
                  <input
                    name="prefArchiveStorage"
                    id="archiveStorage"
                    class="checkbox"
                    type="checkbox"
                    ?checked="${this.archiveStorage}"
                  /><span class="ml-1">Archive local storage</span>
                  <p class="is-size-7 mt-1">
                    Archiving local storage will archive information that is
                    generally <em>always private.</em> Archiving local storage
                    may be required for certain paywalled sites but should be
                    avoided where possible.
                  </p>
                  <p class="is-size-7 mt-1">
                    <strong
                      >Sharing content created with this setting enabled may
                      compromise your login credentials.</strong
                    >
                    <br />Archived items created with this settings should
                    generally be kept private!
                  </p>
                </div>
              </fieldset>`
            : ``}
          ${this.settingsTab === "ipfs"
            ? html` <p class="is-size-6 mb-3">
                  Configure settings for sharing archived items to IPFS.
                </p>
                <fieldset>
                  <div class="field">
                    <input
                      name="ipfsAutoDetect"
                      id="ipfsAutoDetect"
                      class="checkbox is-small"
                      type="checkbox"
                      ?checked="${this.ipfsOpts.autoDetect}"
                    /><span class="ml-1">Auto-Detect IPFS</span>
                  </div>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      IPFS Daemon URL (leave blank to auto-detect IPFS):
                      <input
                        class="input is-small"
                        type="url"
                        name="ipfsDaemonUrl"
                        id="ipfsDaemonUrl"
                        value="${this.ipfsOpts.daemonUrl}"
                        placeholder="Set IPFS Daemon URL or set blank to auto-detect IPFS"
                      />
                    </p>
                  </div>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      IPFS Gateway URL:
                      <input
                        class="input is-small"
                        type="url"
                        name="ipfsGatewayUrl"
                        id="ipfsGatewayUrl"
                        value="${this.ipfsOpts.gatewayUrl}"
                        placeholder="${DEFAULT_GATEWAY_URL}"
                      />
                    </p>
                  </div>
                </fieldset>`
            : ""}
          ${this.settingsTab === "browsertrix"
            ? html`
                <p class="is-size-6 mb-3">
                  Configure your credentials to upload archived items to
                  Browsertrix: Webrecorder's cloud-based crawling service.
                </p>
                <p class="is-size-7 p-4 has-background-info">
                  Don't have a Browsertrix account?
                  <a target="_blank" href="https://webrecorder.net/browsertrix/"
                    >Sign up today!</a
                  >
                </p>
                <fieldset>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      Browsertrix URL:
                      <input
                        class="input is-small"
                        type="url"
                        name="btrixUrl"
                        id="btrixUrl"
                        value="${this.btrixOpts?.url || DEFAULT_BTRIX_URL}"
                        placeholder="${DEFAULT_BTRIX_URL}"
                      />
                    </p>
                  </div>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      Username
                      <input
                        class="input is-small"
                        type="text"
                        name="btrixUsername"
                        id="btrixUsername"
                        value="${this.btrixOpts?.username || ""}"
                        placeholder="Username"
                      />
                    </p>
                  </div>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      Password
                      <input
                        class="input is-small"
                        type="password"
                        name="btrixPassword"
                        id="btrixPassword"
                        value="${this.btrixOpts?.password || ""}"
                        placeholder="Password"
                      />
                    </p>
                  </div>
                  <div class="field has-addons">
                    <p class="is-expanded">
                      Organization Name or Slug (Optional)
                      <input
                        class="input is-small"
                        type="text"
                        name="btrixOrgName"
                        id="btrixOrgName"
                        value="${this.btrixOpts?.orgName || ""}"
                        placeholder="my-org"
                      />
                    </p>
                  </div>
                </fieldset>
              `
            : ""}
          <div class="has-text-centered has-text-danger">
            ${this.settingsError}
          </div>
          <div class="has-text-centered mt-4">
            <button class="button is-primary" type="submit">Save</button>
            <button
              class="button"
              type="button"
              @click="${this.onCancelSettings}"
            >
              Cancel
            </button>
          </div>
        </form>
      </wr-modal>
    `;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  async onNewColl(event) {
    // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
    this.showNew = "loading";
    event.preventDefault();
    // @ts-expect-error - TS2339 - Property 'renderRoot' does not exist on type 'ArchiveWebApp'.
    const title = this.renderRoot.querySelector("#new-title").value;

    const method = "POST";
    const body = JSON.stringify({ metadata: { title } });
    const resp = await fetch(`${apiPrefix}/c/create`, { method, body });
    await resp.json();

    const index = this.renderRoot.querySelector("wr-rec-coll-index")!;
    if (index) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (index as any).loadItems();
    }
    // @ts-expect-error - TS2339 - Property 'showNew' does not exist on type 'ArchiveWebApp'.
    this.showNew = null;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onSelectColl(event) {
    //this.selCollId = event.currentTarget.getAttribute("data-id");
    //this.selCollTitle = event.currentTarget.getAttribute("data-title");
    //this.showCollDrop = false;
    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
    this.selCollId = event.currentTarget.value;
  }

  async setDefaultColl() {
    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
    if (!this.selCollId) {
      // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
      this.selCollId = await getLocalOption("defaultCollId");
    }
    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'colls' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'colls' does not exist on type 'ArchiveWebApp'.
    if (!this.selCollId && this.colls?.length) {
      // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'. | TS2339 - Property 'colls' does not exist on type 'ArchiveWebApp'.
      this.selCollId = this.colls[0].id;
    }
    // copy from localStorage to chrome.storage
    if (
      // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
      self.chrome?.storage?.local &&
      self.localStorage
    ) {
      await setLocalOption(
        "index:sortKey",
        localStorage.getItem("index:sortKey"),
      );
      await setLocalOption(
        "index:sortDesc",
        localStorage.getItem("index:sortDesc"),
      );
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  _setCurrColl(event) {
    if (!(event instanceof CustomEvent)) {
      this.setDefaultColl();
      return;
    }
    const { detail } = event;
    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
    this.selCollId = detail.coll;
    //this.selCollTitle = event.detail.title;
    if (!this.colls?.length) {
      this.colls = [
        {
          id: detail.coll,
          title: detail.title,
        },
      ];
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onShowStart(event) {
    this._setCurrColl(event);
    // @ts-expect-error - TS2339 - Property 'recordUrl' does not exist on type 'ArchiveWebApp'.
    this.recordUrl = event.detail.url || "https://example.com/";
    // @ts-expect-error - TS2551 - Property 'showStartRecord' does not exist on type 'ArchiveWebApp'. Did you mean 'onStartRecord'?
    this.showStartRecord = true;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onShowImport(event) {
    this._setCurrColl(event);
    this.showImport = true;
    // @ts-expect-error - TS2339 - Property 'isImportExisting' does not exist on type 'ArchiveWebApp'.
    this.isImportExisting = true;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onCollsLoaded(event) {
    this.colls = event.detail.colls;
    //this.selCollId = this.colls && this.colls.length ? this.colls[0].id: null;
    this.setDefaultColl();
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  async onStartRecord(event) {
    event.preventDefault();
    // @ts-expect-error - TS2339 - Property 'renderRoot' does not exist on type 'ArchiveWebApp'.
    const url = this.renderRoot.querySelector("#url").value;

    const previewCheckbox = this.renderRoot.querySelector("#preview");
    // @ts-expect-error - TS2339 - Property 'checked' does not exist on type 'Element'.
    const isPreview = previewCheckbox?.checked;

    // @ts-expect-error - TS2551 - Property 'showStartRecord' does not exist on type 'ArchiveWebApp'. Did you mean 'onStartRecord'?
    this.showStartRecord = false;
    const autorun = this.autorun;

    // @ts-expect-error - TS2339 - Property 'selCollId' does not exist on type 'ArchiveWebApp'.
    const collId = this.selCollId;

    await setLocalOption("defaultCollId", collId);
    await setLocalOption("autorunBehaviors", autorun ? "1" : "0");

    // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
    if (self.chrome?.runtime) {
      chrome.runtime.sendMessage({
        msg: "startNew",
        url,
        collId,
        autorun,
      });
    } else if (window.archivewebpage?.record) {
      const startRec = !isPreview;
      window.archivewebpage.record({ url, collId, startRec, autorun });
    }
    return false;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  override async onTitle(event): void {
    super.onTitle(event);

    if (
      this.embed &&
      this.loadedCollId &&
      event.detail.replayTitle &&
      event.detail.title
    ) {
      try {
        await fetch(`${apiPrefix}/c/${this.loadedCollId}/pageTitle`, {
          method: "POST",
          body: JSON.stringify(event.detail),
        });
      } catch (e) {
        console.warn(e);
      }
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  async onSaveSettings(event) {
    event.preventDefault();

    // IPFS settings
    const daemonUrlText = this.renderRoot.querySelector("#ipfsDaemonUrl");
    const gatewayUrlText = this.renderRoot.querySelector("#ipfsGatewayUrl");
    const autodetectCheck = this.renderRoot.querySelector("#ipfsAutoDetect");

    if (daemonUrlText && gatewayUrlText) {
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const daemonUrl = daemonUrlText.value;
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const gatewayUrl = gatewayUrlText.value;
      // @ts-expect-error - TS2339 - Property 'checked' does not exist on type 'Element'.
      const autoDetect = autodetectCheck?.checked;

      this.ipfsOpts = {
        daemonUrl,
        useCustom: !!daemonUrl,
        gatewayUrl,
        autoDetect,
      };

      await this.checkIPFS();

      localStorage.setItem("ipfsOpts", JSON.stringify(this.ipfsOpts));
    }

    // Browsertrix Settings
    const btrixUrl = this.renderRoot.querySelector("#btrixUrl");
    const btrixUsername = this.renderRoot.querySelector("#btrixUsername");
    const btrixPassword = this.renderRoot.querySelector("#btrixPassword");
    const btrixOrgName = this.renderRoot.querySelector("#btrixOrgName");

    if (btrixUrl && btrixUsername && btrixPassword) {
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const url = btrixUrl.value;
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const username = btrixUsername.value;
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const password = btrixPassword.value;
      // @ts-expect-error - TS2339 - Property 'value' does not exist on type 'Element'.
      const orgName = btrixOrgName?.value || "";

      if (url && username && password) {
        const btrixOpts = { url, username, password, orgName };

        let client;

        try {
          client = await BtrixClient.login(btrixOpts);
          this.settingsError = "";
        } catch (e) {
          this.settingsError =
            "Unable to log in to Browsertrix. Check your credentials.";
          return false;
        }

        localStorage.setItem("btrixOpts", JSON.stringify(btrixOpts));
        this.btrixOpts = { ...btrixOpts, client };
      } else {
        this.btrixOpts = null;
        localStorage.removeItem("btrixOpts");
      }
    }

    const options = ["Cookies", "Storage", "Flash", "Screenshots", "PDF"];

    for (const option of options) {
      const name = "archive" + option;
      const elem = this.renderRoot.querySelector("#" + name);

      if (elem) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any)[name] = (elem as HTMLInputElement).checked;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await setLocalOption(name, (this as any)[name] ? "1" : "0");
      }
    }

    localStorage.setItem("settingsTab", this.settingsTab);

    // @ts-expect-error - TS2339 - Property 'showSettings' does not exist on type 'ArchiveWebApp'.
    this.showSettings = false;

    return false;
  }

  onCancelSettings() {
    // @ts-expect-error - TS2339 - Property 'settingsError' does not exist on type 'ArchiveWebApp'.
    this.settingsError = null;
    // @ts-expect-error - TS2339 - Property 'showSettings' does not exist on type 'ArchiveWebApp'.
    this.showSettings = false;
  }

  async checkIPFS() {
    const ipfsOpts = this.ipfsOpts;

    // use auto-js-ipfs to get possible local daemon url (eg. for Brave)
    // if so, send it to the service worker
    if (ipfsOpts.useCustom && ipfsOpts.daemonUrl) {
      ipfsOpts.message = "IPFS Access -- Custom IPFS Daemon";
      return;
    }

    if (!ipfsOpts.daemonUrl && ipfsOpts.autoDetect) {
      const autoipfs = await createAutoIpfs({
        web3StorageToken: __WEB3_STORAGE_TOKEN__,
      });

      if (autoipfs instanceof DaemonAPI) {
        ipfsOpts.daemonUrl = autoipfs.url;
      }

      ipfsOpts.useCustom = false;

      if (autoipfs instanceof Web3StorageAPI) {
        ipfsOpts.message = "Sharing via remote web3.storage";
      } else if (!ipfsOpts.daemonUrl) {
        ipfsOpts.message = "IPFS Access Unknown - Sharing Not Available";
      } else if (ipfsOpts.daemonUrl.startsWith("http://localhost:45")) {
        ipfsOpts.message = "Sharing via Brave IPFS node";
      } else if (ipfsOpts.daemonUrl.startsWith("http://localhost")) {
        ipfsOpts.message = "Sharing via local IPFS node";
      } else {
        ipfsOpts.message = "";
      }
    }
  }
}

customElements.define("archive-web-page-app", ArchiveWebApp);

export { ArchiveWebApp, Loader, Embed };
```


## src\ui\coll-index.ts

```ts
import { ItemIndex, html } from "replaywebpage";
import { property } from "lit/decorators.js";

import prettyBytes from "pretty-bytes";
import { type WrRecCollInfo } from "./coll-info";
import { type WrRecItem } from "../types";

import type { PropertyValues } from "lit";

//============================================================================
export class WrRecCollIndex extends ItemIndex {
  @property({ type: Object })
  deleteConfirm: WrRecItem | null = null;
  ipfsSharePending = 0;

  private _poll?: number | NodeJS.Timer;

  sortedItems: WrRecItem[] = [];

  @property({ type: Object })
  shareOpts: unknown;

  get sortKeys() {
    return [
      { key: "title", name: "Title" },

      { key: "ctime", name: this.dateName },

      { key: "mtime", name: "Date Modified" },

      { key: "size", name: "Total Size" },

      { key: "loadUrl", name: "Source" },
    ];
  }

  firstUpdated() {
    this.loadItems();

    this._poll = setInterval(() => {
      if (!this.ipfsSharePending) {
        this.loadItems();
      }
    }, 10000);
  }

  updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    if (changedProperties.has("sortedItems") && this.sortedItems?.length) {
      this.dispatchEvent(
        new CustomEvent("colls-updated", {
          detail: { colls: this.sortedItems },
        }),
      );
    }
  }

  renderItemInfo(item: WrRecItem) {
    return html` <wr-rec-coll-info
      style="overflow: visible"
      data-coll="${item.id!}"
      .item=${item}
      .shareOpts=${this.shareOpts}
      @ipfs-share="${this.onIpfsShare}"
    >
    </wr-rec-coll-info>`;
  }

  render() {
    return html` ${super.render()} ${this.renderDeleteConfirm()} `;
  }

  renderDeleteConfirm() {
    if (!this.deleteConfirm) {
      return null;
    }

    return html` <wr-modal
      bgClass="has-background-grey-lighter"
      @modal-closed="${() => (this.deleteConfirm = null)}"
      title="Confirm Delete"
    >
      <p>
        Are you sure you want to permanentely delete the archive
        <b>${this.deleteConfirm.title}</b>
        (Size:
        <b>${prettyBytes(Number(this.deleteConfirm.size))}</b>)
      </p>
      <button @click="${this.doDelete}" class="button is-danger">Delete</button>
      <button @click="${() => (this.deleteConfirm = null)}" class="button">
        Cancel
      </button>
    </wr-modal>`;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onIpfsShare(event) {
    if (event.detail.pending) {
      this.ipfsSharePending++;
    } else {
      this.ipfsSharePending--;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onDeleteColl(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.sortedItems) {
      return;
    }

    const index = Number(event.currentTarget.getAttribute("data-coll-index"));

    this.deleteConfirm = this.sortedItems[index];
  }

  async doDelete() {
    if (!this.deleteConfirm) {
      return;
    }

    this._deleting[this.deleteConfirm.sourceUrl] = true;
    this.requestUpdate();

    const info = this.renderRoot.querySelector<WrRecCollInfo>(
      `wr-rec-coll-info[data-coll="${this.deleteConfirm.id}"]`,
    );

    if (info) {
      await info.doDelete();
    }

    this.deleteConfirm = null;
  }

  renderEmpty() {
    return html`No archived items. Click "New Archiving Session" above to begin
    archiving pages!`;
  }
}

customElements.define("wr-rec-coll-index", WrRecCollIndex);
```


## src\ui\coll-info.ts

```ts
import { html, css, wrapCss, apiPrefix } from "replaywebpage";

import prettyBytes from "pretty-bytes";

import fasDownload from "@fortawesome/fontawesome-free/svgs/solid/download.svg";
import fasUpload from "@fortawesome/fontawesome-free/svgs/solid/upload.svg";
import fasSync from "@fortawesome/fontawesome-free/svgs/solid/sync-alt.svg";
import fasCheck from "@fortawesome/fontawesome-free/svgs/solid/check-circle.svg";
import fasCopy from "@fortawesome/fontawesome-free/svgs/regular/copy.svg";
import fasCaretUp from "@fortawesome/fontawesome-free/svgs/solid/caret-up.svg";
import fasShare from "@fortawesome/fontawesome-free/svgs/solid/share.svg";
import fasReshare from "@fortawesome/fontawesome-free/svgs/solid/retweet.svg";
import fasX from "@fortawesome/fontawesome-free/svgs/solid/times.svg";
import fasCloudArrowUp from "@fortawesome/fontawesome-free/svgs/solid/cloud-upload-alt.svg";

import { ItemInfo } from "replaywebpage";
import wrRec from "../assets/icons/recLogo.svg";
import { type WrRecItem } from "../types";

const REPLAY_URL = "https://replayweb.page/";

//============================================================================
class WrRecCollInfo extends ItemInfo {
  ipfsURL: string | null = null;
  shareWait = false;
  showShareMenu = false;
  shareWarn = false;
  shareProgressSize = 0;
  shareProgressTotalSize = 0;

  items?: WrRecItem[];
  item: WrRecItem | null = null;
  isUploadNeeded?: boolean;
  shareOpts: TODOFixMe;
  ipfsOpts: TODOFixMe;
  btrixOpts: TODOFixMe;

  static get properties() {
    return {
      item: { type: Object },
      detailed: { type: Boolean },
      ipfsURL: { type: String },
      shareWait: { type: Boolean },
      showShareMenu: { type: Boolean },
      shareWarn: { type: Boolean },
      shareProgressSize: { type: Number },
      shareProgressTotalSize: { type: Number },

      isUploadNeeded: { type: Boolean },

      shareOpts: { type: Object },
      btrixOpts: { type: Object },
      ipfsOpts: { type: Object },
    };
  }

  static get styles() {
    return wrapCss(WrRecCollInfo.compStyles);
  }

  static get compStyles() {
    return css`
      :host {
        overflow: visible;
      }

      .columns {
        width: 100%;
      }
      .column {
        word-break: break-word;
        position: relative;
      }

      :host {
        width: 100%;
        height: 100%;
        min-width: 0px;
      }

      :host(.is-list) .columns {
        display: flex !important;
        flex-direction: column;
      }

      :host(.is-list) .column {
        width: 100% !important;
      }

      .minihead {
        font-size: 10px;
        font-weight: bold;
      }

      .button-row {
        align-items: center;
        flex-wrap: wrap;
      }

      .button-row *:not(:last-child) {
        margin-right: 0.5em;
      }

      .progress.is-small.mini {
        height: 2px;
        margin-top: 2px;
        width: calc(100% - 0.5em);
      }

      ${ItemInfo.compStyles}
    `;
  }

  firstUpdated() {
    this.renderRoot.addEventListener(
      "click",
      () => (this.showShareMenu = false),
    );

    this.isUploadNeeded = Boolean(
      this.item?.uploadTime && this.item.mtime > this.item.uploadTime,
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'changedProps' implicitly has an 'any' type.
  updated(changedProps) {
    if (changedProps.has("shareOpts") && this.shareOpts) {
      const { ipfsOpts, btrixOpts } = this.shareOpts;
      this.ipfsOpts = ipfsOpts;
      this.btrixOpts = btrixOpts;
    }

    if (changedProps.has("coll") && this.item) {
      // Fix for loading single collection from previous versions
      if (
        this.item.id === "main.archive" &&
        this.item.sourceUrl !== "local://main.archive"
      ) {
        this.item = { ...this.item, sourceUrl: "local://main.archive" };
      }

      if (this.item.ipfsPins?.length) {
        this.ipfsURL = this.item.ipfsPins[this.item.ipfsPins.length - 1].url;
      }

      this.isUploadNeeded = Boolean(
        this.item?.uploadTime && this.item.mtime > this.item.uploadTime,
      );
    }
  }

  render() {
    const coll = this.item;
    const detailed = this.detailed;

    const hasUpload = !!this.btrixOpts;
    const hasIpfs = !!this.ipfsOpts && this.ipfsOpts.daemonUrl;

    return html`
      <div class="columns">
        <div class="column is-2">
          <p class="minihead">Name</p>
          <span class="subtitle has-text-weight-bold">
            ${detailed || coll?.sourceUrl == null
              ? html` ${coll?.title} `
              : html` <a href="?source=${encodeURIComponent(coll.sourceUrl)}"
                  >${coll?.title}</a
                >`}
          </span>
        </div>

        <div class="column is-2">
          <p class="minihead">Date Created</p>
          ${coll?.ctime ? new Date(coll.ctime).toLocaleString() : ""}
        </div>
        <div class="column is-1">
          <p class="minihead">Total Size</p>
          ${prettyBytes(Number(coll?.size || 0))}
        </div>

        <div class="column is-2">
          <p class="minihead">Actions</p>
          <div class="button-row is-flex">
            <a
              href="${apiPrefix}/c/${this.item
                ?.id}/dl?format=wacz&amp;pages=all"
              class="button is-small"
              title="Download WACZ"
            >
              <span class="icon is-small">
                <fa-icon aria-hidden="true" .svg="${fasDownload}"></fa-icon>
              </span>
            </a>
            <button
              @click="${this.onShowImport}"
              class="button is-small"
              title="Import File"
            >
              <span class="icon">
                <fa-icon aria-hidden="true" .svg="${fasUpload}"></fa-icon>
              </span>
            </button>
            <!-- <button
              @click="${this.onShowStart}"
              class="button is-small"
              title="Start Archiving"
            >
              <span class="icon">
                <fa-icon aria-hidden="true" .svg="${wrRec}"></fa-icon>
              </span>
            </button> -->
          </div>
        </div>

        ${hasUpload
          ? html`
              <div class="column is-1">
                <p class="minihead">Upload</p>
                <div class="button-row is-flex">
                  ${hasUpload ? this.renderBtrixUpload() : ""}
                </div>
              </div>
            `
          : html` <div class="column"></div> `}
        ${hasIpfs
          ? html`
        </div>
          <div class="column">
          <p class="minihead">Share (via IPFS)</p>
          <div class="button-row is-flex">
          ${hasIpfs ? this.renderIPFSSharing() : ""}
          </div>
        </div>
        `
          : ""}
        ${coll?.loadUrl
          ? html` <div class="column is-3">
              <p class="minihead">Imported From</p>
              ${coll.loadUrl}
              <a
                @click="${
                  // @ts-expect-error - TS7006 - Parameter 'e' implicitly has an 'any' type.
                  (e) => this.onCopy(e, coll.loadUrl)
                }"
                class="copy"
                ><fa-icon .svg="${fasCopy}"></fa-icon
              ></a>
            </div>`
          : ""}
      </div>
      ${this.shareWarn ? this.renderShareWarn() : ""}
    `;
  }

  renderIPFSSharing() {
    return this.ipfsURL
      ? html`
          <div class="is-flex is-flex-direction-column">
            <div
              class="dropdown is-up ${this.showShareMenu ? "is-active" : ""}"
            >
              <div class="dropdown-trigger">
                <button
                  @click="${this.onShowShareMenu}"
                  class="button is-link is-light is-small ${this.shareWait
                    ? "is-loading"
                    : ""}"
                  aria-haspopup="true"
                  aria-controls="dropdown-menu"
                >
                  <span>Sharing!</span>
                  <span class="icon">
                    <fa-icon .svg=${fasCaretUp}></fa-icon>
                  </span>
                </button>
              </div>
              <div
                class="dropdown-menu"
                id="dropdown-menu"
                role="menu"
                style="z-index: 100"
              >
                <div class="dropdown-content">
                  <div class="dropdown-item">
                    <i class="is-size-7">${this.ipfsOpts?.message || ""}</i>
                  </div>
                  <hr class="dropdown-divider" />
                  <a @click="${this.onPin}" class="dropdown-item">
                    <span class="icon is-small">
                      <fa-icon .svg="${fasReshare}"></fa-icon>
                    </span>
                    Reshare Latest
                  </a>
                  <hr class="dropdown-divider" />
                  <a @click="${this.onCopyIPFSLink}" class="dropdown-item">
                    <span class="icon is-small">
                      <fa-icon size="0.8em" .svg="${fasShare}"></fa-icon>
                    </span>
                    Copy IPFS URL
                  </a>
                  <a
                    @click="${this.onCopyGatewayLink}"
                    class="has-text-weight-bold dropdown-item"
                  >
                    <span class="icon is-small">
                      <fa-icon size="0.8em" .svg="${fasShare}"></fa-icon>
                    </span>
                    Copy Gateway Link
                  </a>
                  <a @click="${this.onCopyRWPLink}" class="dropdown-item">
                    <span class="icon is-small">
                      <fa-icon size="0.8em" .svg="${fasShare}"></fa-icon>
                    </span>
                    Copy Shareable ReplayWeb.page Link
                  </a>
                </div>
              </div>
            </div>
            <progress
              value="${this.shareProgressSize}"
              max="${this.shareProgressTotalSize}"
              class="progress is-small ${this.shareProgressTotalSize
                ? "mini"
                : "is-hidden"}"
            ></progress>
          </div>

          <button class="button is-small" @click="${this.onUnpin}">
            <span class="icon is-small">
              <fa-icon .svg="${fasX}"></fa-icon>
            </span>
            <span>Stop Sharing</span>
          </button>
        `
      : html`
          <div class="is-flex is-flex-direction-column">
            <button
              class="button is-small ${this.shareWait ? "is-loading" : ""}"
              @click="${this.onPinOrWarn}"
            >
              <span class="icon is-small">
                <fa-icon .svg="${fasShare}"></fa-icon>
              </span>
              <span>Start</span>
            </button>
            <progress
              value="${this.shareProgressSize}"
              max="${this.shareProgressTotalSize}"
              class="progress is-small ${this.shareProgressTotalSize
                ? "mini"
                : "is-hidden"}"
            ></progress>
          </div>
        `;
  }

  renderBtrixUpload() {
    const { uploadId, uploadTime } = this.item!;

    return html`
      <div class="is-flex is-flex-direction-column">
        <button
          @click="${this.onUpload}"
          class="button is-small"
          title="Upload to Browsertrix"
        >
          <span class="icon">
            ${uploadTime && uploadId
              ? !this.isUploadNeeded
                ? html`
                    <fa-icon
                      aria-hidden="true"
                      class="has-text-success"
                      .svg="${fasCheck}"
                    ></fa-icon>
                  `
                : html`
                    <fa-icon
                      aria-hidden="true"
                      class="has-text-warning-dark"
                      .svg="${fasSync}"
                    ></fa-icon>
                  `
              : html`
                  <fa-icon
                    aria-hidden="true"
                    size="1.5em"
                    .svg="${fasCloudArrowUp}"
                  ></fa-icon>
                `}
          </span>
        </button>
      </div>
    `;
  }

  renderShareWarn() {
    return html` <wr-modal
      bgClass="has-background-warning"
      @modal-closed="${() => (this.shareWarn = false)}"
      title="Start Sharing?"
    >
      <div class="content is-size-7">
        <p>
          Do you want to share all the content in "<i>${this.item?.title}</i>"
          via IPFS, a peer-to-peer distributed storage network?
        </p>
        <p>
          Your archiving session will have a unique link which can be shared
          with others to load and replay on-demand in ReplayWeb.page. This
          feature is experimental and likely works best with smaller archives.
        </p>
        <p>You can cancel sharing at any time.</p>
        <p>
          <b
            >Once shared, this data leaves your computer and can be read by
            others.</b
          >
        </p>
        <p>If you do not wish to share this data, click Cancel.</p>
      </div>
      <div class="content">
        <label class="checkbox" for="sharewarn">
          <input @change="${this.toggleShareWarn}" type="checkbox" />
          Don't show this message again
        </label>
      </div>
      <button @click="${this.onPin}" class="button is-primary">Share</button>
      <button @click="${() => (this.shareWarn = false)}" class="button">
        Cancel
      </button>
    </wr-modal>`;
  }

  onShowImport() {
    const coll = this.item?.id;
    const title = this.item?.title;
    this.dispatchEvent(
      new CustomEvent("show-import", {
        bubbles: true,
        composed: true,
        detail: { coll, title },
      }),
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onShowShareMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    this.showShareMenu = !this.showShareMenu;
  }

  onShowStart() {
    const coll = this.item?.id;
    const title = this.item?.title;
    this.dispatchEvent(
      new CustomEvent("show-start", {
        bubbles: true,
        composed: true,
        detail: { coll, title },
      }),
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  toggleShareWarn(event) {
    localStorage.setItem(
      "nosharewarn",
      event.currentTarget.checked ? "1" : "0",
    );
  }

  onPinOrWarn() {
    if (localStorage.getItem("nosharewarn") === "1") {
      this.onPin();
    } else {
      this.shareWarn = true;
    }
  }

  async onPin() {
    this.shareWarn = false;

    this.shareWait = true;

    try {
      const { ipfsURL } = await this.ipfsAdd();

      this.ipfsURL = ipfsURL;

      this.onCopyGatewayLink();
    } catch (e) {
      console.log("ipfs share failed");
      this.dispatchEvent(
        new CustomEvent("ipfs-share-failed", { bubbles: true, composed: true }),
      );
    }

    this.shareWait = false;
  }

  async onUnpin() {
    this.shareWait = true;
    const { removed } = await this.ipfsRemove();

    if (removed) {
      this.ipfsURL = null;
    } else {
      this.dispatchEvent(
        new CustomEvent("ipfs-share-failed", { bubbles: true, composed: true }),
      );
    }
    this.shareWait = false;
  }

  ipfsAdd() {
    this.dispatchEvent(
      new CustomEvent("ipfs-share", { detail: { pending: true } }),
    );

    //let id = 0;
    let pc: {
      resolve: (
        value:
          | {
              ipfsURL: string;
            }
          | PromiseLike<{
              ipfsURL: string;
            }>,
      ) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reject: (reason?: any) => void;
    };

    const p = new Promise<{ ipfsURL: string }>(
      (resolve, reject) => (pc = { resolve, reject }),
    );

    // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
    const listener = (event) => {
      const { data } = event;

      if (!data || data.collId !== this.item?.id) {
        return;
      }

      switch (data.type) {
        case "ipfsProgress":
          this.shareProgressSize = data.size;
          this.shareProgressTotalSize = data.totalSize || this.item?.size;
          break;

        case "ipfsAdd":
          this.shareProgressSize = 0;
          this.shareProgressTotalSize = 0;
          if (data.result) {
            pc.resolve(data.result as { ipfsURL: string });
          } else {
            pc.reject();
          }
          this.dispatchEvent(
            new CustomEvent("ipfs-share", { detail: { pending: false } }),
          );

          navigator.serviceWorker.removeEventListener("message", listener);
          break;
      }
    };

    navigator.serviceWorker.addEventListener("message", listener);

    fetch(`${apiPrefix}/c/${this.item!.id}/ipfs`, {
      method: "POST",
      body: JSON.stringify({
        ipfsDaemonUrl: this.ipfsOpts.daemonUrl,
        gzip: false,
        customSplits: true,
      }),
    }).then((res) => {
      if (!res.ok) {
        pc.reject();
      }
    });

    return p;
  }

  async ipfsRemove() {
    const resp = await fetch(`${apiPrefix}/c/${this.item!.id}/ipfs`, {
      method: "DELETE",
      body: JSON.stringify({
        ipfsDaemonUrl: this.ipfsOpts.daemonUrl,
      }),
    });

    return await resp.json();
  }

  onCopyRWPLink() {
    const params = new URLSearchParams();
    params.set("source", this.ipfsURL!);
    const url = REPLAY_URL + params.toString();

    this.showShareMenu = false;
    navigator.clipboard.writeText(url);
  }

  onCopyGatewayLink() {
    const hash = this.ipfsURL!.split("/")[2];
    const url = this.ipfsOpts.gatewayUrl + hash + "/";

    this.showShareMenu = false;
    navigator.clipboard.writeText(url);
  }

  onCopyIPFSLink() {
    const ipfsPath = this.ipfsURL!.slice(0, this.ipfsURL!.lastIndexOf("/") + 1);

    this.showShareMenu = false;
    navigator.clipboard.writeText(ipfsPath);
  }

  onUpload() {
    const detail = { coll: this.item, isUploadNeeded: this.isUploadNeeded };
    this.dispatchEvent(
      new CustomEvent("do-upload", { bubbles: true, composed: true, detail }),
    );
  }

  async doDelete() {
    if (this.item!.ipfsPins?.length) {
      await this.ipfsRemove();
    }

    const resp = await fetch(`${apiPrefix}/c/${this.item!.id}`, {
      method: "DELETE",
    });
    if (resp.status === 200) {
      const json = await resp.json();
      this.items = json.colls;
    }
  }
}

customElements.define("wr-rec-coll-info", WrRecCollInfo);

export { WrRecCollInfo, wrRec };
```


## src\ui\coll.ts

```ts
import {
  html,
  css,
  wrapCss,
  clickOnSpacebarPress,
  apiPrefix,
} from "replaywebpage";

import fasFullscreen from "@fortawesome/fontawesome-free/svgs/solid/desktop.svg";
import fasUnfullscreen from "@fortawesome/fontawesome-free/svgs/solid/compress-arrows-alt.svg";

import { type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";

import prettyBytes from "pretty-bytes";

import { Item } from "replaywebpage";

import wrRec from "../assets/icons/recLogo.svg";

//============================================================================
class WrRecColl extends Item {
  @property({ type: String })
  sourceUrl: string | null = null;

  @property({ type: Object })
  shareOpts: Record<string, string> = {};

  @property({ type: Boolean })
  showFinish = true;

  @state()
  totalSize = 0;

  _sizeUpdater: Promise<void> | null = null;

  static get styles() {
    return wrapCss(WrRecColl.compStyles);
  }

  static get compStyles() {
    return css`
      .rec-button {
        display: flex;
        flex-direction: row;
        margin: 0 1px;
        align-items: center;
        padding: 0 0.5em;
        min-width: max-content;
        margin-left: 1em;
        height: 40px;
      }

      .button.is-primary-new {
        background-color: #4d7c0f;
        border-color: rgba(0, 0, 0, 0);
        color: rgb(255, 255, 255);
        border-radius: 6px;
      }

      .button.is-primary-new:hover {
        background-color: #3a5f09;
      }

      .size-label {
        margin-left: 0.5em;
        font-weight: bold;
      }

      .dot {
        height: 8px;
        width: 8px;
        background-color: #16a34a;
        border-radius: 50%;
        display: inline-block;
      }

      @media screen and (max-width: 480px) {
        div.has-addons {
          flex-wrap: wrap;
        }

        div.has-addons form {
          flex: 1;
          margin-bottom: 8px;
        }

        .rec-controls {
          width: 100%;
          justify-content: space-between !important;
        }
      }

      ${Item.compStyles}
    `;
  }

  updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    if (
      changedProperties.has("embed") ||
      ((changedProperties.has("item") || changedProperties.has("loadInfo")) &&
        this.loadInfo &&
        this.embed &&
        this.item &&
        !this._sizeUpdater)
    ) {
      this._sizeUpdater = this.runSizeUpdater();
    }

    if (changedProperties.has("favIconUrl") && this.favIconUrl) {
      navigator.serviceWorker.controller?.postMessage({
        msg_type: "update-favicon",
        id: this.item,
        url: this.tabData.url,
        favIconUrl: this.favIconUrl.split("mp_/")[1],
      });
    }
  }

  async runSizeUpdater() {
    try {
      while (this.embed) {
        if (this.item) {
          const resp = await fetch(`${apiPrefix}/c/${this.item}`);
          const json = await resp.json();
          this.totalSize = json.size || 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } finally {
      this._sizeUpdater = null;
    }
  }

  // protected renderToolbarLeft(isDropdown = false) {
  //   const leftBar = super.renderToolbarLeft();

  //   if (this.embed) {
  //     return leftBar;
  //   }

  //   return html`${leftBar}<a
  //       href="#"
  //       role="button"
  //       class="${!isDropdown
  //         ? "button narrow is-borderless"
  //         : "dropdown-item is-hidden-tablet"}"
  //       title="Start Archiving"
  //       aria-label="Start Archiving"
  //       aria-controls="record"
  //       @click="${this.onShowStart}"
  //       @keyup="${clickOnSpacebarPress}"
  //     >
  //       <span class="icon is-small">
  //         <fa-icon size="1.2em" aria-hidden="true" .svg="${wrRec}"></fa-icon>
  //       </span>
  //     </a>`;
  // }

  protected renderToolbarRight() {
    const rightBar = super.renderToolbarRight();

    if (!this.embed) {
      return rightBar;
    }

    return html`
      <div class="is-flex is-flex-direction-row rec-controls">
        <a
          href="#"
          role="button"
          class="button is-borderless"
          style="margin-top: 2px"
          id="fullscreen"
          @click="${this.onFullscreenToggle}"
          @keyup="${clickOnSpacebarPress}"
          title="${this.isFullscreen ? "Exit Full Screen" : "Full Screen"}"
          aria-label="${this.isFullscreen ? "Exit Fullscreen" : "Fullscreen"}"
        >
          <span class="icon is-small">
            <fa-icon
              size="1.0em"
              class="has-text-grey"
              aria-hidden="true"
              .svg="${this.isFullscreen ? fasUnfullscreen : fasFullscreen}"
            ></fa-icon>
          </span>
        </a>
        <span class="rec-button" title="Archiving">
          <span class="dot"></span>
          <span class="size-label">${prettyBytes(this.totalSize)}</span>
        </span>
        ${this.showFinish
          ? html` <button
              class="button is-primary-new"
              @click="${this.onEmbedFinish}"
              type="button"
            >
              Finish
            </button>`
          : html`
              <a
                class="button is-primary-new"
                role="button"
                download="my-archive.wacz"
                href="${this.getDownloadUrl()}"
                target="_blank"
                >Download</a
              >
            `}
      </div>
    `;
  }

  renderCollInfo() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemInfo = this.itemInfo as any;
    return html` <div class="info-bg">
      <wr-rec-coll-info
        class="is-list"
        .item="${itemInfo}"
        .shareOpts=${this.shareOpts}
        ?detailed="${true}"
      ></wr-rec-coll-info>
    </div>`;
  }

  onShowStart() {
    if (this.embed) {
      return;
    }

    const coll = this.item;
    const title = this.itemInfo?.title || "";
    const url = this.tabData.url;
    this.dispatchEvent(
      new CustomEvent("show-start", { detail: { coll, title, url } }),
    );
  }

  onEmbedFinish() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        msg_type: "toggle-record",
        id: this.item,
        isRecording: false,
      });
    }
    if (window.parent !== window) {
      window.parent.postMessage({
        type: "awp-finish",
        downloadUrl: this.getDownloadUrl(),
      });
    }
  }

  onHashChange() {
    super.onHashChange();

    if (!this.embed) {
      return;
    }

    const url = this.tabData.url || "";
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      this.tabData.url = "https://" + url;
    }
  }

  navigateTo(value: string) {
    if (
      this.embed &&
      !value.startsWith("https://") &&
      !value.startsWith("http://")
    ) {
      value = "https://" + value;
    }
    super.navigateTo(value);
  }

  getDownloadUrl() {
    return new URL(
      `${apiPrefix}/c/${this.item}/dl?format=wacz&pages=all`,
      window.location.href,
    ).href;
  }
}

customElements.define("wr-rec-coll", WrRecColl);

export { WrRecColl };
```


## src\ui\recordembed.ts

```ts
import { property } from "lit/decorators.js";
import { Embed, apiPrefix } from "replaywebpage";

//import awpLogo from "../assets/brand/archivewebpage-icon-color.svg";

// ===========================================================================
Embed.setDefaultReplayFile("replay.html");

type AWPFinishEvent = {
  type: "awp-finish";
  downloadUrl: string;
};

type LiveProxyURLErrorEvent = {
  type: "live-proxy-url-error";
  url: string;
  status: number;
};

// ===========================================================================
export class RecordEmbed extends Embed {
  @property({ type: String })
  proxyPrefix = "https://wabac-cors-proxy.webrecorder.workers.dev/proxy/";

  @property({ type: String })
  archivePrefix = "";

  source: string;

  constructor() {
    super();

    this.replaybase = "./replay/";
    this.replayfile = "record.html";
    this.mainElementName = "archive-web-page-app";
    this.appName = "Embedded ArchiveWeb.page";
    this.embed = "default";
    this.noWebWorker = true;

    this.coll = this.randomId();

    const baseUrl = new URL(window.location.href);
    baseUrl.hash = "";

    this.customConfig = {
      prefix: this.proxyPrefix,
      isLive: false,
      archivePrefix: this.archivePrefix,
      baseUrl: baseUrl.href,
      baseUrlHashReplay: false,
      recording: true,
      noPostToGet: true,
      messageOnProxyErrors: true,
    };

    this.source = "proxy://" + this.proxyPrefix;
  }

  static get properties() {
    return {
      ...Embed.properties,

      archivePrefix: { type: String },
      proxyPrefix: { type: String },
    };
  }

  randomId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  firstUpdated(): void {
    window.addEventListener("beforeunload", () => {
      this.deleteColl();
    });

    this.customConfig!.archivePrefix = this.archivePrefix;
    this.customConfig!.isLive = !this.archivePrefix;
    this.customConfig!.prefix = this.proxyPrefix;
    this.source = "proxy://" + this.proxyPrefix;

    super.firstUpdated();
  }

  async deleteColl() {
    if (this.coll) {
      await fetch(`w/api/c/${this.coll}`, { method: "DELETE" });
    }
  }

  getDownloadUrl() {
    return `${apiPrefix}/c/${this.coll}/dl?format=wacz&pages=all`;
  }

  handleMessage(event: MessageEvent) {
    const iframe = this.renderRoot.querySelector("iframe");

    if (iframe && event.source === iframe.contentWindow) {
      switch (event.data.type) {
        case "awp-finish":
          this.dispatchEvent(
            new CustomEvent<AWPFinishEvent>("awp-finish", {
              detail: event.data,
            }),
          );
          break;

        case "live-proxy-url-error":
          this.dispatchEvent(
            new CustomEvent<LiveProxyURLErrorEvent>("live-proxy-url-error", {
              detail: event.data,
            }),
          );
          break;

        default:
          return super.handleMessage(event);
      }
    }
  }
}

// ===========================================================================
function main() {
  customElements.define("archive-web-page", RecordEmbed);
}

main();
```


## src\ui\upload.ts

```ts
import { html, css, wrapCss, apiPrefix, LitElement } from "replaywebpage";
import prettyBytes from "pretty-bytes";

import fasSync from "@fortawesome/fontawesome-free/svgs/solid/sync-alt.svg";
import fasCheck from "@fortawesome/fontawesome-free/svgs/solid/check-circle.svg";
import fasExternal from "@fortawesome/fontawesome-free/svgs/solid/external-link-alt.svg";
import fasX from "@fortawesome/fontawesome-free/svgs/solid/times-circle.svg";
import { type BtrixOpts } from "../types";

const VERSION = __AWP_VERSION__;

class BtrixUploader extends LitElement {
  btrixOpts: BtrixOpts | null = null;
  static get properties() {
    return {
      btrixOpts: { type: Object },

      coll: { type: Object },
      uploadColl: { type: Object },

      status: { type: String },

      uploadId: { type: String },
      uploadTime: { type: Number },
      isUploadNeeded: { type: Boolean },

      actualSize: { type: Number },

      uploadSize: { type: Number },
      uploadTotal: { type: Number },
    };
  }

  static get styles() {
    return wrapCss(css``);
  }

  // @ts-expect-error - TS7006 - Parameter 'changedProps' implicitly has an 'any' type.
  updated(changedProps) {
    if (changedProps.has("uploadColl")) {
      // @ts-expect-error - TS2339 - Property 'uploadColl' does not exist on type 'BtrixUploader'.
      const { coll, isUploadNeeded } = this.uploadColl;
      // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      this.coll = coll;
      // @ts-expect-error - TS2339 - Property 'actualSize' does not exist on type 'BtrixUploader'.
      this.actualSize = 0;
      // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
      this.isUploadNeeded = isUploadNeeded;
      // @ts-expect-error - TS2339 - Property 'uploadTime' does not exist on type 'BtrixUploader'. | TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      this.uploadTime = this.coll.uploadTime;
      // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'. | TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      this.uploadId = this.coll.uploadId;
    }

    // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
    if (changedProps.has("coll") && this.coll) {
      this.pollUploadState();
    }
  }

  async pollUploadState() {
    // @ts-expect-error - TS2339 - Property 'pollingUploadState' does not exist on type 'BtrixUploader'.
    if (this.pollingUploadState) {
      return;
    }

    // @ts-expect-error - TS2339 - Property 'pollingUploadState' does not exist on type 'BtrixUploader'.
    this.pollingUploadState = true;

    const loop = true;

    while (loop) {
      // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      const resp = await fetch(`${apiPrefix}/c/${this.coll.id}/upload`);
      const json = await resp.json();
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      this.status = json.status;

      // @ts-expect-error - TS2339 - Property 'uploadTime' does not exist on type 'BtrixUploader'.
      this.uploadTime = json.uploadTime;
      // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      this.uploadId = json.uploadId;

      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      if (this.status === "uploading") {
        // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
        this.isUploadNeeded = false;
      } else if (
        // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
        this.status === "idle" &&
        this.btrixOpts?.client &&
        json.uploadTime &&
        json.uploadId &&
        json.mtime <= json.uploadTime
      ) {
        this.getRemoteUpload();
        // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      } else if (!this.uploadId) {
        // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
        this.isUploadNeeded = true;
      }

      // @ts-expect-error - TS2339 - Property 'uploadSize' does not exist on type 'BtrixUploader'.
      this.uploadSize = json.size;
      // @ts-expect-error - TS2339 - Property 'uploadTotal' does not exist on type 'BtrixUploader'.
      this.uploadTotal = json.totalSize;

      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      if (this.status !== "uploading") {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // @ts-expect-error - TS2339 - Property 'pollingUploadState' does not exist on type 'BtrixUploader'.
    this.pollingUploadState = false;
  }

  async getRemoteUpload() {
    try {
      // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'. | TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      const upload = await this.btrixOpts.client.getRemoteUpload(this.uploadId);
      //this.coll.title = upload.name;
      // @ts-expect-error - TS2339 - Property 'actualSize' does not exist on type 'BtrixUploader'.
      this.actualSize = upload.fileSize;
    } catch (e) {
      // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
      this.isUploadNeeded = true;
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      this.status = "missing";
    }
  }

  render() {
    // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
    if (!this.coll) {
      return html``;
    }

    // @ts-expect-error - TS2339 - Property 'uploadTime' does not exist on type 'BtrixUploader'.
    const uploadTime = this.uploadTime;

    // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
    const alreadyUploaded = !this.isUploadNeeded && uploadTime;

    let btrixUploadUrl = "";

    try {
      // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'. | TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      if (this.btrixOpts.client && this.uploadId) {
        // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'.
        const { client } = this.btrixOpts;
        btrixUploadUrl = new URL(
          // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
          `/orgs/${client.defaultOrg}/artifacts/upload/${this.uploadId}`,
          client.url,
        ).href;
      }
    } catch (e) {
      // ignore
    }

    return html`
      <wr-modal
        @modal-closed="${
          // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
          () => (this.coll = null)
        }"
        title="Upload To Browsertrix"
      >
        <table class="is-size-6" style="margin-left: 3.0rem">
          <tr class="is-italic">
            <td class="has-text-right pr-4">Collection:</td>
            <td>
              ${
                // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
                this.coll.title
              }
            </td>
          </tr>
          <tr class="is-italic">
            <td class="has-text-right pr-4">Local Size:</td>
            <td>
              ${
                // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
                prettyBytes(this.coll.size)
              }
            </td>
          </tr>
          ${
            // @ts-expect-error - TS2339 - Property 'actualSize' does not exist on type 'BtrixUploader'.
            this.actualSize
              ? html` <tr class="is-italic">
                  <td class="has-text-right pr-4">Uploaded Size:</td>
                  <td>
                    ${
                      // @ts-expect-error - TS2339 - Property 'actualSize' does not exist on type 'BtrixUploader'.
                      prettyBytes(this.actualSize)
                    }
                  </td>
                </tr>`
              : ""
          }
          ${uploadTime
            ? html` <tr class="is-italic">
                <td class="has-text-right pr-4">Last Uploaded At:</td>
                <td>${new Date(uploadTime).toLocaleString()}</td>
              </tr>`
            : ""}
          ${btrixUploadUrl
            ? html` <tr class="is-italic">
                <td class="has-text-right pr-4">Link:</td>
                <td>
                  <a href="${btrixUploadUrl}" target="_blank">
                    <fa-icon
                      aria-hidden="true"
                      class=""
                      size="0.7em"
                      .svg="${fasExternal}"
                    ></fa-icon>
                    View in Browsertrix</a
                  >
                </td>
              </tr>`
            : ""}
        </table>
        <div class="is-flex is-flex-direction-column">
          <div class="has-text-centered mt-2 mb-2">
            ${this.renderUploadStatus()}
          </div>
          <div class="has-text-centered mt-4">
            ${
              // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
              this.status === "uploading"
                ? html`
                    <button
                      class="button is-danger"
                      type="button"
                      @click="${this.onCancelUpload}"
                    >
                      Cancel Upload
                    </button>
                    <button
                      class="button"
                      type="button"
                      @click="${
                        // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
                        () => (this.coll = null)
                      }"
                    >
                      Close
                    </button>
                  `
                : html`
                    <button
                      class="button ${
                        // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
                        !this.isUploadNeeded ? "" : "is-primary"
                      }"
                      type="button"
                      @click="${this.onUpload}"
                    >
                      ${alreadyUploaded ? "Upload Again" : "Upload"}
                    </button>
                    <button
                      class="button"
                      type="button"
                      @click="${
                        // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
                        () => (this.coll = null)
                      }"
                      title="Cancel without uploading"
                    >
                      Cancel
                    </button>
                  `
            }
          </div>
        </div>
      </wr-modal>
    `;
  }

  renderUploadStatus() {
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
    switch (this.status) {
      case "done":
        return html`<p class="has-text-weight-bold has-text-primary">
          Upload Finished
        </p>`;

      case "failed":
        return html`<p class="has-text-weight-bold has-text-danger">
            Sorry, Upload Failed, or, the Browsertrix credentials may be
            incorrect.
          </p>
          ;
          <p>
            Check your credentials in <i>Settings</i> and then click
            <b>Upload</b> to try again.
          </p>`;

      case "aborted":
        return html`<p class="has-text-weight-bold has-text-danger">
          Upload has been canceled
        </p>`;

      case "idle":
        // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
        if (!this.isUploadNeeded) {
          return html`<p class="is-italic">
            <fa-icon
              aria-hidden="true"
              class="has-text-success"
              .svg="${fasCheck}"
            ></fa-icon>
            Archive already uploaded to Browsertrix.
            ${this.renderDeleteUploaded()}
          </p> `;
          // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
        } else if (this.uploadId) {
          return html`<p class="has-text-weight-bold has-text-warning-dark">
            <fa-icon
              aria-hidden="true"
              class="has-text-warning-dark"
              .svg="${fasSync}"
            ></fa-icon>
            Archive updated since last upload. Click "Upload" below to upload
            latest. ${this.renderDeleteUploaded()}
          </p> `;
        } else {
          return html`<p class="has-text-weight-bold has-text-primary">
            Archive not yet uploaded. Click "Upload" below to start.
          </p>`;
        }

      case "deleted":
        return html`<p class="has-text-weight-bold has-text-primary">
            Upload to Browsertrix has been deleted.
          </p>
          <p>(Data is still saved locally in your browser)</p>`;

      case "deleteFailed":
        return html`<p class="has-text-weight-bold has-text-danger">
            Sorry, deleting upload has failed, or, the Browsertrix credentials
            may be incorrect.
          </p>
          ;
          <p>
            Check your credentials in <i>Settings</i> and then click
            <b>Delete</b> to try again. ${this.renderDeleteUploaded()}
          </p> `;

      default:
        return "";
    }
  }

  renderDeleteUploaded() {
    return html`
      <span
        ><button
          class="button is-small"
          title="Delete Upload from Browsertrix"
          type="button"
          @click="${this.onDeleteUpload}"
        >
          <fa-icon
            aria-hidden="true"
            class="has-text-danger pr-2"
            .svg="${fasX}"
          ></fa-icon>
          Delete
        </button></span
      >
    `;
  }

  async onUpload() {
    const client = this.btrixOpts!.client;

    // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'.
    const org = await client.getOrg(this.btrixOpts.orgName);

    const urlObj = new URL(`/api/orgs/${org}/uploads/stream`, client!.url);

    // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
    if (this.uploadId) {
      // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      urlObj.searchParams.set("replaceId", this.uploadId);
    }

    const now = new Date().toLocaleString();
    urlObj.searchParams.set(
      "notes",
      `Uploaded by ArchiveWeb.page ${VERSION} at ${now}`,
    );

    const url = urlObj.href;

    const headers = { Authorization: client!.auth };

    const body = JSON.stringify({ url, headers });

    const method = "POST";

    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
    this.status = "uploading";
    // @ts-expect-error - TS2339 - Property 'uploadSize' does not exist on type 'BtrixUploader'.
    this.uploadSize = 0;
    // @ts-expect-error - TS2339 - Property 'uploadTotal' does not exist on type 'BtrixUploader'.
    this.uploadTotal = 0;

    const resp = await fetch(
      // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      `${apiPrefix}/c/${this.coll.id}/upload?format=wacz&pages=all`,
      { method, body },
    );

    const json = await resp.json();

    if (json.uploading) {
      this.pollUploadState();
    }
  }

  async onCancelUpload() {
    const method = "POST";
    const body = JSON.stringify({ abortUpload: true });
    // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
    await fetch(`${apiPrefix}/c/${this.coll.id}/upload`, { method, body });
    this.pollUploadState();
  }

  async onDeleteUpload() {
    try {
      // @ts-expect-error - TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'.
      const { client } = this.btrixOpts;

      if (!client) {
        return;
      }

      // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'.
      await client.deleteUpload(this.uploadId);

      // @ts-expect-error - TS2339 - Property 'coll' does not exist on type 'BtrixUploader'.
      await fetch(`${apiPrefix}/c/${this.coll.id}/upload`, {
        method: "DELETE",
      });

      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      this.status = "deleted";
      // @ts-expect-error - TS2339 - Property 'isUploadNeeded' does not exist on type 'BtrixUploader'.
      this.isUploadNeeded = true;
      // @ts-expect-error - TS2339 - Property 'uploadTime' does not exist on type 'BtrixUploader'. | TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'.
      this.uploadTime = this.btrixOpts.uploadTime = null;
      // @ts-expect-error - TS2339 - Property 'uploadId' does not exist on type 'BtrixUploader'. | TS2339 - Property 'btrixOpts' does not exist on type 'BtrixUploader'.
      this.uploadId = this.btrixOpts.uploadId = null;
    } catch (e) {
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'BtrixUploader'.
      this.status = "deleteFailed";
    }
  }
}

customElements.define("wr-btrix-upload", BtrixUploader);

export class BtrixClient {
  url: string | URL | undefined;
  auth: TODOFixMe;
  defaultOrg: null;
  // @ts-expect-error - TS7031 - Binding element 'url' implicitly has an 'any' type. | TS7031 - Binding element 'username' implicitly has an 'any' type. | TS7031 - Binding element 'password' implicitly has an 'any' type. | TS7031 - Binding element 'orgName' implicitly has an 'any' type.
  static async login({ url, username, password, orgName }) {
    const loginUrl = url + "/api/auth/jwt/login";

    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const headers = new Headers();
    headers.set("Content-Type", "application/x-www-form-urlencoded");

    const res = await fetch(loginUrl, { method: "POST", body: form, headers });
    const auth = await res.json();
    const { token_type, access_token } = auth;
    if (!access_token || !token_type) {
      throw new Error("Invalid login");
    }

    const authToken = token_type + " " + access_token;
    const client = new BtrixClient(url, authToken);

    const org = await client.getOrg(orgName);
    client.defaultOrg = org;

    return client;
  }

  // @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type. | TS7006 - Parameter 'auth' implicitly has an 'any' type.
  constructor(url, auth) {
    this.url = url;
    this.auth = auth;
    this.defaultOrg = null;
  }

  // @ts-expect-error - TS7006 - Parameter 'endpoint' implicitly has an 'any' type.
  async fetchAPI(endpoint, method = "GET", body = null) {
    const headers = { Authorization: this.auth };
    if (method !== "GET") {
      // @ts-expect-error - TS7053 - Element implicitly has an 'any' type because expression of type '"Content-Type"' can't be used to index type '{ Authorization: any; }'.
      headers["Content-Type"] = "application/json";
    }
    try {
      const resp = await fetch(this.url + endpoint, {
        headers,
        method,
        body,
        // @ts-expect-error - TS2345 - Argument of type '{ headers: { Authorization: any; }; method: string; body: null; duplex: string; }' is not assignable to parameter of type 'RequestInit'.
        duplex: "half",
      });
      return await resp.json();
    } catch (e) {
      console.warn(e);
      return {};
    }
  }

  async getOrg(name = "") {
    const json = await this.fetchAPI("/api/users/me");
    const { orgs } = json;
    if (!orgs?.length) {
      return null;
    }
    if (!name) {
      return orgs[0].id;
    }
    for (const org of orgs) {
      if (org.slug === name || org.name === name) {
        return org.id;
      }
    }
    return orgs[0].id;
  }

  // @ts-expect-error - TS7006 - Parameter 'uploadId' implicitly has an 'any' type.
  async getRemoteUpload(uploadId, orgId = null) {
    const org = this.defaultOrg || orgId;
    const res = await this.fetchAPI(`/api/orgs/${org}/uploads/${uploadId}`);
    if (!res.name) {
      throw new Error("upload_missing");
    }
    return res;
  }

  // @ts-expect-error - TS7006 - Parameter 'uploadId' implicitly has an 'any' type.
  async deleteUpload(uploadId, orgId = null) {
    const org = this.defaultOrg || orgId;
    const deleteStr = JSON.stringify({ crawl_ids: [uploadId] });
    const res = await this.fetchAPI(
      `/api/orgs/${org}/uploads/delete`,
      "POST",
      // @ts-expect-error - TS2345 - Argument of type 'string' is not assignable to parameter of type 'null | undefined'.
      deleteStr,
    );
    if (!res.deleted) {
      throw new Error("delete_failed");
    }
  }
}
```


## src\argo-archive-list.ts

```ts
import { LitElement, html, css, CSSResultGroup } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/checkbox/checkbox.js";
import "@material/web/icon/icon.js";
import "@material/web/labs/card/elevated-card.js";

import { getLocalOption } from "./localstorage";

@customElement("argo-archive-list")
export class ArgoArchiveList extends LitElement {
  static styles: CSSResultGroup = [
    typescaleStyles as unknown as CSSResultGroup,
    css`
      md-elevated-card {
        display: block;
        margin: 1rem 0;
        padding: 0;
        overflow: visible;
      }
      .card-container {
        padding: 0 1rem;
      }

      md-elevated-card > details {
        border-radius: inherit;
        overflow: hidden;
        margin: 0;
        background: transparent;
      }

      md-elevated-card > details summary {
        background: transparent !important;
        padding: 0.75rem 1rem;
      }

      md-elevated-card > details md-list {
        background: transparent;
        padding: 0 0rem 0rem;
      }

      md-list-item {
        --md-list-item-top-space: 0px;
        --md-list-item-bottom-space: 0px;

        --md-list-item-leading-space: 0px;
        --md-list-item-trailing-space: 12px;

        --md-list-item-one-line-container-height: 0px;
      }

      .leading-group {
        display: flex;
        gap: 0px;
        align-items: center;
        height: 100%;
      }

      img.favicon {
        width: 20px !important;
        height: 20px !important;
        flex: 0 0 auto;
        object-fit: cover;
        border-radius: 4px;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
      }

      summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        user-select: none;
      }
      summary::-webkit-details-marker {
        display: none;
      }

      summary md-icon.arrow-right,
      summary md-icon.arrow-down {
        display: none;
      }
      details:not([open]) summary md-icon.arrow-right {
        display: block;
      }
      details[open] summary md-icon.arrow-down {
        display: block;
      }

      .title-url {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        overflow: hidden;
        white-space: nowrap;
      }
      .title-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .base-url {
        flex-shrink: 0;
        text-decoration: none;
      }
    `,
  ];

  @state() private pages: Array<{
    id: string;
    ts: string;
    url: string;
    title?: string;
    favIconUrl?: string;
  }> = [];
  @state() private collId = "";
  @state() private selectedPages = new Set<string>();

  private togglePageSelection(ts: string) {
    const next = new Set(this.selectedPages);
    if (next.has(ts)) {
      next.delete(ts);
    } else {
      next.add(ts);
    }
    this.selectedPages = next;
  }

  public getSelectedPages() {
    return this.pages.filter((p) => this.selectedPages.has(p.ts));
  }

  async connectedCallback() {
    super.connectedCallback();
    this.collId = (await getLocalOption("defaultCollId")) || "";
    const port = chrome.runtime.connect({ name: "sidepanel-port" });
    // @ts-expect-error - TS7006 - Parameter 'msg' implicitly has an 'any' type.
    port.onMessage.addListener((msg) => {
      if (msg.type === "pages") this.pages = msg.pages || [];
    });
    port.postMessage({ type: "getPages" });

    // @ts-expect-error - TS7006 - Parameter 'msg' implicitly has an 'any' type.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "pageAdded") {
        // ask the background for a fresh list
        port.postMessage({ type: "getPages" });
      }
    });
  }

  render() {
    if (!this.pages.length) {
      return html`<p class="md-typescale-body-medium">No archives yet.</p>`;
    }

    const groups = this.pages.reduce(
      (acc, page) => {
        const key = this._formatDate(new Date(Number(page.ts)));
        (acc[key] ||= []).push(page);
        return acc;
      },
      {} as Record<string, typeof this.pages>,
    );

    return html`
      <div class="card-container">
        ${Object.entries(groups)
          .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
          .map(
            ([dateLabel, pages]) => html`
              <md-elevated-card style="margin:1rem 0; display:block;">
                <details open>
                  <summary>
                    <md-icon class="arrow-right">chevron_right</md-icon>
                    <md-icon class="arrow-down">expand_more</md-icon>
                    <span class="md-typescale-label-large">${dateLabel}</span>
                  </summary>
                  <md-list>
                    ${(pages || [])
                      .sort((a, b) => Number(b.ts) - Number(a.ts))
                      .map((page) => {
                        const u = new URL(page.url);
                        return html`
                          <md-list-item
                            type="button"
                            @click=${() => this._openPage(page)}
                          >
                            <div slot="start" class="leading-group">
                              <md-checkbox
                                slot="start"
                                touch-target="wrapper"
                                @click=${(e: Event) => {
                                  e.stopPropagation();
                                  this.togglePageSelection(page.ts);
                                }}
                              ></md-checkbox>

                              ${page.favIconUrl
                                ? html`
                                    <img
                                      slot="start"
                                      class="favicon"
                                      src=${page.favIconUrl}
                                      alt="favicon of ${u.hostname}"
                                    />
                                  `
                                : html`<md-icon slot="start">article</md-icon>`}
                            </div>
                            <div slot="headline" class="title-url">
                              <span
                                class="md-typescale-body-small title-text"
                                style="--md-sys-typescale-body-small-weight: 700"
                                >${page.title || page.url}</span
                              >
                              <a
                                class="md-typescale-body-small base-url"
                                style="--md-sys-typescale-body-small-weight: 700; color: gray"
                                >${u.hostname}</a
                              >
                            </div>
                          </md-list-item>
                        `;
                      })}
                  </md-list>
                </details>
              </md-elevated-card>
            `,
          )}
      </div>
    `;
  }

  private _formatDate(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    const label = date.toLocaleDateString("en-US", opts);
    if (date.toDateString() === today.toDateString()) return `Today — ${label}`;
    if (date.toDateString() === yesterday.toDateString())
      return `Yesterday — ${label}`;
    return label;
  }

  private _openPage(page: { ts: string; url: string }) {
    const tsParam = new Date(Number(page.ts))
      .toISOString()
      .replace(/[-:TZ.]/g, "");
    const urlEnc = encodeURIComponent(page.url);
    const fullUrl =
      `${chrome.runtime.getURL("index.html")}?source=local://${
        this.collId
      }&url=${urlEnc}` + `#view=pages&url=${urlEnc}&ts=${tsParam}`;
    chrome.tabs.create({ url: fullUrl });
  }
}
```


## src\consts.ts

```ts
export const BEHAVIOR_WAIT_LOAD = "wait_load";
export const BEHAVIOR_READY_START = "ready";
export const BEHAVIOR_PAUSED = "paused";
export const BEHAVIOR_RUNNING = "running";
export const BEHAVIOR_DONE = "done";
```


## src\embed.html

```html
<!doctype html>
<html>
  <head>
    <script src="ui.js"></script>
    <style>
      html {
        width: 100%;
        height: 100%;
        display: flex;
      }

      body {
        width: 100%;
      }

      record-web-page {
        border: 1px solid black;
        display: flex;
        height: 100%;
      }
    </style>
  </head>

  <body>
    <archive-web-page
      deepLink="true"
      url="https://example.com/"
    ></archive-web-page>
  </body>
</html>
```


## src\globals.d.ts

```ts
declare module "*.svg";
declare module "*.html";
declare module "*.scss";
declare module "*.sass";
declare module "@/static/extractPDF.js";
declare const __SW_NAME__: string;
declare const __HELPER_PROXY__: string;
declare const __GDRIVE_CLIENT_ID__: string;
declare const __AWP_VERSION__: string;
declare const __VERSION__: string;
declare const __WEB3_STORAGE_TOKEN__: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type TODOFixMe = any;

declare const pdfjsLib: TODOFixMe;

interface Window {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  archivewebpage?: import("./electron/electron-rec-preload").GlobalAPI;
}
```


## src\localstorage.ts

```ts
// @ts-expect-error - TS7006 - Parameter 'name' implicitly has an 'any' type. | TS7006 - Parameter 'value' implicitly has an 'any' type.
export function setLocalOption(name, value) {
  // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
  if (self.chrome?.storage) {
    return new Promise((resolve) => {
      const data = {};
      // @ts-expect-error - TS7053 - Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{}'.
      data[name] = value;
      // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
      self.chrome.storage.local.set(data, () => resolve());
    });
  }

  if (self.localStorage) {
    return Promise.resolve(localStorage.setItem(name, value));
  }

  return Promise.reject();
}

// ===========================================================================
export function getLocalOption(name: string): Promise<string | null> {
  // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
  if (self.chrome?.storage) {
    return new Promise<string>((resolve) => {
      // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
      self.chrome.storage.local.get(name, (res) => {
        resolve(res[name]);
      });
    });
  }

  if (self.localStorage) {
    return Promise.resolve(localStorage.getItem(name));
  }

  return Promise.reject(null);
}

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'name' implicitly has an 'any' type.
export function removeLocalOption(name) {
  // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'. | TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
  if (self.chrome?.storage) {
    return new Promise((resolve) => {
      // @ts-expect-error - TS2339 - Property 'chrome' does not exist on type 'Window & typeof globalThis'.
      self.chrome.storage.local.remove(name, () => {
        // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
        resolve();
      });
    });
  }

  if (self.localStorage) {
    return Promise.resolve(localStorage.removeItem(name));
  }

  return Promise.reject();
}
```


## src\popup.ts

```ts
import { LitElement, html, css, unsafeCSS } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import bulma from "bulma/bulma.sass";

import fasPlus from "@fortawesome/fontawesome-free/svgs/solid/plus.svg";
import fasBox from "@fortawesome/fontawesome-free/svgs/solid/square.svg";
import fasPlay from "@fortawesome/fontawesome-free/svgs/solid/play.svg";
import fasPause from "@fortawesome/fontawesome-free/svgs/solid/pause.svg";
import fasHome from "@fortawesome/fontawesome-free/svgs/solid/home.svg";
import fasQ from "@fortawesome/fontawesome-free/svgs/solid/question.svg";
import fasCheck from "@fortawesome/fontawesome-free/svgs/solid/check.svg";
import fasX from "@fortawesome/fontawesome-free/svgs/solid/times.svg";
import fasCaretDown from "@fortawesome/fontawesome-free/svgs/solid/caret-down.svg";

import wrRec from "./assets/icons/recLogo.svg";

import prettyBytes from "pretty-bytes";

import {
  getLocalOption,
  removeLocalOption,
  setLocalOption,
} from "./localstorage";

import {
  BEHAVIOR_WAIT_LOAD,
  BEHAVIOR_READY_START,
  BEHAVIOR_RUNNING,
  BEHAVIOR_PAUSED,
  BEHAVIOR_DONE,
} from "./consts";

const allCss = unsafeCSS(bulma);
// @ts-expect-error - TS7006 - Parameter 'custom' implicitly has an 'any' type.
function wrapCss(custom) {
  return [allCss, custom];
}

// ===========================================================================
class RecPopup extends LitElement {
  constructor() {
    super();

    // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'RecPopup'.
    this.collections = [];
    // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
    this.collTitle = "";
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
    this.collId = "";

    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
    this.tabId = 0;
    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
    this.recording = false;
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
    this.status = null;

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'RecPopup'.
    this.port = null;

    // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
    this.pageUrl = "";
    // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'RecPopup'.
    this.pageTs = 0;
    // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'RecPopup'.
    this.replayUrl = "";

    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'.
    this.canRecord = false;
    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'RecPopup'.
    this.failureMsg = null;

    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    this.collDrop = "";

    // @ts-expect-error - TS2339 - Property 'allowCreate' does not exist on type 'RecPopup'.
    this.allowCreate = true;

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
    this.waitingForStart = false;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
    this.waitingForStop = false;
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
    // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'RecPopup'.
    this.behaviorMsg = "";
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
    this.autorun = false;
  }

  static get properties() {
    return {
      collections: { type: Array },
      collId: { type: String },
      collTitle: { type: String },
      collDrop: { type: String },

      recording: { type: Boolean },
      status: { type: Object },
      waitingForStart: { type: Boolean },

      replayUrl: { type: String },
      pageUrl: { type: String },
      pageTs: { type: Number },

      canRecord: { type: Boolean },
      failureMsg: { type: String },

      behaviorState: { type: String },
      behaviorResults: { type: Object },
      behaviorMsg: { type: String },
      autorun: { type: Boolean },
    };
  }

  async firstUpdated() {
    document.addEventListener("click", () => {
      // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
      if (this.collDrop === "show") {
        // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
        this.collDrop = "";
      }
    });

    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
    this.autorun = (await getLocalOption("autorunBehaviors")) === "1";

    this.registerMessages();
  }

  registerMessages() {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'RecPopup'.
    this.port = chrome.runtime.connect({ name: "popup-port" });

    // @ts-expect-error - TS7006 - Parameter 'tabs' implicitly has an 'any' type.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length) {
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
        this.tabId = tabs[0].id;
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
        this.pageUrl = tabs[0].url;
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'. | TS7006 - Parameter 'result' implicitly has an 'any' type.
        chrome.action.getTitle({ tabId: this.tabId }, (result) => {
          // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
          this.recording = result.indexOf("Recording:") >= 0;
        });

        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
        this.sendMessage({ tabId: this.tabId, type: "startUpdates" });
      }
    });

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'RecPopup'.
    this.port.onMessage.addListener((message) => {
      this.onMessage(message);
    });
  }

  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  sendMessage(message) {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'RecPopup'.
    this.port.postMessage(message);
  }

  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  async onMessage(message) {
    switch (message.type) {
      case "status":
        // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
        this.recording = message.recording;
        // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
        if (this.waitingForStart && message.firstPageStarted) {
          // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
          this.waitingForStart = false;
        }
        // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
        if (this.waitingForStop && !message.recording && !message.stopping) {
          // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
          this.waitingForStop = false;
        }
        // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
        this.status = message;
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
        this.behaviorState = message.behaviorState;
        // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'RecPopup'.
        this.behaviorMsg = message.behaviorData?.msg || "Starting...";
        // @ts-expect-error - TS2339 - Property 'behaviorResults' does not exist on type 'RecPopup'.
        this.behaviorResults = message.behaviorData?.state;
        // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
        this.autorun = message.autorun;
        if (message.pageUrl) {
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
          this.pageUrl = message.pageUrl;
        }
        if (message.pageTs) {
          // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'RecPopup'.
          this.pageTs = message.pageTs;
        }
        // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'RecPopup'.
        this.failureMsg = message.failureMsg;
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
        if (this.collId !== message.collId) {
          // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          this.collId = message.collId;
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'. | TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          this.collTitle = this.findTitleFor(this.collId);
          // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'. | TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          await setLocalOption(`${this.tabId}-collId`, this.collId);
        }
        break;

      case "collections":
        // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'RecPopup'.
        this.collections = message.collections;
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'. | TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
        this.collId = await getLocalOption(`${this.tabId}-collId`);
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
        this.collTitle = "";
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
        if (this.collId) {
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'. | TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          this.collTitle = this.findTitleFor(this.collId);
        }
        // may no longer be valid, try default id
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
        if (!this.collTitle) {
          // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          this.collId = message.collId;
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'. | TS2339 - Property 'collId' does not exist on type 'RecPopup'.
          this.collTitle = this.findTitleFor(this.collId);
        }
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
        if (!this.collTitle) {
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
          this.collTitle = "[No Title]";
        }
        break;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'match' implicitly has an 'any' type.
  findTitleFor(match) {
    if (!match) {
      return "";
    }
    // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'RecPopup'.
    for (const coll of this.collections) {
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
      if (coll.id === this.collId) {
        return coll.title;
      }
    }

    return "";
  }

  // @ts-expect-error - TS7006 - Parameter 'changedProperties' implicitly has an 'any' type.
  updated(changedProperties) {
    if (
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
      this.pageUrl &&
      // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'RecPopup'.
      this.pageTs &&
      (changedProperties.has("pageUrl") ||
        changedProperties.has("pageTs") ||
        changedProperties.has("recording") ||
        changedProperties.has("collId"))
    ) {
      const params = new URLSearchParams();
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
      params.set("url", this.pageUrl);
      params.set(
        "ts",
        // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'RecPopup'.
        new Date(this.pageTs).toISOString().replace(/[-:TZ.]/g, ""),
      );
      params.set("view", "pages");

      // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'RecPopup'.
      this.replayUrl = this.getCollPage() + "#" + params.toString();
    }

    if (
      changedProperties.has("pageUrl") ||
      changedProperties.has("failureMsg")
    ) {
      // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'.
      this.canRecord =
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
        this.pageUrl &&
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
        (this.pageUrl === "about:blank" ||
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
          this.pageUrl.startsWith("http:") ||
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
          this.pageUrl.startsWith("https:"));
    }
  }

  getHomePage() {
    return chrome.runtime.getURL("index.html");
  }

  get extRoot() {
    return chrome.runtime.getURL("");
  }

  getCollPage() {
    const sourceParams = new URLSearchParams();
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
    sourceParams.set("source", "local://" + this.collId);

    return this.getHomePage() + "?" + sourceParams.toString();
  }

  get notRecordingMessage() {
    return "Not Archiving this Tab";
  }

  static get styles() {
    return wrapCss(css`
      :host {
        width: 100%;
        height: 100%;
        font-size: initial !important;
      }

      .button {
        height: 1.5em !important;
        background-color: aliceblue;
      }

      .smallest.button {
        margin: 0.25em;
        background-color: initial;
        padding: 6px 12px;
      }

      .rec-state {
        margin-right: 1em;
        flex: auto;
      }

      .status-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        padding-bottom: 0.5em;
        border-bottom: 1px solid lightgrey;
      }

      .view-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.5em;
        font-size: 1.1em;
      }

      .autopilot {
        justify-content: center;
      }

      .coll-select {
        align-items: center;
      }

      .dropdown-item {
        width: initial !important;
      }

      .coll.button {
        max-width: 120px;
      }

      .coll.button span {
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      .flex-form {
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
      }

      .flex-form * {
        padding: 0.5em;
      }

      .session-head {
        font-style: italic;
      }

      .underline {
        margin-top: 1em;
        border-bottom: 1px gray solid;
        margin-bottom: 0.5em;
      }

      .status th {
        padding-left: 0.5em;
      }

      .status {
        font-variant-caps: all-small-caps;
      }

      .status-sep {
        border-bottom: 1px solid black;
        width: 100%;
        height: 10px;
      }

      .status-ready {
        color: #459558;
        font-style: italic;
      }

      .status-autopilot {
        color: #3298dc;
        max-width: 330px;
        text-overflow: wrap;
        word-break: break-all;
      }

      .status-pending {
        color: #bb9f08;
        font-style: italic;
      }
      .error {
        font-size: 12px;
        color: maroon;
      }

      .error p {
        margin-bottom: 1em;
      }

      .error-msg {
        font-family: monospace;
        font-style: italic;
      }
    `);
  }

  renderStatus() {
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
    if (this.behaviorState === BEHAVIOR_RUNNING) {
      return html`<span class="status-autopilot"
        >Auto Recording,
        ${
          // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'RecPopup'.
          this.behaviorMsg
        }</span
      >`;
    }

    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
    if (this.recording) {
      return html`<b
          >${
            // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
            this.waitingForStop ? "Finishing " : ""
          }
          Archiving:&nbsp;</b
        >${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'. | TS2339 - Property 'status' does not exist on type 'RecPopup'.
          this.status?.numPending
            ? html`
                <span class="status-pending"
                  >${
                    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                    this.status.numPending
                  }
                  URLs
                  pending${
                    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
                    this.waitingForStop
                      ? "."
                      : ", please wait before loading a new page."
                  }</span
                >
              `
            : html` <span class="status-ready">Idle, Continue Browsing</span>`
        }`;
    }

    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'RecPopup'.
    if (this.failureMsg) {
      return html`
        <div class="error">
          <p>
            Sorry, there was an error starting archiving on this page. Please
            try again or try a different page.
          </p>
          <p class="error-msg">
            Error Details:
            <i
              >${
                // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'RecPopup'.
                this.failureMsg
              }</i
            >
          </p>
          <p>
            If the error persists, check the
            <a
              href="https://archiveweb.page/guide/troubleshooting/errors"
              target="_blank"
              >Common Errors and Issues</a
            >
            page in the guide for known issues and possible solutions.
          </p>
        </div>
      `;
    }

    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'.
    if (!this.canRecord) {
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'. | TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
      if (this.pageUrl?.startsWith(this.extRoot)) {
        return html`
          <p class="is-size-7">
            This page is part of the extension. You can view existing archived
            items from here. To start a new archiving session, click the
            <wr-icon .src="${wrRec}"></wr-icon> Start Archiving button and enter
            a new URL.
          </p>
        `;
      }

      return html`<i>Can't archive this page.</i>`;
    }

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
    if (this.waitingForStart) {
      return html`<i>Archiving will start after the page reloads...</i>`;
    }

    return html`<i>${this.notRecordingMessage}</i>`;
  }

  renderCollDropdown() {
    return html`
      <div class="coll-select">
        <div class="is-size-7">
          ${
            // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
            this.recording ? "Currently archiving" : "Save"
          }
          to:&nbsp;
        </div>
        <div
          class="dropdown ${
            // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
            this.collDrop === "show" ? "is-active" : ""
          }"
        >
          <div class="dropdown-trigger">
            <button
              @click="${this.onShowDrop}"
              class="coll button is-small"
              aria-haspopup="true"
              aria-controls="dropdown-menu"
              ?disabled="${
                // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
                this.recording
              }"
            >
              <span
                >${
                  // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
                  this.collTitle
                }</span
              >
              <span class="icon is-small">
                <wr-icon .src="${fasCaretDown}"></wr-icon>
              </span>
            </button>
          </div>
          ${
            // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
            !this.recording
              ? html` <div class="dropdown-menu" id="dropdown-menu" role="menu">
                  <div class="dropdown-content">
                    ${
                      // @ts-expect-error - TS2339 - Property 'allowCreate' does not exist on type 'RecPopup'.
                      this.allowCreate
                        ? html` <a
                              @click="${
                                // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
                                () => (this.collDrop = "create")
                              }"
                              class="dropdown-item"
                            >
                              <span class="icon is-small">
                                <wr-icon .src="${fasPlus}"></wr-icon> </span
                              >New Archiving Session
                            </a>
                            <hr class="dropdown-divider" />`
                        : ""
                    }
                    ${
                      // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'RecPopup'.
                      this.collections.map(
                        // @ts-expect-error - TS7006 - Parameter 'coll' implicitly has an 'any' type.
                        (coll) => html`
                          <a
                            @click=${this.onSelectColl}
                            data-title="${coll.title}"
                            data-id="${coll.id}"
                            class="dropdown-item"
                            >${coll.title}</a
                          >
                        `,
                      )
                    }
                  </div>
                </div>`
              : html``
          }
        </div>
      </div>
    `;
  }

  renderStartOpt() {
    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'. | TS2339 - Property 'recording' does not exist on type 'RecPopup'.
    if (!this.canRecord || this.recording) {
      return "";
    }

    return html`
      <div class="field">
        <label class="checkbox is-size-7">
          <input
            type="checkbox"
            ?disabled="${
              // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
              this.recording
            }"
            ?checked="${
              // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
              this.autorun
            }"
            @change="${this.onToggleAutoRun}"
          />
          Start With Autopilot
        </label>
      </div>
    `;
  }

  renderCollCreate() {
    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    if (this.collDrop !== "create") {
      return "";
    }

    return html`
      <div class="view-row is-marginless" style="background-color: #ddddff">
        <form @submit="${this.onNewColl}">
          <div class="flex-form">
            <label for="new-name" class="is-size-7 is-italic"
              >New Archiving Session:</label
            >
            <div class="control">
              <input
                class="input is-small"
                id="new-name"
                type="text"
                required
                placeholder="Enter Archiving Session Name"
              />
            </div>
            <button class="button is-small is-outlined" type="submit">
              <wr-icon .src=${fasCheck}></wr-icon>
            </button>
            <button
              @click="${() =>
                // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
                (this.collDrop = "")}"
              class="button is-small is-outlined"
              type="button"
            >
              <wr-icon .src=${fasX}></wr-icon>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    return html`
      <div class="container">
        <div class="status-row">
          <p class="rec-state">${this.renderStatus()}</p>
          <a
            target="_blank"
            href="https://archiveweb.page/guide/usage"
            class="smallest button is-small is-inverted"
          >
            <span class="icon is-small">
              <wr-icon size="1.0em" title="Guide" .src="${fasQ}"></wr-icon>
            </span>
          </a>
          <a
            target="_blank"
            href="${this.getHomePage()}"
            class="smallest button is-small is-inverted"
          >
            <span class="icon is-small">
              <wr-icon
                size="1.0em"
                title="Home - All Archives"
                .src="${fasHome}"
              ></wr-icon>
            </span>
          </a>
        </div>
        <div class="view-row">
          ${
            // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'.
            this.canRecord
              ? html`
                  ${this.renderCollDropdown()}
                  <button
                    autofocus
                    ?disabled=${this.actionButtonDisabled}
                    @click="${
                      // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
                      !this.recording ? this.onStart : this.onStop
                    }"
                    class="button"
                  >
                    <span class="icon">
                      ${
                        // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
                        !this.recording
                          ? html` <wr-icon .src=${wrRec}></wr-icon>`
                          : html` <wr-icon .src=${fasBox}></wr-icon>`
                      }
                    </span>
                    <span
                      >${
                        // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.

                        !this.recording ? "Start Archiving" : "Stop Archiving"
                      }</span
                    >
                  </button>
                `
              : ""
          }
        </div>
        ${this.renderCollCreate()}
        <div class="view-row is-marginless">
          <div>
            ${
              // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'RecPopup'.
              this.canRecord
                ? html` <p>
                    <a
                      target="_blank"
                      href="${this.getCollPage()}"
                      class="is-size-6"
                      >View Archived Pages</a
                    >
                  </p>`
                : ""
            }
          </div>
          ${this.renderStartOpt()}
        </div>

        ${
          // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
          this.recording
            ? html`
                <div class="view-row autopilot">
                  <button
                    @click="${this.onBehaviorToggle}"
                    ?disabled="${
                      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
                      this.behaviorState === BEHAVIOR_WAIT_LOAD ||
                      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
                      this.behaviorState === BEHAVIOR_DONE ||
                      // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
                      this.waitingForStop
                    }"
                    class="button ${
                      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
                      this.behaviorState === BEHAVIOR_DONE
                        ? "is-success"
                        : "is-info"
                    } is-small"
                  >
                    ${this.behaviorsButtonLabel}
                  </button>
                </div>
              `
            : ""
        }
        ${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'. | TS2339 - Property 'status' does not exist on type 'RecPopup'.
          this.status?.sizeTotal
            ? html`
                <div class="view-row underline">
                  <div class="session-head">Archived in this tab</div>
                  ${
                    // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'RecPopup'.
                    this.replayUrl
                      ? html`<a
                          target="_blank"
                          class="is-size-6"
                          href="${
                            // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'RecPopup'.
                            this.replayUrl
                          }"
                          >Replay Current Page</a
                        >`
                      : ""
                  }
                </div>
                <div class="view-row">
                  <table class="status">
                    <tr>
                      <td>Size Stored:</td>
                      <th>
                        ${
                          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                          prettyBytes(this.status.sizeNew)
                        }
                      </th>
                    </tr>
                    <tr>
                      <td>Size Loaded:</td>
                      <th>
                        ${
                          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                          prettyBytes(this.status.sizeTotal)
                        }
                      </th>
                    </tr>
                    <tr>
                      <td>Pages:</td>
                      <th>
                        ${
                          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                          this.status.numPages
                        }
                      </th>
                    </tr>
                    <tr>
                      <td>URLs:</td>
                      <th>
                        ${
                          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                          this.status.numUrls
                        }
                      </th>
                    </tr>

                    ${
                      // @ts-expect-error - TS2339 - Property 'behaviorResults' does not exist on type 'RecPopup'.
                      this.behaviorResults &&
                      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
                      this.behaviorState !== BEHAVIOR_WAIT_LOAD &&
                      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
                      this.behaviorState !== BEHAVIOR_READY_START
                        ? html` <tr class="status-sep">
                              <td></td>
                              <td></td>
                            </tr>
                            ${
                              // @ts-expect-error - TS2339 - Property 'behaviorResults' does not exist on type 'RecPopup'.
                              Object.entries(this.behaviorResults).map(
                                ([name, value]) =>
                                  html` <tr>
                                    <td>${name}</td>
                                    <th>${value}</th>
                                  </tr>`,
                              )
                            }`
                        : ""
                    }
                  </table>
                </div>
              `
            : html``
        }
      </div>
    `;
  }

  get actionButtonDisabled() {
    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    if (this.collDrop === "create") {
      return true;
    }

    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'. | TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'. | TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
    return !this.recording ? this.waitingForStart : this.waitingForStop;
  }

  get behaviorsButtonLabel() {
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'RecPopup'.
    switch (this.behaviorState) {
      case BEHAVIOR_READY_START:
        return html` <wr-icon style="fill: white" .src="${fasPlay}"></wr-icon>
          &nbsp;Start Autopilot!`;

      case BEHAVIOR_RUNNING:
        return html` <wr-icon style="fill: white" .src="${fasPause}"></wr-icon>
          &nbsp;Pause Autopilot`;

      case BEHAVIOR_PAUSED:
        return html` <wr-icon style="fill: white" .src="${fasPlay}"></wr-icon>
          &nbsp;Unpause Autopilot`;

      case BEHAVIOR_DONE:
        return html` <wr-icon style="fill: white" .src="${fasCheck}"></wr-icon>
          &nbsp;Autopilot Done`;

      case BEHAVIOR_WAIT_LOAD:
      default:
        return "Autopilot: Waiting for page to load...";
    }
  }

  onStart() {
    this.sendMessage({
      type: "startRecording",
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
      collId: this.collId,
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'RecPopup'.
      url: this.pageUrl,
      // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
      autorun: this.autorun,
    });
    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
    this.waitingForStart = true;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
    this.waitingForStop = false;
  }

  onStop() {
    this.sendMessage({ type: "stopRecording" });
    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'.
    this.waitingForStart = false;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
    this.waitingForStop = true;
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  async onToggleAutoRun(event) {
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
    this.autorun = event.currentTarget.checked;
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'RecPopup'.
    await setLocalOption("autorunBehaviors", this.autorun ? "1" : "0");
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  async onSelectColl(event) {
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
    this.collId = event.currentTarget.getAttribute("data-id");
    // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'RecPopup'.
    this.collTitle = event.currentTarget.getAttribute("data-title");
    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    this.collDrop = "";

    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'. | TS2339 - Property 'collId' does not exist on type 'RecPopup'.
    await setLocalOption(`${this.tabId}-collId`, this.collId);
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'RecPopup'.
    await setLocalOption("defaultCollId", this.collId);
  }

  onBehaviorToggle() {
    this.sendMessage({ type: "toggleBehaviors" });
  }

  // @ts-expect-error - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onShowDrop(event) {
    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    this.collDrop = "show";
    event.stopPropagation();
    event.preventDefault();
  }

  onNewColl() {
    // @ts-expect-error - TS2531 - Object is possibly 'null'. | TS2339 - Property 'value' does not exist on type 'Element'.
    const title = this.renderRoot.querySelector("#new-name").value;

    this.sendMessage({
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
      tabId: this.tabId,
      type: "newColl",
      title,
    });
    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'RecPopup'.
    removeLocalOption(`${this.tabId}-collId`);
    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'RecPopup'.
    this.collDrop = "";
  }
}

// ===========================================================================
class WrIcon extends LitElement {
  constructor() {
    super();
    // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'.
    this.size = "0.9em";
  }

  static get properties() {
    return {
      src: { type: Object },
      size: { type: String },
    };
  }

  render() {
    return html`
      <svg
        style="width: ${
          // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'. | TS2339 - Property 'size' does not exist on type 'WrIcon'.
          this.size
        }; height: ${
          // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'. | TS2339 - Property 'size' does not exist on type 'WrIcon'.
          this.size
        }"
      >
        <g>
          ${
            // @ts-expect-error - TS2339 - Property 'src' does not exist on type 'WrIcon'.
            unsafeSVG(this.src)
          }
        </g>
      </svg>
    `;
  }
}

customElements.define("wr-icon", WrIcon);
customElements.define("wr-popup-viewer", RecPopup);

export { RecPopup };
```


## src\recorder.ts

```ts
import { RequestResponseInfo } from "./requestresponseinfo";

import {
  getCustomRewriter,
  rewriteDASH,
  rewriteHLS,
  removeRangeAsQuery,
} from "@webrecorder/wabac";

import { Buffer } from "buffer";

// @ts-expect-error - Missing types
import behaviors from "browsertrix-behaviors/dist/behaviors.js";
import extractPDF from "@/static/extractPDF.js";

import {
  BEHAVIOR_WAIT_LOAD,
  BEHAVIOR_READY_START,
  BEHAVIOR_RUNNING,
  BEHAVIOR_PAUSED,
  BEHAVIOR_DONE,
} from "./consts";
import { getLocalOption } from "./localstorage";

const encoder = new TextEncoder();

const MAX_CONCURRENT_FETCH = 6;

const MAIN_INJECT_URL = "__awp_main_inject__";

const IFRAME_INJECT_URL = "__awp_iframe_inject__";

const BEHAVIOR_LOG_FUNC = "__bx_log";

// ===========================================================================
// @ts-expect-error - TS7006 - Parameter 'time' implicitly has an 'any' type.
function sleep(time) {
  // @ts-expect-error - TS2794 - Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}

type FetchEntry = {
  url: string;
  headers?: Headers;
  rangeReplaced?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessions?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageInfo?: any;

  rangeRemoved?: boolean;
  doRangeCheck?: boolean;
  redirectOnly?: boolean;
};

// ===========================================================================
class Recorder {
  archiveStorage = false;
  archiveCookies = false;
  archiveFlash = false;
  archiveScreenshots = false;
  archivePDF = false;

  _fetchQueue: FetchEntry[] = [];

  constructor() {
    // @ts-expect-error - TS2339 - Property 'flatMode' does not exist on type 'Recorder'.
    this.flatMode = false;

    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'Recorder'.
    this.collId = "";

    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    this.pendingRequests = {};
    // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'Recorder'.
    this.numPending = 0;

    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
    this.running = false;
    // @ts-expect-error - TS2339 - Property 'stopping' does not exist on type 'Recorder'.
    this.stopping = false;

    // @ts-expect-error - TS2339 - Property 'frameId' does not exist on type 'Recorder'.
    this.frameId = null;
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    this.pageInfo = { size: 0 };
    // @ts-expect-error - TS2339 - Property 'firstPageStarted' does not exist on type 'Recorder'.
    this.firstPageStarted = false;

    // @ts-expect-error - TS2339 - Property 'sizeNew' does not exist on type 'Recorder'.
    this.sizeNew = 0;
    // @ts-expect-error - TS2339 - Property 'sizeTotal' does not exist on type 'Recorder'.
    this.sizeTotal = 0;
    // @ts-expect-error - TS2339 - Property 'numPages' does not exist on type 'Recorder'.
    this.numPages = 0;
    // @ts-expect-error - TS2339 - Property 'numUrls' does not exist on type 'Recorder'.
    this.numUrls = 0;

    // @ts-expect-error - TS2339 - Property 'historyMap' does not exist on type 'Recorder'.
    this.historyMap = {};

    // @ts-expect-error - TS2339 - Property '_promises' does not exist on type 'Recorder'.
    this._promises = {};

    // @ts-expect-error - TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
    this._fetchPending = new Map();

    // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
    this._fetchUrls = new Set();

    // @ts-expect-error - TS2339 - Property '_bindings' does not exist on type 'Recorder'.
    this._bindings = {};

    // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
    this.pdfLoadURL = null;

    // @ts-expect-error - TS2339 - Property 'pixelRatio' does not exist on type 'Recorder'.
    this.pixelRatio = 1;

    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'Recorder'.
    this.failureMsg = null;

    // @ts-expect-error - TS2339 - Property 'id' does not exist on type 'Recorder'.
    this.id = 1;
    // @ts-expect-error - TS2551 - Property 'sessionSet' does not exist on type 'Recorder'. Did you mean 'sessionClose'?
    this.sessionSet = new Set();

    // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
    this._cachePageInfo = null;
    // @ts-expect-error - TS2339 - Property '_cacheSessionNew' does not exist on type 'Recorder'.
    this._cacheSessionNew = 0;
    // @ts-expect-error - TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'.
    this._cacheSessionTotal = 0;

    // @ts-expect-error - TS2339 - Property 'behaviorInitStr' does not exist on type 'Recorder'.
    this.behaviorInitStr = JSON.stringify({
      autofetch: true,
      autoplay: true,
      autoscroll: true,
      siteSpecific: true,
      log: BEHAVIOR_LOG_FUNC,
    });

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
    // @ts-expect-error - TS2339 - Property 'behaviorData' does not exist on type 'Recorder'.
    this.behaviorData = null;
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'Recorder'.
    this.autorun = false;

    // @ts-expect-error - TS2339 - Property 'defaultFetchOpts' does not exist on type 'Recorder'.
    this.defaultFetchOpts = {
      redirect: "manual",
    };

    this.initOpts();
  }

  async initOpts() {
    this.archiveCookies = (await getLocalOption("archiveCookies")) === "1";
    this.archiveStorage = (await getLocalOption("archiveStorage")) === "1";
    this.archiveFlash = (await getLocalOption("archiveFlash")) === "1";
    this.archiveScreenshots =
      (await getLocalOption("archiveScreenshots")) === "1";
    this.archivePDF = (await getLocalOption("archivePDF")) === "1";
  }

  // @ts-expect-error - TS7006 - Parameter 'autorun' implicitly has an 'any' type.
  setAutoRunBehavior(autorun) {
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'Recorder'.
    this.autorun = autorun;
  }

  // @ts-expect-error - TS7006 - Parameter 'path' implicitly has an 'any' type.
  addExternalInject(path) {
    return `
    (function () {
      window.addEventListener("DOMContentLoaded", () => {
        const e = document.createElement("script");
        e.src = "${
          // @ts-expect-error - TS2339 - Property 'getExternalInjectURL' does not exist on type 'Recorder'.
          this.getExternalInjectURL(path)
        }";
        document.head.appendChild(e);
      });
    })();
    `;
  }

  getInjectScript() {
    return (
      behaviors +
      `;
    self.__bx_behaviors.init(${
      // @ts-expect-error - TS2339 - Property 'behaviorInitStr' does not exist on type 'Recorder'.
      this.behaviorInitStr
    });

    window.addEventListener("beforeunload", () => {});\n` +
      (this.archiveFlash ? this.getFlashInjectScript() : "")
    );
  }

  getFlashInjectScript() {
    return (
      `
    (() => {
      const description = "Shockwave Flash 32.0 r0";
      const enabledPlugin = { description };
      navigator.plugins["Shockwave Flash"] = { description };
      function addPlugin(type, suffixes) {
        const mime = { enabledPlugin, description: "", type, suffixes};
        navigator.mimeTypes[type] = mime;
        navigator.mimeTypes[navigator.mimeTypes.length] = mime;
      }
      addPlugin("application/futuresplash", "sp1");
      addPlugin("application/x-shockwave-flash2-preview", "swf");
      addPlugin("application/x-shockwave-flash", "swf");
      addPlugin("application/vnd.adobe.flash-movie", "swf");
    })();
    ` + this.addExternalInject("ruffle/ruffle.js")
    );
  }

  async detach() {
    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
    if (!this.running) {
      return;
    }

    // @ts-expect-error - TS2339 - Property 'stopping' does not exist on type 'Recorder'.
    this.stopping = true;

    const domSnapshot = await this.getFullText(true);

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    if (this.behaviorState === BEHAVIOR_RUNNING) {
      this.toggleBehaviors();
    }

    try {
      await Promise.race([
        // @ts-expect-error - TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
        Promise.all(this._fetchPending.values()),
        sleep(15000),
      ]);
    } catch (e) {
      console.log(e);
    }

    try {
      // @ts-expect-error - TS2339 - Property '_doDetach' does not exist on type 'Recorder'.
      await this._doDetach();
    } catch (e) {
      console.log(e);
    }

    await this._stop(domSnapshot);
  }

  async _stop(domSnapshot = null) {
    // @ts-expect-error - TS2339 - Property '_updateStatusId' does not exist on type 'Recorder'.
    clearInterval(this._updateStatusId);
    // @ts-expect-error - TS2339 - Property '_loopId' does not exist on type 'Recorder'.
    clearInterval(this._loopId);
    // @ts-expect-error - TS2339 - Property '_bgFetchId' does not exist on type 'Recorder'.
    clearInterval(this._bgFetchId);

    this.flushPending();
    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
    this.running = false;
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    this.pendingRequests = {};
    // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'Recorder'.
    this.numPending = 0;

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    await this.commitPage(this.pageInfo, domSnapshot, true);

    // @ts-expect-error - TS2339 - Property '_cleaningUp' does not exist on type 'Recorder'.
    if (this._cleaningUp) {
      // @ts-expect-error - TS2339 - Property '_cleanupStaleWait' does not exist on type 'Recorder'.
      await this._cleanupStaleWait;
    } else {
      await this.doUpdateLoop();
    }

    // @ts-expect-error - TS2551 - Property '_doStop' does not exist on type 'Recorder'. Did you mean '_stop'?
    this._doStop();
  }

  async attach() {
    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
    if (this.running) {
      console.warn("Already Attached!");
      return;
    }

    // @ts-expect-error - TS2339 - Property '_doAttach' does not exist on type 'Recorder'.
    await this._doAttach();

    // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
    this.running = true;
    // @ts-expect-error - TS2339 - Property 'stopping' does not exist on type 'Recorder'.
    this.stopping = false;

    // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
    this._cachePageInfo = null;
    // @ts-expect-error - TS2339 - Property '_cacheSessionNew' does not exist on type 'Recorder'.
    this._cacheSessionNew = 0;
    // @ts-expect-error - TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'.
    this._cacheSessionTotal = 0;
    // @ts-expect-error - TS2339 - Property '_cleaningUp' does not exist on type 'Recorder'.
    this._cleaningUp = false;
    // @ts-expect-error - TS2339 - Property '_cleanupStaleWait' does not exist on type 'Recorder'.
    this._cleanupStaleWait = null;

    // @ts-expect-error - TS2339 - Property '_updateStatusId' does not exist on type 'Recorder'.
    this._updateStatusId = setInterval(() => this.updateStatus(), 1000);

    // @ts-expect-error - TS2339 - Property '_loopId' does not exist on type 'Recorder'.
    this._loopId = setInterval(() => this.updateLoop(), 10000);

    // @ts-expect-error - TS2339 - Property '_bgFetchId' does not exist on type 'Recorder'.
    this._bgFetchId = setInterval(() => this.doBackgroundFetch(), 10000);
  }

  updateLoop() {
    // @ts-expect-error - TS2339 - Property '_cleaningUp' does not exist on type 'Recorder'.
    if (!this._cleaningUp) {
      // @ts-expect-error - TS2339 - Property '_cleanupStaleWait' does not exist on type 'Recorder'.
      this._cleanupStaleWait = this.doUpdateLoop();
    }
  }

  async doUpdateLoop() {
    // @ts-expect-error - TS2339 - Property '_cleaningUp' does not exist on type 'Recorder'.
    this._cleaningUp = true;

    try {
      // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
      for (const key of Object.keys(this.pendingRequests)) {
        // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
        const reqresp = this.pendingRequests[key];

        if (!reqresp) {
          continue;
        }

        // @ts-expect-error - TS2362 - The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
        if (new Date() - reqresp._created > 20000) {
          if (this.noResponseForStatus(reqresp.status)) {
            console.log("Dropping stale: " + key);
          } else if (!reqresp.awaitingPayload) {
            console.log(`Committing stale ${reqresp.status} ${reqresp.url}`);
            await this.fullCommit(reqresp, []);
          } else {
            console.log(`Waiting for payload for ${reqresp.url}`);
            continue;
          }
          // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
          delete this.pendingRequests[key];
        }
      }

      // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
      if (this._cachePageInfo) {
        // @ts-expect-error - TS2339 - Property '_doAddPage' does not exist on type 'Recorder'. | TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
        await this._doAddPage(this._cachePageInfo);
        // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
        this._cachePageInfo = null;
      }

      // @ts-expect-error - TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'.
      if (this._cacheSessionTotal > 0) {
        // @ts-expect-error - TS2339 - Property '_doIncSizes' does not exist on type 'Recorder'. | TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'. | TS2339 - Property '_cacheSessionNew' does not exist on type 'Recorder'.
        await this._doIncSizes(this._cacheSessionTotal, this._cacheSessionNew);
        // @ts-expect-error - TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'.
        this._cacheSessionTotal = 0;
        // @ts-expect-error - TS2339 - Property '_cacheSessionNew' does not exist on type 'Recorder'.
        this._cacheSessionNew = 0;
      }
    } finally {
      // @ts-expect-error - TS2339 - Property '_cleaningUp' does not exist on type 'Recorder'.
      this._cleaningUp = false;
    }
  }

  updateStatus() {
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    const networkPending = Object.keys(this.pendingRequests).length;
    // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'Recorder'. | TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
    this.numPending = networkPending + this._fetchPending.size;

    // @ts-expect-error - TS2339 - Property '_loadedDoneResolve' does not exist on type 'Recorder'.
    if (networkPending === 0 && this._loadedDoneResolve) {
      // @ts-expect-error - TS2339 - Property '_loadedDoneResolve' does not exist on type 'Recorder'.
      this._loadedDoneResolve();
    }

    // @ts-expect-error - TS2551 - Property 'doUpdateStatus' does not exist on type 'Recorder'. Did you mean 'updateStatus'?
    this.doUpdateStatus();
  }

  getStatusMsg() {
    return {
      // @ts-expect-error - TS2339 - Property 'running' does not exist on type 'Recorder'.
      recording: this.running,
      // @ts-expect-error - TS2339 - Property 'firstPageStarted' does not exist on type 'Recorder'.
      firstPageStarted: this.firstPageStarted,
      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
      behaviorState: this.behaviorState,
      // @ts-expect-error - TS2339 - Property 'behaviorData' does not exist on type 'Recorder'.
      behaviorData: this.behaviorData,
      // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'Recorder'.
      autorun: this.autorun,
      // @ts-expect-error - TS2339 - Property 'sizeTotal' does not exist on type 'Recorder'.
      sizeTotal: this.sizeTotal,
      // @ts-expect-error - TS2339 - Property 'sizeNew' does not exist on type 'Recorder'.
      sizeNew: this.sizeNew,
      // @ts-expect-error - TS2339 - Property 'numUrls' does not exist on type 'Recorder'.
      numUrls: this.numUrls,
      // @ts-expect-error - TS2339 - Property 'numPages' does not exist on type 'Recorder'.
      numPages: this.numPages,
      // @ts-expect-error - TS2339 - Property 'numPending' does not exist on type 'Recorder'.
      numPending: this.numPending,
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      favIconUrl: this.pageInfo.favIconUrl,
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      pageTitle: this.pageInfo.title,
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      pageUrl: this.pageInfo.url,
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      pageTs: this.pageInfo.ts,
      // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'Recorder'.
      failureMsg: this.failureMsg,
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'Recorder'.
      collId: this.collId,
      // @ts-expect-error - TS2339 - Property 'stopping' does not exist on type 'Recorder'.
      stopping: this.stopping,
      // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'Recorder'.
      tabId: this.tabId,
      type: "status",
    };
  }

  async _doInjectTopFrame() {
    await this.newDocEval(MAIN_INJECT_URL, this.getInjectScript());

    // @ts-expect-error - TS7031 - Binding element 'data' implicitly has an 'any' type. | TS7031 - Binding element 'type' implicitly has an 'any' type.
    await this.exposeFunction(BEHAVIOR_LOG_FUNC, ({ data, type }) => {
      switch (type) {
        case "info":
          // @ts-expect-error - TS2339 - Property 'behaviorData' does not exist on type 'Recorder'.
          this.behaviorData = data;
          //console.log("bx log", JSON.stringify(data));
          this.updateStatus();
          break;
      }
    });
  }

  // @ts-expect-error - TS7006 - Parameter 'name' implicitly has an 'any' type. | TS7006 - Parameter 'source' implicitly has an 'any' type.
  async newDocEval(name, source) {
    source += "\n\n//# sourceURL=" + name;
    // @ts-expect-error - TS2345 - Argument of type '{ source: any; }' is not assignable to parameter of type 'null | undefined'.
    await this.send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  // @ts-expect-error - TS7006 - Parameter 'name' implicitly has an 'any' type. | TS7006 - Parameter 'expression' implicitly has an 'any' type.
  pageEval(name, expression, sessions = []) {
    expression += "\n\n//# sourceURL=" + name;
    return this.send(
      "Runtime.evaluate",
      // @ts-expect-error - TS2345 - Argument of type '{ expression: any; userGesture: boolean; includeCommandLineAPI: boolean; allowUnsafeEvalBlockedByCSP: boolean; awaitPromise: boolean; }' is not assignable to parameter of type 'null | undefined'.
      {
        expression,
        userGesture: true,
        includeCommandLineAPI: true,
        allowUnsafeEvalBlockedByCSP: true,
        //replMode: true,
        awaitPromise: true,
        //returnByValue: true,
      },
      sessions,
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async _doInjectIframe(sessions) {
    try {
      //console.log("inject to: " + sessions[0]);
      await this.pageEval(IFRAME_INJECT_URL, this.getInjectScript(), sessions);
    } catch (e) {
      console.warn(e);
    }
  }

  toggleBehaviors() {
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    switch (this.behaviorState) {
      case BEHAVIOR_WAIT_LOAD:
      case BEHAVIOR_DONE:
        break;

      case BEHAVIOR_READY_START:
        this.pageEval(
          "__awp_behavior_run__",
          "self.__bx_behaviors.run();",
          // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
        ).then(() => (this.behaviorState = BEHAVIOR_DONE));
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
        this.behaviorState = BEHAVIOR_RUNNING;
        break;

      case BEHAVIOR_RUNNING:
        this.pageEval(
          "__awp_behavior_unpause__",
          "self.__bx_behaviors.pause();",
        );
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
        this.behaviorState = BEHAVIOR_PAUSED;
        break;

      case BEHAVIOR_PAUSED:
        this.pageEval(
          "__awp_behavior_unpause__",
          "self.__bx_behaviors.unpause();",
        );
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
        this.behaviorState = BEHAVIOR_RUNNING;
        break;
    }

    this.updateStatus();
  }

  // @ts-expect-error - TS7006 - Parameter 'name' implicitly has an 'any' type. | TS7006 - Parameter 'func' implicitly has an 'any' type.
  async exposeFunction(name, func, sessions = []) {
    // @ts-expect-error - TS2339 - Property '_bindings' does not exist on type 'Recorder'.
    this._bindings[name] = func;
    // @ts-expect-error - TS2345 - Argument of type '{ name: any; }' is not assignable to parameter of type 'null | undefined'.
    await this.send("Runtime.addBinding", { name }, sessions);

    //await this.newDocEval("__awp_binding_wrap__", `
    //self._${name} = (args) => self.${name}(JSON.stringify(args));`, sessions);
  }

  loaded() {
    // @ts-expect-error - TS2551 - Property '_loaded' does not exist on type 'Recorder'. Did you mean 'loaded'?
    this._loaded = new Promise(
      // @ts-expect-error - TS2339 - Property '_loadedDoneResolve' does not exist on type 'Recorder'.
      (resolve) => (this._loadedDoneResolve = resolve),
    );
    // @ts-expect-error - TS2551 - Property '_loaded' does not exist on type 'Recorder'. Did you mean 'loaded'?
    return this._loaded;
  }

  async start() {
    // @ts-expect-error - TS2339 - Property 'firstPageStarted' does not exist on type 'Recorder'.
    this.firstPageStarted = false;

    await this.send("Page.enable");

    await this.send("DOMSnapshot.enable");

    await this.initPixRatio();

    await this._doInjectTopFrame();

    await this.sessionInit([]);

    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'Recorder'.
    this.failureMsg = null;
  }

  async initPixRatio() {
    const { result } = await this.pageEval(
      "__awp_get_pix_ratio",
      "window.devicePixelRatio",
    );
    if (result && result.type === "number") {
      // @ts-expect-error - TS2339 - Property 'pixelRatio' does not exist on type 'Recorder'.
      this.pixelRatio = result.value;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async sessionInit(sessions) {
    try {
      await this.send("Network.enable", null, sessions);

      try {
        await this.send(
          "Fetch.enable",
          // @ts-expect-error - TS2345 - Argument of type '{ patterns: { urlPattern: string; requestStage: string; }[]; }' is not assignable to parameter of type 'null | undefined'.
          { patterns: [{ urlPattern: "*", requestStage: "Response" }] },
          sessions,
        );
      } catch (e) {
        console.log("No Fetch Available", e);
      }

      try {
        await this.send("Media.enable", null, sessions);
      } catch (e) {
        console.log("No media events available");
      }

      await this.send(
        "Target.setAutoAttach",
        // @ts-expect-error - TS2345 - Argument of type '{ autoAttach: boolean; waitForDebuggerOnStart: boolean; flatten: any; }' is not assignable to parameter of type 'null | undefined'.
        {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          // @ts-expect-error - TS2339 - Property 'flatMode' does not exist on type 'Recorder'.
          flatten: this.flatMode,
        },
        sessions,
      );

      // disable cache for now?
      await this.send(
        "Network.setCacheDisabled",
        // @ts-expect-error - TS2345 - Argument of type '{ cacheDisabled: boolean; }' is not assignable to parameter of type 'null | undefined'.
        { cacheDisabled: true },
        sessions,
      );
      await this.send(
        "Network.setBypassServiceWorker",
        // @ts-expect-error - TS2345 - Argument of type '{ bypass: boolean; }' is not assignable to parameter of type 'null | undefined'.
        { bypass: true },
        sessions,
      );
      // another option: clear cache, but don't disable
      await this.send("Network.clearBrowserCache", null, sessions);
    } catch (e) {
      console.warn("Session Init Error: ");
      console.log(e);
    }
  }

  async sessionClose(sessions = []) {
    await this.send("Page.disable");
    await this.send("DOMSnapshot.disable");

    await this.send("Debugger.disable");

    await this.send("Network.disable", null, sessions);

    await this.send("Fetch.disable", null, sessions);

    try {
      await this.send("Media.disable", null, sessions);
    } catch (e) {
      // ignore
    }

    // @ts-expect-error - TS2345 - Argument of type '{ autoAttach: boolean; waitForDebuggerOnStart: boolean; }' is not assignable to parameter of type 'null | undefined'.
    await this.send("Target.setAutoAttach", {
      autoAttach: false,
      waitForDebuggerOnStart: false,
    });

    await this.send(
      "Network.setBypassServiceWorker",
      // @ts-expect-error - TS2345 - Argument of type '{ bypass: boolean; }' is not assignable to parameter of type 'null | undefined'.
      { bypass: false },
      sessions,
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'requestId' implicitly has an 'any' type.
  pendingReqResp(requestId, reuseOnly = false) {
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    if (!this.pendingRequests[requestId]) {
      if (reuseOnly || !requestId) {
        return null;
      }
      // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
      this.pendingRequests[requestId] = new RequestResponseInfo(requestId);
      // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    } else if (requestId !== this.pendingRequests[requestId].requestId) {
      console.error("Wrong Req Id!");
    }

    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    return this.pendingRequests[requestId];
  }

  // @ts-expect-error - TS7006 - Parameter 'requestId' implicitly has an 'any' type.
  removeReqResp(requestId) {
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    const reqresp = this.pendingRequests[requestId];
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    delete this.pendingRequests[requestId];
    return reqresp;
  }

  // @ts-expect-error - TS7006 - Parameter 'method' implicitly has an 'any' type. | TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async processMessage(method, params, sessions) {
    switch (method) {
      case "Target.attachedToTarget":
        sessions.push(params.sessionId);

        try {
          // @ts-expect-error - TS2551 - Property 'sessionSet' does not exist on type 'Recorder'. Did you mean 'sessionClose'?
          this.sessionSet.add(params.sessionId);

          const type = params.targetInfo.type;

          const allowAttach = type !== "service_worker";

          if (allowAttach) {
            await this.sessionInit(sessions);
          }

          if (params.waitingForDebugger) {
            await this.send("Runtime.runIfWaitingForDebugger", null, sessions);
          }

          if (allowAttach) {
            console.log(
              "Target Attached: " +
                type +
                " " +
                params.targetInfo.url +
                " " +
                params.sessionId,
            );

            if (type === "page" || type === "iframe") {
              await this._doInjectIframe(sessions);
            }
          } else {
            console.log(
              "Not allowed attach for: " +
                type +
                " " +
                params.targetInfo.url +
                " " +
                params.sessionId,
            );

            // @ts-expect-error - TS2339 - Property 'flatMode' does not exist on type 'Recorder'.
            const params2 = this.flatMode
              ? { sessionId: params.sessionId }
              : { targetId: params.targetInfo.targetId };
            await this.send(
              "Runtime.runIfWaitingForDebugger",
              // @ts-expect-error - TS2345 - Argument of type '{ sessionId: any; targetId?: undefined; } | { targetId: any; sessionId?: undefined; }' is not assignable to parameter of type 'null | undefined'.
              params2,
              sessions,
            );
          }
        } catch (e) {
          console.log(e);
          console.warn(
            "Error attaching target: " +
              params.targetInfo.type +
              " " +
              params.targetInfo.url,
          );
        }
        break;

      case "Target.detachedFromTarget":
        console.log("Detaching from: " + params.sessionId);
        // @ts-expect-error - TS2551 - Property 'sessionSet' does not exist on type 'Recorder'. Did you mean 'sessionClose'?
        this.sessionSet.delete(params.sessionId);
        break;

      case "Target.receivedMessageFromTarget":
        // @ts-expect-error - TS2551 - Property 'sessionSet' does not exist on type 'Recorder'. Did you mean 'sessionClose'?
        if (!this.sessionSet.has(params.sessionId)) {
          console.warn("no such session: " + params.sessionId);
          console.warn(params);
          return;
        }
        sessions.push(params.sessionId);
        this.receiveMessageFromTarget(params, sessions);
        break;

      case "Network.responseReceived":
        if (params.response) {
          const reqresp = this.pendingReqResp(params.requestId, true);
          if (reqresp) {
            reqresp.fillResponseReceived(params);
          }
        }
        break;

      case "Network.loadingFinished":
        await this.handleLoadingFinished(params, sessions);
        break;

      case "Network.loadingFailed": {
        const reqresp = this.removeReqResp(params.requestId);
        if (reqresp && reqresp.status !== 206) {
          // check if this is a false positive -- a valid download that's already been fetched
          // the abort is just for page, but download will succeed
          if (
            params.type === "Document" &&
            params.errorText === "net::ERR_ABORTED" &&
            reqresp.isValidBinary()
          ) {
            this.fullCommit(reqresp, sessions);
          } else {
            console.log(
              `Loading Failed for: ${reqresp.url} ${params.errorText}`,
            );
          }
        }
        break;
      }

      case "Network.requestServedFromCache":
        this.removeReqResp(params.requestId);
        break;

      case "Network.responseReceivedExtraInfo":
        {
          const reqresp = this.pendingReqResp(params.requestId, true);
          if (reqresp) {
            reqresp.fillResponseReceivedExtraInfo(params);
          }
        }
        break;

      case "Network.requestWillBeSent":
        await this.handleRequestWillBeSent(params);
        break;

      case "Network.requestWillBeSentExtraInfo":
        if (!this.shouldSkip(null, params.headers, null)) {
          this.pendingReqResp(params.requestId).requestHeaders = params.headers;
        }
        break;

      case "Fetch.requestPaused":
        await this.handlePaused(params, sessions);
        break;

      case "Page.frameNavigated":
        this.initPage(params, sessions);
        break;

      case "Page.loadEventFired":
        await this.updatePage(sessions);
        break;

      case "Page.navigatedWithinDocument":
        await this.updateHistory(sessions);
        break;

      case "Page.windowOpen":
        this.handleWindowOpen(params.url, sessions);
        break;

      case "Page.javascriptDialogOpening":
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
        if (this.behaviorState === BEHAVIOR_RUNNING) {
          // @ts-expect-error - TS2345 - Argument of type '{ accept: boolean; }' is not assignable to parameter of type 'null | undefined'.
          await this.send("Page.handleJavaScriptDialog", { accept: false });
        }
        break;

      case "Debugger.paused":
        // only unpause for beforeunload event
        // could be paused for regular breakpoint if debugging via devtools
        if (params.data && params.data.eventName === "listener:beforeunload") {
          await this.unpauseAndFinish(params);
        }
        break;

      case "Media.playerEventsAdded":
        this.parseMediaEventsAdded(params, sessions);
        break;

      case "Runtime.bindingCalled":
        // @ts-expect-error - TS2339 - Property '_bindings' does not exist on type 'Recorder'.
        if (this._bindings[params.name]) {
          // @ts-expect-error - TS2339 - Property '_bindings' does not exist on type 'Recorder'.
          this._bindings[params.name](JSON.parse(params.payload));
        }
        break;

      default:
        //if (method.startsWith("Target.")) {
        //  console.log(method, params);
        //}
        return false;
    }

    return true;
  }

  // @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  handleWindowOpen(url, sessions) {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    const headers = new Headers({ Referer: this.pageInfo.url });
    this.doAsyncFetch({ url, headers, redirectOnly: true }, sessions);
  }

  isPagePDF() {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    return this.pageInfo.mime === "application/pdf";
  }

  async extractPDFText() {
    let success = false;
    // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
    console.log("pdfLoadURL", this.pdfLoadURL);
    // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
    if (this.pdfLoadURL) {
      const res = await this.pageEval(
        "__awp_pdf_extract__",
        `
      ${extractPDF};

      extractPDF("${
        // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
        this.pdfLoadURL
      }", "${
        // @ts-expect-error - TS2339 - Property 'getExternalInjectURL' does not exist on type 'Recorder'.
        this.getExternalInjectURL("")
      }");
      `,
      );

      if (res.result) {
        const { type, value } = res.result;
        if (type === "string") {
          // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
          this.pageInfo.text = value;
          success = true;
        }
      }
    }

    return success;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async savePDF(pageInfo: any) {
    // @ts-expect-error: ignore param
    await this.send("Emulation.setEmulatedMedia", { type: "screen" });

    // @ts-expect-error: ignore param
    const resp = await this.send("Page.printToPDF", { printBackground: true });

    // @ts-expect-error: ignore param
    await this.send("Emulation.setEmulatedMedia", { type: "" });

    const payload = Buffer.from(resp.data, "base64");
    const mime = "application/pdf";

    const fullData = {
      url: "urn:pdf:" + pageInfo.url,
      ts: new Date().getTime(),
      status: 200,
      statusText: "OK",
      pageId: pageInfo.id,
      mime,
      respHeaders: {
        "Content-Type": mime,
        "Content-Length": payload.length + "",
      },
      reqHeaders: {},
      payload,
      extraOpts: { resource: true },
    };

    console.log("pdf", payload.length);

    // @ts-expect-error - TS2339 - Property '_doAddResource' does not exist on type 'Recorder'.
    await this._doAddResource(fullData);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async saveScreenshot(pageInfo: any) {
    // View Screenshot
    const width = 1920;
    const height = 1080;

    // @ts-expect-error: ignore param
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 0,
      mobile: false,
    });
    // @ts-expect-error: ignore param
    const resp = await this.send("Page.captureScreenshot", { format: "png" });

    const payload = Buffer.from(resp.data, "base64");
    const blob = new Blob([payload], { type: "image/png" });

    await this.send("Emulation.clearDeviceMetricsOverride");

    const mime = "image/png";

    const fullData = {
      url: "urn:view:" + pageInfo.url,
      ts: new Date().getTime(),
      status: 200,
      statusText: "OK",
      pageId: pageInfo.id,
      mime,
      respHeaders: {
        "Content-Type": mime,
        "Content-Length": payload.length + "",
      },
      reqHeaders: {},
      payload,
      extraOpts: { resource: true },
    };

    const thumbWidth = 640;
    const thumbHeight = 360;

    const bitmap = await self.createImageBitmap(blob, {
      resizeWidth: thumbWidth,
      resizeHeight: thumbHeight,
    });

    const canvas = new OffscreenCanvas(thumbWidth, thumbWidth);
    const context = canvas.getContext("bitmaprenderer")!;
    context.transferFromImageBitmap(bitmap);

    const resizedBlob = await canvas.convertToBlob({ type: "image/png" });

    const thumbPayload = new Uint8Array(await resizedBlob.arrayBuffer());

    const thumbData = {
      ...fullData,
      url: "urn:thumbnail:" + pageInfo.url,
      respHeaders: {
        "Content-Type": mime,
        "Content-Length": thumbPayload.length + "",
      },
      payload: thumbPayload,
    };

    // @ts-expect-error - TS2339 - Property '_doAddResource' does not exist on type 'Recorder'.
    await this._doAddResource(fullData);

    // @ts-expect-error - TS2339 - Property '_doAddResource' does not exist on type 'Recorder'.
    await this._doAddResource(thumbData);
  }

  async getFullText(finishing = false) {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'. | TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    if (!this.pageInfo?.url) {
      return null;
    }

    if (this.isPagePDF() && !finishing) {
      await this.extractPDFText();
      return null;
    }

    try {
      // wait upto 10s for getDocument, otherwise proceed
      return await Promise.race([
        //this.send("DOM.getDocument", {"depth": -1, "pierce": true}),
        // @ts-expect-error - TS2345 - Argument of type '{ computedStyles: never[]; }' is not assignable to parameter of type 'null | undefined'.
        this.send("DOMSnapshot.captureSnapshot", { computedStyles: [] }),
        sleep(10000),
      ]);
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  async unpauseAndFinish(params) {
    let domSnapshot = null;

    // determine if this is the unload from the injected content script
    // if not, unpause but don't extract full text
    const ourUnload = params.callFrames[0].url === MAIN_INJECT_URL;

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    if (ourUnload && this.behaviorState !== BEHAVIOR_WAIT_LOAD) {
      domSnapshot = await this.getFullText(true);
    }

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    const currPage = this.pageInfo;

    try {
      await this.send("Debugger.resume");
    } catch (e) {
      console.warn(e);
    }

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    if (this.behaviorState === BEHAVIOR_RUNNING) {
      await this.toggleBehaviors();
    }

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    if (ourUnload && this.behaviorState !== BEHAVIOR_WAIT_LOAD) {
      this.flushPending();

      await this.commitPage(currPage, domSnapshot, true);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'currPage' implicitly has an 'any' type. | TS7006 - Parameter 'domSnapshot' implicitly has an 'any' type. | TS7006 - Parameter 'finished' implicitly has an 'any' type.
  commitPage(currPage, domSnapshot, finished) {
    if (!currPage?.url || !currPage.ts || currPage.url === "about:blank") {
      return;
    }

    if (domSnapshot) {
      currPage.text = this.parseTextFromDOMSnapshot(domSnapshot);
    } else if (!currPage.text) {
      console.warn("No Full Text Update");
    }

    currPage.finished = finished;

    // @ts-expect-error - TS2339 - Property '_doAddPage' does not exist on type 'Recorder'.
    const res = this._doAddPage(currPage);
    // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
    if (currPage === this._cachePageInfo) {
      // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
      this._cachePageInfo = null;
    }
    return res;
  }

  // @ts-expect-error - TS7006 - Parameter 'data' implicitly has an 'any' type. | TS7006 - Parameter 'pageInfo' implicitly has an 'any' type.
  async commitResource(data, pageInfo) {
    const payloadSize = data.payload.length;
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    pageInfo = pageInfo || this.pageInfo;
    pageInfo.size += payloadSize;

    // @ts-expect-error - TS2339 - Property 'sizeTotal' does not exist on type 'Recorder'.
    this.sizeTotal += payloadSize;
    // @ts-expect-error - TS2339 - Property 'numUrls' does not exist on type 'Recorder'.
    this.numUrls++;

    // @ts-expect-error - TS2339 - Property '_doAddResource' does not exist on type 'Recorder'.
    const writtenSize = await this._doAddResource(data);

    // @ts-expect-error - TS2339 - Property 'sizeNew' does not exist on type 'Recorder'.
    this.sizeNew += writtenSize;

    // @ts-expect-error - TS2339 - Property '_cachePageInfo' does not exist on type 'Recorder'.
    this._cachePageInfo = pageInfo;
    // @ts-expect-error - TS2339 - Property '_cacheSessionTotal' does not exist on type 'Recorder'.
    this._cacheSessionTotal += payloadSize;
    // @ts-expect-error - TS2339 - Property '_cacheSessionNew' does not exist on type 'Recorder'.
    this._cacheSessionNew += writtenSize;
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  receiveMessageFromTarget(params, sessions) {
    const nestedParams = JSON.parse(params.message);

    if (nestedParams.id != undefined) {
      // @ts-expect-error - TS2339 - Property '_promises' does not exist on type 'Recorder'.
      const promise = this._promises[nestedParams.id];
      if (promise) {
        //if (DEBUG) {
        //  console.log("RECV " + promise.method + " " + params.message);
        //}
        if (nestedParams.error) {
          promise.reject(nestedParams.error);
        } else {
          promise.resolve(nestedParams.result);
        }
        // @ts-expect-error - TS2339 - Property '_promises' does not exist on type 'Recorder'.
        delete this._promises[nestedParams.id];
      }
    } else if (nestedParams.params != undefined) {
      //console.log("RECV MSG " + nestedParams.method + " " + nestedParams.message);
      this.processMessage(nestedParams.method, nestedParams.params, sessions);
    }
  }

  //from http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
  newPageId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  initPage(params, sessions) {
    if (params.frame.parentId) {
      return false;
    }

    //console.log("Page.frameNavigated: " + params.frame.url + " " + params.frame.id);
    // @ts-expect-error - TS2339 - Property 'frameId' does not exist on type 'Recorder'.
    if (this.frameId != params.frame.id) {
      // @ts-expect-error - TS2339 - Property 'historyMap' does not exist on type 'Recorder'.
      this.historyMap = {};
    }

    // @ts-expect-error - TS2339 - Property 'frameId' does not exist on type 'Recorder'.
    this.frameId = params.frame.id;
    // @ts-expect-error - TS2551 - Property 'loaderId' does not exist on type 'Recorder'. Did you mean 'loaded'?
    this.loaderId = params.frame.loaderId;

    this._initNewPage(params.frame.url, params.frame.mimeType);

    // @ts-expect-error - TS2551 - Property 'loaderId' does not exist on type 'Recorder'. Did you mean 'loaded'?
    const reqresp = this.removeReqResp(this.loaderId);
    if (reqresp) {
      this.fullCommit(reqresp, sessions);
    }

    return true;
  }

  initFirstPage() {
    // Disable debugger intercept due to occasional crashes on some pages
    // Enable unload pause only on first full page that is being recorded
    //await this.send("Debugger.enable");
    //await this.send("DOMDebugger.setEventListenerBreakpoint", {"eventName": "beforeunload"});
    this.updateStatus();
    // @ts-expect-error - TS2339 - Property 'firstPageStarted' does not exist on type 'Recorder'.
    this.firstPageStarted = true;
  }

  // @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type. | TS7006 - Parameter 'mime' implicitly has an 'any' type.
  _initNewPage(url, mime) {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    this.pageInfo = {
      id: this.newPageId(),
      url,
      ts: 0,
      title: "",
      text: "",
      size: 0,
      finished: false,
      favIconUrl: "",
      mime,
    };

    // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
    this.pdfLoadURL = null;

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
    // @ts-expect-error - TS2339 - Property 'behaviorData' does not exist on type 'Recorder'.
    this.behaviorData = null;

    // @ts-expect-error - TS2339 - Property 'numPages' does not exist on type 'Recorder'.
    this.numPages++;

    // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
    this._fetchUrls.clear();

    // @ts-expect-error - TS2339 - Property 'firstPageStarted' does not exist on type 'Recorder'.
    if (!this.firstPageStarted) {
      this.initFirstPage();
    }

    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
  }

  // @ts-expect-error - TS7006 - Parameter 'favIconUrl' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  loadFavIcon(favIconUrl, sessions) {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'. | TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    if (favIconUrl && this.pageInfo && this.pageInfo.favIconUrl != favIconUrl) {
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      this.pageInfo.favIconUrl = favIconUrl;

      this.doAsyncFetch({ url: favIconUrl }, sessions);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async updatePage(sessions) {
    //console.log("updatePage", this.pageInfo);

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    if (!this.pageInfo) {
      console.warn("no page info!");
    }

    const result = await this.send("Page.getNavigationHistory");
    const id = result.currentIndex;

    // allow duplicate pages for now
    //if (id !== result.entries.length - 1 || this.historyMap[id] === result.entries[id].url) {
    //  return;
    //}

    //await this.addText(false);

    // @ts-expect-error - TS2339 - Property 'historyMap' does not exist on type 'Recorder'.
    this.historyMap[id] = result.entries[id].url;

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    this.pageInfo.title = result.entries[id].title || result.entries[id].url;

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    const pageInfo = this.pageInfo;

    if (this.archiveScreenshots) {
      await this.saveScreenshot(pageInfo);
    }

    if (this.archivePDF) {
      await this.savePDF(pageInfo);
    }

    const [domSnapshot, favIcon] = await Promise.all([
      this.getFullText(),
      // @ts-expect-error - TS2339 - Property 'getFavIcon' does not exist on type 'Recorder'.
      this.getFavIcon(),
    ]);

    if (favIcon) {
      this.loadFavIcon(favIcon, sessions);
    }

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    await this.commitPage(this.pageInfo, domSnapshot, false);

    this.updateStatus();

    await this.loaded();

    // don't mark as ready if page changed
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    if (pageInfo === this.pageInfo) {
      // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'Recorder'.
      this.behaviorState = BEHAVIOR_READY_START;

      // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'Recorder'.
      if (this.autorun) {
        await this.toggleBehaviors();
      }
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async updateHistory(sessions) {
    if (sessions.length) {
      return;
    }

    const result = await this.send("Page.getNavigationHistory", null, sessions);
    const id = result.currentIndex;
    if (
      id === result.entries.length - 1 &&
      // @ts-expect-error - TS2339 - Property 'historyMap' does not exist on type 'Recorder'.
      this.historyMap[id] !== result.entries[id].url
    ) {
      //console.log("New History Entry: " + JSON.stringify(result.entries[id]));
      // @ts-expect-error - TS2339 - Property 'historyMap' does not exist on type 'Recorder'.
      this.historyMap[id] = result.entries[id].url;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'method' implicitly has an 'any' type. | TS7006 - Parameter 'headers' implicitly has an 'any' type. | TS7006 - Parameter 'resourceType' implicitly has an 'any' type.
  shouldSkip(method, headers, resourceType) {
    if (headers && !method) {
      method = headers[":method"];
    }

    if (method === "OPTIONS" || method === "HEAD") {
      return true;
    }

    if (["EventSource", "WebSocket", "Ping"].includes(resourceType)) {
      return true;
    }

    // beacon
    if (resourceType === "Other" && method === "POST") {
      return true;
    }

    // skip eventsource, resourceType may not be set correctly
    if (
      headers &&
      (headers["accept"] === "text/event-stream" ||
        headers["Accept"] === "text/event-stream")
    ) {
      return true;
    }

    return false;
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async handlePaused(params, sessions) {
    let continued = false;
    let reqresp: TODOFixMe = null;

    let skip = false;

    if (
      this.shouldSkip(
        params.request.method,
        params.request.headers,
        params.resourceType,
      )
    ) {
      skip = true;
    } else if (!params.responseStatusCode && !params.responseErrorReason) {
      skip = true;
    }

    try {
      if (!skip) {
        reqresp = await this.handleFetchResponse(params, sessions);

        try {
          if (reqresp?.payload) {
            continued = await this.rewriteResponse(params, reqresp, sessions);
          }
        } catch (e) {
          console.error("Fetch rewrite failed for: " + params.request.url);
          console.error(e);
        }
      }
    } catch (e) {
      console.warn(e);
    }

    if (!continued) {
      try {
        await this.send(
          "Fetch.continueResponse",
          // @ts-expect-error - TS2345 - Argument of type '{ requestId: any; }' is not assignable to parameter of type 'null | undefined'.
          { requestId: params.requestId },
          sessions,
        );
      } catch (e) {
        console.warn("Continue failed for: " + params.request.url, e);
      }
    }

    // if finished and matches current frameId, commit right away
    if (
      reqresp?.payload?.length &&
      // @ts-expect-error - TS2339 - Property 'frameId' does not exist on type 'Recorder'.
      params.frameId === this.frameId &&
      !isNaN(Number(reqresp.requestId))
    ) {
      this.removeReqResp(reqresp.requestId);
      this.fullCommit(reqresp, sessions);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'reqresp' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async rewriteResponse(params, reqresp, sessions) {
    if (!reqresp?.payload) {
      return false;
    }

    const payload = reqresp.payload;

    if (!payload.length) {
      return false;
    }

    let newString = null;
    let string = null;

    const { url, extraOpts } = reqresp;

    const ct = this._getContentType(params.responseHeaders);

    switch (ct) {
      case "application/x-mpegURL":
      case "application/vnd.apple.mpegurl":
        string = payload.toString("utf-8");
        newString = rewriteHLS(string, { save: reqresp.extraOpts });
        break;

      case "application/dash+xml":
        string = payload.toString("utf-8");
        newString = rewriteDASH(string, { save: reqresp.extraOpts });
        break;

      case "text/html":
      case "application/json":
      case "text/javascript":
      case "application/javascript":
      case "application/x-javascript": {
        const rw = getCustomRewriter(url, ct === "text/html");

        if (rw) {
          string = payload.toString();
          newString = rw.rewrite(string, { save: extraOpts });
        }
      }
    }

    if (!newString) {
      return false;
    }

    if (newString !== string) {
      reqresp.extraOpts.rewritten = 1;
      reqresp.payload = encoder.encode(newString);

      console.log("Rewritten Response for: " + params.request.url);
    }

    const base64Str = Buffer.from(newString).toString("base64");

    try {
      await this.send(
        "Fetch.fulfillRequest",
        // @ts-expect-error - TS2345 - Argument of type '{ requestId: any; responseCode: any; responseHeaders: any; body: string; }' is not assignable to parameter of type 'null | undefined'.
        {
          requestId: params.requestId,
          responseCode: params.responseStatusCode,
          responseHeaders: params.responseHeaders,
          body: base64Str,
        },
        sessions,
      );
      //console.log("Replace succeeded? for: " + params.request.url);
      return true;
    } catch (e) {
      console.warn("Fulfill Failed for: " + params.request.url + " " + e);
    }

    return false;
  }

  // @ts-expect-error - TS7006 - Parameter 'headers' implicitly has an 'any' type.
  _getContentType(headers) {
    for (const header of headers) {
      if (header.name.toLowerCase() === "content-type") {
        return header.value.split(";")[0];
      }
    }

    return null;
  }

  // @ts-expect-error - TS7006 - Parameter 'status' implicitly has an 'any' type.
  noResponseForStatus(status) {
    return !status || status === 204 || (status >= 300 && status < 400);
  }

  // @ts-expect-error - TS7006 - Parameter 'url' implicitly has an 'any' type.
  isValidUrl(url) {
    return url && (url.startsWith("https:") || url.startsWith("http:"));
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async handleLoadingFinished(params, sessions) {
    const reqresp = this.removeReqResp(params.requestId);

    if (!reqresp?.url) {
      //console.log("unknown request finished: " + params.requestId);
      return;
    }

    if (!this.isValidUrl(reqresp.url)) {
      return;
    }

    let payload = reqresp.payload;

    if (!reqresp.fetch && !payload) {
      // empty response, don't attempt to store it
      if (params.encodedDataLength) {
        payload = await this.fetchPayloads(
          params,
          reqresp,
          sessions,
          "Network.getResponseBody",
        );
      }
      if (!payload?.length) {
        return;
      }
      reqresp.payload = payload;
    }

    this.fullCommit(reqresp, sessions);
  }

  // @ts-expect-error - TS7006 - Parameter 'reqresp' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async fullCommit(reqresp, sessions) {
    //const requestId = reqresp.requestId;

    // let doneResolve;

    // const pending = new Promise((resolve) => {
    //   doneResolve = resolve;
    // });

    //this._fetchPending.set(requestId, pending);

    try {
      const data = reqresp.toDBRecord(
        reqresp.payload,
        // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
        this.pageInfo,
        this.archiveCookies,
      );

      // top-level URL is a non-GET request
      if (
        data?.requestUrl &&
        // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
        data.requestUrl === this.pageInfo.url &&
        !sessions.length
      ) {
        // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
        this.pageInfo.url = data.url;
      }

      // top-level page resource
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      if (data && !sessions.length && reqresp.url === this.pageInfo.url) {
        // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
        this.pageInfo.ts = reqresp.ts;

        if (
          data.mime === "application/pdf" &&
          reqresp.payload &&
          // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
          this.pageInfo
        ) {
          // ensure set for electron
          // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
          this.pageInfo.mime = "application/pdf";
          // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
          this.pdfLoadURL = reqresp.url;
        } else {
          if (!data.extraOpts) {
            data.extraOpts = {};
          }

          // @ts-expect-error - TS2339 - Property 'pixelRatio' does not exist on type 'Recorder'.
          data.extraOpts.pixelRatio = this.pixelRatio;

          // handle storage
          const storage = await this.getStorage(sessions);

          if (storage) {
            data.extraOpts.storage = storage;
          }
        }
      }

      if (data) {
        // @ts-expect-error - TS2554 - Expected 2 arguments, but got 1.
        await this.commitResource(data);
      }
    } catch (e) {
      console.log("error committing", e);
    }

    //doneResolve();
    //delete this._fetchPending[requestId];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getStorage(sessions: any) {
    // check if recording storage is allowed
    if (!this.archiveStorage) {
      return null;
    }

    const extractStorage = () => {
      const local: [string, string][] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key);
        if (!value) continue;
        local.push([key, value]);
      }
      const session: [string, string][] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        const value = sessionStorage.getItem(key);
        if (!value) continue;
        session.push([key, value]);
      }
      return JSON.stringify({ local, session });
    };

    const { result } = await this.pageEval(
      "__awp_extract_storage",
      `(${extractStorage.toString()})();`,
      sessions,
    );

    if (result && result.type === "string") {
      return result.value;
    } else {
      return null;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  async handleRequestWillBeSent(params) {
    if (
      this.shouldSkip(
        params.request.method,
        params.request.headers,
        params.type,
      )
    ) {
      this.removeReqResp(params.requestId);
      return;
    }

    const reqresp = this.pendingReqResp(params.requestId);

    let data = null;

    if (params.redirectResponse) {
      if (reqresp.isSelfRedirect()) {
        console.warn(`Skip self redirect: ${reqresp.url}`);
        this.removeReqResp(params.requestId);
        return;
      }

      reqresp.fillResponseRedirect(params);
      // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
      data = reqresp.toDBRecord(null, this.pageInfo, this.archiveCookies);
    }

    reqresp.fillRequest(params);

    // commit redirect response, if any
    if (data) {
      // @ts-expect-error - TS2554 - Expected 2 arguments, but got 1.
      await this.commitResource(data);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async handleFetchResponse(params, sessions) {
    if (!params.networkId) {
      //console.warn(`No networkId for ${params.request.url} ${params.resourceType}`);
    }

    // @ts-expect-error - TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'. | TS2339 - Property 'pdfLoadURL' does not exist on type 'Recorder'.
    if (this.pdfLoadURL && params.request.url === this.pdfLoadURL) {
      return null;
    }

    const id = params.networkId || params.requestId;

    const reqresp = this.pendingReqResp(id);

    reqresp.fillFetchRequestPaused(params);

    reqresp.payload = await this.fetchPayloads(
      params,
      reqresp,
      sessions,
      "Fetch.getResponseBody",
    );

    if (reqresp.status === 206) {
      this.removeReqResp(id);
    }

    return reqresp;
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  parseMediaEventsAdded(params, sessions) {
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    if (!this.pageInfo.id) {
      return;
    }

    for (const { value } of params.events) {
      if (value.indexOf('"kLoad"') > 0) {
        const { url } = JSON.parse(value);
        this.doAsyncFetch({ url, doRangeCheck: true }, sessions);
        break;
      }
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'request' implicitly has an 'any' type. | TS7006 - Parameter 'resp' implicitly has an 'any' type.
  async attemptFetchRedirect(request: FetchEntry, resp) {
    if (request.redirectOnly && resp.type === "opaqueredirect") {
      const abort = new AbortController();
      // @ts-expect-error - TS2345 - Argument of type '{ abort: AbortController; }' is not assignable to parameter of type 'RequestInit'.
      resp = await fetch(request.url, { abort });
      abort.abort();

      if (resp.redirected) {
        console.warn(`Adding synthetic redirect ${request.url} -> ${resp.url}`);
        return Response.redirect(resp.url, 302);
      }
    }

    console.warn(
      `async fetch error ${resp.status}, opaque due to redirect, retrying in browser`,
    );
    // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
    await this.doAsyncFetchInBrowser(request, request.sessions, true);
    return null;
  }

  // @ts-expect-error - TS7006 - Parameter 'request' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  async doAsyncFetchInBrowser(request, sessions) {
    // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
    this._fetchUrls.add(request.url);

    const expression = `self.__bx_behaviors.doAsyncFetch("${request.url}")`;

    console.log("Start Async Load: " + request.url);

    await this.pageEval("__awp_async_fetch__", expression, sessions);
    //console.log("Async Fetch Result: " + JSON.stringify(result));
  }

  // @ts-expect-error - TS7006 - Parameter 'request' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type.
  doAsyncFetch(request: FetchEntry, sessions) {
    if (!request || !this.isValidUrl(request.url)) {
      return;
    }

    if (request.doRangeCheck) {
      const url = removeRangeAsQuery(request.url);
      if (url) {
        request.url = url;
        request.rangeRemoved = true;
      }
    }

    // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
    if (this._fetchUrls.has(request.url)) {
      console.log("Skipping, already fetching: " + request.url);
      return;
    }

    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    request.pageInfo = this.pageInfo;
    request.sessions = sessions;

    this._fetchQueue.push(request);

    this.doBackgroundFetch();
  }

  async doBackgroundFetch() {
    if (
      !this._fetchQueue.length ||
      // @ts-expect-error - TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
      this._fetchPending.size >= MAX_CONCURRENT_FETCH ||
      // @ts-expect-error - TS2339 - Property 'stopping' does not exist on type 'Recorder'.
      this.stopping
    ) {
      return;
    }

    const request = this._fetchQueue.shift();
    if (!request) {
      return;
    }

    // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
    if (this._fetchUrls.has(request.url)) {
      console.log("Skipping, already fetching: " + request.url);
      return;
    }

    let doneResolve;
    const fetchId = "fetch-" + this.newPageId();

    try {
      console.log("Start Async Load: " + request.url);

      // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
      this._fetchUrls.add(request.url);

      const pending = new Promise((resolve) => {
        doneResolve = resolve;
      });

      // @ts-expect-error - TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
      this._fetchPending.set(fetchId, pending);

      // @ts-expect-error - TS2339 - Property 'defaultFetchOpts' does not exist on type 'Recorder'.
      const opts = { ...this.defaultFetchOpts };

      if (request.headers) {
        opts.headers = request.headers;
        opts.headers.delete("range");
      }

      let resp = await fetch(request.url, opts);
      if (resp.status === 0) {
        // @ts-expect-error - TS2322 - Type 'Response | null' is not assignable to type 'Response'.
        resp = await this.attemptFetchRedirect(request, resp);
        if (!resp) {
          return;
        }
      } else if (resp.status >= 400) {
        console.warn(
          `async fetch error ${resp.status}, retrying without headers`,
        );
        // @ts-expect-error - TS2339 - Property 'defaultFetchOpts' does not exist on type 'Recorder'.
        resp = await fetch(request.url, this.defaultFetchOpts);
        if (resp.status >= 400) {
          console.warn(
            `async fetch returned: ${resp.status}, trying in-browser fetch`,
          );
          // @ts-expect-error - TS2554 - Expected 2 arguments, but got 3.
          await this.doAsyncFetchInBrowser(request, request.sessions, true);
          return;
        }
      }

      const payload = await resp.arrayBuffer();

      const reqresp = new RequestResponseInfo(fetchId);
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      reqresp.status = resp.status;
      // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'.
      reqresp.statusText = resp.statusText;
      // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
      reqresp.responseHeaders = Object.fromEntries(resp.headers);

      // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
      reqresp.method = "GET";
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      reqresp.url = request.url;
      // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
      reqresp.payload = new Uint8Array(payload);

      const data = reqresp.toDBRecord(
        // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
        reqresp.payload,
        request.pageInfo,
        this.archiveCookies,
      );

      if (data) {
        await this.commitResource(data, request.pageInfo);
        console.log(`Done Async Load (${resp.status}) ${request.url}`);

        // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
        if (this.pageInfo !== request.pageInfo) {
          // @ts-expect-error - TS2554 - Expected 3 arguments, but got 1.
          await this.commitPage(request.pageInfo);
        }
      } else {
        console.warn(
          "No Data Committed for: " + request.url + " Status: " + resp.status,
        );
      }
    } catch (e) {
      console.log(e);
      // @ts-expect-error - TS2339 - Property '_fetchUrls' does not exist on type 'Recorder'.
      this._fetchUrls.delete(request.url);
    } finally {
      // @ts-expect-error - TS2722 - Cannot invoke an object which is possibly 'undefined'.
      doneResolve();
      // @ts-expect-error - TS2339 - Property '_fetchPending' does not exist on type 'Recorder'.
      this._fetchPending.delete(fetchId);
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type. | TS7006 - Parameter 'reqresp' implicitly has an 'any' type. | TS7006 - Parameter 'sessions' implicitly has an 'any' type. | TS7006 - Parameter 'method' implicitly has an 'any' type.
  async fetchPayloads(params, reqresp, sessions, method) {
    let payload;

    if (reqresp.status === 206) {
      sleep(500).then(() =>
        this.doAsyncFetch(
          {
            url: reqresp.url,
            headers: reqresp.getRequestHeadersDict().headers,
          },
          sessions,
        ),
      );
      reqresp.payload = null;
      return null;
    } else {
      const changedUrl = removeRangeAsQuery(reqresp.url);

      if (changedUrl) {
        reqresp.url = changedUrl;
        this.removeReqResp(reqresp.requestId);
        sleep(500).then(() =>
          this.doAsyncFetch(
            {
              url: changedUrl,
              headers: reqresp.getRequestHeadersDict().headers,
              rangeRemoved: true,
            },
            sessions,
          ),
        );
        reqresp.payload = null;
        return null;
      }
    }

    if (!this.noResponseForStatus(reqresp.status)) {
      try {
        reqresp.awaitingPayload = true;
        payload = await this.send(
          method,
          // @ts-expect-error - TS2345 - Argument of type '{ requestId: any; }' is not assignable to parameter of type 'null | undefined'.
          { requestId: params.requestId },
          sessions,
        );

        if (payload.base64Encoded) {
          payload = Buffer.from(payload.body, "base64");
        } else {
          payload = Buffer.from(payload.body, "utf-8");
        }
      } catch (e) {
        console.warn(
          "no buffer for: " +
            reqresp.url +
            " " +
            reqresp.status +
            " " +
            reqresp.requestId +
            " " +
            method,
        );
        console.warn(e);
        return null;
      } finally {
        reqresp.awaitingPayload = false;
      }
    } else {
      payload = Buffer.from([]);
    }

    if (reqresp.hasPostData && !reqresp.postData) {
      try {
        const postRes = await this.send(
          "Network.getRequestPostData",
          // @ts-expect-error - TS2345 - Argument of type '{ requestId: any; }' is not assignable to parameter of type 'null | undefined'.
          { requestId: reqresp.requestId },
          sessions,
        );
        reqresp.postData = Buffer.from(postRes.postData, "utf-8");
      } catch (e) {
        console.warn("Error getting POST data: " + e);
      }
    }

    reqresp.payload = payload;
    return payload;
  }

  flushPending() {
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    const oldPendingReqs = this.pendingRequests;
    // @ts-expect-error - TS2339 - Property 'pageInfo' does not exist on type 'Recorder'.
    const pageInfo = this.pageInfo;
    // @ts-expect-error - TS2551 - Property 'pendingRequests' does not exist on type 'Recorder'. Did you mean 'pendingReqResp'?
    this.pendingRequests = {};

    if (!oldPendingReqs) {
      return;
    }

    for (const [id, reqresp] of Object.entries(oldPendingReqs)) {
      // @ts-expect-error - TS2571 - Object is of type 'unknown'.
      if (reqresp.payload) {
        // @ts-expect-error - TS2571 - Object is of type 'unknown'.
        console.log(`Committing Finished ${id} - ${reqresp.url}`);
        // @ts-expect-error - TS2571 - Object is of type 'unknown'. | TS2571 - Object is of type 'unknown'.
        const data = reqresp.toDBRecord(
          // @ts-expect-error - TS2571 - Object is of type 'unknown'. | TS2571 - Object is of type 'unknown'.
          reqresp.payload,
          pageInfo,
          this.archiveCookies,
        );

        if (data) {
          // @ts-expect-error - TS2554 - Expected 2 arguments, but got 1.
          this.commitResource(data);
        }

        // top-level page resource
        // @ts-expect-error - TS2571 - Object is of type 'unknown'.
        if (data && reqresp.url === pageInfo.url) {
          // @ts-expect-error - TS2571 - Object is of type 'unknown'.
          pageInfo.ts = reqresp.ts;
        }
      } else {
        // @ts-expect-error - TS2571 - Object is of type 'unknown'.
        console.log(`Discarding Payload-less ${reqresp.url}`);
      }
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'method' implicitly has an 'any' type.
  send(method, params = null, sessions = []) {
    let promise = null;

    // @ts-expect-error - TS2339 - Property 'flatMode' does not exist on type 'Recorder'.
    if (this.flatMode && sessions.length) {
      // @ts-expect-error - TS2339 - Property '_doSendCommandFlat' does not exist on type 'Recorder'.
      return this._doSendCommandFlat(
        method,
        params,
        sessions[sessions.length - 1],
      );
    }

    for (let i = sessions.length - 1; i >= 0; i--) {
      // @ts-expect-error - TS2339 - Property 'id' does not exist on type 'Recorder'.
      const id = this.id++;

      const p = new Promise((resolve, reject) => {
        // @ts-expect-error - TS2339 - Property '_promises' does not exist on type 'Recorder'.
        this._promises[id] = { resolve, reject, method };
      });

      if (!promise) {
        promise = p;
      }

      //let message = params ? {id, method, params} : {id, method};
      const message = JSON.stringify({ id, method, params });

      //const sessionId = sessions[sessions.length - 1 - i];
      const sessionId = sessions[i];

      // @ts-expect-error - TS2322 - Type '{ sessionId: never; message: string; }' is not assignable to type 'null'.
      params = { sessionId, message };
      method = "Target.sendMessageToTarget";
    }

    // @ts-expect-error - TS2339 - Property '_doSendCommand' does not exist on type 'Recorder'.
    return this._doSendCommand(method, params, promise);
  }

  // @ts-expect-error - TS7006 - Parameter 'result' implicitly has an 'any' type.
  parseTextFromDOMSnapshot(result) {
    const TEXT_NODE = 3;
    const ELEMENT_NODE = 1;

    const SKIPPED_NODES = [
      "SCRIPT",
      "STYLE",
      "HEADER",
      "FOOTER",
      "BANNER-DIV",
      "NOSCRIPT",
    ];

    const { strings, documents } = result;

    const accum = [];

    for (const doc of documents) {
      const nodeValues = doc.nodes.nodeValue;
      const nodeNames = doc.nodes.nodeName;
      const nodeTypes = doc.nodes.nodeType;
      const parentIndex = doc.nodes.parentIndex;

      for (let i = 0; i < nodeValues.length; i++) {
        if (nodeValues[i] === -1) {
          continue;
        }

        if (nodeTypes[i] === TEXT_NODE) {
          const pi = parentIndex[i];
          if (pi >= 0 && nodeTypes[pi] === ELEMENT_NODE) {
            const name = strings[nodeNames[pi]];

            if (!SKIPPED_NODES.includes(name)) {
              const value = strings[nodeValues[i]].trim();
              if (value) {
                accum.push(value);
              }
            }
          }
        }
      }

      return accum.join("\n");
    }
  }

  // parseTextFromDom(dom) {
  //   const accum = [];
  //   const metadata = {};

  //   this._parseText(dom.root, metadata, accum);

  //   return accum.join("\n");
  // }

  // _parseText(node, metadata, accum) {
  //   const SKIPPED_NODES = ["script", "style", "header", "footer", "banner-div", "noscript"];
  //   const EMPTY_LIST = [];
  //   const TEXT = "#text";
  //   const TITLE = "title";

  //   const name = node.nodeName.toLowerCase();

  //   if (SKIPPED_NODES.includes(name)) {
  //     return;
  //   }

  //   const children = node.children || EMPTY_LIST;

  //   if (name === TEXT) {
  //     const value = node.nodeValue ? node.nodeValue.trim() : "";
  //     if (value) {
  //       accum.push(value);
  //     }
  //   } else if (name === TITLE) {
  //     const title = [];

  //     for (let child of children) {
  //       this._parseText(child, null, title);
  //     }

  //     if (metadata) {
  //       metadata.title = title.join(" ");
  //     } else {
  //       accum.push(title.join(" "));
  //     }
  //   } else {
  //     for (let child of children) {
  //       this._parseText(child, metadata, accum);
  //     }

  //     if (node.contentDocument) {
  //       this._parseText(node.contentDocument, null, accum);
  //     }
  //   }
  // }
}

export { Recorder };
```


## src\requestresponseinfo.ts

```ts
import { getCustomRewriter, getStatusText } from "@webrecorder/wabac";

import { postToGetUrl } from "warcio";

// max URL length for post/put payload-converted URLs
const MAX_URL_LENGTH = 4096;

// max length for single query arg for post/put converted URLs
const MAX_ARG_LEN = 512;

const CONTENT_LENGTH = "content-length";
const CONTENT_TYPE = "content-type";
const EXCLUDE_HEADERS = ["content-encoding", "transfer-encoding"];

const encoder = new TextEncoder();

// ===========================================================================
class RequestResponseInfo {
  extraOpts: Record<string, string>;

  // @ts-expect-error - TS7006 - Parameter 'requestId' implicitly has an 'any' type.
  constructor(requestId) {
    // @ts-expect-error - TS2339 - Property '_created' does not exist on type 'RequestResponseInfo'.
    this._created = new Date();

    // @ts-expect-error - TS2339 - Property 'requestId' does not exist on type 'RequestResponseInfo'.
    this.requestId = requestId;

    // @ts-expect-error - TS2339 - Property 'ts' does not exist on type 'RequestResponseInfo'.
    this.ts = null;

    // request data
    // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
    this.method = null;
    // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
    this.url = null;
    // @ts-expect-error - TS2339 - Property 'protocol' does not exist on type 'RequestResponseInfo'.
    this.protocol = "HTTP/1.1";

    // @ts-expect-error - TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
    this.requestHeaders = null;
    // @ts-expect-error - TS2339 - Property 'requestHeadersText' does not exist on type 'RequestResponseInfo'.
    this.requestHeadersText = null;

    // @ts-expect-error - TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
    this.postData = null;
    // @ts-expect-error - TS2339 - Property 'hasPostData' does not exist on type 'RequestResponseInfo'.
    this.hasPostData = false;

    // response data
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.status = 0;
    // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'.
    this.statusText = null;

    // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
    this.responseHeaders = null;
    // @ts-expect-error - TS2339 - Property 'responseHeadersList' does not exist on type 'RequestResponseInfo'.
    this.responseHeadersList = null;
    // @ts-expect-error - TS2339 - Property 'responseHeadersText' does not exist on type 'RequestResponseInfo'.
    this.responseHeadersText = null;

    // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
    this.payload = null;

    // @ts-expect-error - TS2339 - Property 'fromServiceWorker' does not exist on type 'RequestResponseInfo'.
    this.fromServiceWorker = false;

    // @ts-expect-error - TS2339 - Property 'fetch' does not exist on type 'RequestResponseInfo'.
    this.fetch = false;

    // @ts-expect-error - TS2339 - Property 'resourceType' does not exist on type 'RequestResponseInfo'.
    this.resourceType = null;

    this.extraOpts = {};
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  fillRequest(params) {
    // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
    this.url = params.request.url;
    // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
    this.method = params.request.method;
    // @ts-expect-error - TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
    if (!this.requestHeaders) {
      // @ts-expect-error - TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
      this.requestHeaders = params.request.headers;
    }
    // @ts-expect-error - TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
    this.postData = params.request.postData;
    // @ts-expect-error - TS2339 - Property 'hasPostData' does not exist on type 'RequestResponseInfo'.
    this.hasPostData = params.request.hasPostData;

    if (params.type) {
      // @ts-expect-error - TS2339 - Property 'resourceType' does not exist on type 'RequestResponseInfo'.
      this.resourceType = params.type;
    }

    //this.loaderId = params.loaderId;
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  fillFetchRequestPaused(params) {
    this.fillRequest(params);

    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.status = params.responseStatusCode;
    // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.statusText = getStatusText(this.status);

    // @ts-expect-error - TS2339 - Property 'responseHeadersList' does not exist on type 'RequestResponseInfo'.
    this.responseHeadersList = params.responseHeaders;

    // @ts-expect-error - TS2339 - Property 'fetch' does not exist on type 'RequestResponseInfo'.
    this.fetch = true;
    // @ts-expect-error - TS2339 - Property 'resourceType' does not exist on type 'RequestResponseInfo'.
    this.resourceType = params.resourceType;
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  fillResponseRedirect(params) {
    this._fillResponse(params.redirectResponse);
  }

  isSelfRedirect() {
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    if (this.status < 300 || this.status >= 400 || this.status === 304) {
      return false;
    }
    try {
      // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      const redirUrl = new URL(this.responseHeaders["location"], this.url).href;
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      return this.url === redirUrl;
    } catch (e) {
      return false;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  fillResponseReceived(params) {
    const response = params.response;

    // if initial fetch was a 200, but now replacing with 304, don't!
    if (
      response.status == 304 &&
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      this.status &&
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      this.status != 304 &&
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      this.url
    ) {
      return;
    }

    // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
    this.url = response.url.split("#")[0];

    this._fillResponse(response);
  }

  // @ts-expect-error - TS7006 - Parameter 'response' implicitly has an 'any' type.
  _fillResponse(response) {
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.status = response.status;
    // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.statusText = response.statusText || getStatusText(this.status);

    // @ts-expect-error - TS2339 - Property 'protocol' does not exist on type 'RequestResponseInfo'.
    this.protocol = response.protocol;

    if (response.requestHeaders) {
      // @ts-expect-error - TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
      this.requestHeaders = response.requestHeaders;
    }
    if (response.requestHeadersText) {
      // @ts-expect-error - TS2339 - Property 'requestHeadersText' does not exist on type 'RequestResponseInfo'.
      this.requestHeadersText = response.requestHeadersText;
    }

    // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
    this.responseHeaders = response.headers;

    if (response.headersText) {
      // @ts-expect-error - TS2339 - Property 'responseHeadersText' does not exist on type 'RequestResponseInfo'.
      this.responseHeadersText = response.headersText;
    }

    // @ts-expect-error - TS2339 - Property 'fromServiceWorker' does not exist on type 'RequestResponseInfo'.
    this.fromServiceWorker = !!response.fromServiceWorker;

    if (response.securityDetails) {
      const issuer = response.securityDetails.issuer || "";
      const ctc =
        response.securityDetails.certificateTransparencyCompliance ===
        "compliant"
          ? "1"
          : "0";
      // @ts-expect-error - TS2339 - Property 'extraOpts' does not exist on type 'RequestResponseInfo'.
      this.extraOpts.cert = { issuer, ctc };
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'params' implicitly has an 'any' type.
  fillResponseReceivedExtraInfo(params) {
    // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
    this.responseHeaders = params.headers;
    if (params.headersText) {
      // @ts-expect-error - TS2339 - Property 'responseHeadersText' does not exist on type 'RequestResponseInfo'.
      this.responseHeadersText = params.headersText;
    }
  }

  // @ts-expect-error - TS7006 - Parameter 'payload' implicitly has an 'any' type. | TS7006 - Parameter 'pageInfo' implicitly has an 'any' type.
  toDBRecord(payload, pageInfo, allowCookies) {
    // don't save 304 (todo: turn into 'revisit' style entry?)
    // extra check for 206, should already be skipped
    if (
      // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
      this.method === "OPTIONS" ||
      // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
      this.method === "HEAD" ||
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      this.status == 304 ||
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      this.status === 206
    ) {
      return null;
    }

    if (
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      !this.url ||
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      (!this.url.startsWith("https:") && !this.url.startsWith("http:"))
    ) {
      return;
    }

    if (!pageInfo.id) {
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      console.log("Skipping No Page Id for: " + this.url);
      return null;
    }

    if (!payload) {
      payload = new Uint8Array([]);
    }

    // @ts-expect-error - TS2339 - Property 'ts' does not exist on type 'RequestResponseInfo'.
    this.ts = new Date().getTime();

    const respHeaders = this.getResponseHeadersDict(payload.length);
    const reqHeaders = this.getRequestHeadersDict();

    const mime = (respHeaders.headers.get(CONTENT_TYPE) || "").split(";")[0];
    const cookie = reqHeaders.headers.get("cookie");

    if (cookie) {
      if (allowCookies) {
        respHeaders.headersDict["x-wabac-preset-cookie"] = cookie;
      } else {
        reqHeaders.headers.delete("cookie");
      }
    }

    // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
    const reqUrl = this.url;

    // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
    if (this.method && this.method !== "GET") {
      const convData = {
        // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
        url: this.url,
        headers: reqHeaders.headers,
        // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
        method: this.method,
        // @ts-expect-error - TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
        postData: this.postData || "",
      };
      if (postToGetUrl(convData)) {
        // if URL for custom rewriting, keep as is, otherwise truncate to avoid extra long URLs
        // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
        if (getCustomRewriter(this.url, mime === "text/html")) {
          // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
          this.url = convData.url;
        } else {
          try {
            const url = new URL(convData.url);
            for (const [key, value] of url.searchParams.entries()) {
              if (value && value.length > MAX_ARG_LEN) {
                url.searchParams.set(key, value.slice(0, MAX_ARG_LEN));
              }
            }
            convData.url = url.href;
          } catch (e) {
            //ignore
          }
          // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
          this.url = convData.url.slice(0, MAX_URL_LENGTH);
        }
      }
    }

    const data = {
      // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
      url: this.url,
      // @ts-expect-error - TS2339 - Property 'ts' does not exist on type 'RequestResponseInfo'.
      ts: this.ts,
      // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
      status: this.status,
      // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'.
      statusText: this.statusText,
      pageId: pageInfo.id,
      payload,
      mime,
      respHeaders: respHeaders.headersDict,
      reqHeaders: reqHeaders.headersDict,
      extraOpts: this.extraOpts,
    };

    // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
    if (this.method !== "GET") {
      // @ts-expect-error - TS2339 - Property 'method' does not exist on type '{ url: any; ts: any; status: any; statusText: any; pageId: any; payload: any; mime: string; respHeaders: any; reqHeaders: any; extraOpts: any; }'. | TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'.
      data.method = this.method;
      // @ts-expect-error - TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
      if (this.postData) {
        // @ts-expect-error - TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
        if (typeof this.postData === "string") {
          // @ts-expect-error - TS2339 - Property 'requestBody' does not exist on type '{ url: any; ts: any; status: any; statusText: any; pageId: any; payload: any; mime: string; respHeaders: any; reqHeaders: any; extraOpts: any; }'. | TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
          data.requestBody = encoder.encode(this.postData);
        } else {
          // @ts-expect-error - TS2339 - Property 'requestBody' does not exist on type '{ url: any; ts: any; status: any; statusText: any; pageId: any; payload: any; mime: string; respHeaders: any; reqHeaders: any; extraOpts: any; }'. | TS2339 - Property 'postData' does not exist on type 'RequestResponseInfo'.
          data.requestBody = this.postData;
        }
        // @ts-expect-error - TS2339 - Property 'requestUrl' does not exist on type '{ url: any; ts: any; status: any; statusText: any; pageId: any; payload: any; mime: string; respHeaders: any; reqHeaders: any; extraOpts: any; }'.
        data.requestUrl = reqUrl;
      }
    }

    return data;
  }

  // @ts-expect-error - TS7006 - Parameter 'record' implicitly has an 'any' type.
  fillFromDBRecord(record) {
    // @ts-expect-error - TS2339 - Property 'url' does not exist on type 'RequestResponseInfo'.
    this.url = record.url;
    // @ts-expect-error - TS2339 - Property 'ts' does not exist on type 'RequestResponseInfo'.
    this.ts = record.ts;

    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'.
    this.status = record.status;
    // @ts-expect-error - TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'.
    this.statusText = record.statusText;

    // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
    this.payload = record.payload;
    // @ts-expect-error - TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
    this.requestHeaders = record.reqHeaders || {};
    // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
    this.responseHeaders = record.respHeaders || {};
  }

  getResponseHeadersText() {
    // @ts-expect-error - TS2339 - Property 'protocol' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'status' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'statusText' does not exist on type 'RequestResponseInfo'.
    let headers = `${this.protocol} ${this.status} ${this.statusText}\r\n`;

    // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
    for (const header of Object.keys(this.responseHeaders)) {
      // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
      headers += `${header}: ${this.responseHeaders[header].replace(
        /\n/g,
        ", ",
      )}\r\n`;
    }
    headers += "\r\n";
    return headers;
  }

  hasRequest() {
    // @ts-expect-error - TS2339 - Property 'method' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'. | TS2339 - Property 'requestHeadersText' does not exist on type 'RequestResponseInfo'.
    return this.method && (this.requestHeaders || this.requestHeadersText);
  }

  getRequestHeadersDict() {
    // @ts-expect-error - TS2554 - Expected 3 arguments, but got 2. | TS2339 - Property 'requestHeaders' does not exist on type 'RequestResponseInfo'.
    return this._getHeadersDict(this.requestHeaders, null);
  }

  // @ts-expect-error - TS7006 - Parameter 'length' implicitly has an 'any' type.
  getResponseHeadersDict(length) {
    return this._getHeadersDict(
      // @ts-expect-error - TS2339 - Property 'responseHeaders' does not exist on type 'RequestResponseInfo'.
      this.responseHeaders,
      // @ts-expect-error - TS2339 - Property 'responseHeadersList' does not exist on type 'RequestResponseInfo'.
      this.responseHeadersList,
      length,
    );
  }

  // @ts-expect-error - TS7006 - Parameter 'headersDict' implicitly has an 'any' type. | TS7006 - Parameter 'headersList' implicitly has an 'any' type. | TS7006 - Parameter 'actualContentLength' implicitly has an 'any' type.
  _getHeadersDict(headersDict, headersList, actualContentLength) {
    if (!headersDict && headersList) {
      headersDict = {};

      for (const header of headersList) {
        const headerName = header.name.toLowerCase();
        if (EXCLUDE_HEADERS.includes(headerName)) {
          continue;
        }
        if (actualContentLength && headerName === CONTENT_LENGTH) {
          headersDict[headerName] = "" + actualContentLength;
          continue;
        }
        headersDict[headerName] = header.value.replace(/\n/g, ", ");
      }
    }

    let headers = null;

    if (!headersDict) {
      return { headers: new Headers(), headersDict: {} };
    }

    try {
      headers = new Headers(headersDict);
    } catch (e) {
      for (const key of Object.keys(headersDict)) {
        if (key.startsWith(":")) {
          delete headersDict[key];
          continue;
        }
        const keyLower = key.toLowerCase();
        if (EXCLUDE_HEADERS.includes(keyLower)) {
          continue;
        }
        if (actualContentLength && keyLower === CONTENT_LENGTH) {
          headersDict[key] = "" + actualContentLength;
          continue;
        }
        headersDict[key] = headersDict[key].replace(/\n/g, ", ");
      }
      try {
        headers = new Headers(headersDict);
      } catch (e) {
        console.warn(e);
        headers = new Headers();
      }
    }

    return { headers, headersDict };
  }

  isValidBinary() {
    // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
    if (!this.payload) {
      return false;
    }

    // @ts-expect-error - TS2339 - Property 'payload' does not exist on type 'RequestResponseInfo'.
    const length = this.payload.length;

    // @ts-expect-error - TS2554 - Expected 1 arguments, but got 0.
    const { headers } = this.getResponseHeadersDict();
    const contentType = headers.get(CONTENT_TYPE);
    const contentLength = headers.get(CONTENT_LENGTH);

    if (contentLength !== null && Number(contentLength) !== length) {
      return false;
    }

    if (contentType && contentType.startsWith("text/html")) {
      return false;
    }

    return true;
  }
}

//function formatHeadersText(headersText) {
//  condense any headers containing newlines
//  return headersText.replace(/(\n[^:\n]+)+(?=\r\n)/g, function(value) { return value.replace(/\r?\n/g, ", ");});
//}

export { RequestResponseInfo };
```


## src\sidepanel.ts

```ts
import "@material/web/all.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import { LitElement, html, css, CSSResultGroup } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import "./argo-archive-list";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/icon/icon.js";
import { ArgoArchiveList } from "./argo-archive-list";
import { Downloader } from "./sw/downloader";

import wrRec from "./assets/icons/recLogo.svg";

import {
  getLocalOption,
  // removeLocalOption,
  setLocalOption,
} from "./localstorage";
import {
  BEHAVIOR_WAIT_LOAD,
  BEHAVIOR_RUNNING,
  // BEHAVIOR_READY_START,
  // BEHAVIOR_PAUSED,
  // BEHAVIOR_DONE,
} from "./consts";

import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/divider/divider.js";
import { mapIntegerToRange, truncateString } from "./utils";
import { CollectionLoader } from "@webrecorder/wabac/swlib";
import WebTorrent from "webtorrent";

document.adoptedStyleSheets.push(typescaleStyles.styleSheet!);

const collLoader = new CollectionLoader();
class ArgoViewer extends LitElement {
  static styles: CSSResultGroup = [
    typescaleStyles as unknown as CSSResultGroup,
    css`
      md-tabs {
        background-color: white;
      }

      .search-container {
        margin: 16px 12px;
        height: 32px;
        background: #ece7f8;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        overflow: hidden;
      }

      .search-field {
        width: 100%;
        --md-filled-text-field-container-color: transparent;
        --md-ref-shape-corner-radius: 9999px;
        overflow: hidden;
      }

      .search-field::part(container),
      .search-field::part(hover-overlay),
      .search-field::part(focus-overlay) {
        border-radius: 9999px;
      }

      .search-field::part(input-area) {
        padding: 0;
      }

      .search-field md-icon,
      .search-field input::placeholder {
        color: #6b6b6b;
      }

      md-elevated-card {
        display: block;
        margin: 1rem 0;
        padding: 0;
        overflow: visible;
      }
      .card-container {
        padding: 0 1rem;
      }

      .summary {
        background: transparent !important;
        padding: 0.75rem 1rem;
      }
      .status-current-page {
        display: flex;
        flex-direction: column;
        align-items: start;
        justify-content: space-between;
      }

      .status-title {
        font-size: 12px;
        font-weight: 500;
        color: #6b6b6b;
        margin-bottom: 4px;
      }

      .status-ready {
        font-size: 11px;
        font-weight: 500;
        color: #6b6b6b;
        margin-bottom: 4px;
      }

      .status-page-title {
        font-size: 14px;
        font-weight: 500;
        color: #000;
        margin-bottom: 8px;
      }

      img.favicon {
        width: 20px !important;
        height: 20px !important;
        flex: 0 0 auto;
        object-fit: cover;
        border-radius: 4px;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
      }
    `,
  ];

  private archiveList!: ArgoArchiveList;
  constructor() {
    super();

    // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'ArgoViewer'.
    this.collections = [];
    // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'.
    this.collTitle = "";
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
    this.collId = "";

    // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'.
    this.tabId = 0;
    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'.
    this.recording = false;
    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
    this.status = null;

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'ArgoViewer'.
    this.port = null;

    // @ts-expect-error - TS2339 - Property 'favIconUrl' does not exist on type 'ArgoViewer'.
    this.favIconUrl = "";
    // @ts-expect-error - TS2339 - Property 'pageTitle' does not exist on type 'ArgoViewer'.
    this.pageTitle = "";
    // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
    this.pageUrl = "";
    // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'ArgoViewer'.
    this.pageTs = 0;
    // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'ArgoViewer'.
    this.replayUrl = "";

    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'ArgoViewer'.
    this.canRecord = false;
    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'ArgoViewer'.
    this.failureMsg = null;

    // @ts-expect-error - TS2339 - Property 'collDrop' does not exist on type 'ArgoViewer'.
    this.collDrop = "";

    // @ts-expect-error - TS2339 - Property 'allowCreate' does not exist on type 'ArgoViewer'.
    this.allowCreate = true;

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    this.waitingForStart = false;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
    this.waitingForStop = false;
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'ArgoViewer'.
    this.behaviorState = BEHAVIOR_WAIT_LOAD;
    // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'ArgoViewer'.
    this.behaviorMsg = "";
    // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'ArgoViewer'.
    this.autorun = false;
  }

  static get properties() {
    return {
      collections: { type: Array },
      collId: { type: String },
      collTitle: { type: String },
      collDrop: { type: String },

      recording: { type: Boolean },
      status: { type: Object },
      waitingForStart: { type: Boolean },

      replayUrl: { type: String },
      pageTitle: { type: String },
      pageUrl: { type: String },
      pageTs: { type: Number },

      canRecord: { type: Boolean },
      failureMsg: { type: String },

      behaviorState: { type: String },
      behaviorResults: { type: Object },
      behaviorMsg: { type: String },
      autorun: { type: Boolean },
    };
  }

  // @ts-expect-error - TS7006 - Parameter 'match' implicitly has an 'any' type.
  findTitleFor(match) {
    if (!match) {
      return "";
    }
    // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'ArgoViewer'.
    for (const coll of this.collections) {
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
      if (coll.id === this.collId) {
        return coll.title;
      }
    }

    return "";
  }

  private async onDownload() {
    const selectedPages = this.archiveList?.getSelectedPages?.() || [];
    if (!selectedPages.length) {
      alert("Please select some pages to share.");
      return;
    }

    console.log("Selected pages to share:", selectedPages);

    const defaultCollId = (await getLocalOption("defaultCollId")) || "";
    const coll = await collLoader.loadColl(defaultCollId);

    const pageTsList = selectedPages.map((p) => p.id);
    const format = "wacz";
    const filename = `archive-${Date.now()}.wacz`;

    // Webrecorder swlib API format for download:
    const downloader = new Downloader({
      coll,
      format,
      filename,
      pageList: pageTsList,
    });

    const response = await downloader.download();
    if (!(response instanceof Response)) {
      console.error("Download failed:", response);
      alert("Failed to download archive.");
      return;
    }

    console.log("Download response:", response);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Create temporary <a> to trigger download
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    URL.revokeObjectURL(url);
    document.body.removeChild(a);

    console.log("WACZ file downloaded:", filename);
  }

  private async onShare() {
    const selectedPages = this.archiveList?.getSelectedPages?.() || [];
    if (!selectedPages.length) {
      alert("Please select some pages to share.");
      return;
    }

    console.log("Selected pages to share:", selectedPages);

    const defaultCollId = (await getLocalOption("defaultCollId")) || "";
    const coll = await collLoader.loadColl(defaultCollId);

    const pageTsList = selectedPages.map((p) => p.id);
    const format = "wacz";
    const filename = `archive-${Date.now()}.wacz`;

    // Webrecorder swlib API format for download:
    const downloader = new Downloader({
      coll,
      format,
      filename,
      pageList: pageTsList,
    });

    const response = await downloader.download();
    if (!(response instanceof Response)) {
      console.error("Download failed:", response);
      alert("Failed to download archive.");
      return;
    }

    const opfsRoot = await navigator.storage.getDirectory();
    const waczFileHandle = await opfsRoot.getFileHandle(filename, {
      create: true,
    });
    const writable = await waczFileHandle.createWritable();

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
    }

    await writable.close();

    console.log("WACZ saved to OPFS as:", filename);

    // Get a File object from OPFS
    const fileHandle = await opfsRoot.getFileHandle(filename);
    const file = await fileHandle.getFile();

    // Create a WebTorrent client if not already available
    const client = new (window as any).WebTorrent();

    // Seed the file
    // @ts-expect-error
    client.seed(file, (torrent) => {
      const magnetURI = torrent.magnetURI;
      console.log("Seeding WACZ file via WebTorrent:", magnetURI);

      // Copy to clipboard
      navigator.clipboard
        .writeText(magnetURI)
        .then(() => {
          alert(`Magnet link copied to clipboard:\n${magnetURI}`);
        })
        .catch((err) => {
          console.error("Failed to copy magnet link:", err);
          alert(`Magnet Link Ready:\n${magnetURI}`);
        });
    });
  }

  firstUpdated() {
    this.archiveList = this.shadowRoot?.getElementById(
      "archive-list",
    ) as ArgoArchiveList;

    console.log("Archive list:", this.archiveList);
    this.registerMessages();
  }

  updateTabInfo() {
    // @ts-expect-error - TS7006 - Parameter 'tabs' implicitly has an 'any' type.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length) {
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'.
        this.tabId = tabs[0].id;
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
        this.pageUrl = tabs[0].url;
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'. | TS7006 - Parameter 'result' implicitly has an 'any' type.
        chrome.action.getTitle({ tabId: this.tabId }, (result) => {
          // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'.
          this.recording = result.indexOf("Recording:") >= 0;
        });
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'.
        this.sendMessage({ tabId: this.tabId, type: "startUpdates" });
      }
    });
  }

  registerMessages() {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'ArgoViewer'.
    this.port = chrome.runtime.connect({ name: "sidepanel-port" });

    this.updateTabInfo();

    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'ArgoViewer'.
    this.port.onMessage.addListener((message) => {
      this.onMessage(message);
    });
  }

  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  sendMessage(message) {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'ArgoViewer'.
    this.port.postMessage(message);
  }
  // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
  async onMessage(message) {
    switch (message.type) {
      case "update":
        this.updateTabInfo();
        break;
      case "status":
        // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'.
        if (this.tabId !== message.tabId) {
          return;
        }
        // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'.
        this.recording = message.recording;
        // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
        if (this.waitingForStart && message.firstPageStarted) {
          // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
          this.waitingForStart = false;
        }
        // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
        if (this.waitingForStop && !message.recording && !message.stopping) {
          // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
          this.waitingForStop = false;
        }
        // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
        this.status = message;
        // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'ArgoViewer'.
        this.behaviorState = message.behaviorState;
        // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'ArgoViewer'.
        this.behaviorMsg = message.behaviorData?.msg || "Starting...";
        // @ts-expect-error - TS2339 - Property 'behaviorResults' does not exist on type 'ArgoViewer'.
        this.behaviorResults = message.behaviorData?.state;
        // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'ArgoViewer'.
        this.autorun = message.autorun;

        if (message.favIconUrl) {
          // @ts-expect-error - TS2339 - Property 'favIconUrl' does not exist on type 'ArgoViewer'.
          this.favIconUrl = message.favIconUrl;
        }
        if (message.pageTitle) {
          // @ts-expect-error - TS2339 - Property 'pageTitle' does not exist on type 'ArgoViewer'.
          this.pageTitle = message.pageTitle;
        }
        if (message.pageUrl) {
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
          this.pageUrl = message.pageUrl;
        }
        if (message.pageTs) {
          // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'ArgoViewer'.
          this.pageTs = message.pageTs;
        }
        // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'ArgoViewer'.
        this.failureMsg = message.failureMsg;
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
        if (this.collId !== message.collId) {
          // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          this.collId = message.collId;
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'. | TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          this.collTitle = this.findTitleFor(this.collId);
          // @ts-expect-error - TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'. | TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          await setLocalOption(`${this.tabId}-collId`, this.collId);
        }
        break;
      case "collections":
        // @ts-expect-error - TS2339 - Property 'collections' does not exist on type 'ArgoViewer'.
        this.collections = message.collections;
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'. | TS2339 - Property 'tabId' does not exist on type 'ArgoViewer'.
        this.collId = await getLocalOption(`${this.tabId}-collId`);
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'.
        this.collTitle = "";
        // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
        if (this.collId) {
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'. | TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          this.collTitle = this.findTitleFor(this.collId);
        }
        // may no longer be valid, try default id
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'.
        if (!this.collTitle) {
          // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          this.collId = message.collId;
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'. | TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
          this.collTitle = this.findTitleFor(this.collId);
        }
        // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'.
        if (!this.collTitle) {
          // @ts-expect-error - TS2339 - Property 'collTitle' does not exist on type 'ArgoViewer'.
          this.collTitle = "[No Title]";
        }
        break;
    }
  }

  get actionButtonDisabled() {
    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'. | TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'. | TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
    return !this.recording ? this.waitingForStart : this.waitingForStop;
  }

  // @ts-expect-error - TS7006 - Parameter 'changedProperties' implicitly has an 'any' type.
  updated(changedProperties) {
    if (
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
      this.pageUrl &&
      // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'ArgoViewer'.
      this.pageTs &&
      (changedProperties.has("pageUrl") ||
        changedProperties.has("pageTs") ||
        changedProperties.has("recording") ||
        changedProperties.has("collId"))
    ) {
      const params = new URLSearchParams();
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
      params.set("url", this.pageUrl);
      params.set(
        "ts",
        // @ts-expect-error - TS2339 - Property 'pageTs' does not exist on type 'ArgoViewer'.
        new Date(this.pageTs).toISOString().replace(/[-:TZ.]/g, ""),
      );
      params.set("view", "pages");

      // @ts-expect-error - TS2339 - Property 'replayUrl' does not exist on type 'ArgoViewer'.
      this.replayUrl = this.getCollPage() + "#" + params.toString();
    }

    if (
      changedProperties.has("pageUrl") ||
      changedProperties.has("failureMsg")
    ) {
      // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'ArgoViewer'.
      this.canRecord =
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
        this.pageUrl &&
        // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
        (this.pageUrl === "about:blank" ||
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
          this.pageUrl.startsWith("http:") ||
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
          this.pageUrl.startsWith("https:"));
    }
  }
  getHomePage() {
    return chrome.runtime.getURL("index.html");
  }
  get extRoot() {
    return chrome.runtime.getURL("");
  }

  getCollPage() {
    const sourceParams = new URLSearchParams();
    // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
    sourceParams.set("source", "local://" + this.collId);

    return this.getHomePage() + "?" + sourceParams.toString();
  }

  onStart() {
    this.sendMessage({
      type: "startRecording",
      // @ts-expect-error - TS2339 - Property 'collId' does not exist on type 'ArgoViewer'.
      collId: this.collId,
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
      url: this.pageUrl,
      // @ts-expect-error - TS2339 - Property 'autorun' does not exist on type 'ArgoViewer'.
      autorun: this.autorun,
    });
    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    this.waitingForStart = true;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
    this.waitingForStop = false;
  }

  onStop() {
    this.sendMessage({ type: "stopRecording" });
    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    this.waitingForStart = false;
    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
    this.waitingForStop = true;
  }

  get notRecordingMessage() {
    return "Not Archiving this Tab";
  }

  renderStatusCard() {
    return html`
      <div class="card-container">
        <md-elevated-card style="margin:1rem 0; display:block;">
          <div class="summary">${this.renderStatus()}</div>
        </md-elevated-card>
      </div>
    `;
  }

  renderStatus() {
    // @ts-expect-error - TS2339 - Property 'behaviorState' does not exist on type 'ArgoViewer'.
    if (this.behaviorState === BEHAVIOR_RUNNING) {
      return html`<span class="status-autopilot"
        >Auto Recording,
        ${
          // @ts-expect-error - TS2339 - Property 'behaviorMsg' does not exist on type 'ArgoViewer'.
          this.behaviorMsg
        }</span
      >`;
    }

    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'.
    if (this.recording) {
      return html`<div class="status-current-page">
        <span class="status-title">Current page</span>
        ${
          // @ts-expect-error - TS2339 - Property 'favIconUrl' does not exist on type 'ArgoViewer'.
          this.favIconUrl ||
          // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
          this.pageTitle
            ? html`
                <div style="display: flex; align-items: start; gap: 0.5rem;">
                  <img
                    src="${
                      // @ts-expect-error - TS2339 - Property 'favIconUrl' does not exist on type 'ArgoViewer'.
                      this.favIconUrl
                    }"
                    alt="Favicon"
                    class="favicon"
                  />
                  <span class="status-page-title"
                    >${
                      //@ts-expect-error - TS2339 - Property 'pageTitle' does not exist on type 'ArgoViewer'.
                      truncateString(this.pageTitle)
                    }</span
                  >
                </div>
              `
            : ""
        }
        <span class="status-title">Status</span>
        ${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
          this.status?.numPending
            ? html`
                <md-linear-progress
                  title=${`${
                    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'RecPopup'.
                    this.status.numPending
                  } URLs pending${
                    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
                    this.waitingForStop
                      ? "."
                      : ", please wait before loading a new page."
                  }
          `}
                  value=${mapIntegerToRange(
                    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
                    this.status?.numPending || 0,
                  )}
                  style="--md-sys-color-primary: #7b1fa2; width: 100%; margin-bottom: 0.5rem;"
                ></md-linear-progress>
              `
            : ""
        }
        ${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'. | TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
          !this.status?.numPending
            ? html`<span class="status-ready">All resources archived</span>`
            : ""
        }
      </div>`;
    }

    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'ArgoViewer'.
    if (this.failureMsg) {
      return html`
        <span class="status-title">Status</span>
        <div class="error">
          <p>
            Sorry, there was an error starting archiving on this page. Please
            try again or try a different page.
          </p>
          <p class="error-msg">
            Error Details:
            <i
              >${
                // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'ArgoViewer'.
                this.failureMsg
              }</i
            >
          </p>
          <p>
            If the error persists, check the
            <a
              href="https://archiveweb.page/guide/troubleshooting/errors"
              target="_blank"
              >Common Errors and Issues</a
            >
            page in the guide for known issues and possible solutions.
          </p>
        </div>
      `;
    }

    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'ArgoViewer'.
    if (!this.canRecord) {
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'. | TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
      if (this.pageUrl?.startsWith(this.extRoot)) {
        return html`
          <span class="status-title">Status</span>
          <p class="is-size-7">
            This page is part of the extension. You can view existing archived
            items from here. To start a new archiving session, click the
            <wr-icon .src="${wrRec}"></wr-icon> Start Archiving button and enter
            a new URL.
          </p>
        `;
      }

      return html` <span class="status-title">Status</span>
        <br />
        <p>Can't archive this page.</p>`;
    }

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    if (this.waitingForStart) {
      return html` <span class="status-title">Status</span>
        <br />
        <p>Archiving will start after the page reloads...</p>`;
    }

    return html` <span class="status-title">Status</span>
      <br />
      <p>${this.notRecordingMessage}</p>`;
  }

  renderSearch() {
    return html`
      <div class="search-container">
        <md-filled-text-field
          type="search"
          placeholder="Search archived pages"
          aria-label="Search archived pages"
          class="search-field"
        >
          <md-icon slot="leading-icon">search</md-icon>
        </md-filled-text-field>
      </div>
    `;
  }

  renderTabs() {
    return html`
      <md-tabs id="tabs" aria-label="Archive tabs">
        <md-primary-tab class="md-typescale-label-large"
          >My Archives</md-primary-tab
        >
        <md-primary-tab class="md-typescale-label-large"
          >My Shared Archives</md-primary-tab
        >
      </md-tabs>

      <div
        class="tab-panels"
        style="flex: 1; overflow-y: auto; position: relative; flex-grow: 1;"
      >
        <div id="my-archives" class="tab-panel" active>
          <argo-archive-list id="archive-list"></argo-archive-list>
        </div>
        <div id="shared-archives" class="tab-panel">
          <!-- future “shared” list… -->
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this.renderSearch()} ${this.renderStatusCard()} ${this.renderTabs()}
      <div style="height: 72px; width: 100%;">
        <md-divider></md-divider>
        <div
          style="padding:1rem; display:flex; align-items:center; justify-content:space-between; "
        >
          ${
            // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'ArgoViewer'.
            !this.recording
              ? html`
                  <md-filled-button
                    style="
                  --md-sys-color-primary-container: #7b1fa2;
                  color: white;
                  border-radius: 9999px;
                "
                    ?disabled=${this.actionButtonDisabled ||
                    // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'ArgoViewer'.
                    !this.canRecord}
                    @click=${this.onStart}
                  >
                    <md-icon slot="icon" style="color:white">public</md-icon>
                    Resume Archiving
                  </md-filled-button>
                  <md-icon-button
                    aria-label="Download"
                    @click=${this.onDownload}
                  >
                    <md-icon style="color: gray;">download</md-icon>
                  </md-icon-button>

                  <md-icon-button aria-label="Share" @click=${this.onShare}>
                    <md-icon style="color: gray;">share</md-icon>
                  </md-icon-button>
                `
              : html`
                  <md-outlined-button
                    style="--md-sys-color-primary: #b00020; --md-sys-color-outline: #b00020; border-radius: 9999px;"
                    ?disabled=${this.actionButtonDisabled}
                    @click=${this.onStop}
                  >
                    <md-icon slot="icon" style="color:#b00020">pause</md-icon>
                    Pause Archiving
                  </md-outlined-button>
                `
          }

          <md-icon-button aria-label="Settings">
            <md-icon>settings</md-icon>
          </md-icon-button>
        </div>
      </div>
    `;
  }
}

class WrIcon extends LitElement {
  constructor() {
    super();
    // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'.
    this.size = "0.9em";
  }

  static get properties() {
    return {
      src: { type: Object },
      size: { type: String },
    };
  }

  render() {
    return html`
      <svg
        style="width: ${
          // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'. | TS2339 - Property 'size' does not exist on type 'WrIcon'.
          this.size
        }; height: ${
          // @ts-expect-error - TS2339 - Property 'size' does not exist on type 'WrIcon'. | TS2339 - Property 'size' does not exist on type 'WrIcon'.
          this.size
        }"
      >
        <g>
          ${
            // @ts-expect-error - TS2339 - Property 'src' does not exist on type 'WrIcon'.
            unsafeSVG(this.src)
          }
        </g>
      </svg>
    `;
  }
}

customElements.define("wr-icon", WrIcon);
customElements.define("argo-viewer", ArgoViewer);

export { ArgoViewer };
```


## src\types.ts

```ts
import { type ItemType } from "replaywebpage";
import { type BtrixClient } from "./ui/upload";

type Identity<T extends object> = { [k in keyof T]: T[k] };

export type WrRecItem = Identity<
  ItemType & {
    uploadTime?: number;
    mtime: number;
    sourceUrl?: string;
    ipfsPins?: { url: string }[];
    uploadId: string;
  }
>;

export type BtrixOpts = {
  url: string;
  username: string;
  password: string;
  orgName: string;
  client?: BtrixClient;
};
```


## src\utils.ts

```ts
import { getCollData } from "@webrecorder/wabac";
import { getLocalOption, setLocalOption } from "./localstorage";

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
```


## static\replay\index.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script src="ui.js"></script>
  </head>
  <body>
    <archive-web-page-app></archive-web-page-app>
  </body>
</html>
```


## static\index.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script src="ui.js"></script>
  </head>
  <body>
    <archive-web-page-app></archive-web-page-app>
  </body>
</html>
```


## static\popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    html {
      width: 400px;
    }
  </style>
  <script src="./popup.js"></script>
</head>
<body>
  <wr-popup-viewer></wr-popup-viewer>
</body>
</html>
```


## static\sidepanel.html

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>My Sidepanel</title>
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap"
    />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
    />
    <style>
      :root {
        --md-ref-typeface-brand: 'Roboto';  
        --md-ref-typeface-plain: 'Roboto';  
        --md-sys-color-surface: white;
        --md-sys-color-background: white;
        --md-sys-color-surface-container: white;
        --md-elevated-card-container-color: white;
        
        --md-linear-progress-track-height: 8px;
      }

    </style>
    <script src="webtorrent.min.js"></script>
    <script src="./sidepanel.js"></script>
  </head>
  <body style="margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; overflow: hidden;">
    <argo-viewer style="
      position: relative;
      height: 100dvh;
      z-index: 10;
      background: white;
      display: flex;
      flex-direction: column;
    "></argo-viewer>
  </body>
</html>
```

