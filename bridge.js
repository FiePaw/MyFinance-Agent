'use strict';
const WebSocket = require('ws');

// Singleton bridge instance
let bridgeInstance = null;

class PythonBridge {
  constructor() {
    this.ws = null;
    this.pending = new Map();
    this.reconnectTimer = null;
    this.connected = false;
    this.wss = null;
    this._startServer();
  }

  _startServer() {
    const WS_PORT = 9560;
    this.wss = new WebSocket.Server({ port: WS_PORT });

    this.wss.on('listening', () => {
      console.log(`[Bridge] WebSocket server listening on port ${WS_PORT}`);
    });

    this.wss.on('connection', (ws) => {
      console.log('[Bridge] Python client connected');
      this.ws = ws;
      this.connected = true;

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const resolver = this.pending.get(msg.req_id);
          if (resolver) {
            this.pending.delete(msg.req_id);
            if (msg.error) resolver.reject(new Error(msg.error));
            else resolver.resolve(msg);
          }
        } catch (e) {
          console.error('[Bridge] Parse error:', e.message);
        }
      });

      ws.on('close', () => {
        console.log('[Bridge] Python client disconnected');
        this.connected = false;
        this.ws = null;
        // Reject all pending requests
        this.pending.forEach(r => r.reject(new Error('Database tidak terhubung')));
        this.pending.clear();
      });

      ws.on('error', (e) => {
        console.error('[Bridge] WS error:', e.message);
      });
    });
  }

  send(payload, timeout = 8000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        return reject(new Error('Database tidak terhubung'));
      }

      const req_id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error('Request timeout'));
      }, timeout);

      this.pending.set(req_id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      try {
        this.ws.send(JSON.stringify({ ...payload, req_id }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(req_id);
        reject(e);
      }
    });
  }
}

function getPythonBridge() {
  if (!bridgeInstance) bridgeInstance = new PythonBridge();
  return bridgeInstance;
}

module.exports = { getPythonBridge };