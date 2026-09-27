/**
 * scripts/fix-agent-base.js
 * Ensures that agent-base has a valid dist/index.js entrypoint.
 * Prevents runtime MODULE_NOT_FOUND errors on containerized deployment environments
 * (e.g. Render build cache desyncs).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HELPERS_JS_CONTENT = `"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.req = exports.json = exports.toBuffer = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
async function toBuffer(stream) {
    let length = 0;
    const chunks = [];
    for await (const chunk of stream) {
        length += chunk.length;
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
}
exports.toBuffer = toBuffer;
async function json(stream) {
    const buf = await toBuffer(stream);
    const str = buf.toString('utf8');
    try {
        return JSON.parse(str);
    }
    catch (_err) {
        const err = _err;
        err.message += " (input: " + str + ")";
        throw err;
    }
}
exports.json = json;
function req(url, opts = {}) {
    const href = typeof url === 'string' ? url : url.href;
    const req = (href.startsWith('https:') ? https : http).request(url, opts);
    const promise = new Promise((resolve, reject) => {
        req
            .once('response', resolve)
            .once('error', reject)
            .end();
    });
    req.then = promise.then.bind(promise);
    return req;
}
exports.req = req;
`;

const INDEX_JS_CONTENT = `"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const net = __importStar(require("net"));
const http = __importStar(require("http"));
const https_1 = require("https");
__exportStar(require("./helpers"), exports);
const INTERNAL = Symbol('AgentBaseInternalState');
class Agent extends http.Agent {
    constructor(opts) {
        super(opts);
        this[INTERNAL] = {};
    }
    isSecureEndpoint(options) {
        if (options) {
            if (typeof options.secureEndpoint === 'boolean') {
                return options.secureEndpoint;
            }
            if (typeof options.protocol === 'string') {
                return options.protocol === 'https:';
            }
        }
        const { stack } = new Error();
        if (typeof stack !== 'string')
            return false;
        return stack
            .split('\\n')
            .some((l) => l.indexOf('(https.js:') !== -1 ||
            l.indexOf('node:https:') !== -1);
    }
    incrementSockets(name) {
        if (this.maxSockets === Infinity && this.maxTotalSockets === Infinity) {
            return null;
        }
        if (!this.sockets[name]) {
            this.sockets[name] = [];
        }
        const fakeSocket = new net.Socket({ writable: false });
        this.sockets[name].push(fakeSocket);
        this.totalSocketCount++;
        return fakeSocket;
    }
    decrementSockets(name, socket) {
        if (!this.sockets[name] || socket === null) {
            return;
        }
        const sockets = this.sockets[name];
        const index = sockets.indexOf(socket);
        if (index !== -1) {
            sockets.splice(index, 1);
            this.totalSocketCount--;
            if (sockets.length === 0) {
                delete this.sockets[name];
            }
        }
    }
    getName(options) {
        const secureEndpoint = this.isSecureEndpoint(options);
        if (secureEndpoint) {
            return https_1.Agent.prototype.getName.call(this, options);
        }
        return super.getName(options);
    }
    createSocket(req, options, cb) {
        const connectOpts = {
            ...options,
            secureEndpoint: this.isSecureEndpoint(options),
        };
        const name = this.getName(connectOpts);
        const fakeSocket = this.incrementSockets(name);
        Promise.resolve()
            .then(() => this.connect(req, connectOpts))
            .then((socket) => {
            this.decrementSockets(name, fakeSocket);
            if (socket instanceof http.Agent) {
                try {
                    return socket.addRequest(req, connectOpts);
                }
                catch (err) {
                    return cb(err);
                }
            }
            this[INTERNAL].currentSocket = socket;
            super.createSocket(req, options, cb);
        }, (err) => {
            this.decrementSockets(name, fakeSocket);
            cb(err);
        });
    }
    createConnection() {
        const socket = this[INTERNAL].currentSocket;
        this[INTERNAL].currentSocket = undefined;
        if (!socket) {
            throw new Error('No socket was returned in the connect() function');
        }
        return socket;
    }
    get defaultPort() {
        return (this[INTERNAL].defaultPort ??
            (this.protocol === 'https:' ? 443 : 80));
    }
    set defaultPort(v) {
        if (this[INTERNAL]) {
            this[INTERNAL].defaultPort = v;
        }
    }
    get protocol() {
        return (this[INTERNAL].protocol ??
            (this.isSecureEndpoint() ? 'https:' : 'http:'));
    }
    set protocol(v) {
        if (this[INTERNAL]) {
            this[INTERNAL].protocol = v;
        }
    }
}
exports.Agent = Agent;
`;

function fixAgentBase() {
  const targetDir = path.resolve(__dirname, '../node_modules/agent-base');
  const distDir = path.join(targetDir, 'dist');
  const indexJs = path.join(distDir, 'index.js');
  const helpersJs = path.join(distDir, 'helpers.js');

  // 1. Verify if agent-base resolves properly
  try {
    const ab = require('agent-base');
    if (ab && (ab.Agent || typeof ab === 'function')) {
      return true; // Already working
    }
  } catch (err) {
    // Missing or invalid, continue to fix
  }

  console.log('[fix-agent-base] agent-base is missing or invalid. Ensuring module files...');

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    const pkgJsonPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(
        pkgJsonPath,
        JSON.stringify(
          {
            name: 'agent-base',
            version: '7.1.4',
            main: './dist/index.js',
            types: './dist/index.d.ts',
          },
          null,
          2
        )
      );
    }

    if (!fs.existsSync(indexJs)) {
      fs.writeFileSync(indexJs, INDEX_JS_CONTENT, 'utf8');
    }
    if (!fs.existsSync(helpersJs)) {
      fs.writeFileSync(helpersJs, HELPERS_JS_CONTENT, 'utf8');
    }

    console.log('[fix-agent-base] agent-base has been successfully repaired.');
    return true;
  } catch (repairErr) {
    console.warn('[fix-agent-base] Warning: Unable to auto-repair agent-base:', repairErr.message);
    return false;
  }
}

fixAgentBase();

module.exports = fixAgentBase;
