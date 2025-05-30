import { LitElement, html, css, unsafeCSS, CSSResultGroup } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import { customElement, property, state } from "lit/decorators.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

// Import Material Design components
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/divider/divider.js";
import "@material/web/icon/icon.js";

// Import assets
import forestImg from "./assets/images/forest.avif";
import packratLogo from "./assets/brand/packrat-lockup-white.svg";
import collageImg from "./assets/onboarding/collage.png";

@customElement("wr-onboarding")
export class OnboardingView extends LitElement {
  static styles: CSSResultGroup = [
    typescaleStyles as unknown as CSSResultGroup,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: url(${unsafeCSS(forestImg)}) center/cover no-repeat;
      }

      .slides {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .slide {
        position: absolute;
        width: 90%;
        max-width: 400px;
        height: 97%;
        max-height: 650px;
        box-sizing: border-box;
        padding: 2rem;
        background: var(--md-sys-color-surface);
        border-radius: 32px;
        box-shadow: var(--md-sys-elevation-level2);
        display: flex;
        flex-direction: column;
        transform: translateX(calc(50vw + 250px));
        transition:
          transform 300ms ease-in-out,
          opacity 300ms ease-in-out;
        opacity: 1; /* Changed from 0 to 1 */
        margin-top: -50px;
      }

      /* Active slide */
      .slide[active] {
        transform: translateX(0);
        opacity: 1;
      }

      /* Previous slides (to the left) */
      .slide[prev] {
        transform: translateX(calc(-50vw - 250px));
        opacity: 1; /* Keep visible during transition */
      }

      /* Next slides (to the right) */
      .slide[next] {
        transform: translateX(calc(50vw + 250px));
        opacity: 1; /* Keep visible during transition */
      }

      /* First slide - full screen, no card */
      .slide[first] {
        position: absolute;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        background: transparent;
        box-shadow: none;
        border-radius: 0;
        padding: 0;
      }

      /* First slide content */
      .first-content {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3rem;
      }

      .first-content .logo {
        width: 100%;
        max-width: 256px;
        height: auto;
      }

      /* Card content */
      .card-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1rem;
      }

      .card-content img {
        width: 100%;
        height: auto;
        object-fit: contain;
        margin-bottom: 1.5rem;
      }

      .card-content md-divider {
        width: 100%;
        margin: 0.5rem 0;
      }

      /* Dots indicator */
      .dots {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-top: auto;
        padding-bottom: 1rem;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--md-sys-color-outline-variant);
        transition: background 200ms;
      }

      .dot[active] {
        background: var(--md-sys-color-primary);
      }

      /* Bottom navigation panel */
      .bottom-panel {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: var(--md-sys-color-surface);
        box-shadow: var(--md-sys-elevation-level2);
      }

      .bottom-panel-content {
        padding: 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .bottom-panel md-outlined-button {
        --md-outlined-button-container-shape: 999px;
      }

      .bottom-panel md-filled-button {
        --md-filled-button-container-shape: 999px;
        color: white;
      }

      .bottom-panel md-outlined-button[disabled] {
        opacity: 0.38;
      }

      /* Hide bottom panel on first slide */
      .bottom-panel[hidden] {
        display: none;
      }
    `,
  ];

  @state() private step = 0;

  private content = [
    {
      first: true,
    },
    {
      title: "Packrat downloads websites as you browse",
      img: collageImg,
      body: "All the pages you view with the extension enabled will be saved to your computer.",
    },
    {
      title: "Send a link to share your archives",
      img: collageImg,
      body: "All data is transferred directly from your computer to their browser.\n\n We don't get access to your archives.",
    },
    {
      title: "Web archives of logged-in sites can contain private data!",
      img: collageImg,
      body: "Only share web archives of logged-in sites with people you trust.",
    },
  ];

  private _prev() {
    if (this.step > 1) {
      this.step--;
    }
  }

  private _next() {
    if (this.step < this.content.length - 1) {
      this.step++;
    } else {
      this.dispatchEvent(new CustomEvent("completed", { bubbles: true }));
    }
  }

  render() {
    return html`
      <div class="slides">
        ${this.content.map(
          (slide, i) => html`
            <div
              class="slide"
              ?active=${i === this.step}
              ?prev=${i < this.step}
              ?next=${i > this.step}
              ?first=${i === 0}
            >
              ${i === 0
                ? html`
                    <div class="first-content">
                      <span class="logo" role="img" aria-label="Packrat by OPFN logo">${unsafeSVG(packratLogo)}</span>
                      <md-filled-button @click=${this._next}>
                        Get Started
                      </md-filled-button>
                    </div>
                  `
                : html`
                    <div class="card-content">
                      <img src="${slide.img}" alt="" />
                      <div
                        class="md-typescale-body-medium"
                        style="--md-sys-typescale-body-medium-weight: 700"
                      >
                        ${slide.title}
                      </div>
                      <md-divider></md-divider>
                      <div
                        class="md-typescale-body-small"
                        style="color: gray; max-width: 90%; line-height: 1.5;"
                      >
                        ${slide.body}
                      </div>
                    </div>

                    <div class="dots">
                      ${this.content
                        .slice(1)
                        .map(
                          (_, j) => html`
                            <div
                              class="dot"
                              ?active=${j + 1 === this.step}
                            ></div>
                          `,
                        )}
                    </div>
                  `}
            </div>
          `,
        )}
      </div>

      <div class="bottom-panel" ?hidden=${this.step === 0}>
        <md-divider></md-divider>
        <div class="bottom-panel-content">
          <md-outlined-button @click=${this._prev} ?disabled=${this.step === 1}>
            <md-icon slot="icon">arrow_back</md-icon>
            Previous
          </md-outlined-button>

          <md-filled-button @click=${this._next}>
            ${this.step === this.content.length - 1
              ? "Get Started!"
              : html`<span
                  style="display: flex; align-items: center; gap: 8px;"
                >
                  Next
                  <md-icon>arrow_forward</md-icon>
                </span>`}
          </md-filled-button>
        </div>
      </div>
    `;
  }
}
