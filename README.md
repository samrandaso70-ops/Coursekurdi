# PayVault - Multi-Course & Multi-Year Customer Payment Database

A simple, fast, and persistent web application database to keep track of customer and student payments across different academic years and course types.

## ✨ Key Features

- **Multi-Course & Multi-Year Recorders**:
  - Create separate course recorders organized by **Year** (e.g. `2024`, `2025`, `2026`, `2027`) and **Course Type** (e.g. `Programming`, `Design`, `Languages`, `Business`).
  - Fast switcher tabs to jump between different courses with one click.
  - Filter by Year chips (`All Years`, `2025`, `2026`, etc.).

- **Automated Real-Time Calculations**:
  - 💰 **Total Money Collected** (calculated for each individual course, or grand total across all courses).
  - 👥 **Total Number of Students / Customers** (enrollment count for that course or globally).
  - 📊 **Average Payment Amount** per student.
  - 📋 **Course Breakdown Cards** displaying student counts and revenue for every course at a glance.

- **4-Section Payment Window (Modal)**:
  - **Section 1**: Customer / Student Name
  - **Section 2**: Amount of Money Paid (with currency selector: `IQD`, `KWD`, `JOD`, `$`, `€`, `£`, `AED`, `SAR`, etc.)
  - **Section 3**: Primary Photo / Receipt (Cash photo, transfer proof, screenshot)
  - **Section 4**: Second Photo / Additional Document (Student ID, contract, promissory note)
  - Course assignment dropdown (auto-preselected to active course)

- **Course Name Editing**:
  - Rename any course ledger directly from the top banner or overview breakdown cards.
  - Automatically updates across all tabs, cards, banners, and student payment entries.

- **📱 Real-Time Multi-Device Cloud Sync**:
  - Keep customer names, payments, dual photos, and courses **100% synchronized across Mobile, Tablet, and Laptop**.
  - Edit or add payment receipts on your phone or tablet; changes appear instantly on your laptop without refreshing!
  - 📷 **Instant QR Code Camera Pairing**: Open the camera on your phone/tablet and point it at your laptop screen to link devices in 1 second.
  - Powered by Firebase Realtime Database with local IndexedDB offline caching.

- **Persistent Database (Local & Cloud Mirror)**:
  - Stored inside local persistent database (`PayVaultDB`) for 0ms instant loading, with automated cloud synchronization.
  - Works offline and syncs automatically when connection is restored.

- **Full-Screen Multi-Photo Lightbox**:
  - Click any customer's photo thumbnail to inspect in high resolution.
  - Interactive photo switcher (`📷 Photo 1` / `📄 Photo 2`) and keyboard arrow key navigation.

- **Data Export & Import**:
  - One-click JSON backup of all courses, academic years, student payments, and both proof photos.

## 🌐 Live Links

- **GitHub Pages**: 👉 **[https://samrandaso70-ops.github.io/Coursekurdi/](https://samrandaso70-ops.github.io/Coursekurdi/)**
- **Vercel**: 👉 **[https://course-git-main-vvb4.vercel.app](https://course-git-main-vvb4.vercel.app)**
- **Local Server**: 👉 **[http://localhost:5500/](http://localhost:5500/)** (run `.\serve.ps1`)

