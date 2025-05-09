import "@material/web/all.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import { LitElement, html, css, CSSResultGroup  } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import "./argo-archive-list";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/icon/icon.js";


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

document.adoptedStyleSheets.push(typescaleStyles.styleSheet!);

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
      },

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
    `
  ];

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

  firstUpdated() {
    this.registerMessages();
  }

  registerMessages() {
    // @ts-expect-error - TS2339 - Property 'port' does not exist on type 'ArgoViewer'.
    this.port = chrome.runtime.connect({ name: "sidepanel-port" });
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

    // this.sendMessage({ type: "getPages" });

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
      case "status":
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

    if (changedProperties.has("pageUrl") || changedProperties.has("failureMsg")) {
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
          <div class="summary">
            ${this.renderStatus()}
          </div>
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
      return html`<b
          >${
            // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
            this.waitingForStop ? "Finishing " : ""
          }
          Archiving:&nbsp;</b
        >${
          // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'. | TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
          this.status?.numPending
            ? html`
                <span class="status-pending"
                  >${
                    // @ts-expect-error - TS2339 - Property 'status' does not exist on type 'ArgoViewer'.
                    this.status.numPending
                  }
                  URLs
                  pending${
                    // @ts-expect-error - TS2339 - Property 'waitingForStop' does not exist on type 'ArgoViewer'.
                    this.waitingForStop
                      ? "."
                      : ", please wait before loading a new page."
                  }</span
                >
              `
            : html` <span class="status-ready">Idle, Continue Browsing</span>`
        }`;
    }

    // @ts-expect-error - TS2339 - Property 'failureMsg' does not exist on type 'ArgoViewer'.
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

    // @ts-expect-error - TS2339 - Property 'waitingForStart' does not exist on type 'ArgoViewer'.
    if (this.waitingForStart) {
      return html`<i>Archiving will start after the page reloads...</i>`;
    }

    return html`<i>${this.notRecordingMessage}</i>`;
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
        <md-primary-tab class="md-typescale-label-large">My Archives</md-primary-tab>
        <md-primary-tab class="md-typescale-label-large">My Shared Archives</md-primary-tab>
      </md-tabs>

      <div class="tab-panels" style="flex: 1; overflow-y: auto; position: relative; padding-bottom: 90px;">
        <div id="my-archives" class="tab-panel" active>
          <argo-archive-list></argo-archive-list>
        </div>
        <div id="shared-archives" class="tab-panel">
          <!-- future “shared” list… -->
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this.renderSearch()}
      ${this.renderStatusCard()}
      ${this.renderTabs()}
      <div style="position: fixed; bottom: 0; width: 100%;">
        <md-divider></md-divider>
        <div style="padding:1rem; display:flex; align-items:center; justify-content:space-between; ">
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
                    ?disabled=${
                      this.actionButtonDisabled || 
                      // @ts-expect-error - TS2339 - Property 'canRecord' does not exist on type 'ArgoViewer'.
                      !this.canRecord
                    }
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
