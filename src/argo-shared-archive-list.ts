import { LitElement, html, css, CSSResultGroup, PropertyValues } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

import "@material/web/list/list.js";
import "@material/web/list/list-item.js";
import "@material/web/checkbox/checkbox.js";
import "@material/web/icon/icon.js";
import "@material/web/labs/card/elevated-card.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
// @ts-expect-error
import filingDrawer from "assets/images/filing-drawer.avif";

import { getLocalOption } from "./localstorage";
import { Index as FlexIndex } from "flexsearch";
import type { SharedArchive } from "./types";
import { setSharedArchives } from "./localstorage";

import { webtorrentClient as client } from "./global-webtorrent";

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
  set sharedArchives(value: SharedArchive[]) {
    const oldValue = this._sharedArchives;
    this._sharedArchives = value;
    this.requestUpdate("sharedArchives", oldValue);
  }

  get sharedArchives(): SharedArchive[] {
    return this._sharedArchives;
  }

  private _sharedArchives: SharedArchive[] = [];

  @state() private collId = "";
  @state() private selectedPages = new Set<string>();
  @state() private filteredPages = [] as Array<{
    id: string;
    ts: string;
    url: string;
    title?: string;
    favIconUrl?: string;
    text?: string;
  }>;

  @property({ type: String }) filterQuery = "";
  private flex: FlexIndex<string> = new FlexIndex<string>({
    tokenize: "forward",
    resolution: 3,
  });

  protected updated(changed: PropertyValues) {
    super.updated(changed);

    // Rebuild the index when the shared archives change:
    if (changed.has("sharedArchives")) {
      this.flex = new FlexIndex<string>({
        tokenize: "forward",
        resolution: 3,
      });
      this.sharedArchives
        .flatMap((a) => a.pages)
        .forEach((p) => {
          // include title + text (and URL if you like)
          const toIndex = [p.title ?? "", p.text ?? ""].join(" ");
          this.flex.add(p.ts, toIndex);
        });
    }

    // Whenever sharedArchives or the query change, recompute filteredPages:
    if (changed.has("sharedArchives") || changed.has("filterQuery")) {
      if (!this.filterQuery.trim()) {
        this.filteredPages = this.sharedArchives.flatMap((a) => a.pages);
      } else {
        // partial matches on title/text via the "match" preset
        // @ts-expect-error
        const matches = this.flex.search(this.filterQuery) as string[];
        this.filteredPages = this.sharedArchives
          .flatMap((a) => a.pages)
          .filter((p) => matches.includes(p.ts));
      }
    }
  }

  public clearSelection() {
    this.selectedPages = new Set();
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent("selection-change", {
        detail: { count: 0 },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private togglePageSelection(ts: string) {
    const next = new Set(this.selectedPages);
    if (next.has(ts)) {
      next.delete(ts);
    } else {
      next.add(ts);
    }
    this.selectedPages = next;
    this.dispatchEvent(
      new CustomEvent("selection-change", {
        detail: { count: this.selectedPages.size },
        bubbles: true,
        composed: true,
      }),
    );
  }

  async connectedCallback() {
    super.connectedCallback();
    console.log("Currently seeding torrents:", client.torrents);
    this.collId = (await getLocalOption("defaultCollId")) || "";
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
    // optionally: show toast/alert
  }

  private async _unseed(id: string) {
    const record = this.sharedArchives.find((a) => a.id === id);
    if (record) {
      const torrent = client.get(record.magnetURI);
      if (torrent) {
        torrent.destroy();
      }
    }

    // remove from storage
    const all = this.sharedArchives.filter((a) => a.id !== id);
    // persist back to storage
    await setSharedArchives(all);
    // fire an event so the parent component updates its state
    this.dispatchEvent(
      new CustomEvent("shared-archives-changed", {
        detail: { sharedArchives: all },
        bubbles: true,
        composed: true,
      }),
    );
    console.log("Currently sharing archives:", this.sharedArchives);
    console.log("Currently seeding torrents:", client.torrents);
  }

  protected render() {
    // No shared archives at all
    if (!this.sharedArchives || !this.sharedArchives.length) {
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

    // Build a date-grouped map of SharedArchive[]
    const groups = this.sharedArchives.reduce(
      (acc, archive) => {
        const key = this._formatDate(new Date(archive.seededAt));
        (acc[key] ||= []).push(archive);
        return acc;
      },
      {} as Record<string, SharedArchive[]>,
    );

    // If a filter is applied but no pages match
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

    // Render each date group
    return html`
      <div class="card-container">
        ${Object.entries(groups)
          .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
          .map(
            ([dateLabel, archives]) => html`
              <!-- Date header -->
              <div
                class="md-typescale-label-large"
                style="margin: 1rem 0 0.5rem;"
              >
                ${dateLabel}
              </div>

              ${archives.map(
                (archive) => html`
                  <md-elevated-card style="margin-bottom:1rem;">
                    <details open>
                      <!-- Summary with expand/collapse -->
                      <summary>
                        <md-icon class="arrow-right">chevron_right</md-icon>
                        <md-icon class="arrow-down">expand_more</md-icon>
                        <span class="md-typescale-label-large">
                          ${archive.pages.length}
                          page${archive.pages.length === 1 ? "" : "s"}
                        </span>
                        ${this.filterQuery
                          ? html`
                              <span class="md-badge">
                                ${archive.pages.filter((p) =>
                                  this.filteredPages.some(
                                    (fp) => fp.ts === p.ts,
                                  ),
                                ).length}
                              </span>
                            `
                          : ""}
                      </summary>

                      <!-- List of pages -->
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
                                  <md-checkbox
                                    slot="start"
                                    touch-target="wrapper"
                                    .checked=${this.selectedPages.has(page.ts)}
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
                                    : html`
                                        <md-icon slot="start">article</md-icon>
                                      `}
                                </div>
                                <div slot="headline" class="title-url">
                                  <span
                                    class="md-typescale-body-small title-text"
                                    style="
                                      --md-sys-typescale-body-small-weight: 700;
                                    "
                                    >${page.title || page.url}</span
                                  >
                                  <a
                                    class="md-typescale-body-small base-url"
                                    style="
                                      --md-sys-typescale-body-small-weight: 700;
                                      color: gray;
                                    "
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

                      <!-- Copy Link + Unseed buttons -->
                      <div
                        style="
                        padding: 0.5rem 1rem;
                        display: flex;
                        gap: 0.5rem;
                        justify-content: flex-end;
                      "
                      >
                        <md-filled-button
                          @click=${() => this._copyLink(archive.magnetURI)}
                        >
                          Copy Link
                        </md-filled-button>
                        <md-outlined-button
                          @click=${() => this._unseed(archive.id)}
                        >
                          Unseed
                        </md-outlined-button>
                      </div>
                    </details>
                  </md-elevated-card>
                `,
              )}
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
