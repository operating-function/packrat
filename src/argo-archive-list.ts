import { LitElement, html, css, CSSResultGroup, PropertyValues } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/checkbox/checkbox.js";
import "@material/web/icon/icon.js";
import "@material/web/labs/card/elevated-card.js";

import { getLocalOption } from "./localstorage";
import { Index as FlexIndex } from "flexsearch";

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
      .search-result-text {
        width: 100%;
        padding-left: 14px;
        padding-right: 12px;
        padding-top: 4px;
        padding-bottom: 12px;
        box-sizing: border-box;
      }

      .search-result-text b {
        background-color: var(--md-sys-color-secondary-container);
        color: black;
        font-weight: bold;
        padding: 0 2px;
        border-radius: 2px;
      }
    `,
  ];

  @state() private pages: Array<{
    id: string;
    ts: string;
    url: string;
    title?: string;
    favIconUrl?: string;
    text?: string;
  }> = [];
  @state() private collId = "";
  @state() private selectedPages = new Set<string>();
  @state() private filteredPages = [] as typeof this.pages;

  @property({ type: String }) filterQuery = "";
  private flex: FlexIndex<string> = new FlexIndex<string>({
    tokenize: "forward",
    resolution: 3,
  });

  protected updated(changed: PropertyValues) {
    super.updated(changed);

    // 2) Rebuild the index when the raw pages change:
    if (changed.has("pages")) {
      this.flex = new FlexIndex<string>({
        tokenize: "forward",
        resolution: 3,
      });
      this.pages.forEach((p) => {
        // include title + text (and URL if you like)

        const toIndex = [p.title ?? "", p.text ?? ""].join(" ");
        this.flex.add(p.ts, toIndex);
      });
    }

    // 3) Whenever pages or the query change, recompute filteredPages:
    if (changed.has("pages") || changed.has("filterQuery")) {
      if (!this.filterQuery.trim()) {
        this.filteredPages = [...this.pages];
      } else {
        // partial matches on title/text via the “match” preset
        const matches = this.flex.search(this.filterQuery) as string[];
        this.filteredPages = this.pages.filter((p) => matches.includes(p.ts));
      }
    }
  }

  private buildIndex() {
    this.flex = new FlexIndex();
    this.pages.forEach((p) => {
      const text = p.url + (p.title ? ` ${p.title}` : "");
      this.flex.add(p.ts, text); // use ts (timestamp) as a unique id
    });
  }

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

  private _highlightMatch(
    text?: string,
    query: string = "",
    maxLen = 180,
  ): string {
    if (!text) return "";

    const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safeQuery, "ig");

    const matchIndex = text.search(regex);
    if (matchIndex === -1) return text.slice(0, maxLen) + "...";

    const previewStart = Math.max(0, matchIndex - 30);
    const preview = text.slice(previewStart, previewStart + maxLen);

    return preview.replace(regex, (m) => `<b>${m}</b>`) + "...";
  }

  render() {
    if (!this.pages.length) {
      return html`<p class="md-typescale-body-medium">No archives yet.</p>`;
    }

    const groups = this.filteredPages.reduce(
      (acc, page) => {
        const key = this._formatDate(new Date(Number(page.ts)));
        (acc[key] ||= []).push(page);
        return acc;
      },
      {} as Record<string, typeof this.filteredPages>,
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
                          ${this.filterQuery && page.text
                            ? html`
                                <div
                                  class="search-result-text md-typescale-body-small"
                                >
                                  <span
                                    .innerHTML=${this._highlightMatch(
                                      page.text,
                                      this.filterQuery,
                                    )}
                                  ></span>
                                </div>
                              `
                            : ""}
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

  private async _openPage(page: { ts: string; url: string }) {
    const tsParam = new Date(Number(page.ts))
      .toISOString()
      .replace(/[-:TZ.]/g, "");
    const urlEnc = encodeURIComponent(page.url);
    const fullUrl =
      `${chrome.runtime.getURL("index.html")}?source=local://${this.collId}` +
      `&url=${urlEnc}#view=pages&url=${urlEnc}&ts=${tsParam}`;

    const extensionUrlPrefix = chrome.runtime.getURL("index.html");

    // Check if any existing tab already displays the archive viewer
    const tabs = await chrome.tabs.query({});
    // @ts-expect-error - t implicitly has an 'any' type
    const viewerTab = tabs.find((t) => t.url?.startsWith(extensionUrlPrefix));

    if (viewerTab && viewerTab.id) {
      // Reuse the existing tab
      chrome.tabs.update(viewerTab.id, { url: fullUrl, active: true });
    } else {
      // Fallback: open a new tab
      chrome.tabs.create({ url: fullUrl });
    }
  }
}
