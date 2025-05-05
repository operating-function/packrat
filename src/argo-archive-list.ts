import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getLocalOption } from "./localstorage";

@customElement("argo-archive-list")
export class ArgoArchiveList extends LitElement {
  @state()
  private pages: any[] = [];

  @property({ type: String })
  collId = "";

  static styles = css`
    ul {
      list-style: none;
      padding-left: 0;
    }
    li {
      cursor: pointer;
      margin: 0.3em 0;
      color: #0066cc;
      text-decoration: underline;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();

    this.collId = (await getLocalOption("defaultCollId")) || "";

    const port = chrome.runtime.connect({ name: "sidepanel-port" });

    // @ts-expect-error - TS7006 - Parameter 'message' implicitly has an 'any' type.
    port.onMessage.addListener((message) => {
      if (message.type === "pages") {
        this.pages = message.pages || [];
      }
    });

    port.postMessage({ type: "getPages" });
  }

  render() {
    if (!this.pages.length) {
      return html`<p>No archives found yet.</p>`;
    }

    return html`
      <ul>
        ${this.pages.map((page) => {
          const tsString = page.ts
            ? new Date(Number(page.ts)).toISOString().replace(/[-:TZ.]/g, "")
            : "";

          const query = new URLSearchParams({
            source: `local://${page.coll || ""}`,
            url: page.url,
          }).toString();

          const hash = new URLSearchParams({
            view: "pages",
            url: page.url,
            ts: tsString,
          }).toString();

          const fullUrl = `${chrome.runtime.getURL(
            "index.html",
          )}?source=local://${this.collId}&url=${encodeURIComponent(
            page.url,
          )}#view=pages&url=${encodeURIComponent(page.url)}&ts=${tsString}`;

          return html`<li @click=${() => chrome.tabs.create({ url: fullUrl })}>
            ${page.title || page.url}
          </li>`;
        })}
      </ul>
    `;
  }
}
