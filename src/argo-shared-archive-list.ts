import { LitElement, html, css, CSSResultGroup, PropertyValues } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/icon/icon.js";
import "@material/web/labs/card/elevated-card.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
// @ts-expect-error
import filingDrawer from "assets/images/filing-drawer.avif";

import { getLocalOption, setSharedArchives } from "./localstorage";
import { Index as FlexIndex } from "flexsearch";
import type { SharedArchive } from "./types";
import { webtorrentClient as client } from "./global-webtorrent";

import { REPLAY_BASE_URL } from "./consts";
@customElement("argo-shared-archive-list")
export class ArgoSharedArchiveList extends LitElement {
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

      .center-flex-container {
        display: flex;
        align-items: center;
        justify-content: center;
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
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        user-select: none;
      }
      md-elevated-card > details summary::-webkit-details-marker {
        display: none;
      }

      md-elevated-card > details md-list {
        background: transparent;
        padding: 0 0rem 0rem;
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

      .md-badge {
        display: block;
        background-color: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        font-size: var(--md-sys-typescale-label-small);
        border-radius: 999px;
        padding: 2px 6px;
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
        object-fit: contain;
        border-radius: 4px;
        filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
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

      md-list-item {
        --md-list-item-top-space: 0px;
        --md-list-item-bottom-space: 0px;

        --md-list-item-leading-space: 0px;
        --md-list-item-trailing-space: 0px;

        --md-list-item-one-line-container-height: 0px;
        padding: 0.75rem 1rem;

        --md-list-item-hover-state-layer-opacity: 0;
      }

      md-list-item[type="button"]:hover {
        background: transparent !important;
      }

      md-list-item md-ripple {
        display: none !important;
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

      .search-error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 5rem;

        & img {
          width: 100%;
          max-width: 128px;
          margin-bottom: 1rem;
        }

        & p {
          margin: 0 0 0.5rem 0;
        }
      }
    `,
  ];

  @property({ type: Array })
  sharedArchives: SharedArchive[] = [];

  @state() private collId = "";
  @state() private filteredPages: Array<{
    id: string;
    ts: string;
    url: string;
    title?: string;
    favIconUrl?: string;
    text?: string;
  }> = [];

  @property({ type: String }) filterQuery = "";
  private flex: FlexIndex<string> = new FlexIndex<string>({
    tokenize: "forward",
    resolution: 3,
  });

  protected updated(changed: PropertyValues) {
    super.updated(changed);

    if (changed.has("sharedArchives")) {
      this.flex = new FlexIndex<string>({
        tokenize: "forward",
        resolution: 3,
      });
      this.sharedArchives
        .flatMap((a) => a.pages)
        .forEach((p) => {
          const toIndex = [p.title ?? "", p.text ?? ""].join(" ");
          this.flex.add(p.ts, toIndex);
        });
    }

    if (changed.has("sharedArchives") || changed.has("filterQuery")) {
      const allPages = this.sharedArchives.flatMap((a) => a.pages);
      if (!this.filterQuery.trim()) {
        this.filteredPages = allPages;
      } else {
        // @ts-expect-error
        const matches = this.flex.search(this.filterQuery) as string[];
        this.filteredPages = allPages.filter((p) => matches.includes(p.ts));
      }
    }
  }

  async connectedCallback() {
    super.connectedCallback();
    this.collId = (await getLocalOption("defaultCollId")) || "";
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

  private _copyLink(uri: string) {
    navigator.clipboard.writeText(uri);
  }

  private async _unseed(id: string) {
    const record = this.sharedArchives.find((a) => a.id === id);
    if (!record) return;
    const torrent = client.get(record.magnetURI);
    if (torrent) {
      await new Promise<void>((resolve) => torrent.destroy(() => resolve()));
    }

    const all = this.sharedArchives.filter((a) => a.id !== id);
    await setSharedArchives(all);
    this.dispatchEvent(
      new CustomEvent("shared-archives-changed", {
        detail: { sharedArchives: all },
        bubbles: true,
        composed: true,
      }),
    );
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
    const tabs = await chrome.tabs.query({});

    // @ts-expect-error
    const viewerTab = tabs.find((t) => t.url?.startsWith(extensionUrlPrefix));
    if (viewerTab && viewerTab.id) {
      chrome.tabs.update(viewerTab.id, { url: fullUrl, active: true });
    } else {
      chrome.tabs.create({ url: fullUrl });
    }
  }

  render() {
    if (!this.sharedArchives.length) {
      return html`
        <div class="card-container center-flex-container">
          <div class="search-error-container">
            <img src=${filingDrawer} />
            <p class="md-typescale-body-large">No shared archives yet</p>
            <p class="md-typescale-body-small">
              Share some pages to see them here
            </p>
          </div>
        </div>
      `;
    }

    const groups = this.sharedArchives.reduce(
      (acc, archive) => {
        const key = this._formatDate(new Date(archive.seededAt));
        (acc[key] ||= []).push(archive);
        return acc;
      },
      {} as Record<string, SharedArchive[]>,
    );

    if (this.filterQuery && !this.filteredPages.length) {
      return html`
        <div class="card-container center-flex-container">
          <div class="search-error-container">
            <img src=${filingDrawer} />
            <p class="md-typescale-body-large">No results found</p>
            <p class="md-typescale-body-small">
              Try searching for something else
            </p>
          </div>
        </div>
      `;
    }

    return html`
      <div class="card-container">
        ${Object.entries(groups)
          .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
          .flatMap(([dateLabel, archives]) =>
            archives.map(
              (archive) => html`
                <md-elevated-card>
                  <details open>
                    <summary>
                      <md-icon class="arrow-right">chevron_right</md-icon>
                      <md-icon class="arrow-down">expand_more</md-icon>
                      <span class="md-typescale-label-large">${dateLabel}</span>
                    </summary>

                    <md-list>
                      ${archive.pages
                        .sort((a, b) => Number(b.ts) - Number(a.ts))
                        .filter((p) =>
                          this.filterQuery
                            ? this.filteredPages.some((fp) => fp.ts === p.ts)
                            : true,
                        )
                        .map((page) => {
                          const u = new URL(page.url);
                          return html`
                            <md-list-item
                              type="button"
                              @click=${() => this._openPage(page)}
                            >
                              <div slot="start" class="leading-group">
                                ${page.favIconUrl
                                  ? html`
                                      <img
                                        slot="start"
                                        class="favicon"
                                        src=${page.favIconUrl}
                                        alt="favicon of ${u.hostname}"
                                      />
                                    `
                                  : html`
                                      <md-icon slot="start">article</md-icon>
                                    `}
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

                    <div
                      style="padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.5rem; justify-content: space-between;"
                    >
                      <md-filled-button
                        @click=${() =>
                          this._copyLink(
                            `${REPLAY_BASE_URL}/?source=${encodeURIComponent(
                              archive.magnetURI,
                            )}`,
                          )}
                      >
                        <md-icon slot="icon" style="color:white"
                          >content_copy</md-icon
                        >
                        Copy Link
                      </md-filled-button>
                      <md-icon-button
                        @click=${() => this._unseed(archive.id)}
                        aria-label="Unshare"
                      >
                        <md-icon>share_off</md-icon>
                      </md-icon-button>
                    </div>
                  </details>
                </md-elevated-card>
              `,
            ),
          )}
      </div>
    `;
  }
}
