// src/types/webtorrent-browser.d.ts

declare module "webtorrent" {
  import { EventEmitter } from "events"; // Node.js EventEmitter
  import { Readable } from "stream"; // Node.js Readable stream
  import * as MagnetUri from "magnet-uri"; // Magnet URI parser :contentReference[oaicite:9]{index=9}
  import * as ParseTorrentFile from "parse-torrent-file"; // Parsed torrent file types
  import type { Instance as BittorrentProtocol } from "bittorrent-protocol"; // Wire protocol types :contentReference[oaicite:11]{index=11}

  /** Main WebTorrent client */
  export default class WebTorrent extends EventEmitter {
    /** Default tracker list */
    defaultAnnounceList: string[][];

    constructor(opts?: TorrentOptions);

    /** Add or load a torrent */
    add(
      torrentId:
        | string
        | Buffer
        | MagnetUri.Instance
        | ParseTorrentFile.Instance,
      opts?: TorrentOptions,
      onTorrent?: (torrent: Torrent) => void,
    ): Torrent;

    /** Create and seed a torrent */
    seed(
      input:
        | string
        | File
        | Blob
        | Buffer
        | Readable
        | Array<string | File | Blob | Buffer | Readable>,
      opts?: TorrentOptions,
      onSeed?: (torrent: Torrent) => void,
    ): Torrent;

    /** Remove a torrent (and optionally delete data) */
    remove(
      torrentId: string | Torrent,
      opts?: { destroyStore?: boolean },
      cb?: (err: Error | null) => void,
    ): void;

    /** Lookup an existing torrent by infoHash */
    get(infoHash: string): Torrent | undefined;

    /** Destroy client and all torrents */
    destroy(cb?: (err?: Error) => void): void;

    /** All torrents in this client */
    torrents: Torrent[];
  }

  /** Options for add() and seed() */
  export interface TorrentOptions {
    announce?: string[]; // Trackers :contentReference[oaicite:12]{index=12}
    getAnnounceOpts?: Function; // Custom announce params :contentReference[oaicite:13]{index=13}
    urlList?: string[]; // Web seeds :contentReference[oaicite:14]{index=14}
    maxWebConns?: number; // Per-seed connection limit :contentReference[oaicite:15]{index=15}
    path?: string; // Download path (Node.js) :contentReference[oaicite:16]{index=16}
    private?: boolean; // No DHT/PEX if true :contentReference[oaicite:17]{index=17}
    maxConns?: number; // Max peers per torrent :contentReference[oaicite:18]{index=18}
    dht?: boolean | object; // DHT enable/options :contentReference[oaicite:19]{index=19}
    tracker?: boolean | object; // Tracker enable/options :contentReference[oaicite:20]{index=20}
    lsd?: boolean; // Local discovery :contentReference[oaicite:21]{index=21}
    utp?: boolean; // uTP support :contentReference[oaicite:22]{index=22}
    webSeeds?: boolean; // Web seeds support :contentReference[oaicite:23]{index=23}
    blocklist?: string[] | string; // Blocklist :contentReference[oaicite:24]{index=24}
    downloadLimit?: number; // Throttle download (bytes/sec) :contentReference[oaicite:25]{index=25}
    uploadLimit?: number; // Throttle upload (bytes/sec) :contentReference[oaicite:26]{index=26}
    store?: any; // Custom storage engine :contentReference[oaicite:27]{index=27}
    storeOpts?: any; // Storage engine options :contentReference[oaicite:28]{index=28}
    skipVerify?: boolean; // Skip piece verification :contentReference[oaicite:29]{index=29}
    strategy?: "sequential" | "rarest"; // Piece selection strategy :contentReference[oaicite:30]{index=30}
  }

  /** Single file within a torrent */
  export interface TorrentFile {
    name: string; // File name :contentReference[oaicite:31]{index=31}
    path: string; // Path within torrent :contentReference[oaicite:32]{index=32}
    length: number; // Total size in bytes :contentReference[oaicite:33]{index=33}
    offset: number; // Byte offset :contentReference[oaicite:34]{index=34}
    downloaded: number; // Bytes downloaded :contentReference[oaicite:35]{index=35}
    progress: number; // 0 → 1 :contentReference[oaicite:36]{index=36}

    // Browser-only
    getBlob(cb: (err: any, blob: Blob) => void): void; // :contentReference[oaicite:37]{index=37}
    appendTo(
      root: string | Element,
      opts?: {
        autoplay?: boolean;
        muted?: boolean;
        controls?: boolean;
        maxBlobLength?: number;
      },
      cb?: (err: any, elem: Element) => void,
    ): void; // :contentReference[oaicite:38]{index=38}
    renderTo(
      elem: string | Element,
      opts?: {
        autoplay?: boolean;
        muted?: boolean;
        controls?: boolean;
        maxBlobLength?: number;
      },
      cb?: (err: any, elem: Element) => void,
    ): void; // :contentReference[oaicite:39]{index=39}

    // Node.js
    createReadStream(opts?: { start?: number; end?: number }): Readable; // :contentReference[oaicite:40]{index=40}
    select(start?: number, end?: number): void; // :contentReference[oaicite:41]{index=41}
    deselect(): void; // :contentReference[oaicite:42]{index=42}
    getBuffer(cb: (err: any, buffer: Buffer) => void): void; // :contentReference[oaicite:43]{index=43}
    getBlobURL(cb: (err: any, url: string) => void): void; // :contentReference[oaicite:44]{index=44}
  }

  /** Torrent instance returned by add()/seed() */
  export interface Torrent extends EventEmitter {
    infoHash: string; // 20-byte SHA-1 hex :contentReference[oaicite:45]{index=45}
    magnetURI: string; // magnet:?xt=... :contentReference[oaicite:46]{index=46}
    name: string; // Torrent name :contentReference[oaicite:47]{index=47}
    announce: string[]; // Tracker list :contentReference[oaicite:48]{index=48}
    urlList: string[]; // Web seeds :contentReference[oaicite:49]{index=49}
    files: TorrentFile[]; // All files :contentReference[oaicite:50]{index=50}

    // Progress
    timeRemaining: number; // ms left :contentReference[oaicite:51]{index=51}
    progress: number; // 0 → 1 :contentReference[oaicite:52]{index=52}
    downloaded: number; // Bytes :contentReference[oaicite:53]{index=53}
    downloadSpeed: number; // B/s :contentReference[oaicite:54]{index=54}
    uploadSpeed: number; // B/s :contentReference[oaicite:55]{index=55}
    numPeers: number; // Connected peers :contentReference[oaicite:56]{index=56}
    wires: BittorrentProtocol[]; // Raw wires :contentReference[oaicite:57]{index=57}

    // Control
    pause(): void; // :contentReference[oaicite:58]{index=58}
    resume(): void; // :contentReference[oaicite:59]{index=59}
    addPeer(addr: string): void; // :contentReference[oaicite:60]{index=60}
    removePeer(addr: string): void; // :contentReference[oaicite:61]{index=61}

    // Events
    on(event: "infoHash", cb: () => void): this; // :contentReference[oaicite:62]{index=62}
    on(event: "metadata", cb: () => void): this; // :contentReference[oaicite:63]{index=63}
    on(event: "ready", cb: () => void): this; // :contentReference[oaicite:64]{index=64}
    on(event: "warning", cb: (err: Error) => void): this; // :contentReference[oaicite:65]{index=65}
    on(event: "error", cb: (err: Error) => void): this; // :contentReference[oaicite:66]{index=66}
    on(event: "done", cb: () => void): this; // :contentReference[oaicite:67]{index=67}
    on(event: "download", cb: (bytes: number) => void): this; // :contentReference[oaicite:68]{index=68}
    on(event: "upload", cb: (bytes: number) => void): this; // :contentReference[oaicite:69]{index=69}
    on(
      event: "wire",
      cb: (wire: BittorrentProtocol, addr: string) => void,
    ): this; // :contentReference[oaicite:70]{index=70}
    on(
      event: "noPeers",
      cb: (announceType: "tracker" | "dht" | "lsd") => void,
    ): this; // :contentReference[oaicite:71]{index=71}

    /** Create an HTTP server for streaming (Node.js only) */
    createServer(): import("http").Server; // :contentReference[oaicite:72]{index=72}

    /** Destroy this torrent */
    destroy(cb?: (err?: Error) => void): void; // :contentReference[oaicite:73]{index=73}
  }
}
