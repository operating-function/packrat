<h1>
    <div align="center">
        <img alt="Packrat by OPFN" src="src/assets/brand/packrat-lockup-color-dynamic.svg" width="90%">
    </div>
</h1>

Packrat is an browser extension for Chromium-based browsers that lets you create high-fidelity web archives out of your browsing history.

Packrat is available on the Chrome Web Store.

## Architecture

Packrat is based on Webrecorder's [ArchiveWeb.page](https://webrecorder.net/archivewebpage) which uses the Chrome debugging protocol to capture and save network traffic. Like ArchiveWeb.page, Packrat also uses Webrecorder's [ReplayWeb.page](https://webrecorder.net/replaywebpage) viewer to replay archived content.

## Development

### Prerequisites

- Node >=12
- Yarn Classic (v1)

### Installation

To build the extension or Electron app locally for development, do the following:

1. Clone this repo and `cd` to the working directory
2. Install dependencies:
   ```sh
   yarn install
   ```
3. Create a development build:
   ```sh
   yarn build-dev
   ```
   OR
   Run `yarn start-ext` to update the build automatically as you make changes

### Adding the development extension to Chrome

To install the extension locally, load the development build as an unpacked extension:

1. Open the Chrome Extensions page ([chrome://extensions](chrome://extensions)).

2. Choose 'Load Unpacked Extension' and point to the `./dist/ext` directory in your local copy of this repo.

> [!NOTE]
> You'll still have to refresh the extension from chrome://extensions as you make changes, even if you're using live reloading.
