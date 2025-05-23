// src/types/webtorrent-global.d.ts

interface WebTorrentFile {
  name: string;
  getBlob(cb: (err: any, blob: Blob) => void): void;
}

interface WebTorrentTorrent {
  infoHash: string;
  magnetURI: string;
  name: string;
  announce: string[];
  urlList: string[];
  files: WebTorrentFile[];
  timeRemaining: number;
  progress: number;
  downloaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  wires: any[];

  pause(): void;
  resume(): void;
  addPeer(addr: string): void;
  removePeer(addr: string): void;

  select(start?: number, end?: number): void;
  deselect(): void;

  file(name: string): WebTorrentFile | undefined;
  createServer(): import("http").Server;
  destroy(cb?: (err?: Error) => void): void;
}

interface WebTorrentInstance {
  add(
    torrentId: string | Buffer,
    opts?: WebTorrentOptions,
    cb?: (torrent: WebTorrentTorrent) => void,
  ): WebTorrentTorrent;

  add(
    torrentId: string,
    cb: (torrent: WebTorrentTorrent) => void,
  ): WebTorrentTorrent;
  seed(
    input: File | Blob | string | Buffer | WebTorrentFile[],
    opts?: WebTorrentOptions,
    cb?: (torrent: WebTorrentTorrent) => void,
  ): WebTorrentTorrent;

  remove(
    torrentId: string,
    opts?: { destroyStore?: boolean },
    cb?: (err: Error | null) => void,
  ): void;
  get(infoHash: string): WebTorrentTorrent | undefined;
  destroy(cb?: () => void): void;
  torrents: WebTorrentTorrent[];
}

interface Window {
  WebTorrent: new (...args: any[]) => WebTorrentInstance;
}
