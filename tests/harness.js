/**
 * tests/harness.js
 * Comprehensive Test Harness & Mock Environment for Engineer Islam Fouda Work Management System
 * Self-contained for Node.js v22 (zero external dependencies)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const CODEBASE_ROOT = path.resolve(__dirname, '..');

// Test Registry & Reporting State
const testRegistry = [];
let currentSuite = '';
let currentTier = 'Tier 1';
let currentFeature = 'F01';

function setContext(tier, feature, suiteName) {
  if (tier) currentTier = tier;
  if (feature) currentFeature = feature;
  if (suiteName) currentSuite = suiteName;
}

function registerTest(name, fn, meta = {}) {
  testRegistry.push({
    name,
    tier: meta.tier || currentTier,
    feature: meta.feature || currentFeature,
    suite: meta.suite || currentSuite,
    fn,
    passed: false,
    durationMs: 0,
    error: null,
    skipped: false
  });
}

// Helper for file system assertions
function getFilePath(relPath) {
  return path.join(CODEBASE_ROOT, relPath);
}

function fileExists(relPath) {
  return fs.existsSync(getFilePath(relPath));
}

function readFile(relPath) {
  const fullPath = getFilePath(relPath);
  if (!fs.existsSync(fullPath)) {
    assert.fail(`Assertion Failure: Expected file does not exist on disk: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function readBinary(relPath) {
  const fullPath = getFilePath(relPath);
  if (!fs.existsSync(fullPath)) {
    assert.fail(`Assertion Failure: Expected binary file does not exist on disk: ${relPath}`);
  }
  return fs.readFileSync(fullPath);
}

function getFileSize(relPath) {
  const fullPath = getFilePath(relPath);
  if (!fs.existsSync(fullPath)) return -1;
  return fs.statSync(fullPath).size;
}

function computeSha256(bufferOrString) {
  const hash = crypto.createHash('sha256');
  hash.update(bufferOrString);
  return hash.digest('hex');
}

// In-Memory IndexedDB Mock for Offline Unit & Integration Testing
  function makeIDBRequest(val) {
    const p = Promise.resolve(val);
    p.result = val;
    p.error = null;
    p.onsuccess = null;
    p.onerror = null;
    setTimeout(() => {
      if (typeof p.onsuccess === 'function') p.onsuccess({ target: p });
    }, 0);
    return p;
  }

  class MockIDBObjectStore {
    constructor(name, options = {}) {
      this.name = name;
      this.keyPath = options.keyPath || 'id';
      this.autoIncrement = !!options.autoIncrement;
      this.data = new Map();
      this._nextId = 1;
    }

    put(value, key) {
      let k = key;
      if (!k && this.keyPath && typeof value === 'object' && value !== null) {
        k = value[this.keyPath];
      }
      if (!k) {
        k = this._nextId++;
        if (typeof value === 'object' && value !== null && this.keyPath) {
          value[this.keyPath] = k;
        }
      }
      this.data.set(String(k), Object.assign({}, value));
      return makeIDBRequest(k);
    }

    get(key) {
      const val = this.data.get(String(key)) || null;
      return makeIDBRequest(val);
    }

    delete(key) {
      const existed = this.data.delete(String(key));
      return makeIDBRequest(existed);
    }

    getAll() {
      const arr = Array.from(this.data.values());
      return makeIDBRequest(arr);
    }

    clear() {
      this.data.clear();
      return makeIDBRequest(undefined);
    }

    count() {
      return makeIDBRequest(this.data.size);
    }
  }

  class MockIDBDatabase {
    constructor(name, version = 1) {
      this.name = name;
      this.version = version;
      this.stores = new Map();
    }

    get objectStoreNames() {
      return {
        contains: (n) => this.stores.has(n),
        length: this.stores.size
      };
    }

    createObjectStore(name, options = {}) {
      if (this.stores.has(name)) {
        throw new Error(`ObjectStore already exists: ${name}`);
      }
      const store = new MockIDBObjectStore(name, options);
      this.stores.set(name, store);
      return store;
    }

    getObjectStore(name) {
      const store = this.stores.get(name);
      if (!store) {
        throw new Error(`ObjectStore does not exist: ${name}`);
      }
      return store;
    }

    hasObjectStore(name) {
      return this.stores.has(name);
    }

    transaction(storeNames, mode = 'readonly') {
      const tx = {
        db: this,
        mode,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: (name) => this.getObjectStore(name)
      };
      setTimeout(() => {
        if (typeof tx.oncomplete === 'function') tx.oncomplete();
      }, 0);
      return tx;
    }
  }

// In-Memory LocalStorage Mock
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }

  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  get length() {
    return this.store.size;
  }
}

// Mock DOM Node & Document for Headless Testing
class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = (tagName || 'DIV').toUpperCase();
    this.id = id;
    this._className = '';
    this.classList = {
      _classes: new Set(),
      add: (...cls) => {
        cls.forEach(c => this.classList._classes.add(c));
        this._className = Array.from(this.classList._classes).join(' ');
      },
      remove: (...cls) => {
        cls.forEach(c => this.classList._classes.delete(c));
        this._className = Array.from(this.classList._classes).join(' ');
      },
      contains: (c) => this.classList._classes.has(c),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          this._className = Array.from(this.classList._classes).join(' ');
          return false;
        } else {
          this.classList._classes.add(c);
          this._className = Array.from(this.classList._classes).join(' ');
          return true;
        }
      }
    };
    this.className = className;
    this.attributes = new Map();
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val || '');
    this.classList._classes = new Set(this._className.split(' ').filter(Boolean));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (matchesSelector(ch, selector)) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    const res = this.querySelectorAll(selector);
    return res[0] || null;
  }
}

function matchesSelector(el, sel) {
  if (!sel) return false;
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new MockElement('BODY');
    this.head = new MockElement('HEAD');
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  registerElement(el) {
    if (el.id) this.elementsById.set(el.id, el);
    if (!el.parentElement && el !== this.body && el !== this.head) {
      this.body.appendChild(el);
    }
    for (const ch of el.children) this.registerElement(ch);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('#')) {
      const el = this.getElementById(selector.slice(1));
      if (el) results.push(el);
      return results;
    }
    const walk = (node) => {
      for (const ch of node.children) {
        if (matchesSelector(ch, selector)) results.push(ch);
        walk(ch);
      }
    };
    walk(this.body);
    walk(this.head);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

// Create a complete sandbox window environment
function createMockBrowserEnv(customInit = {}) {
  const doc = new MockDocument();
  const localStorage = new MockLocalStorage();
  const sessionStorage = new MockLocalStorage();
  const mockDb = new MockIDBDatabase('EngineerIslamFoudaDB', 1);

  // Pre-populate 22 collections + 1 blobs store in mock IDB
  const storeNames = [
    'companies', 'workorders', 'permits', 'materials', 'issues', 'checklists',
    'qualityProfiles', 'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
    'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
    'archiveFilesV165', 'codexDecisions1646', 'safeSnapshots1646',
    'users', 'locations', 'workTypes', 'crewPeople', 'crewAuthorizations',
    'qualityInspections', 'executionEvidence', 'whatsapp', 'files',
    'smartReads', 'hrPeople', 'safetyFiles', 'archive', 'unmapped_state',
    'settings', 'blobs'
  ];
  for (const name of storeNames) {
    const keyPath = name === 'blobs' || name === 'attachments' ? 'hash' : (name === 'materials' ? 'code' : (name === 'settings' || name === 'unmapped_state' ? 'key' : 'id'));
    mockDb.createObjectStore(name, { keyPath });
  }

  // Blob storage map for idbPut / idbGet
  const blobStorage = new Map();

  const mockWindow = {
    document: doc,
    localStorage,
    sessionStorage,
    indexedDB: {
      open: (name, version) => {
        const req = Promise.resolve(mockDb);
        req.result = mockDb;
        req.error = null;
        req.onsuccess = null;
        req.onerror = null;
        req.onupgradeneeded = null;
        setTimeout(() => {
          if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
        }, 0);
        return req;
      }
    },
    mockDb,
    idbPut: async (hash, data) => {
      if (!hash) throw new Error('hash required');
      blobStorage.set(hash, data);
      await mockDb.getObjectStore('blobs').put({ hash, data, storedAt: new Date().toISOString() }, hash);
      return true;
    },
    idbGet: async (hash) => {
      if (!hash) return null;
      if (blobStorage.has(hash)) return blobStorage.get(hash);
      const rec = await mockDb.getObjectStore('blobs').get(hash);
      return rec ? rec.data : null;
    },
    idbDelete: async (hash) => {
      blobStorage.delete(hash);
      return await mockDb.getObjectStore('blobs').delete(hash);
    },
    alert: (msg) => { /* mock alert */ },
    confirm: (msg) => true,
    prompt: (msg, def) => def || '',
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (t) => clearInterval(t),
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    Set,
    Map,
    Uint8Array,
    ArrayBuffer
  };

  Object.assign(mockWindow, customInit);
  return mockWindow;
}

// 23 Navigation routes authoritative oracle
const EXPECTED_NAV_PAGES = [
  'home', 'companies', 'alerts', 'workorders', 'tasks', 'coord', 'safety',
  'exec', 'crews', 'hr', 'organization', 'quality', 'teamroom', 'equipment',
  'materials', 'issue', 'docs', 'checklists', 'users', 'archive', 'survey',
  'governance', 'locations'
];

// 14 Execution stages translation oracle
const EXEC_STAGES_ORACLE = [
  { id: 1, ar: 'وضع وتجهيز السلامة بالموقع', en: 'Site safety setup', ur: 'سائٹ سیفٹی کی تیاری', hi: 'साइट सेफ्टी तैयारी', bn: 'সাইট নিরাপত্তা প্রস্তুতি' },
  { id: 2, ar: 'دخول المعدات', en: 'Equipment arrival', ur: 'سامان کی آمد', hi: 'उपकरण प्रवेश', bn: 'যন্ত্রপাতি প্রবেশ' },
  { id: 3, ar: 'بداية عمل المعدات', en: 'Equipment start', ur: 'سامان شروع کرنا', hi: 'उपकरण शुरू करना', bn: 'যন্ত্রপাতি চালু করা' },
  { id: 4, ar: 'الحفر', en: 'Excavation', ur: 'کھدائی', hi: 'खुदाई', bn: 'খনন কাজ' },
  { id: 5, ar: 'قياس عمق الحفر', en: 'Excavation depth measurement', ur: 'کھدائی کی گہرائی', hi: 'खुदाई की गहराई', bn: 'খননের গভীরতা পরিমাপ' },
  { id: 6, ar: 'وضع الرمل الناعم', en: 'Fine sand bedding', ur: 'باریک ریت کی تہہ', hi: 'बारीक रेत बिछाना', bn: 'মিহি বালির স্তর তৈরি' },
  { id: 7, ar: 'قياس العمق بعد الرمل', en: 'Depth after sand', ur: 'ریت کے بعد گہرائی', hi: 'रेत के बाद गहराई', bn: 'বালির পর গভীরতা পরিমাপ' },
  { id: 8, ar: 'تجهيز الرولرات', en: 'Rollers setup', ur: 'رولرز کی تیاری', hi: 'रोलर तैयारी', bn: 'রোলার প্রস্তুতি' },
  { id: 9, ar: 'تمديد الكابل على الرولرات وباستخدام الماكينة', en: 'Cable laying on rollers using machine', ur: 'مشین سے رولرز پر کیبل بچھانا', hi: 'मशीन से रोलر पर केबल बिछाना', bn: 'মেশিনের সাহায্যে রোলারের উপর তার স্থাপন' },
  { id: 10, ar: 'الدفان/الرمل فوق الكابل', en: 'Sand/backfill above cable', ur: 'کیبل کے اوپر ریت/بیک فل', hi: 'केबल के ऊपर रेत/बैकफिल', bn: 'তারের উপর বালি/ভরাটকরণ' },
  { id: 11, ar: 'وسائل حماية الكابل', en: 'Cable protection', ur: 'کیبل پروٹیکشن', hi: 'केबल सुरक्षा', bn: 'তারের সুরক্ষা ব্যবস্থা' },
  { id: 12, ar: 'الشريط التحذيري', en: 'Warning tape', ur: 'وارننگ ٹیپ', hi: 'चेतावनी टेप', bn: 'সতর্কবার্তা টেপ' },
  { id: 13, ar: 'الردم', en: 'Backfilling', ur: 'بیک فلنگ', hi: 'बैकफिल', bn: 'পুনরায় ভরাটকরণ' },
  { id: 14, ar: 'الدمك', en: 'Compaction', ur: 'کمپیکشن', hi: 'कम्पैक्शन', bn: 'মাটির সংকুচিতকরণ' }
];

module.exports = {
  CODEBASE_ROOT,
  assert,
  registerTest,
  testRegistry,
  setContext,
  getFilePath,
  fileExists,
  readFile,
  readBinary,
  getFileSize,
  computeSha256,
  createMockBrowserEnv,
  MockLocalStorage,
  MockIDBDatabase,
  MockIDBObjectStore,
  MockElement,
  MockDocument,
  EXPECTED_NAV_PAGES,
  EXEC_STAGES_ORACLE
};
