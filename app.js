/**
 * PayVault | Multi-Course & Multi-Year Customer Payment Database
 * Persistent IndexedDB (Courses & Customers), Dynamic Course Switching,
 * Automated Money & Student Enrollment Calculations, and Full Media Lightbox.
 */

// ==========================================================================
// 1. IndexedDB Database Engine (Version 2)
// ==========================================================================
const DB_NAME = 'PayVaultDB';
const DB_VERSION = 2;
const STORE_CUSTOMERS = 'customers';
const STORE_COURSES = 'courses';

class Database {
  static open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Create or upgrade courses store
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          const courseStore = db.createObjectStore(STORE_COURSES, { keyPath: 'id', autoIncrement: true });
          courseStore.createIndex('year', 'year', { unique: false });
          courseStore.createIndex('name', 'name', { unique: false });
        }

        // 2. Create or upgrade customers store
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
          const custStore = db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id', autoIncrement: true });
          custStore.createIndex('name', 'name', { unique: false });
          custStore.createIndex('courseId', 'courseId', { unique: false });
          custStore.createIndex('createdAt', 'createdAt', { unique: false });
        } else {
          const custStore = event.target.transaction.objectStore(STORE_CUSTOMERS);
          if (!custStore.indexNames.contains('courseId')) {
            custStore.createIndex('courseId', 'courseId', { unique: false });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Course Operations
  static async getAllCourses() {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COURSES, 'readonly');
      const store = tx.objectStore(STORE_COURSES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async addCourse(course) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COURSES, 'readwrite');
      const store = tx.objectStore(STORE_COURSES);
      if (!course.id) {
        course.id = Date.now() + Math.floor(Math.random() * 1000);
      }
      const request = store.put(course);
      request.onsuccess = () => resolve(course.id);
      request.onerror = () => reject(request.error);
    });
  }

  static async updateCourse(course) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COURSES, 'readwrite');
      const store = tx.objectStore(STORE_COURSES);
      const request = store.put(course);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteCourse(courseId) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COURSES, STORE_CUSTOMERS], 'readwrite');
      const courseStore = tx.objectStore(STORE_COURSES);
      const custStore = tx.objectStore(STORE_CUSTOMERS);

      courseStore.delete(courseId);

      // Also cascade delete customer records belonging to this course
      const custIndex = custStore.index('courseId');
      const req = custIndex.openCursor(IDBKeyRange.only(courseId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Customer Operations
  static async getAllCustomers() {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOMERS, 'readonly');
      const store = tx.objectStore(STORE_CUSTOMERS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async addCustomer(record) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOMERS, 'readwrite');
      const store = tx.objectStore(STORE_CUSTOMERS);
      if (!record.id) {
        record.id = Date.now() + Math.floor(Math.random() * 1000);
      }
      const request = store.put(record);
      request.onsuccess = () => resolve(record.id);
      request.onerror = () => reject(request.error);
    });
  }

  static async updateCustomer(record) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOMERS, 'readwrite');
      const store = tx.objectStore(STORE_CUSTOMERS);
      const request = store.put(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteCustomer(id) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOMERS, 'readwrite');
      const store = tx.objectStore(STORE_CUSTOMERS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Bulk replace (for syncing from cloud)
  static async replaceAllData(courses, customers) {
    const db = await Database.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_COURSES, STORE_CUSTOMERS], 'readwrite');
      const courseStore = tx.objectStore(STORE_COURSES);
      const custStore = tx.objectStore(STORE_CUSTOMERS);

      courseStore.clear();
      custStore.clear();

      if (Array.isArray(courses)) {
        for (const c of courses) {
          if (c && c.id) courseStore.put(c);
        }
      }

      if (Array.isArray(customers)) {
        for (const cust of customers) {
          if (cust && cust.id) custStore.put(cust);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ==========================================================================
// 1B. Real-Time Multi-Device Cloud Synchronization Engine (Firebase RTDB)
// ==========================================================================
const CLOUD_CONFIG_STORAGE_KEY = 'payvault_cloud_sync_config_v2';

class CloudSync {
  static config = null;
  static rtdb = null;
  static isConnected = false;
  static isSyncing = false;
  static isReceivingRemoteUpdate = false;
  static lastSyncTime = null;
  static dbRef = null;

  static loadConfig() {
    // 1. Check URL hash first (e.g. from QR code scan or share link: #sync=...)
    try {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#sync=')) {
        const encoded = hash.slice(6);
        const jsonStr = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
        const parsed = JSON.parse(jsonStr);
        if (parsed && (parsed.databaseURL || parsed.apiKey)) {
          localStorage.setItem(CLOUD_CONFIG_STORAGE_KEY, JSON.stringify(parsed));
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          showToast('📱 Device paired! Connecting to cloud...', 'success');
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not parse sync URL hash:', e);
    }

    // 2. Load from localStorage
    try {
      const saved = localStorage.getItem(CLOUD_CONFIG_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load saved sync config:', e);
    }
    return null;
  }

  static saveConfig(cfg) {
    this.config = cfg;
    localStorage.setItem(CLOUD_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  }

  static clearConfig() {
    this.config = null;
    this.isConnected = false;
    if (this.dbRef) {
      try { this.dbRef.off(); } catch (e) {}
    }
    this.rtdb = null;
    localStorage.removeItem(CLOUD_CONFIG_STORAGE_KEY);
    this.updateStatusUI('not-configured', 'Cloud Sync: Local Mode Only', 'Data is currently saved only in this browser.');
  }

  static async init() {
    this.config = this.loadConfig();
    if (this.config && this.config.databaseURL) {
      await this.connect(this.config, false);
    } else {
      this.updateStatusUI('not-configured', 'Cloud Sync: Local Mode Only', 'Data is currently saved only in this browser.');
    }
  }

  static async connect(cfg, notifySuccess = true) {
    if (!cfg || !cfg.databaseURL) {
      showToast('Please provide a valid Firebase Database URL', 'error');
      return false;
    }

    // Normalize databaseURL (trim trailing slashes)
    let dbUrl = cfg.databaseURL.trim().replace(/\/+$/, '');
    if (!dbUrl.startsWith('http://') && !dbUrl.startsWith('https://')) {
      dbUrl = 'https://' + dbUrl;
    }
    cfg.databaseURL = dbUrl;

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded');
      this.updateStatusUI('not-configured', 'Offline / SDK Error', 'Firebase library could not be loaded.');
      return false;
    }

    try {
      this.updateStatusUI('syncing', 'Connecting to Cloud...', 'Establishing connection...');

      // Check if firebase app already exists
      let app;
      const appName = 'payvaultApp';
      const existingApp = firebase.apps ? firebase.apps.find(a => a.name === appName) : null;
      if (existingApp) {
        app = existingApp;
      } else {
        const projectIdMatch = cfg.databaseURL.match(/https:\/\/([^.]+)/);
        const derivedProjectId = projectIdMatch ? projectIdMatch[1] : 'payvault';
        app = firebase.initializeApp({
          databaseURL: cfg.databaseURL,
          apiKey: cfg.apiKey || 'AIzaSyDemoDummyKeyForFreePublicRTDB',
          projectId: cfg.projectId || derivedProjectId
        }, appName);
      }

      this.rtdb = firebase.database(app);
      this.saveConfig(cfg);

      // Listen for connection state (.info/connected)
      const connRef = this.rtdb.ref('.info/connected');
      connRef.on('value', (snap) => {
        if (snap.val() === true) {
          this.isConnected = true;
          this.updateStatusUI('connected', '🟢 Live Cloud Synced', 'Mobile, Tablet & Laptop are synced in real-time.');
        } else {
          this.isConnected = false;
          this.updateStatusUI('syncing', 'Connecting to Cloud...', 'Connecting to real-time sync server...');
        }
      });

      // Setup real-time listener on payvault
      this.setupRealtimeListener();

      if (notifySuccess) {
        showToast('Connected to Cloud Database! Real-time sync is active.', 'success');
      }

      this.updatePairingUI();
      return true;
    } catch (err) {
      console.error('Firebase connection error:', err);
      this.updateStatusUI('not-configured', 'Connection Failed', err.message);
      if (notifySuccess) {
        showToast('Connection failed: ' + err.message, 'error');
      }
      return false;
    }
  }

  static setupRealtimeListener() {
    if (!this.rtdb) return;
    if (this.dbRef) {
      try { this.dbRef.off(); } catch (e) {}
    }

    this.dbRef = this.rtdb.ref('payvault');
    this.dbRef.on('value', async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // Cloud is empty. If we have local records, auto-upload to initialize cloud
        const localCourses = await Database.getAllCourses();
        const localCustomers = await Database.getAllCustomers();
        if ((localCourses.length > 0 || localCustomers.length > 0) && !this.isReceivingRemoteUpdate) {
          await this.pushData();
        }
        return;
      }

      await this.handleRemoteUpdate(data);
    }, (err) => {
      console.error('Cloud realtime listener error:', err);
      this.updateStatusUI('not-configured', 'Sync Permission Error', 'Please check Firebase database rules (test mode).');
    });
  }

  static async handleRemoteUpdate(cloudData) {
    if (this.isSyncing) return; // Ignore reflection of our own push
    this.isReceivingRemoteUpdate = true;

    try {
      // Normalize cloud courses and customers
      const cloudCourses = cloudData.courses ? (Array.isArray(cloudData.courses) ? cloudData.courses : Object.values(cloudData.courses)) : [];
      const cloudCustomers = cloudData.customers ? (Array.isArray(cloudData.customers) ? cloudData.customers : Object.values(cloudData.customers)) : [];

      // Replace local IndexedDB with latest cloud state
      await Database.replaceAllData(cloudCourses, cloudCustomers);

      // Re-render UI
      await loadDatabase();

      this.lastSyncTime = Date.now();
      this.updateStatusUI('connected', '🟢 Live Cloud Synced', `Updated from cloud at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('Error handling remote cloud data:', err);
    } finally {
      this.isReceivingRemoteUpdate = false;
    }
  }

  static async pushData() {
    if (!this.rtdb || this.isReceivingRemoteUpdate) return;
    this.isSyncing = true;
    this.updateStatusUI('syncing', 'Syncing to Cloud...', 'Uploading latest changes...');

    try {
      const courses = await Database.getAllCourses();
      const customers = await Database.getAllCustomers();

      await this.rtdb.ref('payvault').set({
        courses: courses || [],
        customers: customers || [],
        lastUpdated: Date.now()
      });

      this.lastSyncTime = Date.now();
      this.updateStatusUI('connected', '🟢 Live Cloud Synced', `All changes saved to cloud at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('Failed to push data to cloud:', err);
      this.updateStatusUI('not-configured', 'Cloud Push Error', err.message);
      showToast('Could not sync to cloud: ' + err.message, 'error');
    } finally {
      this.isSyncing = false;
    }
  }

  static updateStatusUI(statusClass, headline, detail) {
    const indicator = document.getElementById('headerSyncIndicator');
    const headerText = document.getElementById('headerSyncText');
    const orb = document.getElementById('syncStatusOrb');
    const headlineEl = document.getElementById('syncStatusHeadline');
    const detailEl = document.getElementById('syncStatusDetail');
    const forceSyncBtn = document.getElementById('forceSyncNowBtn');
    const uploadBtn = document.getElementById('uploadLocalDataBtn');
    const disconnectBtn = document.getElementById('disconnectSyncBtn');
    const pairingSection = document.getElementById('syncPairingSection');

    if (indicator) {
      indicator.className = `sync-dot ${statusClass}`;
    }
    if (orb) {
      orb.className = `status-orb ${statusClass}`;
    }
    if (headlineEl) headlineEl.textContent = headline;
    if (detailEl) detailEl.textContent = detail;

    if (statusClass === 'connected') {
      if (headerText) headerText.textContent = '🟢 Synced';
      if (forceSyncBtn) forceSyncBtn.style.display = 'inline-flex';
      if (uploadBtn) uploadBtn.style.display = 'inline-flex';
      if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
      if (pairingSection) pairingSection.style.display = 'flex';
      this.updatePairingUI();
    } else if (statusClass === 'syncing') {
      if (headerText) headerText.textContent = '🔄 Syncing...';
      if (forceSyncBtn) forceSyncBtn.style.display = 'inline-flex';
    } else {
      if (headerText) headerText.textContent = '📱 Sync Devices';
      if (forceSyncBtn) forceSyncBtn.style.display = 'none';
      if (uploadBtn) uploadBtn.style.display = 'none';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
      if (pairingSection) pairingSection.style.display = 'none';
    }
  }

  static updatePairingUI() {
    if (!this.config) return;
    const qrImg = document.getElementById('syncQrCodeImg');
    const shareInput = document.getElementById('syncShareLinkInput');
    if (!qrImg || !shareInput) return;

    const jsonStr = JSON.stringify(this.config);
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(jsonStr))));
    const pairingUrl = `${window.location.origin}${window.location.pathname}#sync=${encoded}`;

    shareInput.value = pairingUrl;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=8&data=${encodeURIComponent(pairingUrl)}`;
  }
}

// ==========================================================================
// 2. Application State & DOM Selectors
// ==========================================================================
const state = {
  courses: [],
  customers: [],
  activeCourseId: 'all', // 'all' or numeric course ID
  activeYear: 'all',     // 'all' or numeric string e.g. '2025', '2026'
  currentEditingCustomerId: null,
  currentImageBase64: null,
  currentImage2Base64: null,
  lastActiveDropZone: 1,
  lightboxRecordId: null,
  lightboxPhotoIndex: 1,
  searchQuery: '',
  sortBy: 'newest'
};

// DOM Elements
const yearFilterGroup = document.getElementById('yearFilterGroup');
const courseTabsList = document.getElementById('courseTabsList');
const allCoursesCountBadge = document.getElementById('allCoursesCountBadge');

const activeCourseBanner = document.getElementById('activeCourseBanner');
const bannerYearTag = document.getElementById('bannerYearTag');
const bannerCategoryTag = document.getElementById('bannerCategoryTag');
const bannerTitle = document.getElementById('bannerTitle');
const editCourseBtn = document.getElementById('editCourseBtn');
const deleteCourseBtn = document.getElementById('deleteCourseBtn');

const allCoursesOverviewSection = document.getElementById('allCoursesOverviewSection');
const courseBreakdownGrid = document.getElementById('courseBreakdownGrid');

// Stats Elements
const statMoneyLabel = document.getElementById('statMoneyLabel');
const statTotalAmount = document.getElementById('statTotalAmount');
const statStudentsLabel = document.getElementById('statStudentsLabel');
const statTotalCustomers = document.getElementById('statTotalCustomers');
const statAverageAmount = document.getElementById('statAverageAmount');

// Customer Modal Elements
const openAddModalBtn = document.getElementById('openAddModalBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const customerModal = document.getElementById('customerModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const customerForm = document.getElementById('customerForm');
const modalTitle = document.getElementById('modalTitle');
const modalTag = document.getElementById('modalTag');
const recordIdInput = document.getElementById('recordIdInput');
const customerCourseSelect = document.getElementById('customerCourseSelect');
const customerNameInput = document.getElementById('customerNameInput');
const currencySelect = document.getElementById('currencySelect');
const amountInput = document.getElementById('amountInput');
const notesInput = document.getElementById('notesInput');
const nameError = document.getElementById('nameError');
const amountError = document.getElementById('amountError');

// Image 1 upload
const dropZone = document.getElementById('dropZone');
const imageFileInput = document.getElementById('imageFileInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const imagePreviewBox = document.getElementById('imagePreviewBox');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImageBtn');

// Image 2 upload (Second Photo)
const dropZone2 = document.getElementById('dropZone2');
const imageFileInput2 = document.getElementById('imageFileInput2');
const uploadPlaceholder2 = document.getElementById('uploadPlaceholder2');
const imagePreviewBox2 = document.getElementById('imagePreviewBox2');
const previewImg2 = document.getElementById('previewImg2');
const removeImageBtn2 = document.getElementById('removeImageBtn2');

// Course Modal Elements
const openCourseModalBtn = document.getElementById('openCourseModalBtn');
const courseModal = document.getElementById('courseModal');
const closeCourseModalBtn = document.getElementById('closeCourseModalBtn');
const cancelCourseModalBtn = document.getElementById('cancelCourseModalBtn');
const courseForm = document.getElementById('courseForm');
const courseModalTag = document.getElementById('courseModalTag');
const courseModalTitle = document.getElementById('courseModalTitle');
const courseEditIdInput = document.getElementById('courseEditIdInput');
const saveCourseBtnText = document.getElementById('saveCourseBtnText');
const courseYearInput = document.getElementById('courseYearInput');
const courseNameInput = document.getElementById('courseNameInput');
const courseCategoryInput = document.getElementById('courseCategoryInput');
const courseYearError = document.getElementById('courseYearError');
const courseNameError = document.getElementById('courseNameError');

// Table & Empty state
const recordsSectionTitle = document.getElementById('recordsSectionTitle');
const recordCountBadge = document.getElementById('recordCountBadge');
const emptyState = document.getElementById('emptyState');
const emptyStateTitle = document.getElementById('emptyStateTitle');
const emptyStateDesc = document.getElementById('emptyStateDesc');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const recordsTableContainer = document.getElementById('recordsTableContainer');
const recordsTableBody = document.getElementById('recordsTableBody');
const courseColumnHeader = document.getElementById('courseColumnHeader');

// Search & Sort
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');

// Export & Import
const exportBtn = document.getElementById('exportBtn');
const importTriggerBtn = document.getElementById('importTriggerBtn');
const importFileInput = document.getElementById('importFileInput');

// Lightbox
const lightboxModal = document.getElementById('lightboxModal');
const closeLightboxBtn = document.getElementById('closeLightboxBtn');
const lightboxCustomerName = document.getElementById('lightboxCustomerName');
const lightboxAmount = document.getElementById('lightboxAmount');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxPhotoSwitcher = document.getElementById('lightboxPhotoSwitcher');
const lightboxPhoto1Btn = document.getElementById('lightboxPhoto1Btn');
const lightboxPhoto2Btn = document.getElementById('lightboxPhoto2Btn');

// Toast
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Cloud Sync Modal Selectors
const openSyncModalBtn = document.getElementById('openSyncModalBtn');
const syncModal = document.getElementById('syncModal');
const closeSyncModalBtn = document.getElementById('closeSyncModalBtn');
const toggleConfigGuideBtn = document.getElementById('toggleConfigGuideBtn');
const syncGuideBox = document.getElementById('syncGuideBox');
const syncConfigForm = document.getElementById('syncConfigForm');
const syncDbUrlInput = document.getElementById('syncDbUrlInput');
const syncApiKeyInput = document.getElementById('syncApiKeyInput');
const syncProjectIdInput = document.getElementById('syncProjectIdInput');
const saveSyncConfigBtn = document.getElementById('saveSyncConfigBtn');
const uploadLocalDataBtn = document.getElementById('uploadLocalDataBtn');
const disconnectSyncBtn = document.getElementById('disconnectSyncBtn');
const forceSyncNowBtn = document.getElementById('forceSyncNowBtn');
const copySyncLinkBtn = document.getElementById('copySyncLinkBtn');
const copySyncLinkBtnText = document.getElementById('copySyncLinkBtnText');

// ==========================================================================
// 3. Image Processing (File & Drag-Drop & Clipboard) - Dual Photo Support
// ==========================================================================
function processImageFile(file, photoNum = 1) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1200;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.82);
      setImagePreview(optimizedBase64, photoNum);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setImagePreview(dataUrl, photoNum = 1) {
  if (photoNum === 1) {
    state.currentImageBase64 = dataUrl;
    previewImg.src = dataUrl;
    uploadPlaceholder.style.display = 'none';
    imagePreviewBox.style.display = 'flex';
  } else {
    state.currentImage2Base64 = dataUrl;
    previewImg2.src = dataUrl;
    uploadPlaceholder2.style.display = 'none';
    imagePreviewBox2.style.display = 'flex';
  }
}

function clearImagePreview(photoNum = 1) {
  if (photoNum === 1) {
    state.currentImageBase64 = null;
    previewImg.src = '';
    imageFileInput.value = '';
    uploadPlaceholder.style.display = 'block';
    imagePreviewBox.style.display = 'none';
  } else {
    state.currentImage2Base64 = null;
    previewImg2.src = '';
    imageFileInput2.value = '';
    uploadPlaceholder2.style.display = 'block';
    imagePreviewBox2.style.display = 'none';
  }
}

// Drag & Drop for Photo 1
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.lastActiveDropZone = 1;
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('mouseenter', () => { state.lastActiveDropZone = 1; });
dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    processImageFile(files[0], 1);
  }
});

imageFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    processImageFile(e.target.files[0], 1);
  }
});

removeImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImagePreview(1);
});

// Drag & Drop for Photo 2
['dragenter', 'dragover'].forEach(eventName => {
  dropZone2.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.lastActiveDropZone = 2;
    dropZone2.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone2.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone2.classList.remove('drag-over');
  });
});

dropZone2.addEventListener('mouseenter', () => { state.lastActiveDropZone = 2; });
dropZone2.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    processImageFile(files[0], 2);
  }
});

imageFileInput2.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    processImageFile(e.target.files[0], 2);
  }
});

removeImageBtn2.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImagePreview(2);
});

// Clipboard Paste support (intelligently picks target slot)
window.addEventListener('paste', (e) => {
  if (!customerModal.classList.contains('is-open')) return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      let targetSlot = state.lastActiveDropZone || 1;
      // If photo 1 is already filled and photo 2 is empty, place into photo 2
      if (state.currentImageBase64 && !state.currentImage2Base64 && targetSlot === 1) {
        targetSlot = 2;
      }
      processImageFile(blob, targetSlot);
      showToast(`Image pasted into Photo ${targetSlot}!`);
      break;
    }
  }
});

// ==========================================================================
// 4. Course Management (Creation, Renaming/Editing & Deletion)
// ==========================================================================
function openCourseModal(mode = 'create', courseId = null) {
  courseYearError.classList.remove('is-visible');
  courseNameError.classList.remove('is-visible');
  courseForm.reset();

  if (mode === 'edit' && courseId) {
    const course = state.courses.find(c => c.id === courseId);
    if (!course) return;
    courseEditIdInput.value = course.id;
    courseModalTag.textContent = 'Edit Course Details (دەستکاری ناوی کۆرس)';
    courseModalTitle.textContent = `Edit Course: ${course.name}`;
    courseYearInput.value = course.year;
    courseNameInput.value = course.name;
    courseCategoryInput.value = course.category || 'General';
    saveCourseBtnText.textContent = 'Save Course Changes';
  } else {
    // Create mode
    courseEditIdInput.value = '';
    courseModalTag.textContent = 'Course Management';
    courseModalTitle.textContent = 'Create New Course Recorder';
    saveCourseBtnText.textContent = 'Create Course Recorder';
    const currentCalYear = new Date().getFullYear();
    courseYearInput.value = (state.activeYear !== 'all') ? state.activeYear : currentCalYear;
  }

  courseModal.classList.add('is-open');
  courseModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => courseNameInput.focus(), 80);
}

window.openEditCourseModal = (courseId) => {
  openCourseModal('edit', courseId);
};

function closeCourseModal() {
  courseModal.classList.remove('is-open');
  courseModal.setAttribute('aria-hidden', 'true');
  courseEditIdInput.value = '';
}

openCourseModalBtn.addEventListener('click', () => openCourseModal('create'));
closeCourseModalBtn.addEventListener('click', closeCourseModal);
cancelCourseModalBtn.addEventListener('click', closeCourseModal);

// Edit Course Name button in active banner
editCourseBtn.addEventListener('click', () => {
  if (state.activeCourseId !== 'all') {
    openCourseModal('edit', state.activeCourseId);
  }
});

courseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  courseYearError.classList.remove('is-visible');
  courseNameError.classList.remove('is-visible');

  const yearVal = parseInt(courseYearInput.value, 10);
  const nameVal = courseNameInput.value.trim();
  const categoryVal = courseCategoryInput.value;
  const editId = courseEditIdInput.value ? parseInt(courseEditIdInput.value, 10) : null;

  let hasError = false;
  if (isNaN(yearVal) || yearVal < 2000 || yearVal > 2100) {
    courseYearError.classList.add('is-visible');
    hasError = true;
  }
  if (!nameVal) {
    courseNameError.classList.add('is-visible');
    hasError = true;
  }
  if (hasError) return;

  try {
    if (editId) {
      // Edit / Rename existing course
      const existing = state.courses.find(c => c.id === editId);
      const updatedCourse = {
        ...existing,
        id: editId,
        name: nameVal,
        year: yearVal,
        category: categoryVal,
        updatedAt: Date.now()
      };

      await Database.updateCourse(updatedCourse);
      showToast(`Updated course: "${nameVal}"`);
      closeCourseModal();
      await loadDatabase();
      await CloudSync.pushData();
    } else {
      // Create new course
      const newCourse = {
        name: nameVal,
        year: yearVal,
        category: categoryVal,
        createdAt: Date.now()
      };

      const courseId = await Database.addCourse(newCourse);
      showToast(`Created course recorder: "${nameVal}" (${yearVal})`);
      closeCourseModal();

      state.activeCourseId = courseId;
      state.activeYear = String(yearVal);
      await loadDatabase();
      await CloudSync.pushData();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to save course', 'error');
  }
});

deleteCourseBtn.addEventListener('click', async () => {
  if (state.activeCourseId === 'all') return;
  const course = state.courses.find(c => c.id === state.activeCourseId);
  const courseName = course ? course.name : 'this course';

  const count = state.customers.filter(c => c.courseId === state.activeCourseId).length;
  const confirmMsg = `Are you sure you want to delete the course "${courseName}" and its ${count} student payment records?`;

  if (confirm(confirmMsg)) {
    try {
      await Database.deleteCourse(state.activeCourseId);
      showToast(`Deleted course "${courseName}"`);
      state.activeCourseId = 'all';
      await loadDatabase();
      await CloudSync.pushData();
    } catch (err) {
      console.error(err);
      showToast('Could not delete course', 'error');
    }
  }
});

// ==========================================================================
// 5. Customer Modal Controls (Add / Edit)
// ==========================================================================
function populateCourseDropdown(selectedCourseId) {
  customerCourseSelect.innerHTML = '';

  if (state.courses.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'General Cohort';
    customerCourseSelect.appendChild(opt);
    return;
  }

  state.courses.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.year}) - ${c.category}`;
    if (c.id === selectedCourseId) {
      opt.selected = true;
    }
    customerCourseSelect.appendChild(opt);
  });
}

function openCustomerModal(mode = 'create', record = null) {
  resetFormValidation();

  // If no courses exist yet, auto-generate a starter course so customers have a recorder
  let targetCourseId = state.activeCourseId !== 'all' ? state.activeCourseId : (state.courses[0]?.id || null);

  if (mode === 'edit' && record) {
    state.currentEditingCustomerId = record.id;
    modalTag.textContent = `Editing Record #${record.courseIndex || record.id}`;
    modalTitle.textContent = 'Edit Customer Payment';
    recordIdInput.value = record.id;
    customerNameInput.value = record.name || '';
    currencySelect.value = record.currency || '$';
    amountInput.value = record.amount !== undefined ? record.amount : '';
    notesInput.value = record.notes || '';

    populateCourseDropdown(record.courseId);

    if (record.image) {
      setImagePreview(record.image, 1);
    } else {
      clearImagePreview(1);
    }

    if (record.image2) {
      setImagePreview(record.image2, 2);
    } else {
      clearImagePreview(2);
    }
  } else {
    // Create Mode
    state.currentEditingCustomerId = null;
    modalTag.textContent = 'New Customer Payment Entry';
    modalTitle.textContent = 'Add Customer Payment';
    customerForm.reset();
    recordIdInput.value = '';
    currencySelect.value = 'IQD';
    populateCourseDropdown(targetCourseId);
    clearImagePreview(1);
    clearImagePreview(2);
  }

  customerModal.classList.add('is-open');
  customerModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => customerNameInput.focus(), 80);
}

function closeCustomerModal() {
  customerModal.classList.remove('is-open');
  customerModal.setAttribute('aria-hidden', 'true');
  state.currentEditingCustomerId = null;
}

openAddModalBtn.addEventListener('click', () => {
  // If user has no courses, prompt them or create a default course
  if (state.courses.length === 0) {
    openCourseModal();
    showToast('Please create a course recorder first!');
  } else {
    openCustomerModal('create');
  }
});

emptyAddBtn.addEventListener('click', () => {
  if (state.courses.length === 0) {
    openCourseModal();
    showToast('Please create a course recorder first!');
  } else {
    openCustomerModal('create');
  }
});

closeModalBtn.addEventListener('click', closeCustomerModal);
cancelModalBtn.addEventListener('click', closeCustomerModal);

// Close on backdrop click
customerModal.addEventListener('click', (e) => {
  if (e.target === customerModal) closeCustomerModal();
});

courseModal.addEventListener('click', (e) => {
  if (e.target === courseModal) closeCourseModal();
});

// Escape key to close modals
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (lightboxModal.classList.contains('is-open')) {
      closeLightbox();
    } else if (courseModal.classList.contains('is-open')) {
      closeCourseModal();
    } else if (customerModal.classList.contains('is-open')) {
      closeCustomerModal();
    }
  }
});

// ==========================================================================
// 6. Form Submission & Validation
// ==========================================================================
function resetFormValidation() {
  nameError.classList.remove('is-visible');
  amountError.classList.remove('is-visible');
  customerNameInput.style.borderColor = '';
  amountInput.style.borderColor = '';
}

customerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetFormValidation();

  const name = customerNameInput.value.trim();
  const amountVal = parseFloat(amountInput.value);
  const currency = currencySelect.value;
  const notes = notesInput.value.trim();
  const courseIdVal = parseInt(customerCourseSelect.value, 10) || (state.courses[0]?.id || 1);

  let hasError = false;

  if (!name) {
    nameError.classList.add('is-visible');
    customerNameInput.style.borderColor = 'var(--danger)';
    hasError = true;
  }

  if (isNaN(amountVal) || amountVal < 0) {
    amountError.classList.add('is-visible');
    amountInput.style.borderColor = 'var(--danger)';
    hasError = true;
  }

  if (hasError) return;

  const recordData = {
    courseId: courseIdVal,
    name,
    amount: amountVal,
    currency,
    image: state.currentImageBase64,
    image2: state.currentImage2Base64,
    notes,
    createdAt: Date.now()
  };

  try {
    if (state.currentEditingCustomerId) {
      const existing = state.customers.find(c => c.id === state.currentEditingCustomerId);
      recordData.id = state.currentEditingCustomerId;
      if (existing) {
        recordData.createdAt = existing.createdAt;
      }
      await Database.updateCustomer(recordData);
      showToast(`Updated record for "${name}"`);
    } else {
      await Database.addCustomer(recordData);
      showToast(`Added customer: "${name}"`);
    }

    closeCustomerModal();
    await loadDatabase();
    await CloudSync.pushData();
  } catch (err) {
    console.error('Error saving customer:', err);
    showToast('Failed to save record to database', 'error');
  }
});

// ==========================================================================
// 7. Rendering Engine (Calculations, Course Switcher, Table)
// ==========================================================================

/**
 * Loads courses & customers from IndexedDB, performs calculations, and updates UI
 */
async function loadDatabase() {
  try {
    state.courses = await Database.getAllCourses();
    state.customers = await Database.getAllCustomers();

    // Auto-migration: if customers exist without a courseId, or courses array is empty
    if (state.courses.length === 0 && state.customers.length > 0) {
      const defaultCourseId = await Database.addCourse({
        name: 'General Cohort',
        year: 2026,
        category: 'General',
        createdAt: Date.now()
      });
      state.courses = await Database.getAllCourses();
      for (const cust of state.customers) {
        if (!cust.courseId) {
          cust.courseId = defaultCourseId;
          await Database.updateCustomer(cust);
        }
      }
    }

    renderYearFilterChips();
    renderCourseTabs();
    renderActiveCourseBanner();
    calculateAndRenderStats();
    renderCourseBreakdownGrid();
    renderRecordsTable();
  } catch (err) {
    console.error('Database load error:', err);
  }
}

/**
 * Renders the Year Filter Chips dynamically based on existing courses
 */
function renderYearFilterChips() {
  const yearsSet = new Set(state.courses.map(c => String(c.year)));
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  let html = `
    <button class="year-chip ${state.activeYear === 'all' ? 'active' : ''}" data-year="all">
      All Years
    </button>
  `;

  years.forEach(y => {
    html += `
      <button class="year-chip ${state.activeYear === y ? 'active' : ''}" data-year="${y}">
        ${y}
      </button>
    `;
  });

  yearFilterGroup.innerHTML = html;

  // Add click listeners to year chips
  yearFilterGroup.querySelectorAll('.year-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeYear = btn.getAttribute('data-year');
      // If the currently active course does not match this year, switch to 'all'
      if (state.activeCourseId !== 'all') {
        const activeCourse = state.courses.find(c => c.id === state.activeCourseId);
        if (activeCourse && state.activeYear !== 'all' && String(activeCourse.year) !== state.activeYear) {
          state.activeCourseId = 'all';
        }
      }
      renderYearFilterChips();
      renderCourseTabs();
      renderActiveCourseBanner();
      calculateAndRenderStats();
      renderCourseBreakdownGrid();
      renderRecordsTable();
    });
  });
}

/**
 * Renders the Course Tabs switcher
 */
function renderCourseTabs() {
  // Filter courses by selected year
  let visibleCourses = state.courses;
  if (state.activeYear !== 'all') {
    visibleCourses = visibleCourses.filter(c => String(c.year) === state.activeYear);
  }

  // Count total records for "All Courses"
  let totalCustomersMatchingYear = state.customers.filter(cust => {
    if (state.activeYear === 'all') return true;
    const course = state.courses.find(c => c.id === cust.courseId);
    return course && String(course.year) === state.activeYear;
  }).length;

  allCoursesCountBadge.textContent = totalCustomersMatchingYear;

  let html = `
    <button class="course-tab ${state.activeCourseId === 'all' ? 'active' : ''}" data-course-id="all">
      <span class="tab-title">All Courses Overview</span>
      <span class="tab-count">${totalCustomersMatchingYear}</span>
    </button>
  `;

  visibleCourses.forEach(course => {
    const count = state.customers.filter(c => c.courseId === course.id).length;
    const isAct = state.activeCourseId === course.id;
    html += `
      <button class="course-tab ${isAct ? 'active' : ''}" data-course-id="${course.id}">
        <span class="tab-title">${escapeHtml(course.name)} (${course.year})</span>
        <span class="tab-count">${count}</span>
      </button>
    `;
  });

  courseTabsList.innerHTML = html;

  // Add tab click listeners
  courseTabsList.querySelectorAll('.course-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const cid = tab.getAttribute('data-course-id');
      state.activeCourseId = cid === 'all' ? 'all' : parseInt(cid, 10);
      renderCourseTabs();
      renderActiveCourseBanner();
      calculateAndRenderStats();
      renderCourseBreakdownGrid();
      renderRecordsTable();
    });
  });
}

/**
 * Renders active course banner if a specific course recorder is selected
 */
function renderActiveCourseBanner() {
  if (state.activeCourseId === 'all') {
    activeCourseBanner.style.display = 'none';
    allCoursesOverviewSection.style.display = state.courses.length > 0 ? 'block' : 'none';
  } else {
    const course = state.courses.find(c => c.id === state.activeCourseId);
    if (course) {
      activeCourseBanner.style.display = 'flex';
      allCoursesOverviewSection.style.display = 'none';
      bannerYearTag.textContent = `Year ${course.year}`;
      bannerCategoryTag.textContent = course.category || 'Course';
      bannerTitle.textContent = course.name;
    } else {
      activeCourseBanner.style.display = 'none';
      allCoursesOverviewSection.style.display = 'block';
    }
  }
}

/**
 * CALCULATIONS: Calculates money and student count based on active course & year filters
 */
function calculateAndRenderStats() {
  let relevantCustomers = state.customers;

  if (state.activeCourseId !== 'all') {
    // Specific Course selected
    relevantCustomers = relevantCustomers.filter(c => c.courseId === state.activeCourseId);
    const course = state.courses.find(c => c.id === state.activeCourseId);
    statMoneyLabel.textContent = `Course Money (${course ? course.name : ''})`;
    statStudentsLabel.textContent = 'Enrolled Students in Course';
  } else {
    // All Courses selected, optionally filtered by year
    if (state.activeYear !== 'all') {
      relevantCustomers = relevantCustomers.filter(cust => {
        const course = state.courses.find(c => c.id === cust.courseId);
        return course && String(course.year) === state.activeYear;
      });
      statMoneyLabel.textContent = `Total Money (${state.activeYear})`;
      statStudentsLabel.textContent = `Total Students (${state.activeYear})`;
    } else {
      statMoneyLabel.textContent = 'Total Money (All Courses & Years)';
      statStudentsLabel.textContent = 'Total Students Across All Courses';
    }
  }

  const count = relevantCustomers.length;
  const totalMoney = relevantCustomers.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const avgMoney = count > 0 ? totalMoney / count : 0;
  const primaryCurrency = relevantCustomers[0]?.currency || 'IQD';

  statTotalAmount.textContent = formatCurrency(totalMoney, primaryCurrency);
  statTotalCustomers.textContent = count;
  statAverageAmount.textContent = formatCurrency(avgMoney, primaryCurrency);
  recordCountBadge.textContent = `${count} ${count === 1 ? 'Record' : 'Records'}`;
}

/**
 * Renders the Course Breakdown Cards (shown when in "All Courses" mode)
 */
function renderCourseBreakdownGrid() {
  if (state.activeCourseId !== 'all' || state.courses.length === 0) {
    allCoursesOverviewSection.style.display = 'none';
    return;
  }

  allCoursesOverviewSection.style.display = 'block';

  let visibleCourses = state.courses;
  if (state.activeYear !== 'all') {
    visibleCourses = visibleCourses.filter(c => String(c.year) === state.activeYear);
  }

  if (visibleCourses.length === 0) {
    courseBreakdownGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No courses found for year ${state.activeYear}.</p>`;
    return;
  }

  courseBreakdownGrid.innerHTML = visibleCourses.map(course => {
    const enrolled = state.customers.filter(c => c.courseId === course.id);
    const count = enrolled.length;
    const courseTotal = enrolled.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return `
      <div class="course-card" onclick="selectCourse(${course.id})">
        <div>
          <div class="course-card-top">
            <div class="course-card-badges">
              <span class="course-card-year">${course.year}</span>
              <span class="course-card-category">${escapeHtml(course.category || 'Course')}</span>
            </div>
            <button type="button" class="btn-card-edit" onclick="event.stopPropagation(); openEditCourseModal(${course.id})" title="Edit Course Name">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit Name
            </button>
          </div>
          <h4 class="course-card-title">${escapeHtml(course.name)}</h4>
        </div>
        <div class="course-card-metrics">
          <div>
            <div class="card-metric-val">${formatCurrency(courseTotal, enrolled[0]?.currency || 'IQD')}</div>
            <div class="card-metric-sub">Total Collected</div>
          </div>
          <div style="text-align: right;">
            <div class="card-metric-val" style="color: #2563EB;">${count}</div>
            <div class="card-metric-sub">Students</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.selectCourse = (courseId) => {
  state.activeCourseId = courseId;
  renderCourseTabs();
  renderActiveCourseBanner();
  calculateAndRenderStats();
  renderCourseBreakdownGrid();
  renderRecordsTable();
};

/**
 * Renders the Records Table (Sequential indexing #1, #2, #3... to infinity)
 */
function renderRecordsTable() {
  let list = [...state.customers];

  // 1. Course & Year Filter
  if (state.activeCourseId !== 'all') {
    list = list.filter(c => c.courseId === state.activeCourseId);
    recordsSectionTitle.textContent = 'Course Payment Records';
  } else {
    recordsSectionTitle.textContent = 'All Customer Payment Entries';
    if (state.activeYear !== 'all') {
      list = list.filter(cust => {
        const course = state.courses.find(c => c.id === cust.courseId);
        return course && String(course.year) === state.activeYear;
      });
    }
  }

  // 2. Add sequential index within this filtered view (#1, #2, #3...)
  // Chronological order for numbering
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  list = list.map((item, index) => ({
    ...item,
    courseIndex: index + 1
  }));

  // 3. Search Filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(item => {
      const course = state.courses.find(c => c.id === item.courseId);
      const courseStr = course ? `${course.name} ${course.year}`.toLowerCase() : '';
      return (item.name && item.name.toLowerCase().includes(q)) ||
             (item.notes && item.notes.toLowerCase().includes(q)) ||
             courseStr.includes(q) ||
             String(item.amount).includes(q);
    });
  }

  // 4. Sorting
  switch (state.sortBy) {
    case 'oldest':
      list.sort((a, b) => a.courseIndex - b.courseIndex);
      break;
    case 'newest':
      list.sort((a, b) => b.courseIndex - a.courseIndex);
      break;
    case 'amount-high':
      list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
      break;
    case 'amount-low':
      list.sort((a, b) => (a.amount || 0) - (b.amount || 0));
      break;
    case 'name-az':
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
  }

  // Empty check
  if (state.customers.length === 0 && state.courses.length === 0) {
    emptyState.style.display = 'block';
    emptyStateTitle.textContent = 'No Courses or Records Yet';
    emptyStateDesc.textContent = 'Create your first course recorder or load the multi-course demo to get started.';
    recordsTableContainer.style.display = 'none';
    return;
  }

  if (list.length === 0) {
    if (state.searchQuery) {
      recordsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No records match "${escapeHtml(state.searchQuery)}"
          </td>
        </tr>
      `;
      recordsTableContainer.style.display = 'block';
      emptyState.style.display = 'none';
    } else {
      emptyState.style.display = 'block';
      emptyStateTitle.textContent = 'No Payments in this Course Yet';
      emptyStateDesc.textContent = 'Click "Add Customer" to record the first payment for this course.';
      recordsTableContainer.style.display = 'none';
    }
    return;
  }

  emptyState.style.display = 'none';
  recordsTableContainer.style.display = 'block';

  recordsTableBody.innerHTML = list.map(item => {
    const course = state.courses.find(c => c.id === item.courseId);
    const initials = (item.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const formattedAmt = formatCurrency(item.amount, item.currency || '$');

    const coursePill = course ? `
      <span class="course-table-pill">
        <span class="course-pill-year">${course.year}</span>
        ${escapeHtml(course.name)}
      </span>
    ` : `<span style="color: var(--text-dim);">General</span>`;

    let photoCell = '';
    if (item.image && item.image2) {
      photoCell = `
        <div class="photos-cell-group">
          <div class="receipt-thumb-wrap" onclick="openLightbox(${item.id}, 1)" title="Click to view Photo 1 (Payment Proof)">
            <img src="${item.image}" alt="Photo 1 for ${escapeHtml(item.name)}" class="receipt-thumb">
            <span class="photo-idx-badge">#1</span>
            <div class="receipt-thumb-overlay">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </div>
          </div>
          <div class="receipt-thumb-wrap" onclick="openLightbox(${item.id}, 2)" title="Click to view Photo 2 (Document / ID)">
            <img src="${item.image2}" alt="Photo 2 for ${escapeHtml(item.name)}" class="receipt-thumb">
            <span class="photo-idx-badge" style="background: rgba(124, 58, 237, 0.9);">#2</span>
            <div class="receipt-thumb-overlay">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </div>
          </div>
        </div>
      `;
    } else if (item.image) {
      photoCell = `
        <div class="receipt-thumb-wrap" onclick="openLightbox(${item.id}, 1)" title="Click to view Photo 1 (Payment Proof)">
          <img src="${item.image}" alt="Photo 1 for ${escapeHtml(item.name)}" class="receipt-thumb">
          <span class="photo-idx-badge">#1</span>
          <div class="receipt-thumb-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </div>
        </div>
      `;
    } else if (item.image2) {
      photoCell = `
        <div class="receipt-thumb-wrap" onclick="openLightbox(${item.id}, 2)" title="Click to view Photo 2 (Document / ID)">
          <img src="${item.image2}" alt="Photo 2 for ${escapeHtml(item.name)}" class="receipt-thumb">
          <span class="photo-idx-badge" style="background: rgba(124, 58, 237, 0.9);">#2</span>
          <div class="receipt-thumb-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
          </div>
        </div>
      `;
    } else {
      photoCell = `<span class="no-photo-badge">No photo attached</span>`;
    }

    return `
      <tr>
        <td>
          <span class="record-number">#${item.courseIndex}</span>
        </td>
        <td>
          <div class="customer-cell">
            <div class="avatar-circle">${initials}</div>
            <div>
              <span class="customer-name-text">${escapeHtml(item.name)}</span>
              ${item.notes ? `<span class="customer-note-text">${escapeHtml(item.notes)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>
          ${coursePill}
        </td>
        <td>
          <span class="amount-badge">${formattedAmt}</span>
        </td>
        <td>
          ${photoCell}
        </td>
        <td style="color: var(--text-muted); font-size: 13px;">
          ${formatDate(item.createdAt)}
        </td>
        <td>
          <div class="action-buttons-wrap">
            <button class="btn-icon-action" onclick="handleEditClick(${item.id})" title="Edit Customer Details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon-action btn-icon-delete" onclick="handleDeleteClick(${item.id})" title="Delete Customer Record">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount, currency = 'IQD') {
  const num = Number(amount) || 0;
  // For currencies like IQD, avoid trailing cents if whole number, otherwise show up to 2-3 decimals
  const isDinar = ['IQD', 'KWD', 'JOD', 'BHD', 'LYD', 'TND', 'DZD'].includes(currency);
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: isDinar && Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 3
  });

  if (['$', '€', '£', '¥'].includes(currency)) {
    return `${currency}${formatted}`;
  }
  return `${formatted} ${currency}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Global actions
window.handleEditClick = (id) => {
  const record = state.customers.find(c => c.id === id);
  if (record) {
    openCustomerModal('edit', record);
  }
};

window.handleDeleteClick = async (id) => {
  const record = state.customers.find(c => c.id === id);
  const name = record ? record.name : 'this customer';
  if (confirm(`Are you sure you want to delete payment record for "${name}"?`)) {
    try {
      await Database.deleteCustomer(id);
      showToast(`Record for "${name}" deleted`);
      await loadDatabase();
      await CloudSync.pushData();
    } catch (err) {
      console.error(err);
      showToast('Could not delete record', 'error');
    }
  }
};

window.openLightbox = (id, photoNum = 1) => {
  const record = state.customers.find(c => c.id === id);
  if (!record) return;

  const hasPhoto1 = Boolean(record.image);
  const hasPhoto2 = Boolean(record.image2);

  if (!hasPhoto1 && !hasPhoto2) return;

  // If requested photo slot doesn't exist, fallback to available one
  if (photoNum === 2 && !hasPhoto2) photoNum = 1;
  if (photoNum === 1 && !hasPhoto1) photoNum = 2;

  state.lightboxRecordId = id;
  state.lightboxPhotoIndex = photoNum;

  const course = state.courses.find(c => c.id === record.courseId);
  const courseStr = course ? `[${course.name} (${course.year})]` : '';

  lightboxCustomerName.textContent = `${record.name} ${courseStr}`;
  lightboxAmount.textContent = formatCurrency(record.amount, record.currency || '$');

  if (hasPhoto1 && hasPhoto2) {
    lightboxPhotoSwitcher.style.display = 'inline-flex';
    updateLightboxSwitcherUI(photoNum);
  } else {
    lightboxPhotoSwitcher.style.display = 'none';
  }

  lightboxImg.src = (photoNum === 1 ? record.image : record.image2) || '';

  lightboxModal.classList.add('is-open');
  lightboxModal.setAttribute('aria-hidden', 'false');
};

function updateLightboxSwitcherUI(activeNum) {
  if (activeNum === 1) {
    lightboxPhoto1Btn.classList.add('active');
    lightboxPhoto2Btn.classList.remove('active');
  } else {
    lightboxPhoto1Btn.classList.remove('active');
    lightboxPhoto2Btn.classList.add('active');
  }
}

function switchLightboxPhoto(photoNum) {
  if (!state.lightboxRecordId) return;
  const record = state.customers.find(c => c.id === state.lightboxRecordId);
  if (!record) return;

  if (photoNum === 1 && record.image) {
    state.lightboxPhotoIndex = 1;
    lightboxImg.src = record.image;
    updateLightboxSwitcherUI(1);
  } else if (photoNum === 2 && record.image2) {
    state.lightboxPhotoIndex = 2;
    lightboxImg.src = record.image2;
    updateLightboxSwitcherUI(2);
  }
}

lightboxPhoto1Btn.addEventListener('click', () => switchLightboxPhoto(1));
lightboxPhoto2Btn.addEventListener('click', () => switchLightboxPhoto(2));

// Arrow keys navigation in lightbox to toggle photo 1 and photo 2
window.addEventListener('keydown', (e) => {
  if (!lightboxModal.classList.contains('is-open')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    switchLightboxPhoto(1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    switchLightboxPhoto(2);
  }
});

function closeLightbox() {
  lightboxModal.classList.remove('is-open');
  lightboxModal.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
  state.lightboxRecordId = null;
}

closeLightboxBtn.addEventListener('click', closeLightbox);
lightboxModal.addEventListener('click', (e) => {
  if (e.target === lightboxModal) closeLightbox();
});

// ==========================================================================
// 8. Search & Sorting
// ==========================================================================
searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.trim();
  clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
  renderRecordsTable();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.searchQuery = '';
  clearSearchBtn.style.display = 'none';
  renderRecordsTable();
  searchInput.focus();
});

sortSelect.addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  renderRecordsTable();
});

// ==========================================================================
// 9. Export & Import Backup (Courses + Customers)
// ==========================================================================
exportBtn.addEventListener('click', async () => {
  try {
    const courses = await Database.getAllCourses();
    const customers = await Database.getAllCustomers();

    if (courses.length === 0 && customers.length === 0) {
      showToast('No records to export yet');
      return;
    }

    const backupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      courses,
      customers
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payvault_courses_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${courses.length} courses and ${customers.length} customer records`);
  } catch (err) {
    console.error(err);
    showToast('Export failed', 'error');
  }
});

importTriggerBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);

      // Support both new multi-course format and legacy flat customer array format
      if (data.courses && Array.isArray(data.courses) && data.customers && Array.isArray(data.customers)) {
        const idMap = new Map();
        for (const c of data.courses) {
          const oldId = c.id;
          delete c.id;
          const newId = await Database.addCourse(c);
          idMap.set(oldId, newId);
        }
        for (const cust of data.customers) {
          delete cust.id;
          if (cust.courseId && idMap.has(cust.courseId)) {
            cust.courseId = idMap.get(cust.courseId);
          }
          await Database.addCustomer(cust);
        }
        showToast('Successfully imported all courses and payment records!');
      } else if (Array.isArray(data)) {
        // Legacy flat customer array
        const defaultCourseId = await Database.addCourse({
          name: 'Imported Cohort',
          year: new Date().getFullYear(),
          category: 'General',
          createdAt: Date.now()
        });
        for (const cust of data) {
          delete cust.id;
          cust.courseId = defaultCourseId;
          await Database.addCustomer(cust);
        }
        showToast('Imported customer records into new cohort!');
      } else {
        throw new Error('Unsupported format');
      }

      importFileInput.value = '';
      await loadDatabase();
      await CloudSync.pushData();
    } catch (err) {
      console.error(err);
      showToast('Invalid backup file. Please select a valid PayVault JSON backup.', 'error');
    }
  };
  reader.readAsText(file);
});

// Toast notification
let toastTimer = null;
function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toastMsg.textContent = message;
  const icon = document.getElementById('toastIcon');
  if (type === 'error') {
    icon.style.background = 'var(--danger)';
    icon.style.boxShadow = '0 0 10px var(--danger)';
  } else {
    icon.style.background = 'var(--accent-green)';
    icon.style.boxShadow = '0 0 10px var(--accent-green)';
  }

  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}

// ==========================================================================
// 10. Multi-Course & Multi-Year Demo Samples Generator
// ==========================================================================
function createSampleReceiptImage(customerName, amountStr, courseTitle, txnId) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 600, 420);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(1, '#1E293B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 420);

  // Border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, 570, 390);

  // Banner
  ctx.fillStyle = '#10B981';
  ctx.fillRect(15, 15, 570, 70);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px "Outfit", sans-serif';
  ctx.fillText('TUITION PAYMENT RECEIPT', 35, 58);

  ctx.beginPath();
  ctx.arc(540, 50, 20, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('✓', 533, 57);

  // Amount
  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px sans-serif';
  ctx.fillText('PAYMENT RECEIVED', 35, 125);

  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(amountStr, 35, 175);

  // Course Details
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Student Name:', 35, 230);
  ctx.font = '15px sans-serif';
  ctx.fillText(customerName, 170, 230);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Enrolled Course:', 35, 270);
  ctx.font = '15px sans-serif';
  ctx.fillText(courseTitle, 170, 270);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Reference ID:', 35, 310);
  ctx.font = '15px monospace';
  ctx.fillText(txnId, 170, 310);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Status:', 35, 350);
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('VERIFIED & RECORDED', 170, 350);

  return canvas.toDataURL('image/jpeg', 0.88);
}

function createSampleDocumentImage(customerName, courseTitle, docType) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Background Gradient (Deep Indigo)
  const grad = ctx.createLinearGradient(0, 0, 600, 420);
  grad.addColorStop(0, '#1E1B4B');
  grad.addColorStop(1, '#312E81');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 420);

  // Border
  ctx.strokeStyle = '#4338CA';
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, 570, 390);

  // Header Banner
  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(15, 15, 570, 70);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px "Outfit", sans-serif';
  ctx.fillText(docType.toUpperCase(), 35, 56);

  // Badge
  ctx.beginPath();
  ctx.arc(540, 50, 18, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('ID', 532, 56);

  // Subtitle
  ctx.fillStyle = '#A5B4FC';
  ctx.font = '13px sans-serif';
  ctx.fillText('STUDENT ENROLLMENT DOCUMENTATION', 35, 125);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(customerName, 35, 175);

  // Details
  ctx.fillStyle = '#C7D2FE';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Program / Cohort:', 35, 230);
  ctx.font = '15px sans-serif';
  ctx.fillText(courseTitle, 185, 230);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Document Type:', 35, 270);
  ctx.font = '15px sans-serif';
  ctx.fillText(docType, 185, 270);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Verification Date:', 35, 310);
  ctx.font = '15px monospace';
  ctx.fillText(new Date().toISOString().slice(0, 10), 185, 310);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Security Status:', 35, 350);
  ctx.fillStyle = '#A7F3D0';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('AUTHENTICATED & VERIFIED', 185, 350);

  return canvas.toDataURL('image/jpeg', 0.88);
}

loadSampleBtn.addEventListener('click', async () => {
  // Course 1: Year 2026 - Web Development
  const c1Id = await Database.addCourse({
    name: 'Full-Stack Web Development',
    year: 2026,
    category: 'Programming',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30
  });

  // Course 2: Year 2026 - Graphic Design
  const c2Id = await Database.addCourse({
    name: 'Graphic Design & UI Masterclass',
    year: 2026,
    category: 'Design',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20
  });

  // Course 3: Year 2025 - Business English
  const c3Id = await Database.addCourse({
    name: 'Business English Fluency',
    year: 2025,
    category: 'Languages',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 200
  });

  // Students for Course 1 (Web Dev 2026)
  await Database.addCustomer({
    courseId: c1Id,
    name: 'Alexander Wright',
    amount: 1800000,
    currency: 'IQD',
    image: createSampleReceiptImage('Alexander Wright', '1,800,000 IQD', 'Full-Stack Web Dev', 'TXN-9482910'),
    image2: createSampleDocumentImage('Alexander Wright', 'Full-Stack Web Dev', 'Student Identity Card'),
    notes: 'Full tuition paid in Iraqi Dinar (Receipt + ID)',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5
  });

  await Database.addCustomer({
    courseId: c1Id,
    name: 'Sophia Chen',
    amount: 1500000,
    currency: 'IQD',
    image: createSampleReceiptImage('Sophia Chen', '1,500,000 IQD', 'Full-Stack Web Dev', 'TXN-3891024'),
    image2: createSampleDocumentImage('Sophia Chen', 'Full-Stack Web Dev', 'Scholarship Agreement'),
    notes: 'Early bird registration discount with signed agreement',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3
  });

  await Database.addCustomer({
    courseId: c1Id,
    name: 'Marcus Vance',
    amount: 1800000,
    currency: 'IQD',
    image: createSampleReceiptImage('Marcus Vance', '1,800,000 IQD', 'Full-Stack Web Dev', 'TXN-7719203'),
    notes: 'Tuition installment confirmed',
    createdAt: Date.now() - 1000 * 60 * 60 * 12
  });

  // Students for Course 2 (Design 2026)
  await Database.addCustomer({
    courseId: c2Id,
    name: 'Elena Rostova',
    amount: 950000,
    currency: 'IQD',
    image: createSampleReceiptImage('Elena Rostova', '950,000 IQD', 'Graphic Design & UI', 'TXN-5510293'),
    image2: createSampleDocumentImage('Elena Rostova', 'Graphic Design & UI', 'Transfer Confirmation Slip'),
    notes: 'Payment transfer receipt + bank stamp attached',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2
  });

  await Database.addCustomer({
    courseId: c2Id,
    name: 'Lucas Silva',
    amount: 900000,
    currency: 'IQD',
    image: createSampleReceiptImage('Lucas Silva', '900,000 IQD', 'Graphic Design & UI', 'TXN-4491029'),
    notes: 'Signed invoice attached',
    createdAt: Date.now() - 1000 * 60 * 60 * 8
  });

  // Students for Course 3 (English 2025)
  await Database.addCustomer({
    courseId: c3Id,
    name: 'Fatima Al-Mansoor',
    amount: 450,
    currency: 'JOD',
    image: createSampleReceiptImage('Fatima Al-Mansoor', '450 JOD', 'Business English', 'TXN-1102938'),
    image2: createSampleDocumentImage('Fatima Al-Mansoor', 'Business English', 'Placement Test Certificate'),
    notes: 'Cash receipt in Jordanian Dinar + test certificate',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60
  });

  await Database.addCustomer({
    courseId: c3Id,
    name: 'Tariq Johnson',
    amount: 450,
    currency: 'JOD',
    image: createSampleReceiptImage('Tariq Johnson', '450 JOD', 'Business English', 'TXN-8819201'),
    notes: 'Bank transfer in Jordanian Dinar',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 45
  });

  showToast('Loaded 3 courses with Dual-Photo Dinar payment records!');
  await loadDatabase();
  await CloudSync.pushData();
});

// ==========================================================================
// 10. Cloud Sync Modal Handlers & Device Pairing Listeners
// ==========================================================================
function openSyncModal() {
  const currentConfig = CloudSync.config || CloudSync.loadConfig();
  if (currentConfig) {
    syncDbUrlInput.value = currentConfig.databaseURL || '';
    syncApiKeyInput.value = currentConfig.apiKey || '';
    syncProjectIdInput.value = currentConfig.projectId || '';
  }
  CloudSync.updatePairingUI();
  syncModal.classList.add('is-open');
  syncModal.setAttribute('aria-hidden', 'false');
}

function closeSyncModal() {
  syncModal.classList.remove('is-open');
  syncModal.setAttribute('aria-hidden', 'true');
}

if (openSyncModalBtn) openSyncModalBtn.addEventListener('click', openSyncModal);
if (closeSyncModalBtn) closeSyncModalBtn.addEventListener('click', closeSyncModal);

if (syncModal) {
  syncModal.addEventListener('click', (e) => {
    if (e.target === syncModal) closeSyncModal();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && syncModal && syncModal.classList.contains('is-open')) {
    closeSyncModal();
  }
});

if (toggleConfigGuideBtn) {
  toggleConfigGuideBtn.addEventListener('click', () => {
    const isHidden = syncGuideBox.style.display === 'none';
    syncGuideBox.style.display = isHidden ? 'block' : 'none';
    toggleConfigGuideBtn.textContent = isHidden ? 'Hide setup guide ▴' : 'How to setup in 1 min (Free) ▾';
  });
}

if (syncConfigForm) {
  syncConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dbUrl = syncDbUrlInput.value.trim();
    const apiKey = syncApiKeyInput.value.trim();
    const projectId = syncProjectIdInput.value.trim();

    if (!dbUrl) {
      showToast('Please enter your Firebase Database URL', 'error');
      return;
    }

    const cfg = {
      databaseURL: dbUrl,
      apiKey: apiKey,
      projectId: projectId
    };

    saveSyncConfigBtn.disabled = true;
    saveSyncConfigBtn.textContent = 'Connecting...';

    const success = await CloudSync.connect(cfg, true);
    saveSyncConfigBtn.disabled = false;
    saveSyncConfigBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      Save & Connect Cloud
    `;

    if (success) {
      const localCourses = await Database.getAllCourses();
      const localCustomers = await Database.getAllCustomers();
      if (localCourses.length > 0 || localCustomers.length > 0) {
        await CloudSync.pushData();
      }
    }
  });
}

if (uploadLocalDataBtn) {
  uploadLocalDataBtn.addEventListener('click', async () => {
    if (confirm('Upload all local courses and customer payments to the cloud?')) {
      await CloudSync.pushData();
      showToast('Uploaded local records to cloud successfully!', 'success');
    }
  });
}

if (disconnectSyncBtn) {
  disconnectSyncBtn.addEventListener('click', () => {
    if (confirm('Disconnect from Cloud Database? Your local data will remain intact.')) {
      CloudSync.clearConfig();
      showToast('Disconnected from cloud sync.');
    }
  });
}

if (forceSyncNowBtn) {
  forceSyncNowBtn.addEventListener('click', async () => {
    if (!CloudSync.isConnected && CloudSync.config) {
      await CloudSync.connect(CloudSync.config, true);
    } else if (CloudSync.isConnected) {
      await CloudSync.pushData();
      showToast('Synced all data with cloud!');
    }
  });
}

if (copySyncLinkBtn) {
  copySyncLinkBtn.addEventListener('click', async () => {
    const linkInput = document.getElementById('syncShareLinkInput');
    if (linkInput && linkInput.value) {
      try {
        await navigator.clipboard.writeText(linkInput.value);
        if (copySyncLinkBtnText) copySyncLinkBtnText.textContent = 'Copied!';
        showToast('📋 Pairing link copied to clipboard!');
        setTimeout(() => {
          if (copySyncLinkBtnText) copySyncLinkBtnText.textContent = 'Copy Link';
        }, 2500);
      } catch (err) {
        linkInput.select();
        document.execCommand('copy');
        showToast('📋 Copied link!');
      }
    }
  });
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', async () => {
  await loadDatabase();
  await CloudSync.init();
});
