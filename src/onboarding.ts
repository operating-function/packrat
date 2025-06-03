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
        overflow: hidden; /* Changed from scroll to hidden */
        width: 100vw;
        height: 100vh;
        background: url(${unsafeCSS(forestImg)}) center/cover no-repeat;
      }

      .slides-container {
        flex: 1;
        overflow: hidden;
        position: relative;
      }

      .slides {
        display: flex;
        align-items: center;
        justify-content: flex-start; /* Changed from center */
        height: 100%;
        transition: transform 500ms ease-in-out;
        padding: 2rem;
        gap: 2rem;
        box-sizing: border-box;
      }

      /* Transform classes for the slides container */
      .slides.step-0 {
        transform: translateX(0);
      }

      .slides.step-1 {
        transform: translateX(calc(-100vw + 2rem));
      }

      .slides.step-2 {
        transform: translateX(calc(-200vw + 4rem));
      }

      .slides.step-3 {
        transform: translateX(calc(-300vw + 6rem));
      }

      .slide {
        width: calc(100vw - 4rem);
        height: 100%;
        box-sizing: border-box;
        padding: 2rem;
        background: var(--md-sys-color-surface);
        border-radius: 0.5rem;
        box-shadow: var(--md-sys-elevation-level2);
        display: flex;
        flex-direction: column;
        flex-shrink: 0; /* Prevent slides from shrinking */
        opacity: 1;
      }

      .slide.hidden {
        opacity: 0;
        transition: opacity 2s ease-out;
      }

      /* First slide - full screen, no card styling */
      .slide.first {
        background: transparent;
        box-shadow: none;
        border-radius: 0;
        padding: 0;
        height: 100%;
      }

      /* First slide content */
      .first-content {
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
        max-height: 100%;
      }

      .card-content-imgcontainer {
        width: 100%;
        flex-shrink: 1;
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .card-content img {
        width: 100%;
        height: 100%;
        object-fit: contain; /* or 'cover', depending on your goal */
        display: block;
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
      <div class="slides-container">
        <div class="slides step-${this.step}">
          ${this.content.map(
            (slide, i) => html`
              <div
                class="slide ${i === 0 ? "first" : ""} ${i !== this.step
                  ? "hidden"
                  : ""}"
              >
                ${i === 0
                  ? html`
                      <div class="first-content">
                        <span
                          class="logo"
                          role="img"
                          aria-label="Packrat by OPFN logo"
                          >${unsafeSVG(packratLogo)}</span
                        >
                        <md-filled-button @click=${this._next}>
                          Get Started
                        </md-filled-button>
                      </div>
                    `
                  : html`
                      <div class="card-content">
                        <div class="card-content-imgcontainer">
                          <img src="${slide.img}" alt="" />
                        </div>
                        <div
                          style="display: flex; justify-content: center; align-items: center; flex-direction: column;"
                        >
                          <div class="md-typescale-body-medium">
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
                      </div>
                    `}
              </div>
            `,
          )}
        </div>
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
