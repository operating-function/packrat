// settings-page.ts
import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/switch/switch.js";
import "@material/web/icon/icon.js";
import "@material/web/iconbutton/icon-button.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import { getLocalOption, setLocalOption } from "./localstorage";
import { state } from "lit/decorators.js";
import { onSettingsChanged } from "./events";

@customElement("settings-page")
export class SettingsPage extends LitElement {
  // @ts-expect-error
  static styles: CSSResultGroup = [
    // @ts-expect-error
    typescaleStyles as unknown as CSSResultGroup,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .header {
        margin-bottom: 24px;

        & nav {
          display: flex;
          align-items: center;
          margin: 0 16px;
        }
      }
      .content {
        box-sizing: border-box; /* include padding in width calculations */
        padding: 16px; /* existing top/bottom padding */
        padding-inline-start: 16px; /* horizontal padding */
        padding-inline-end: 16px; /* horizontal padding */
        overflow-y: auto;
        flex: 1;
      }
      .section {
        margin: 24px 16px 0; /* 24px top, 16px left/right, 0 bottom */
      }
      .section-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .section-desc {
        margin: 4px 0 8px;
        color: rgba(0, 0, 0, 0.6);
      }

      md-outlined-text-field {
        display: block; /* make it a block so margins apply symmetrically */
        box-sizing: border-box; /* include padding/border in its width calculation */
        /* override the inline width:100% you currently have on the element */
        width: auto !important;
        /* fill the container minus your 2×16px margins */
        max-width: calc(100% - 32px);
        margin: 0 16px;
      }
    `,
  ];

  @state()
  private archiveCookies = false;
  @state()
  private archiveStorage = false;
  @state()
  private archiveScreenshots = false;
  @state()
  private analyticsEnabled = false;
  @state()
  private skipDomains = "";
  @state()
  private showOnboarding = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadSettings();
  }

  private async loadSettings() {
    try {
      const cookies = await getLocalOption("archiveCookies");
      this.archiveCookies = cookies === "1";
      const storage = await getLocalOption("archiveStorage");
      this.archiveStorage = storage === "1";
      const screenshots = await getLocalOption("archiveScreenshots");
      this.archiveScreenshots = screenshots === "1";
      const analytics = await getLocalOption("analyticsEnabled");
      this.analyticsEnabled = analytics === "1";
      const domains = await getLocalOption("skipDomains");

      this.skipDomains = Array.isArray(domains)
        ? domains.join("\n")
        : typeof domains === "string"
          ? domains
          : "";
      const onb = await getLocalOption("showOnboarding");
      this.showOnboarding = onb !== "0";
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }

  private async _onSkipDomainsChange(e: Event) {
    const textarea = e.currentTarget as HTMLInputElement;
    const value = textarea.value;
    this.skipDomains = value; // update lit-state so UI stays in sync

    // split into an array, trimming out blank lines
    const list = value
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);

    // persist and notify recorder
    await setLocalOption("skipDomains", list);
    chrome.runtime.sendMessage({ msg: "optionsChanged" });

    await onSettingsChanged("SkippedDomains", list.length);
  }

  private async _onArchiveCookiesChange(e: Event) {
    // @ts-expect-error
    const checked = (e.currentTarget as HTMLInputElement).selected;

    await setLocalOption("archiveCookies", checked ? "1" : "0");
    chrome.runtime.sendMessage({ msg: "optionsChanged" });
    await onSettingsChanged("CookiesEnabled", checked);
  }

  private async _onArchiveLocalstorageChange(e: Event) {
    // @ts-expect-error
    const checked = (e.currentTarget as HTMLInputElement).selected;
    await setLocalOption("archiveStorage", checked ? "1" : "0");
    chrome.runtime.sendMessage({ msg: "optionsChanged" });
    await onSettingsChanged("LocalstorageEnabled", checked);
  }

  private async _onArchiveScreenshotsChange(e: Event) {
    // @ts-expect-error
    const checked = (e.currentTarget as HTMLInputElement).selected;
    await setLocalOption("archiveScreenshots", checked ? "1" : "0");
    chrome.runtime.sendMessage({ msg: "optionsChanged" });
    await onSettingsChanged("ScreenshotsEnabled", checked);
  }

  private async _onAnalyticsChange(e: Event) {
    // @ts-expect-error
    const checked = (e.currentTarget as HTMLInputElement).selected;
    await setLocalOption("analyticsEnabled", checked ? "1" : "0");
    chrome.runtime.sendMessage({ msg: "optionsChanged" });
    await onSettingsChanged("AnalyticsEnabled", checked);
  }

  private async _onShowOnboardingChange(e: Event) {
    // @ts-expect-error md-switch uses `selected` for its checked state
    const checked = (e.currentTarget as HTMLInputElement).selected;
    this.showOnboarding = checked;
    await setLocalOption("showOnboarding", checked ? "1" : "0");
    chrome.runtime.sendMessage({ msg: "optionsChanged" });
  }

  private _onBack() {
    this.dispatchEvent(
      new CustomEvent("back", { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <header class="header">
        <nav>
          <md-icon-button
            @click=${this._onBack}
            aria-label="Back"
          >
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          <h1 class="md-typescale-headline-small">Settings</h1>
        </nav>
        <md-divider></md-divider>
      </header>
        <md-outlined-text-field
          type="textarea"       
          rows="4"         
          style="width:100%;"  
          label="Domains to skip"
          .value=${this.skipDomains}
          @change=${this._onSkipDomainsChange}
          supporting-text="Pages from these domains will not be archived"
        ></md-outlined-text-field>

        <div class="section">
          <label class="section-label md-typescale-label-large">
            Archive Screenshots
            <md-switch
              id="archiveScreenshots"
              style="transform: scale(0.6);"
              @change=${this._onArchiveScreenshotsChange}
              ?selected=${this.archiveScreenshots}
            ></md-switch>
          </label>
          <p class="section-desc md-typescale-body-small">
            Save a thumbnail screenshot of every page on load. Screenshot will be saved as soon as page is done loading.
          </p>
        </div>


        <div class="section">
          <label class="section-label md-typescale-label-large">
            Archive Cookies
            <md-switch
              id="archiveCookies"
              style="transform: scale(0.6);"
              @change=${this._onArchiveCookiesChange}
              ?selected=${this.archiveCookies}
            ></md-switch>
          </label>
          <p class="section-desc md-typescale-body-small">
            Archiving cookies may expose private information that is normally
            only shared with the site. When enabled, users should exercise
            caution about sharing archived pages.
          </p>
        </div>

        <div class="section">
        <label class="section-label md-typescale-label-large">
          Enable Analytics
          <md-switch
            id="enableAnalytics"
            style="transform: scale(0.6);"
            @change=${this._onAnalyticsChange}
            ?selected=${this.analyticsEnabled}
          ></md-switch>
        </label>
        <p class="section-desc md-typescale-body-small">
          Allow anonymous usage tracking (e.g., page archives, settings changes). When enabled, basic events will be logged. You can disable this at any time to opt-out of data collection.
        </p>
      </div>


        <div class="section">
            <label class="md-typescale-label-large section-label">
            Archive Localstorage
            <md-switch
              id="archiveLocalstorage"
              style="transform: scale(0.6);"
              @change=${this._onArchiveLocalstorageChange}
              ?selected=${this.archiveStorage}
            ></md-switch>
            </label>
          <p class="section-desc md-typescale-body-small">
            Archiving local storage will archive information that is generally
            always private.
            <br /><br />
            <strong>Sharing content created with this setting enabled may compromise your
            login credentials.</strong>
          </p>
        </div>

        <div class="section">
          <label class="section-label md-typescale-label-large">
            Show Onboarding on First Open
            <md-switch
              id="showOnboarding"
              style="transform: scale(0.6);"
              @change=${this._onShowOnboardingChange}
              ?selected=${this.showOnboarding}
            ></md-switch>
          </label>
          <p class="section-desc md-typescale-body-small">
            When enabled, the onboarding carousel will run the next time you open the side panel.
          </p>
        </div>


      </div>
    `;
  }
}
