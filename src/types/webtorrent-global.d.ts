// src/types/webtorrent-global.d.ts

interface WebTorrentFile {
  name: string;
  getBlob(cb: (err: any, blob: Blob) => void): void;
}

interface WebTorrentTorrent {
  magnetURI: string;
  files: WebTorrentFile[];
}

interface WebTorrentInstance {
  add(torrentId: string, callback: (torrent: WebTorrentTorrent) => void): void;
  seed(file: File | Blob, callback: (torrent: WebTorrentTorrent) => void): void;
}

interface Window {
  WebTorrent: new (...args: any[]) => WebTorrentInstance;
}
