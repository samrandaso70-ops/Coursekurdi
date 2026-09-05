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

- **3-Section Payment Window (Modal)**:
  - **Section 1**: Customer / Student Name
  - **Section 2**: Amount of Money Paid (with currency selector: `$`, `€`, `£`, `¥`, `AED`, `SAR`, etc.)
  - **Section 3**: Picture of the Money / Payment Proof (file upload, drag & drop, and direct clipboard `Ctrl+V` screenshot paste)
  - Course assignment dropdown (auto-preselected to active course)

- **Persistent Database (IndexedDB)**:
  - Stored inside your browser's persistent database (`PayVaultDB`).
  - Never lost on refresh; works 100% offline with zero server costs or quota bottlenecks.

- **Full-Screen Lightbox**:
  - Click any customer's money thumbnail in the list to view and inspect the high-resolution photo.

- **Data Export & Import**:
  - One-click JSON backup of all courses, academic years, student payments, and proof photos.

## 🚀 How to Run

1. Open your browser and go to:
   👉 **[http://localhost:5500/](http://localhost:5500/)**
2. Or double-click `index.html` in your file explorer (`c:\Users\hp\Desktop\datanase antigravity\index.html`).
