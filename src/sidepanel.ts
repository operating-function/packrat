import "@material/web/all.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import { LitElement, html } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import "./argo-archive-list";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/icon/icon.js";

import {
  getLocalOption,
  // removeLocalOption,
  setLocalOption,
} from "./localstorage";
import {
  BEHAVIOR_WAIT_LOAD,
  // BEHAVIOR_READY_START,
  // BEHAVIOR_RUNNING,
  // BEHAVIOR_PAUSED,
  // BEHAVIOR_DONE,
} from "./consts";

import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/divider/divider.js";

document.adoptedStyleSheets.push(typescaleStyles.styleSheet!);

class ArgoViewer extends LitElement {
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

  firstUpdated() {
    this.registerMessages();
  }

  registerMessages() {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'RecPopup'.
    this.port = chrome.runtime.connect({ name: "sidepanel-port" });
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

    // this.sendMessage({ type: "getPages" });

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

  get actionButtonDisabled() {
    // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'. | TS2339 - Property 'waitingForStart' does not exist on type 'RecPopup'. | TS2339 - Property 'waitingForStop' does not exist on type 'RecPopup'.
    return !this.recording ? this.waitingForStart : this.waitingForStop;
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

    if (changedProperties.has("pageUrl") || changedProperties.has("failureMsg")) {
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
  render() {
    return html`
      <md-divider></md-divider>
      <div style="padding:1rem; display:flex; align-items:center; justify-content:space-between;">
        ${
          // @ts-expect-error - TS2339 - Property 'recording' does not exist on type 'RecPopup'.
          !this.recording
            ? html`
                <md-filled-button
                  style="
                  --md-sys-color-primary-container: #7b1fa2;
                  color: white;
                  border-radius: 9999px;
                "
                  ?disabled=${this.actionButtonDisabled}
                  @click=${this.onStart}
                >
                  <md-icon slot="icon" style="color:white">public</md-icon>
                  Resume Archiving
                </md-filled-button>
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
