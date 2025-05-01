
import '@material/web/all.js';
import { styles as typescaleStyles } from '@material/web/typography/md-typescale-styles.js';
import { LitElement, html } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import fasHome from "@fortawesome/fontawesome-free/svgs/solid/home.svg";

document.adoptedStyleSheets.push(typescaleStyles.styleSheet!);


class ArgoViewer extends LitElement {
  constructor() {
    super();
  }

  getHomePage() {
    return chrome.runtime.getURL("index.html");
  }

  render() {
    return html`<div>
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
    </div>`;
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
