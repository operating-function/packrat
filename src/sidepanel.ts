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
        border-radius: 9999px;
        display: flex;
        align-items: center;
        overflow: hidden;
      }

      .search-field {
        width: 100%;
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

      .status-container {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: start;
        margin-bottom: 8px;
      }

      .status-title {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #6b6b6b;
        margin-bottom: 4px;
      }

      .status-content {
        font-size: 14px;
        font-weight: 500;
        color: #000;
      }

      .status-divider {
        width: 100%;
        margin: 0.5rem 0;
        border: none;
        border-top: 1px solid #e0e0e0;
      }

      img.favicon {
        width: var(--md-icon-size) !important;
        height: var(--md-icon-size) !important;
        flex: 0 0 auto;
        object-fit: cover;
        border-radius: 4px;
        filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
      }

      md-icon[filled] {
        font-variation-settings: "FILL" 1;
      }
    `,
  ];

  private archiveList!: ArgoArchiveList;
  constructor() {
    super();
    // @ts-expect-error - TS2339 - Property 'searchQuery' does not exist on type 'ArgoViewer'.
    this.searchQuery = "";
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
      searchQuery: { type: String },
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

  private getCurrentPage() {
    const sameUrls = this.archiveList
      ?.getAllPages()
      // @ts-expect-error - TS2339 - Property 'pageUrl' does not exist on type 'ArgoViewer'.
      .filter((p) => p.url === this.pageUrl);
    if (!sameUrls || !sameUrls.length) {
      return null;
    }

    // Sort by timestamp (newest first)
    return sameUrls.sort((a, b) => {
      const tsA = parseInt(a.ts, 10);
      const tsB = parseInt(b.ts, 10);
      return tsB - tsA; // Descending order (newest first)
    })[0];
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

  private async onShareSelected() {
    const selectedPages = this.archiveList?.getSelectedPages?.() || [];
    if (!selectedPages.length) {
      alert("Please select some pages to share.");
      return;
    }
    console.log("Selected pages to share:", selectedPages);
    await this.onShare(selectedPages);
  }

  private async onShareCurrent() {
    const currentPage = this.getCurrentPage?.() || null;
    if (!currentPage) {
      alert("No current page to share.");
      return;
    }
    console.log("Current page to share:", currentPage);
    await this.onShare([currentPage]);
  }

  // @ts-expect-error - TS7006 - Parameter 'pages' implicitly has an 'any' type.
  private async onShare(pages) {
    const defaultCollId = (await getLocalOption("defaultCollId")) || "";
    const coll = await collLoader.loadColl(defaultCollId);

    // @ts-expect-error - TS7006 - Parameter 'p' implicitly has an 'any' type.
    const pageTsList = pages.map((p) => p.id);
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
    return "Archiving Disabled";
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
                <div class="status-container">
                  <img
                    src="${
                      // @ts-expect-error - TS2339 - Property 'favIconUrl' does not exist on type 'ArgoViewer'.
                      this.favIconUrl
                    }"
                    alt="Favicon"
                    class="favicon"
                  />
                  <span class="status-content"
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
                  style="width: 100%; margin-bottom: 0.5rem;"
                ></md-linear-progress>
              `
            : ""
        }
        ${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'. | TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
          !this.status?.numPending && this.pageUrl
            ? html`<div class="status-container">
                  <md-icon filled style="color: var(--md-sys-color-primary);"
                    >check_circle</md-icon
                  >
                  <span class="status-content">All resources archived</span>
                </div>
                <hr class="status-divider" />
                <md-filled-button
                  style="color: white; border-radius: 9999px; align-self: flex-end;"
                  @click=${this.onShareCurrent}
                >
                  <md-icon slot="icon" style="color:white">share</md-icon>
                  Share Current Page
                </md-filled-button> `
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
          <p class="is-size-7 status-content">
            This page is part of the extension.
          </p>
        `;
      }

      return html` <span class="status-title">Status</span>
        <div class="status-container">
          <md-icon filled style="color: var(--md-sys-color-secondary)"
            >folder_off</md-icon
          >
          <span class="status-content">Can't archive this page.</span>
        </div>`;
    }

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    if (this.waitingForStart) {
      return html` <span class="status-title">Status</span>
        <div class="status-container">
          <md-icon filled style="color: var(--md-sys-color-secondary)"
            >folder_off</md-icon
          >
          <span class="status-content"
            >Archiving will start after page reloads…</span
          >
        </div>`;
    }

    return html`
      <span class="status-title">Status</span>
      <div class="status-container">
        <md-icon filled style="color: var(--md-sys-color-secondary)"
          >folder_off</md-icon
        >
        <span class="status-content">${this.notRecordingMessage}</span>
      </div>
    `;
  }

  private onSearchInput(e: InputEvent) {
    const input = e.currentTarget as HTMLInputElement;
    // @ts-expect-error - TS2339 - Property 'searchQuery' does not exist on type 'ArgoViewer'.
    this.searchQuery = input.value;
  }

  renderSearch() {
    return html`
      <div class="search-container">
        <md-filled-text-field
          type="search"
          placeholder="Search archived pages"
          aria-label="Search archived pages"
          class="search-field"
          @input=${this.onSearchInput}
          .value=${
            // @ts-expect-error - TS2339 - Property 'searchQuery' does not exist on type 'ArgoViewer'.
            this.searchQuery
          }
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
          <argo-archive-list
            id="archive-list"
            .filterQuery=${
              //@ts-expect-error - TS2339 - Property 'searchQuery' does not exist on type 'ArgoViewer'.
              this.searchQuery
            }
          ></argo-archive-list>
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
                    style="color: white; border-radius: 9999px;"
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

                  <md-icon-button
                    aria-label="Share"
                    @click=${this.onShareSelected}
                  >
                    <md-icon style="color: gray;">share</md-icon>
                  </md-icon-button>
                `
              : html`
                  <md-outlined-button
                    ?disabled=${this.actionButtonDisabled}
                    @click=${this.onStop}
                  >
                    <md-icon slot="icon">pause</md-icon>
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
