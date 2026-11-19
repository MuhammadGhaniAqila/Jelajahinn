/* ==========================================================================
   Jelajahin — Sistem Pemesanan Tiket & Antrean Wahana Virtual (Dufan Ancol)
   Pure Vanilla JavaScript (ES6+) + LocalStorage Simulation
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'jelajahin_dufan_db_v1';

  /* ------------------------------------------------------------------------
     1. Utilitas Tanggal Kalender (Bebas Timezone Drift) & Pemformatan
     ------------------------------------------------------------------------ */
  const CalendarDate = {
    todayISO() {
      if (typeof Temporal !== 'undefined') {
        return Temporal.Now.plainDateISO('Asia/Jakarta').toString();
      }
      // Intl en-CA menghasilkan format YYYY-MM-DD sesuai kalender Asia/Jakarta
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    },

    parseParts(isoDate) {
      const [year, month, day] = isoDate.split('-').map(Number);
      return { year, month, day };
    },

    addDays(isoDate, days) {
      if (typeof Temporal !== 'undefined') {
        return Temporal.PlainDate.from(isoDate).add({ days }).toString();
      }
      const { year, month, day } = this.parseParts(isoDate);
      const utc = new Date(Date.UTC(year, month - 1, day + days));
      const y = utc.getUTCFullYear();
      const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
      const d = String(utc.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    compare(a, b) {
      if (typeof Temporal !== 'undefined') {
        return Temporal.PlainDate.compare(a, b);
      }
      return a < b ? -1 : a > b ? 1 : 0;
    },

    formatFullID(isoDate) {
      const { year, month, day } = this.parseParts(isoDate);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(utcDate);
    },

    formatShortParts(isoDate) {
      const { year, month, day } = this.parseParts(isoDate);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      const dayName = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'short' }).format(utcDate);
      const dayNum = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(utcDate);
      return { dayName, dayNum };
    },

    isWeekend(isoDate) {
      const { year, month, day } = this.parseParts(isoDate);
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return dow === 0 || dow === 6;
    },
  };

  function formatRupiah(nominal) {
    return 'Rp ' + Number(nominal || 0).toLocaleString('id-ID');
  }

  function formatNumberID(num) {
    return Number(num || 0).toLocaleString('id-ID');
  }

  function escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------------
     2. Seed Data Konsisten dengan Skema Database Proyek
        (users, paket_tikets, kuota_harians, wahanas, reservasi_tikets, antrean_virtuals)
     ------------------------------------------------------------------------ */
  function buildInitialQuotaSeeds() {
    const today = CalendarDate.todayISO();
    const list = [];

    for (let i = 0; i < 14; i++) {
      const tanggal = CalendarDate.addDays(today, i);
      const weekend = CalendarDate.isWeekend(tanggal);

      let status_operasional = 'Buka';
      let jam_buka = '10.00';
      let jam_tutup = weekend ? '20.00' : '18.00';
      let kuota_total = weekend ? 5500 : 5000;
      let kuota_tersedia = weekend ? 3150 : 4120;
      let keterangan = weekend ? 'Jam operasional akhir pekan lebih panjang' : 'Operasional reguler Dufan Ancol';

      if (i === 0) {
        kuota_total = 5000;
        kuota_tersedia = 3420;
        jam_tutup = '18.00';
        keterangan = 'Operasional reguler hari ini';
      } else if (i === 2) {
        kuota_tersedia = 285;
        keterangan = 'Kuota hampir habis';
      } else if (i === 3) {
        status_operasional = 'Tutup';
        jam_buka = '-';
        jam_tutup = '-';
        kuota_total = 0;
        kuota_tersedia = 0;
        keterangan = 'Tutup sementara (Perawatan berkala kawasan)';
      } else if (i === 4) {
        status_operasional = 'Buka';
        kuota_tersedia = 0;
        keterangan = 'Kuota pengunjung harian sudah penuh';
      }

      list.push({
        id: `kh-${tanggal}`,
        tanggal,
        status_operasional,
        jam_buka,
        jam_tutup,
        kuota_total,
        kuota_tersedia,
        keterangan,
      });
    }
    return list;
  }

  function createDefaultDB() {
    const today = CalendarDate.todayISO();

    return {
      current_user_id: null,
      users: [
        {
          id: 'usr-demo-1',
          nama_lengkap: 'Budi Wisatawan',
          email: 'budi@wisatawan.id',
          kata_sandi: 'jelajahin123',
          nik: '3172011811980001',
          no_whatsapp: '081234567890',
          created_at: `${today}T08:00:00+07:00`,
        },
      ],
      paket_tikets: [
        {
          id: 'pkt-reguler',
          nama_paket: 'Tiket Terusan Reguler',
          deskripsi: 'Tiket masuk kawasan Dufan + akses seluruh wahana terusan dengan hingga 2 antrean virtual aktif secara bersamaan.',
          harga: 250000,
          jatah_antrean_aktif: 2,
          is_populer: false,
          keunggulan: [
            'Akses seluruh wahana terusan Dufan seharian',
            'Maksimal 2 antrean virtual aktif bersamaan',
            'E-Ticket QR terbit instan tanpa cetak kertas',
            'Pantau status lampu wahana & keramaian real-time',
          ],
        },
        {
          id: 'pkt-bundling',
          nama_paket: 'Paket Bundling Jelajah',
          deskripsi: 'Pilihan terbaik untuk keluarga & pemburu wahana ekstrem dengan jatah hingga 4 antrean virtual aktif bersamaan.',
          harga: 350000,
          jatah_antrean_aktif: 4,
          is_populer: true,
          keunggulan: [
            'Akses seluruh wahana terusan Dufan seharian',
            'Maksimal 4 antrean virtual aktif bersamaan',
            'Rencanakan urutan wahana favorit lebih fleksibel',
            'Prioritas informasi pergantian kloter langsung di drawer',
          ],
        },
      ],
      kuota_harians: buildInitialQuotaSeeds(),
      wahanas: [
        {
          id: 'whn-halilintar',
          kode_wahana: 'H',
          nama_wahana: 'Halilintar',
          judul_hero: 'HALILINTAR - EKSTREM',
          zona: 'Ekstrem',
          kategori_usia: 'Remaja & Dewasa',
          tinggi_minimal_cm: 125,
          kapasitas_per_kloter: 24,
          durasi_menit: 3,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 7,
          kloter_berjalan: 12,
          urutan_hero: 1,
          gambar_url: 'https://images.unsplash.com/photo-1754045473527-d74b9bb55e80?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #0f172a 0%, #9a3412 52%, #f97316 100%)',
          deskripsi_singkat: 'Roller coaster lintasan ganda berkecepatan tinggi dengan putaran 360 derajat yang memacu adrenalin.',
        },
        {
          id: 'whn-niagara',
          kode_wahana: 'N',
          nama_wahana: 'Niagara Gara',
          judul_hero: 'NIAGARA GARA - AIR',
          zona: 'Air',
          kategori_usia: 'Keluarga & Remaja',
          tinggi_minimal_cm: 110,
          kapasitas_per_kloter: 12,
          durasi_menit: 5,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 2,
          kloter_berjalan: 8,
          urutan_hero: 2,
          gambar_url: 'https://images.unsplash.com/photo-1529281901731-f9b6ec160180?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #082f49 0%, #0e7490 55%, #38bdf8 100%)',
          deskripsi_singkat: 'Petualangan perahu kayu menyusuri kanal hingga luncuran air terjun setinggi 20 meter yang menyegarkan.',
        },
        {
          id: 'whn-istana-boneka',
          kode_wahana: 'I',
          nama_wahana: 'Istana Boneka',
          judul_hero: 'ISTANA BONEKA - KELUARGA',
          zona: 'Keluarga',
          kategori_usia: 'Semua Usia',
          tinggi_minimal_cm: 80,
          kapasitas_per_kloter: 20,
          durasi_menit: 10,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 14,
          kloter_berjalan: 5,
          urutan_hero: 3,
          gambar_url: 'https://images.unsplash.com/photo-1504027973709-58986e840e79?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #3b0764 0%, #9333ea 55%, #f472b6 100%)',
          deskripsi_singkat: 'Perjalanan perahu santai ber-AC melintasi diorama ratusan boneka budaya Nusantara dan mancanegara.',
        },
        {
          id: 'whn-kora-kora',
          kode_wahana: 'K',
          nama_wahana: 'Kora-Kora',
          judul_hero: 'KORA-KORA - EKSTREM',
          zona: 'Ekstrem',
          kategori_usia: 'Remaja & Dewasa',
          tinggi_minimal_cm: 125,
          kapasitas_per_kloter: 36,
          durasi_menit: 4,
          status_lampu: 'Merah',
          jumlah_pengantre_saat_ini: 9,
          kloter_berjalan: 11,
          urutan_hero: 4,
          gambar_url: 'https://images.unsplash.com/photo-1502136969935-8d8eef54d77b?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #1e1b4b 0%, #be123c 55%, #fb7185 100%)',
          deskripsi_singkat: 'Kapal bajak laut raksasa yang berayun hingga kemiringan ekstrem 90 derajat memberi sensasi melayang.',
        },
        {
          id: 'whn-bianglala',
          kode_wahana: 'B',
          nama_wahana: 'Biang Lala',
          judul_hero: 'BIANG LALA - KELUARGA',
          zona: 'Keluarga',
          kategori_usia: 'Semua Usia',
          tinggi_minimal_cm: 90,
          kapasitas_per_kloter: 48,
          durasi_menit: 12,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 3,
          kloter_berjalan: 4,
          urutan_hero: 5,
          gambar_url: 'https://images.unsplash.com/photo-1570494362424-2f53c0b9698b?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #0f172a 0%, #0369a1 52%, #22d3ee 100%)',
          deskripsi_singkat: 'Kincir ria ikonik Dufan setinggi 33 meter untuk menikmati panorama Teluk Jakarta dan kawasan Ancol.',
        },
        {
          id: 'whn-tornado',
          kode_wahana: 'T',
          nama_wahana: 'Tornado',
          judul_hero: 'TORNADO - EKSTREM',
          zona: 'Ekstrem',
          kategori_usia: 'Dewasa',
          tinggi_minimal_cm: 145,
          kapasitas_per_kloter: 40,
          durasi_menit: 4,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 16,
          kloter_berjalan: 9,
          urutan_hero: null,
          gambar_url: 'https://images.unsplash.com/photo-1771992932748-deff485351d8?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #18181b 0%, #b91c1c 55%, #f59e0b 100%)',
          deskripsi_singkat: 'Lengan raksasa berputar balik di udara dengan gravitasi ekstrem bagi pencari tantangan sejati.',
        },
        {
          id: 'whn-arung-jeram',
          kode_wahana: 'A',
          nama_wahana: 'Arung Jeram',
          judul_hero: 'ARUNG JERAM - AIR',
          zona: 'Air',
          kategori_usia: 'Keluarga & Remaja',
          tinggi_minimal_cm: 110,
          kapasitas_per_kloter: 8,
          durasi_menit: 6,
          status_lampu: 'Maintenance',
          jumlah_pengantre_saat_ini: 0,
          kloter_berjalan: 0,
          urutan_hero: null,
          gambar_url: 'https://images.unsplash.com/photo-1725758575869-969b8e5783bc?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #064e3b 0%, #0d9488 55%, #6ee7b7 100%)',
          deskripsi_singkat: 'Perahu karet bundar menaklukkan arus deras buatan dan cipratan air sungai berliku.',
        },
        {
          id: 'whn-turangga',
          kode_wahana: 'R',
          nama_wahana: 'Turangga-Rangga',
          judul_hero: 'TURANGGA-RANGGA - KELUARGA',
          zona: 'Keluarga',
          kategori_usia: 'Anak & Keluarga',
          tinggi_minimal_cm: 80,
          kapasitas_per_kloter: 32,
          durasi_menit: 4,
          status_lampu: 'Hijau',
          jumlah_pengantre_saat_ini: 2,
          kloter_berjalan: 7,
          urutan_hero: null,
          gambar_url: 'https://images.unsplash.com/photo-1756691569065-43f22ce1e1bd?auto=format&fit=crop&w=1000&q=80',
          gradasi_fallback: 'linear-gradient(135deg, #312e81 0%, #db2777 55%, #fbbf24 100%)',
          deskripsi_singkat: 'Komidi putar klasik berlampu hangat penuh warna yang aman dan ceria untuk anak-anak maupun keluarga.',
        },
      ],
      reservasi_tikets: [],
      antrean_virtuals: [],
      sequence_counters: {
        booking: 1,
        queue: 18,
      },
    };
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = createDefaultDB();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(raw);
      const defaults = createDefaultDB();
      // Pastikan tanggal kuota hari ini tetap up-to-date bila dibuka di hari baru
      const today = CalendarDate.todayISO();
      const existingDates = new Map((parsed.kuota_harians || []).map((q) => [q.tanggal, q]));
      const mergedQuotas = defaults.kuota_harians.map((seedQ) => existingDates.get(seedQ.tanggal) || seedQ);
      for (const [tgl, q] of existingDates.entries()) {
        if (CalendarDate.compare(tgl, today) >= 0 && !mergedQuotas.some((m) => m.tanggal === tgl)) {
          mergedQuotas.push(q);
        }
      }
      mergedQuotas.sort((a, b) => CalendarDate.compare(a.tanggal, b.tanggal));

      return {
        ...defaults,
        ...parsed,
        paket_tikets: defaults.paket_tikets,
        kuota_harians: mergedQuotas,
      };
    } catch {
      return createDefaultDB();
    }
  }

  let db = loadDB();

  function saveDB() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Abaikan bila mode privat browser membatasi storage
    }
  }

  /* ------------------------------------------------------------------------
     3. Helper Domain (Status Lampu, Tingkat Keramaian, Kuota, QR Matrix)
     ------------------------------------------------------------------------ */
  function getTingkatKeramaian(jumlahPengantre) {
    if (jumlahPengantre < 4) {
      return { key: 'Sepi', label: 'Sepi', className: 'crowd-sepi' };
    }
    if (jumlahPengantre <= 11) {
      return { key: 'Sedang', label: 'Sedang', className: 'crowd-sedang' };
    }
    return { key: 'Padat', label: 'Padat', className: 'crowd-padat' };
  }

  function getLampInfo(statusLampu) {
    if (statusLampu === 'Hijau') {
      return {
        shortLabel: 'HIJAU (SIAP NAIK)',
        badgeLabel: 'Hijau · Siap Naik',
        icon: '●',
        className: 'status-hijau',
      };
    }
    if (statusLampu === 'Merah') {
      return {
        shortLabel: 'MERAH (SEDANG BERMAIN)',
        badgeLabel: 'Merah · Sedang Bermain',
        icon: '■',
        className: 'status-merah',
      };
    }
    return {
      shortLabel: 'ORANYE (MAINTENANCE)',
      badgeLabel: 'Maintenance - Tutup Perawatan',
      icon: '▲',
      className: 'status-maintenance',
    };
  }

  function getQuotaForDate(isoDate) {
    if (!isoDate) return null;
    const found = db.kuota_harians.find((q) => q.tanggal === isoDate);
    if (found) return found;

    const today = CalendarDate.todayISO();
    if (CalendarDate.compare(isoDate, today) < 0) {
      return {
        id: `kh-past-${isoDate}`,
        tanggal: isoDate,
        status_operasional: 'Lampau',
        jam_buka: '-',
        jam_tutup: '-',
        kuota_total: 0,
        kuota_tersedia: 0,
        keterangan: 'Tanggal kunjungan sudah berlalu',
      };
    }

    const weekend = CalendarDate.isWeekend(isoDate);
    return {
      id: `kh-${isoDate}`,
      tanggal: isoDate,
      status_operasional: 'Buka',
      jam_buka: '10.00',
      jam_tutup: weekend ? '20.00' : '18.00',
      kuota_total: weekend ? 5500 : 5000,
      kuota_tersedia: weekend ? 4300 : 4650,
      keterangan: weekend ? 'Operasional akhir pekan tersedia' : 'Operasional reguler tersedia',
      is_virtual_seed: true,
    };
  }

  function ensureQuotaRecord(isoDate) {
    let rec = db.kuota_harians.find((q) => q.tanggal === isoDate);
    if (!rec) {
      rec = getQuotaForDate(isoDate);
      if (rec && rec.is_virtual_seed) {
        delete rec.is_virtual_seed;
        db.kuota_harians.push(rec);
      }
    }
    return rec;
  }

  function getCurrentUser() {
    if (!db.current_user_id) return null;
    return db.users.find((u) => u.id === db.current_user_id) || null;
  }

  function getUserReservations(userId) {
    return db.reservasi_tikets.filter((r) => r.user_id === userId);
  }

  function getActiveParkTicket(userId) {
    return db.reservasi_tikets.find(
      (r) => r.user_id === userId && r.status_kunjungan === 'Aktif di Kawasan'
    ) || null;
  }

  function getActiveQueuesForUser(userId) {
    return db.antrean_virtuals.filter(
      (q) =>
        q.user_id === userId &&
        (q.status_antrean === 'Menunggu' || q.status_antrean === 'Dipanggil')
    );
  }

  function getPackageById(paketId) {
    return db.paket_tikets.find((p) => p.id === paketId) || db.paket_tikets[0];
  }

  // Generator SVG QR Code deterministik 21x21 tanpa API eksternal
  function generateQRSVG(codeText) {
    const size = 21;
    const cells = Array.from({ length: size }, () => Array(size).fill(false));

    const drawFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          cells[r0 + r][c0 + c] = isBorder || isCenter;
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      cells[6][i] = i % 2 === 0;
      cells[i][6] = i % 2 === 0;
    }

    // Seed pseudo-acak deterministik berbasis string kode_qr
    let hash = 2166136261;
    for (let i = 0; i < codeText.length; i++) {
      hash ^= codeText.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const inFinderZone = (r, c) =>
      (r < 8 && c < 8) ||
      (r < 8 && c >= size - 8) ||
      (r >= size - 8 && c < 8) ||
      r === 6 ||
      c === 6;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!inFinderZone(r, c)) {
          hash ^= (r * 31 + c * 17);
          hash = Math.imul(hash, 16777619);
          cells[r][c] = (hash >>> 28) % 2 === 0;
        }
      }
    }

    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (cells[r][c]) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" />`;
        }
      }
    }

    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Kode QR E-Ticket ${escapeHTML(codeText)}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#0f172a">${rects}</g></svg>`;
  }

  /* ------------------------------------------------------------------------
     4. Notifikasi Toast & Live Region Accessibility
     ------------------------------------------------------------------------ */
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'success' ? 'is-success' : type === 'error' ? 'is-error' : ''}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 4200);
  }

  /* ------------------------------------------------------------------------
     5. Dialog Top-Layer Exit & Light-Dismiss Fallback (Sesuai Modern Web Guidance)
     ------------------------------------------------------------------------ */
  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }

  function supportsTopLayerExit() {
    return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
  }

  async function closeDialogSmooth(dialogEl) {
    if (!dialogEl || !dialogEl.open) return;
    if (!supportsTopLayerExit()) {
      dialogEl.setAttribute('data-closing', '');
      const animations = dialogEl.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 450)),
        ]);
      }
      if (!dialogEl.hasAttribute('data-closing')) return;
      dialogEl.removeAttribute('data-closing');
    }
    dialogEl.close();
  }

  function initDialogs() {
    const dialogs = document.querySelectorAll('dialog');
    const hasNativeClosedBy = 'closedBy' in HTMLDialogElement.prototype;

    dialogs.forEach((dialog) => {
      dialog.addEventListener('cancel', (event) => {
        if (event.cancelable) {
          event.preventDefault();
          closeDialogSmooth(dialog);
        }
      });

      if (!hasNativeClosedBy && dialog.getAttribute('closedby') === 'any') {
        let pressedOutside = false;
        const isOutside = (e) => {
          const r = dialog.getBoundingClientRect();
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = isOutside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && isOutside(e)) {
            closeDialogSmooth(dialog);
          }
        });
      }
    });

    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.closeDialog);
        closeDialogSmooth(target);
      });
    });
  }

  /* ------------------------------------------------------------------------
     6. Validasi Form Aksesibel (:user-invalid + ARIA Live Sync + Fallback)
     ------------------------------------------------------------------------ */
  function initAccessibleValidation() {
    const linkError = (el, shown) => {
      const errorId = el.dataset.error;
      if (!errorId) return;
      const ids = (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (shown) ids.push(errorId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    };

    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.classList.add('visually-hidden');
    document.body.append(announcer);
    let announceTimer;
    let announcedField;

    const getErrorMessage = (el) => {
      const errNode = document.getElementById(el.dataset.error);
      return errNode ? errNode.textContent.trim() : '';
    };

    const announceError = (el) => {
      const msg = getErrorMessage(el);
      if (!msg) return;
      const label = el.labels?.[0] ? `${el.labels[0].textContent.replace('*', '').trim()}: ` : '';
      clearTimeout(announceTimer);
      announcer.textContent = '';
      announcedField = el;
      announceTimer = setTimeout(() => {
        announcer.textContent = label + msg;
      }, 450);
    };

    const supportsUserInvalid = CSS.supports('selector(:user-invalid)');
    const dirtyState = new WeakMap();
    const flagged = new WeakSet();
    const announced = new WeakSet();

    const syncAria = (el, announce = false) => {
      if (!el.matches?.('input, select, textarea') || !el.dataset.error) return;
      const isInvalid = supportsUserInvalid
        ? el.matches(':user-invalid')
        : el.classList.contains('user-invalid-fallback');

      if (isInvalid) {
        if (announce && !announced.has(el)) {
          announceError(el);
          announced.add(el);
        }
        el.setAttribute('aria-invalid', 'true');
        linkError(el, true);
        flagged.add(el);
      } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
        el.setAttribute('aria-invalid', 'false');
        linkError(el, false);
        flagged.delete(el);
        announced.delete(el);
        if (announcedField === el) {
          clearTimeout(announceTimer);
          announcer.textContent = '';
        }
      }
    };

    document.querySelectorAll('[data-error]').forEach((el) => {
      el.setAttribute('aria-invalid', 'false');
    });

    if (!supportsUserInvalid) {
      const updateFallback = (input) => {
        const isValid = input.validity.valid;
        input.classList.toggle('user-invalid-fallback', !isValid);
        input.classList.toggle('user-valid-fallback', isValid);
      };
      document.addEventListener('blur', (e) => {
        const input = e.target;
        if (!input.checkValidity) return;
        const st = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        st.hasBlurred = true;
        dirtyState.set(input, st);
        if (st.hasInteracted) updateFallback(input);
      }, true);
      document.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.checkValidity) return;
        const st = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        st.hasInteracted = true;
        dirtyState.set(input, st);
        if (st.hasBlurred) updateFallback(input);
      });
      document.addEventListener('invalid', (e) => {
        const input = e.target;
        dirtyState.set(input, { hasInteracted: true, hasBlurred: true });
        updateFallback(input);
      }, true);
    }

    document.addEventListener('blur', (e) => syncAria(e.target, true), true);
    document.addEventListener('input', (e) => {
      if (e.target.hasAttribute('aria-invalid')) syncAria(e.target);
    });
    document.addEventListener('change', (e) => syncAria(e.target, true), true);
    document.addEventListener('invalid', (e) => {
      announced.add(e.target);
      syncAria(e.target);
    }, true);

    return { syncAria };
  }

  let validationHelper;

  function markFormFieldsTouchedAndValidate(formEl) {
    const controls = [...formEl.querySelectorAll('input, select, textarea')];
    let firstInvalid = null;

    for (const control of controls) {
      if (!control.checkValidity()) {
        if (!firstInvalid) firstInvalid = control;
        control.classList.add('user-invalid-fallback');
        if (validationHelper) validationHelper.syncAria(control);
      } else {
        control.classList.remove('user-invalid-fallback');
        if (validationHelper) validationHelper.syncAria(control);
      }
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     7. HERO 3D ORBITAL CAROUSEL, PARALLAX KURSOR & BACKGROUND CROSS-FADE
     ------------------------------------------------------------------------ */
  const heroRides = db.wahanas
    .filter((w) => w.urutan_hero !== null)
    .sort((a, b) => a.urutan_hero - b.urutan_hero);

  let targetHeroStep = 0;
  let visualHeroPos = 0;
  let animStartPos = 0;
  let animTargetPos = 0;
  let animStartTime = 0;
  let isOrbitAnimating = false;
  let animFrameId = null;
  let activeBgSlot = 'A';
  let lastBackdropRideIdx = 0;

  // State animasi paralaks mengikuti kursor (hanya pointer presisi, halus via lerp)
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let pointerCurrentX = 0;
  let pointerCurrentY = 0;
  let hoverTargetLift = 0;
  let hoverCurrentLift = 0;

  const ORBIT_DURATION_MS = 800;
  const coverflowStage = document.getElementById('coverflow-stage');
  const heroBgA = document.getElementById('hero-bg-a');
  const heroBgB = document.getElementById('hero-bg-b');
  const heroOverlay = document.getElementById('hero-active-overlay');
  const heroTitle = document.getElementById('hero-active-title');
  const heroExitingTitle = document.getElementById('hero-exiting-title');
  const heroCarousel = document.getElementById('hero-carousel');
  let heroCardNodes = [];
  let titleInAnim = null;
  let titleOutAnim = null;

  function wrapSignedOffset(index, pos, total) {
    let d = (((index - pos) % total) + total) % total;
    if (d >= total / 2) d -= total;
    return d;
  }

  function easeOutQuartSoft(t) {
    return 1 - Math.pow(1 - t, 3.2);
  }

  function animateTitleTransition(prevText, nextText, directionSign) {
    if (!heroTitle) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canAnimate = typeof heroTitle.animate === 'function';

    if (titleInAnim) titleInAnim.cancel();
    if (titleOutAnim) titleOutAnim.cancel();

    heroTitle.textContent = nextText;

    if (!canAnimate) {
      if (heroExitingTitle) heroExitingTitle.style.opacity = '0';
      return;
    }

    if (prefersReducedMotion) {
      if (heroExitingTitle) heroExitingTitle.style.opacity = '0';
      titleInAnim = heroTitle.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 180, easing: 'ease-out', fill: 'both' }
      );
      return;
    }

    const dir = directionSign >= 0 ? 1 : -1;

    if (heroExitingTitle && prevText && prevText !== nextText) {
      heroExitingTitle.textContent = prevText;
      titleOutAnim = heroExitingTitle.animate(
        [
          {
            opacity: 1,
            transform: 'translate3d(0, 0, 0) scale(1)',
            filter: 'blur(0px)',
          },
          {
            opacity: 0,
            transform: `translate3d(${-dir * 42}px, 0, 0) scale(0.94)`,
            filter: 'blur(6px)',
          },
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'both',
        }
      );
    }

    titleInAnim = heroTitle.animate(
      [
        {
          opacity: 0,
          transform: `translate3d(${dir * 46}px, 0, 0) scale(0.94)`,
          filter: 'blur(6px)',
        },
        {
          opacity: 1,
          transform: 'translate3d(0, 0, 0) scale(1)',
          filter: 'blur(0px)',
        },
      ],
      {
        duration: 620,
        delay: 90,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      }
    );
  }

  function renderOrbitalFrame() {
    const total = heroRides.length;
    if (!total || heroCardNodes.length === 0) return;

    const stageWidth = coverflowStage.clientWidth || 1000;
    const cardWidth = heroCardNodes[0].offsetWidth || 275;
    const isNarrow = stageWidth < 680;

    // Jarak horizontal lebih lega antar-kartu sekaligus menjaga kedalaman orbit 3D
    const spreadX = isNarrow
      ? Math.min(stageWidth * 0.44, cardWidth * 1.46)
      : Math.min(stageWidth * 0.43, cardWidth * 1.76);
    const depthRadius = isNarrow ? cardWidth * 0.95 : cardWidth * 1.15;

    let closestIdx = 0;
    let closestAbsDist = Infinity;

    heroCardNodes.forEach((card, idx) => {
      const d = wrapSignedOffset(idx, visualHeroPos, total);
      const absD = Math.abs(d);
      if (absD < closestAbsDist) {
        closestAbsDist = absD;
        closestIdx = idx;
      }

      // Pemetaan periodik mulus pada lingkaran penuh [-PI, +PI]
      const u = d / (total / 2); // [-1, 1]
      const phi = Math.PI * (0.48 * u + 0.52 * Math.pow(u, 7));

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const frontFactor = (cosPhi + 1) / 2;
      const centerWeight = Math.max(0, 1 - absD / 0.75);

      // Seluruh kartu di panggung ikut bergoyang serasi sesuai kedalaman
      const cursorShiftX = pointerCurrentX * (10 * centerWeight + 5.5 * frontFactor);
      const cursorShiftY = pointerCurrentY * (8 * centerWeight + 4 * frontFactor);
      const cursorTiltY = pointerCurrentX * (4.5 * centerWeight + 3.2 * frontFactor);
      const cursorTiltX = -pointerCurrentY * (3.8 * centerWeight + 2.5 * frontFactor);
      const hoverScaleBoost = 1 + 0.024 * hoverCurrentLift * centerWeight;

      const x = spreadX * sinPhi + cursorShiftX;
      const z = depthRadius * (cosPhi - 1);
      const yawDeg = sinPhi * (isNarrow ? 26 : 29) + cursorTiltY;
      const scale = (0.6 + 0.4 * Math.pow(frontFactor, 1.15)) * hoverScaleBoost;
      const brightness = 0.36 + 0.64 * Math.pow(frontFactor, 0.85);
      const opacity = Math.max(0, Math.min(1, Math.pow(frontFactor, 0.9) * 1.25));
      const zIndex = Math.round(500 + cosPhi * 400);

      card.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${cursorShiftY.toFixed(2)}px), ${z.toFixed(2)}px) rotateX(${cursorTiltX.toFixed(2)}deg) rotateY(${yawDeg.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      card.style.opacity = opacity.toFixed(3);
      card.style.filter = `brightness(${brightness.toFixed(3)})`;
      card.style.zIndex = String(zIndex);
      card.style.boxShadow =
        absD < 0.35
          ? '0 32px 72px rgba(0, 0, 0, 0.72)'
          : '0 20px 44px rgba(0, 0, 0, 0.5)';
      card.style.pointerEvents = absD > 2.15 ? 'none' : 'auto';
      card.setAttribute('aria-current', idx === closestIdx ? 'true' : 'false');
    });

    // Paralaks halus untuk container overlay judul agar mengikuti kursor serasi di depan kartu tengah
    const titleShiftX = pointerCurrentX * (isNarrow ? 12 : 22);
    const titleShiftY = pointerCurrentY * (isNarrow ? 9 : 16);
    const titleTiltY = pointerCurrentX * 4.5;
    const titleTiltX = -pointerCurrentY * 3.5;
    heroOverlay.style.transform = `translate(-50%, -50%) translate3d(${titleShiftX.toFixed(1)}px, ${titleShiftY.toFixed(1)}px, 0) rotateX(${titleTiltX.toFixed(2)}deg) rotateY(${titleTiltY.toFixed(2)}deg)`;

    // Paralaks lembut pada latar blur belakang
    heroBgA.style.setProperty('--bg-px', `${(-pointerCurrentX * 14).toFixed(1)}px`);
    heroBgA.style.setProperty('--bg-py', `${(-pointerCurrentY * 10).toFixed(1)}px`);
    heroBgB.style.setProperty('--bg-px', `${(-pointerCurrentX * 14).toFixed(1)}px`);
    heroBgB.style.setProperty('--bg-py', `${(-pointerCurrentY * 10).toFixed(1)}px`);

    if (closestIdx !== lastBackdropRideIdx) {
      lastBackdropRideIdx = closestIdx;
      updateHeroBackdrop(heroRides[closestIdx]);
    }
  }

  function tickHeroLoop(now) {
    let needsMoreFrames = false;

    if (isOrbitAnimating) {
      const elapsed = now - animStartTime;
      const progress = Math.min(1, elapsed / ORBIT_DURATION_MS);
      const eased = easeOutQuartSoft(progress);
      visualHeroPos = animStartPos + (animTargetPos - animStartPos) * eased;
      if (progress >= 1) {
        visualHeroPos = animTargetPos;
        isOrbitAnimating = false;
      } else {
        needsMoreFrames = true;
      }
    }

    const dx = pointerTargetX - pointerCurrentX;
    const dy = pointerTargetY - pointerCurrentY;
    const dl = hoverTargetLift - hoverCurrentLift;
    if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002 || Math.abs(dl) > 0.002) {
      pointerCurrentX += dx * 0.095;
      pointerCurrentY += dy * 0.095;
      hoverCurrentLift += dl * 0.12;
      needsMoreFrames = true;
    } else {
      pointerCurrentX = pointerTargetX;
      pointerCurrentY = pointerTargetY;
      hoverCurrentLift = hoverTargetLift;
    }

    renderOrbitalFrame();

    if (needsMoreFrames) {
      animFrameId = requestAnimationFrame(tickHeroLoop);
    } else {
      animFrameId = null;
    }
  }

  function ensureHeroLoop() {
    if (animFrameId || typeof requestAnimationFrame !== 'function') return;
    animFrameId = requestAnimationFrame(tickHeroLoop);
  }

  function buildHeroCarousel() {
    coverflowStage.innerHTML = '';
    heroCardNodes = [];

    heroRides.forEach((ride, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'coverflow-card';
      card.dataset.index = String(idx);
      card.style.backgroundImage = ride.gradasi_fallback;
      card.setAttribute('aria-label', ride.nama_wahana);

      const img = document.createElement('img');
      img.className = 'coverflow-card-img';
      img.src = ride.gambar_url;
      img.alt = `${ride.nama_wahana} di Dunia Fantasi Ancol`;
      img.width = 450;
      img.height = 695;
      if (idx === 0) {
        img.setAttribute('fetchpriority', 'high');
      } else if (idx === 2 || idx === 3) {
        img.setAttribute('fetchpriority', 'low');
      }
      img.addEventListener('error', () => {
        img.style.opacity = '0';
      });

      const scrim = document.createElement('div');
      scrim.className = 'coverflow-card-scrim';

      card.append(img, scrim);
      card.addEventListener('click', () => {
        const total = heroRides.length;
        const activeMod = ((targetHeroStep % total) + total) % total;
        if (idx === activeMod) {
          jumpToRideInCatalog(ride.id);
        } else {
          const delta = wrapSignedOffset(idx, activeMod, total);
          moveHeroBySteps(Math.round(delta));
        }
      });
      coverflowStage.appendChild(card);
      heroCardNodes.push(card);
    });

    const firstRide = heroRides[0];
    heroTitle.textContent = firstRide.nama_wahana.toUpperCase();
    heroBgA.style.backgroundImage = `url("${firstRide.gambar_url}"), ${firstRide.gradasi_fallback}`;
    heroBgA.classList.add('is-visible');
    renderOrbitalFrame();

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => renderOrbitalFrame());
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => renderOrbitalFrame());
      ro.observe(coverflowStage);
    }
  }

  function updateHeroBackdrop(ride) {
    const nextStyle = `url("${ride.gambar_url}"), ${ride.gradasi_fallback}`;
    if (activeBgSlot === 'A') {
      heroBgB.style.backgroundImage = nextStyle;
      heroBgB.classList.add('is-visible');
      heroBgA.classList.remove('is-visible');
      activeBgSlot = 'B';
    } else {
      heroBgA.style.backgroundImage = nextStyle;
      heroBgA.classList.add('is-visible');
      heroBgB.classList.remove('is-visible');
      activeBgSlot = 'A';
    }
  }

  function moveHeroBySteps(deltaSteps) {
    if (!deltaSteps) return;
    const total = heroRides.length;
    const prevIdx = ((targetHeroStep % total) + total) % total;
    targetHeroStep += deltaSteps;
    const nextIdx = ((targetHeroStep % total) + total) % total;

    animateTitleTransition(
      heroRides[prevIdx].nama_wahana.toUpperCase(),
      heroRides[nextIdx].nama_wahana.toUpperCase(),
      deltaSteps
    );

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || typeof requestAnimationFrame !== 'function') {
      visualHeroPos = targetHeroStep;
      renderOrbitalFrame();
      return;
    }

    animStartPos = visualHeroPos;
    animTargetPos = targetHeroStep;
    animStartTime = performance.now();
    isOrbitAnimating = true;
    ensureHeroLoop();
  }

  // Listener paralaks kursor serasi di seluruh panggung Hero (kartu samping ikut bergoyang lembut)
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const heroSectionEl = document.getElementById('beranda');

  heroSectionEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointerQuery.matches || reducedMotionQuery.matches) return;
    const rect = coverflowStage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerTargetX = Math.max(-1, Math.min(1, normX));
    pointerTargetY = Math.max(-1, Math.min(1, normY));

    const total = heroRides.length;
    const activeMod = ((targetHeroStep % total) + total) % total;
    const activeCard = heroCardNodes[activeMod];
    if (activeCard) {
      const cr = activeCard.getBoundingClientRect();
      const insideCenter =
        e.clientX >= cr.left && e.clientX <= cr.right && e.clientY >= cr.top && e.clientY <= cr.bottom;
      hoverTargetLift = insideCenter ? 1 : 0;
    }

    ensureHeroLoop();
  });

  heroSectionEl.addEventListener('pointerleave', () => {
    pointerTargetX = 0;
    pointerTargetY = 0;
    hoverTargetLift = 0;
    ensureHeroLoop();
  });

  function updateHeroVisuals() {
    renderOrbitalFrame();
  }

  document.getElementById('hero-prev').addEventListener('click', () => {
    moveHeroBySteps(-1);
  });

  document.getElementById('hero-next').addEventListener('click', () => {
    moveHeroBySteps(1);
  });

  heroCarousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveHeroBySteps(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveHeroBySteps(1);
    }
  });

  // Dukungan swipe sentuh pada mobile / tablet
  let touchStartX = null;
  let touchStartY = null;
  heroCarousel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  heroCarousel.addEventListener('touchend', (e) => {
    if (touchStartX === null || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
      moveHeroBySteps(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  /* ------------------------------------------------------------------------
     8. Navbar Sticky State & Active Scroll Indicator
     ------------------------------------------------------------------------ */
  const siteHeader = document.getElementById('site-header');
  const heroSection = document.getElementById('beranda');
  const navLinks = document.querySelectorAll('.primary-nav .nav-link[data-nav]');

  function setActiveNav(navKey) {
    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === navKey);
    });
  }

  const heroVisibilityObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      siteHeader.classList.toggle('is-scrolled', !entry.isIntersecting);
    },
    { threshold: 0.14 }
  );
  heroVisibilityObserver.observe(heroSection);

  const sectionMap = [
    { id: 'beranda', nav: 'beranda' },
    { id: 'kuota', nav: 'beranda' },
    { id: 'wahana', nav: 'wahana' },
    { id: 'paket', nav: 'paket' },
    { id: 'cara-kerja', nav: 'cara-kerja' },
  ];

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((en) => en.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const match = sectionMap.find((s) => s.id === visible.target.id);
      if (match) setActiveNav(match.nav);
    },
    { threshold: [0.25, 0.55], rootMargin: '-80px 0px -35% 0px' }
  );

  sectionMap.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) sectionObserver.observe(el);
  });

  /* ------------------------------------------------------------------------
     9. Section Info Taman & Cek Kuota Harian (kuota_harians)
     ------------------------------------------------------------------------ */
  let selectedQuotaDate = CalendarDate.todayISO();

  const todayDateLabel = document.getElementById('today-date-label');
  const todayOpBadge = document.getElementById('today-op-badge');
  const todayHoursVal = document.getElementById('today-hours-value');
  const todayQuotaRem = document.getElementById('today-quota-remaining');
  const todayQuotaPercent = document.getElementById('today-quota-percent');
  const todayQuotaProgress = document.getElementById('today-quota-progress');
  const footerTodayStatus = document.getElementById('footer-today-status');
  const quickDatesWrap = document.getElementById('quota-quick-dates');
  const quotaDatePicker = document.getElementById('quota-date-picker');
  const quotaSelectedResult = document.getElementById('quota-selected-result');

  function renderQuotaSection() {
    const today = CalendarDate.todayISO();
    const todayRec = getQuotaForDate(today);

    todayDateLabel.textContent = CalendarDate.formatFullID(today);

    if (todayRec.status_operasional === 'Buka' && todayRec.kuota_tersedia > 0) {
      todayOpBadge.className = 'status-pill status-pill-open';
      todayOpBadge.innerHTML = '<span class="pill-indicator" aria-hidden="true"></span><span>BUKA</span>';
      todayHoursVal.textContent = `${todayRec.jam_buka} – ${todayRec.jam_tutup} WIB`;
      todayQuotaRem.textContent = `${formatNumberID(todayRec.kuota_tersedia)} dari ${formatNumberID(todayRec.kuota_total)} kuota tersisa`;
      footerTodayStatus.textContent = `BUKA (${todayRec.jam_buka} – ${todayRec.jam_tutup} WIB)`;
    } else if (todayRec.status_operasional === 'Buka') {
      todayOpBadge.className = 'status-pill status-pill-warn';
      todayOpBadge.innerHTML = '<span class="pill-indicator" aria-hidden="true"></span><span>KUOTA PENUH</span>';
      todayHoursVal.textContent = `${todayRec.jam_buka} – ${todayRec.jam_tutup} WIB`;
      todayQuotaRem.textContent = `0 dari ${formatNumberID(todayRec.kuota_total)} kuota tersisa`;
      footerTodayStatus.textContent = `BUKA · KUOTA PENUH`;
    } else {
      todayOpBadge.className = 'status-pill status-pill-closed';
      todayOpBadge.innerHTML = '<span class="pill-indicator" aria-hidden="true"></span><span>TUTUP</span>';
      todayHoursVal.textContent = 'Tutup Operasional';
      todayQuotaRem.textContent = 'Tidak ada kuota tersedia';
      footerTodayStatus.textContent = 'TUTUP';
    }

    const total = todayRec.kuota_total || 1;
    const filled = Math.max(0, total - todayRec.kuota_tersedia);
    const pct = todayRec.kuota_total > 0 ? Math.round((filled / total) * 100) : 100;
    todayQuotaProgress.max = total;
    todayQuotaProgress.value = filled;
    todayQuotaProgress.textContent = `${pct}%`;
    todayQuotaPercent.textContent = `${pct}% terisi`;

    const btnBookToday = document.getElementById('btn-book-today');
    btnBookToday.disabled = todayRec.status_operasional !== 'Buka' || todayRec.kuota_tersedia <= 0;

    // Render 7 hari mendatang sebagai quick chips
    quickDatesWrap.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const tgl = CalendarDate.addDays(today, i);
      const rec = getQuotaForDate(tgl);
      const { dayName, dayNum } = CalendarDate.formatShortParts(tgl);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `date-chip ${tgl === selectedQuotaDate ? 'is-selected' : ''}`;

      let tagText = 'Tersedia';
      let tagClass = 'is-open';
      if (rec.status_operasional !== 'Buka') {
        tagText = 'Tutup';
        tagClass = 'is-closed';
      } else if (rec.kuota_tersedia === 0) {
        tagText = 'Penuh';
        tagClass = 'is-closed';
      } else if (rec.kuota_tersedia < 500) {
        tagText = `Sisa ${formatNumberID(rec.kuota_tersedia)}`;
        tagClass = 'is-warn';
      }

      btn.innerHTML = `
        <span class="date-chip-day">${i === 0 ? 'Hari Ini' : escapeHTML(dayName)}</span>
        <span class="date-chip-num">${escapeHTML(dayNum)}</span>
        <span class="date-chip-tag ${tagClass}">${escapeHTML(tagText)}</span>
      `;
      btn.addEventListener('click', () => {
        selectedQuotaDate = tgl;
        quotaDatePicker.value = tgl;
        renderQuotaSection();
      });
      quickDatesWrap.appendChild(btn);
    }

    quotaDatePicker.min = today;
    quotaDatePicker.value = selectedQuotaDate;
    renderSelectedQuotaResult();
  }

  function renderSelectedQuotaResult() {
    const rec = getQuotaForDate(selectedQuotaDate);
    if (!rec) return;

    const dateLabel = CalendarDate.formatFullID(rec.tanggal);
    const isOpenWithStock = rec.status_operasional === 'Buka' && rec.kuota_tersedia > 0;

    let badgeHTML = '';
    let detailHTML = '';
    if (rec.status_operasional === 'Lampau') {
      badgeHTML = '<span class="status-pill status-pill-closed"><span class="pill-indicator" aria-hidden="true"></span><span>TANGGAL LAMPAU</span></span>';
      detailHTML = 'Tanggal ini sudah berlalu dan tidak dapat dipesan.';
    } else if (rec.status_operasional !== 'Buka') {
      badgeHTML = '<span class="status-pill status-pill-closed"><span class="pill-indicator" aria-hidden="true"></span><span>TUTUP</span></span>';
      detailHTML = `${escapeHTML(rec.keterangan)}. Silakan pilih tanggal kunjungan lain.`;
    } else if (rec.kuota_tersedia <= 0) {
      badgeHTML = '<span class="status-pill status-pill-closed"><span class="pill-indicator" aria-hidden="true"></span><span>KUOTA PENUH</span></span>';
      detailHTML = `Jam buka ${rec.jam_buka} – ${rec.jam_tutup} WIB, namun seluruh ${formatNumberID(rec.kuota_total)} kuota hari ini telah habis dipesan.`;
    } else {
      const isLow = rec.kuota_tersedia < 500;
      badgeHTML = `<span class="status-pill ${isLow ? 'status-pill-warn' : 'status-pill-open'}"><span class="pill-indicator" aria-hidden="true"></span><span>${isLow ? 'HAMPIR PENUH' : 'BUKA · TERSEDIA'}</span></span>`;
      detailHTML = `Jam operasional <strong>${rec.jam_buka} – ${rec.jam_tutup} WIB</strong> · Tersisa <strong>${formatNumberID(rec.kuota_tersedia)} dari ${formatNumberID(rec.kuota_total)} kuota</strong> (${escapeHTML(rec.keterangan)}).`;
    }

    quotaSelectedResult.innerHTML = `
      <div class="quota-result-head">
        <span class="quota-result-date">${escapeHTML(dateLabel)}</span>
        ${badgeHTML}
      </div>
      <p class="quota-result-detail">${detailHTML}</p>
      ${
        isOpenWithStock
          ? `<div><button type="button" class="btn btn-sm btn-primary" id="btn-book-selected-date">Pesan Tiket Tanggal Ini</button></div>`
          : ''
      }
    `;

    const bookBtn = document.getElementById('btn-book-selected-date');
    if (bookBtn) {
      bookBtn.addEventListener('click', () => {
        openBookingModal(null, rec.tanggal);
      });
    }
  }

  quotaDatePicker.addEventListener('change', (e) => {
    if (!e.target.value) return;
    selectedQuotaDate = e.target.value;
    renderQuotaSection();
  });

  document.getElementById('btn-book-today').addEventListener('click', () => {
    openBookingModal(null, CalendarDate.todayISO());
  });

  /* ------------------------------------------------------------------------
     10. Section Katalog & Filter Wahana Interaktif (wahanas)
     ------------------------------------------------------------------------ */
  const catalogFilters = {
    query: '',
    zona: 'Semua',
    keramaian: 'Semua',
    tinggiCm: 160,
    highlightedRideId: null,
  };

  const filterSearchInput = document.getElementById('filter-search');
  const filterHeightRange = document.getElementById('filter-height-range');
  const filterHeightNumber = document.getElementById('filter-height-number');
  const heightFilterSummary = document.getElementById('height-filter-summary');
  const ridesGrid = document.getElementById('rides-grid');
  const ridesEmptyState = document.getElementById('rides-empty-state');

  function updateHeightSliderProgress() {
    const min = Number(filterHeightRange.min);
    const max = Number(filterHeightRange.max);
    const val = Number(filterHeightRange.value);
    const pct = ((val - min) / (max - min)) * 100;
    filterHeightRange.style.setProperty('--progress', `${pct}%`);
  }

  function getFilteredRides() {
    const q = catalogFilters.query.trim().toLowerCase();
    return db.wahanas.filter((ride) => {
      const crowd = getTingkatKeramaian(ride.jumlah_pengantre_saat_ini);
      const matchesQuery =
        !q ||
        ride.nama_wahana.toLowerCase().includes(q) ||
        ride.zona.toLowerCase().includes(q) ||
        ride.deskripsi_singkat.toLowerCase().includes(q);
      const matchesZona = catalogFilters.zona === 'Semua' || ride.zona === catalogFilters.zona;
      const matchesCrowd = catalogFilters.keramaian === 'Semua' || crowd.key === catalogFilters.keramaian;
      const matchesHeight = ride.tinggi_minimal_cm <= catalogFilters.tinggiCm;
      return matchesQuery && matchesZona && matchesCrowd && matchesHeight;
    });
  }

  function renderCatalog() {
    const filtered = getFilteredRides();
    const safeForHeightTotal = db.wahanas.filter(
      (r) => r.tinggi_minimal_cm <= catalogFilters.tinggiCm
    ).length;

    heightFilterSummary.textContent =
      `Menampilkan ${filtered.length} wahana (${safeForHeightTotal} dari ${db.wahanas.length} wahana Dufan aman dinaiki untuk tinggi badan ${catalogFilters.tinggiCm} cm).`;

    ridesGrid.innerHTML = '';

    if (filtered.length === 0) {
      ridesEmptyState.hidden = false;
      return;
    }

    ridesEmptyState.hidden = true;
    const currentUser = getCurrentUser();
    const activeTicket = currentUser ? getActiveParkTicket(currentUser.id) : null;
    const hasPendingTicket = currentUser
      ? getUserReservations(currentUser.id).some((r) => r.status_kunjungan === 'Belum Check-in')
      : false;
    const activeQueues = currentUser ? getActiveQueuesForUser(currentUser.id) : [];

    filtered.forEach((ride) => {
      const lamp = getLampInfo(ride.status_lampu);
      const crowd = getTingkatKeramaian(ride.jumlah_pengantre_saat_ini);
      const existingQueue = activeQueues.find((q) => q.wahana_id === ride.id);

      const card = document.createElement('article');
      card.className = `surface-card ride-card ${catalogFilters.highlightedRideId === ride.id ? 'is-highlighted' : ''}`;
      card.id = `card-${ride.id}`;

      let actionHTML = '';
      if (!currentUser) {
        actionHTML = `
          <button type="button" class="btn btn-outline btn-full" data-ride-action="login" data-ride-id="${ride.id}">
            Masuk &amp; Pesan Tiket untuk Antre
          </button>
          <p class="ride-queue-note">Perlu E-Ticket berstatus Aktif di Kawasan untuk mengambil antrean virtual.</p>
        `;
      } else if (!activeTicket && hasPendingTicket) {
        actionHTML = `
          <button type="button" class="btn btn-secondary btn-full" data-ride-action="activate-ticket" data-ride-id="${ride.id}">
            Aktifkan E-Ticket di Gerbang Masuk
          </button>
          <p class="ride-queue-note">Tiket Anda masih berstatus Belum Check-in. Klik untuk simulasi scan gerbang.</p>
        `;
      } else if (!activeTicket) {
        actionHTML = `
          <button type="button" class="btn btn-primary btn-full" data-ride-action="book" data-ride-id="${ride.id}">
            Pesan Tiket untuk Mengantre
          </button>
          <p class="ride-queue-note">Anda belum memiliki E-Ticket Aktif di Kawasan hari ini.</p>
        `;
      } else if (existingQueue) {
        actionHTML = `
          <button type="button" class="btn btn-secondary btn-full" data-ride-action="view-queue" data-ride-id="${ride.id}">
            Sudah Mengantre (${escapeHTML(existingQueue.nomor_antrean)}) · Lihat Antrean
          </button>
          <p class="ride-queue-note">Kloter #${existingQueue.nomor_kloter} · Estimasi tunggu ~${existingQueue.estimasi_waktu_tunggu_menit} menit.</p>
        `;
      } else if (ride.status_lampu === 'Maintenance') {
        actionHTML = `
          <button type="button" class="btn btn-outline btn-full" data-ride-action="maintenance-blocked" data-ride-id="${ride.id}" aria-disabled="true">
            Sedang Maintenance · Tutup Perawatan
          </button>
          <p class="ride-queue-note">Wahana tidak menerima antrean virtual selama perawatan berlangsung.</p>
        `;
      } else {
        const activePkg = getPackageById(activeTicket.paket_id);
        actionHTML = `
          <button type="button" class="btn btn-primary btn-full" data-ride-action="enqueue" data-ride-id="${ride.id}">
            Ambil Antrean Virtual
          </button>
          <p class="ride-queue-note">Slot terpakai: ${activeQueues.length}/${activePkg.jatah_antrean_aktif} antrean aktif (${escapeHTML(activePkg.nama_paket)}).</p>
        `;
      }

      card.innerHTML = `
        <div class="ride-media" style="background: ${ride.gradasi_fallback};">
          <img
            class="ride-media-img"
            src="${ride.gambar_url}"
            alt="Wahana ${escapeHTML(ride.nama_wahana)} di Dufan Ancol"
            width="800"
            height="500"
            loading="lazy"
          >
          <div class="ride-media-overlay" aria-hidden="true"></div>
          <span class="ride-zona-chip">Zona ${escapeHTML(ride.zona)}</span>
          <span class="ride-code-chip">Kode #${escapeHTML(ride.kode_wahana)}</span>
        </div>

        <div class="ride-body">
          <div class="ride-badges-row">
            <span class="status-badge ${lamp.className}">
              <span aria-hidden="true">${lamp.icon}</span>
              <span>${escapeHTML(lamp.badgeLabel)}</span>
            </span>
            <span class="crowd-badge ${crowd.className}">
              <span>Keramaian: ${escapeHTML(crowd.label)} (${ride.jumlah_pengantre_saat_ini})</span>
            </span>
          </div>

          <div>
            <h3 class="ride-title">${escapeHTML(ride.nama_wahana)}</h3>
            <p class="ride-desc">${escapeHTML(ride.deskripsi_singkat)}</p>
          </div>

          <dl class="ride-specs">
            <div class="ride-spec-item">
              <dt>Tinggi Minimal</dt>
              <dd>${ride.tinggi_minimal_cm} cm</dd>
            </div>
            <div class="ride-spec-item">
              <dt>Kategori Usia</dt>
              <dd>${escapeHTML(ride.kategori_usia)}</dd>
            </div>
            <div class="ride-spec-item">
              <dt>Kapasitas Kloter</dt>
              <dd>${ride.kapasitas_per_kloter} orang</dd>
            </div>
            <div class="ride-spec-item">
              <dt>Durasi Main</dt>
              <dd>${ride.durasi_menit} menit</dd>
            </div>
          </dl>

          <div class="ride-footer">
            ${actionHTML}
          </div>
        </div>
      `;

      const imgEl = card.querySelector('.ride-media-img');
      imgEl.addEventListener('error', () => {
        imgEl.style.opacity = '0';
      });

      ridesGrid.appendChild(card);
    });
  }

  function jumpToRideInCatalog(rideId) {
    resetAllFilters(false);
    catalogFilters.highlightedRideId = rideId;
    renderCatalog();
    const targetCard = document.getElementById(`card-${rideId}`) || document.getElementById('wahana');
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetAllFilters(shouldRender = true) {
    catalogFilters.query = '';
    catalogFilters.zona = 'Semua';
    catalogFilters.keramaian = 'Semua';
    catalogFilters.tinggiCm = 160;
    catalogFilters.highlightedRideId = null;

    filterSearchInput.value = '';
    filterHeightRange.value = '160';
    filterHeightNumber.value = '160';
    updateHeightSliderProgress();

    document.querySelectorAll('#filter-zona-group .filter-chip').forEach((btn) => {
      const sel = btn.dataset.zona === 'Semua';
      btn.classList.toggle('is-selected', sel);
      btn.setAttribute('aria-pressed', String(sel));
    });
    document.querySelectorAll('#filter-keramaian-group .filter-chip').forEach((btn) => {
      const sel = btn.dataset.keramaian === 'Semua';
      btn.classList.toggle('is-selected', sel);
      btn.setAttribute('aria-pressed', String(sel));
    });

    if (shouldRender) renderCatalog();
  }

  filterSearchInput.addEventListener('input', (e) => {
    catalogFilters.query = e.target.value;
    catalogFilters.highlightedRideId = null;
    renderCatalog();
  });

  document.getElementById('filter-zona-group').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zona]');
    if (!btn) return;
    catalogFilters.zona = btn.dataset.zona;
    catalogFilters.highlightedRideId = null;
    document.querySelectorAll('#filter-zona-group .filter-chip').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-selected', active);
      b.setAttribute('aria-pressed', String(active));
    });
    renderCatalog();
  });

  document.getElementById('filter-keramaian-group').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-keramaian]');
    if (!btn) return;
    catalogFilters.keramaian = btn.dataset.keramaian;
    catalogFilters.highlightedRideId = null;
    document.querySelectorAll('#filter-keramaian-group .filter-chip').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-selected', active);
      b.setAttribute('aria-pressed', String(active));
    });
    renderCatalog();
  });

  function syncHeightValue(rawVal) {
    const clamped = Math.min(200, Math.max(80, Number(rawVal) || 80));
    catalogFilters.tinggiCm = clamped;
    catalogFilters.highlightedRideId = null;
    filterHeightRange.value = String(clamped);
    filterHeightNumber.value = String(clamped);
    updateHeightSliderProgress();
    renderCatalog();
  }

  filterHeightRange.addEventListener('input', (e) => syncHeightValue(e.target.value));
  filterHeightNumber.addEventListener('change', (e) => syncHeightValue(e.target.value));

  document.querySelectorAll('.preset-btn[data-height]').forEach((btn) => {
    btn.addEventListener('click', () => syncHeightValue(btn.dataset.height));
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => resetAllFilters(true));
  document.getElementById('btn-empty-reset').addEventListener('click', () => resetAllFilters(true));

  ridesGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ride-action]');
    if (!btn) return;
    const action = btn.dataset.rideAction;
    const rideId = btn.dataset.rideId;

    if (action === 'login') {
      openAuthModal('login');
      showToast('Silakan masuk atau daftar akun terlebih dahulu untuk mengantre.');
    } else if (action === 'book') {
      openBookingModal();
    } else if (action === 'activate-ticket' || action === 'view-queue') {
      openETicketDrawer();
    } else if (action === 'maintenance-blocked') {
      showToast('Wahana ini sedang Maintenance (Tutup Perawatan) dan tidak menerima antrean.', 'error');
    } else if (action === 'enqueue') {
      handleTakeVirtualQueue(rideId);
    }
  });

  /* ------------------------------------------------------------------------
     11. Logika Pengambilan & Pembatalan Antrean Virtual (antrean_virtuals)
     ------------------------------------------------------------------------ */
  function handleTakeVirtualQueue(rideId) {
    const user = getCurrentUser();
    if (!user) {
      openAuthModal('login');
      return;
    }

    const activeTicket = getActiveParkTicket(user.id);
    if (!activeTicket) {
      showToast('E-Ticket Anda belum berstatus Aktif di Kawasan. Lakukan simulasi scan gerbang dahulu.', 'error');
      openETicketDrawer();
      return;
    }

    const ride = db.wahanas.find((w) => w.id === rideId);
    if (!ride) return;

    // 1. Tolak jika Maintenance
    if (ride.status_lampu === 'Maintenance') {
      showToast(`Gagal: Wahana ${ride.nama_wahana} berstatus Maintenance (Tutup Perawatan).`, 'error');
      return;
    }

    const activeQueues = getActiveQueuesForUser(user.id);

    // 2. Tolak antrean ganda pada wahana yang sama
    if (activeQueues.some((q) => q.wahana_id === ride.id)) {
      showToast(`Anda sudah mengantre di ${ride.nama_wahana}. Antrean ganda tidak diizinkan.`, 'error');
      return;
    }

    // 3. Tolak jika melebihi jatah paket
    const pkg = getPackageById(activeTicket.paket_id);
    if (activeQueues.length >= pkg.jatah_antrean_aktif) {
      showToast(
        `Jatah antrean aktif penuh (${activeQueues.length}/${pkg.jatah_antrean_aktif} untuk ${pkg.nama_paket}). Batalkan salah satu antrean dahulu.`,
        'error'
      );
      openETicketDrawer();
      return;
    }

    // Lolos validasi -> Buat nomor antrean, nomor kloter, estimasi tunggu
    const seq = db.sequence_counters.queue++;
    const nomor_antrean = `#${ride.kode_wahana}-${String(seq).padStart(3, '0')}`;
    const posisiDalamAntrean = ride.jumlah_pengantre_saat_ini + 1;
    const offsetKloter = Math.ceil(posisiDalamAntrean / ride.kapasitas_per_kloter);
    const nomor_kloter = (ride.kloter_berjalan || 1) + offsetKloter;
    const estimasi_waktu_tunggu_menit = Math.max(
      ride.durasi_menit,
      offsetKloter * ride.durasi_menit + (ride.status_lampu === 'Merah' ? 3 : 0)
    );

    const entry = {
      id: `aq-${Date.now()}`,
      reservasi_id: activeTicket.id,
      user_id: user.id,
      wahana_id: ride.id,
      nomor_antrean,
      nomor_kloter,
      estimasi_waktu_tunggu_menit,
      status_antrean: 'Menunggu',
      waktu_daftar: new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    db.antrean_virtuals.unshift(entry);
    ride.jumlah_pengantre_saat_ini += 1;
    saveDB();

    renderCatalog();
    updateHeaderUserState();
    updateHeroVisuals(false);
    showToast(
      `Berhasil masuk antrean ${ride.nama_wahana}: Nomor ${nomor_antrean} (Kloter #${nomor_kloter}, ~${estimasi_waktu_tunggu_menit} menit).`,
      'success'
    );
  }

  function handleCancelVirtualQueue(queueId) {
    const idx = db.antrean_virtuals.findIndex((q) => q.id === queueId);
    if (idx === -1) return;
    const queue = db.antrean_virtuals[idx];
    if (queue.status_antrean !== 'Menunggu') return;

    queue.status_antrean = 'Dibatalkan';
    const ride = db.wahanas.find((w) => w.id === queue.wahana_id);
    if (ride && ride.jumlah_pengantre_saat_ini > 0) {
      ride.jumlah_pengantre_saat_ini -= 1;
    }

    saveDB();
    renderCatalog();
    renderETicketDrawer();
    updateHeaderUserState();
    updateHeroVisuals(false);
    showToast(`Antrean ${queue.nomor_antrean} berhasil dibatalkan.`, 'info');
  }

  /* ------------------------------------------------------------------------
     12. Section Pilihan Paket Tiket (paket_tikets)
     ------------------------------------------------------------------------ */
  const packagesGrid = document.getElementById('packages-grid');

  function renderPackages() {
    packagesGrid.innerHTML = '';
    db.paket_tikets.forEach((pkg) => {
      const card = document.createElement('article');
      card.className = `surface-card package-card ${pkg.is_populer ? 'is-popular' : ''}`;

      card.innerHTML = `
        ${pkg.is_populer ? '<span class="package-ribbon">Rekomendasi Populer</span>' : '<span class="package-ribbon">Hemat &amp; Praktis</span>'}
        <div>
          <h3 class="package-title">${escapeHTML(pkg.nama_paket)}</h3>
          <p class="package-desc">${escapeHTML(pkg.deskripsi)}</p>
        </div>
        <div class="package-price-row">
          <strong class="package-price">${formatRupiah(pkg.harga)}</strong>
          <span class="package-unit">/ orang (terusan)</span>
        </div>
        <div class="package-slot-highlight">
          Maksimal ${pkg.jatah_antrean_aktif} antrean virtual aktif bersamaan
        </div>
        <ul class="package-features">
          ${pkg.keunggulan
            .map(
              (feat) => `<li><span class="package-check" aria-hidden="true">✓</span><span>${escapeHTML(feat)}</span></li>`
            )
            .join('')}
        </ul>
        <div class="package-cta">
          <button type="button" class="btn ${pkg.is_populer ? 'btn-primary' : 'btn-secondary'} btn-full" data-select-package="${pkg.id}">
            Pilih Paket &amp; Pesan
          </button>
        </div>
      `;

      card.querySelector('[data-select-package]').addEventListener('click', () => {
        openBookingModal(pkg.id);
      });

      packagesGrid.appendChild(card);
    });
  }

  /* ------------------------------------------------------------------------
     13. Modal Pencarian Wahana Cepat
     ------------------------------------------------------------------------ */
  const modalSearch = document.getElementById('modal-search');
  const quickSearchInput = document.getElementById('quick-search-input');
  const quickSearchResults = document.getElementById('quick-search-results');

  function renderQuickSearchResults(query = '') {
    const q = query.trim().toLowerCase();
    const matches = db.wahanas.filter(
      (w) =>
        !q ||
        w.nama_wahana.toLowerCase().includes(q) ||
        w.zona.toLowerCase().includes(q)
    );

    quickSearchResults.innerHTML = '';
    if (matches.length === 0) {
      quickSearchResults.innerHTML = '<p class="modal-subtitle">Tidak ada wahana yang cocok dengan kata kunci tersebut.</p>';
      return;
    }

    matches.forEach((ride) => {
      const lamp = getLampInfo(ride.status_lampu);
      const crowd = getTingkatKeramaian(ride.jumlah_pengantre_saat_ini);
      const row = document.createElement('div');
      row.className = 'quick-search-item';
      row.innerHTML = `
        <div class="quick-search-item-info">
          <h3>${escapeHTML(ride.nama_wahana)} <small>(${escapeHTML(ride.zona)})</small></h3>
          <p>${escapeHTML(lamp.badgeLabel)} · Keramaian: ${escapeHTML(crowd.label)} · Tinggi min. ${ride.tinggi_minimal_cm} cm</p>
        </div>
        <button type="button" class="btn btn-sm btn-primary">Lihat</button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        await closeDialogSmooth(modalSearch);
        jumpToRideInCatalog(ride.id);
      });
      quickSearchResults.appendChild(row);
    });
  }

  document.getElementById('btn-open-search').addEventListener('click', () => {
    quickSearchInput.value = '';
    renderQuickSearchResults('');
    modalSearch.showModal();
  });

  quickSearchInput.addEventListener('input', (e) => {
    renderQuickSearchResults(e.target.value);
  });

  /* ------------------------------------------------------------------------
     14. Modal Masuk / Daftar Akun Wisatawan (users)
     ------------------------------------------------------------------------ */
  const modalAuth = document.getElementById('modal-auth');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');
  const authLoggedInView = document.getElementById('auth-logged-in-view');
  const authFormsView = document.getElementById('auth-forms-view');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const loginFormAlert = document.getElementById('login-form-alert');
  const registerFormAlert = document.getElementById('register-form-alert');

  let pendingActionAfterAuth = null;

  function switchAuthTab(mode) {
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('is-active', isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabLogin.tabIndex = isLogin ? 0 : -1;

    tabRegister.classList.toggle('is-active', !isLogin);
    tabRegister.setAttribute('aria-selected', String(!isLogin));
    tabRegister.tabIndex = !isLogin ? 0 : -1;

    panelLogin.hidden = !isLogin;
    panelRegister.hidden = isLogin;
    loginFormAlert.hidden = true;
    registerFormAlert.hidden = true;
  }

  tabLogin.addEventListener('click', () => switchAuthTab('login'));
  tabRegister.addEventListener('click', () => switchAuthTab('register'));

  [tabLogin, tabRegister].forEach((tab) => {
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const nextMode = tab === tabLogin ? 'register' : 'login';
        switchAuthTab(nextMode);
        (nextMode === 'login' ? tabLogin : tabRegister).focus();
      }
    });
  });

  function openAuthModal(defaultTab = 'login', afterAuthCallback = null) {
    pendingActionAfterAuth = afterAuthCallback;
    const user = getCurrentUser();

    if (user) {
      authLoggedInView.hidden = false;
      authFormsView.hidden = true;
      document.getElementById('auth-modal-subtitle').textContent = 'Profil akun wisatawan aktif Anda.';
      const initials = user.nama_lengkap
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('');
      document.getElementById('account-avatar-initials').textContent = initials || 'JW';
      document.getElementById('account-display-name').textContent = user.nama_lengkap;
      document.getElementById('account-display-email').textContent = user.email;
      const maskedNik = `${user.nik.slice(0, 4)}••••••••${user.nik.slice(-4)}`;
      document.getElementById('account-display-extra').textContent = `NIK: ${maskedNik} · WA: ${user.no_whatsapp}`;
    } else {
      authLoggedInView.hidden = true;
      authFormsView.hidden = false;
      document.getElementById('auth-modal-subtitle').textContent =
        'Masuk atau daftar akun untuk memesan tiket dan mengambil antrean virtual.';
      switchAuthTab(defaultTab);
    }

    modalAuth.showModal();
  }

  function completeAuthSuccess(user, message) {
    db.current_user_id = user.id;
    saveDB();
    updateHeaderUserState();
    renderCatalog();
    closeDialogSmooth(modalAuth);
    showToast(message, 'success');
    if (typeof pendingActionAfterAuth === 'function') {
      const cb = pendingActionAfterAuth;
      pendingActionAfterAuth = null;
      cb();
    }
  }

  formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    loginFormAlert.hidden = true;
    if (!markFormFieldsTouchedAndValidate(formLogin)) return;

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pwd = document.getElementById('login-password').value;

    const found = db.users.find(
      (u) => u.email.toLowerCase() === email && u.kata_sandi === pwd
    );
    if (!found) {
      loginFormAlert.textContent = 'Email atau kata sandi tidak cocok. Anda dapat mencoba tombol Akun Demo di bawah.';
      loginFormAlert.hidden = false;
      return;
    }

    formLogin.reset();
    completeAuthSuccess(found, `Selamat datang kembali, ${found.nama_lengkap}!`);
  });

  document.getElementById('btn-fill-demo-user').addEventListener('click', () => {
    const demoUser = db.users[0];
    if (!demoUser) return;
    completeAuthSuccess(demoUser, `Masuk sebagai akun demo ${demoUser.nama_lengkap}.`);
  });

  document.getElementById('reg-wa').addEventListener('blur', (e) => {
    e.target.value = e.target.value.replace(/[\s\-().]/g, '');
  });

  formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    registerFormAlert.hidden = true;
    const waInput = document.getElementById('reg-wa');
    waInput.value = waInput.value.replace(/[\s\-().]/g, '');
    if (!markFormFieldsTouchedAndValidate(formRegister)) return;

    const nama_lengkap = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const kata_sandi = document.getElementById('reg-password').value;
    const nik = document.getElementById('reg-nik').value.trim();
    const no_whatsapp = document.getElementById('reg-wa').value.trim();

    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      registerFormAlert.textContent = 'Email tersebut sudah terdaftar. Silakan masuk melalui tab Masuk.';
      registerFormAlert.hidden = false;
      return;
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      nama_lengkap,
      email,
      kata_sandi,
      nik,
      no_whatsapp,
      created_at: new Date().toISOString(),
    };

    db.users.push(newUser);
    formRegister.reset();
    completeAuthSuccess(newUser, `Akun berhasil dibuat! Selamat datang, ${newUser.nama_lengkap}.`);
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    db.current_user_id = null;
    saveDB();
    updateHeaderUserState();
    renderCatalog();
    await closeDialogSmooth(modalAuth);
    showToast('Anda telah keluar dari akun wisatawan.');
  });

  document.getElementById('btn-account-to-eticket').addEventListener('click', async () => {
    await closeDialogSmooth(modalAuth);
    openETicketDrawer();
  });

  // Toggle tampilkan/sembunyikan kata sandi
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetInput = document.getElementById(btn.dataset.togglePassword);
      if (!targetInput) return;
      const isCurrentlyHidden = targetInput.type === 'password';
      targetInput.type = isCurrentlyHidden ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(isCurrentlyHidden));
      btn.textContent = isCurrentlyHidden ? 'Sembunyi' : 'Lihat';
    });
  });

  /* ------------------------------------------------------------------------
     15. Modal Pesan Tiket & Simulasi Pembayaran (reservasi_tikets)
     ------------------------------------------------------------------------ */
  const modalBooking = document.getElementById('modal-booking');
  const bookingAuthGate = document.getElementById('booking-auth-gate');
  const formBooking = document.getElementById('form-booking');
  const bookingSuccessView = document.getElementById('booking-success-view');
  const bookingDateInput = document.getElementById('booking-date');
  const bookingQuotaStatus = document.getElementById('booking-quota-status');
  const bookingPackageOptions = document.getElementById('booking-package-options');
  const bookingQtyInput = document.getElementById('booking-qty');
  const bookingFormAlert = document.getElementById('booking-form-alert');

  let chosenPackageId = 'pkt-bundling';

  function renderBookingPackages(preselectedId) {
    chosenPackageId = preselectedId || chosenPackageId || db.paket_tikets[0].id;
    bookingPackageOptions.innerHTML = '';

    db.paket_tikets.forEach((pkg) => {
      const label = document.createElement('label');
      label.className = 'package-radio-card';
      label.innerHTML = `
        <input type="radio" name="paket_id" value="${pkg.id}" ${pkg.id === chosenPackageId ? 'checked' : ''}>
        <span>
          <strong>${escapeHTML(pkg.nama_paket)} · ${formatRupiah(pkg.harga)}</strong>
          <small>Maksimal ${pkg.jatah_antrean_aktif} antrean virtual aktif bersamaan</small>
        </span>
      `;
      bookingPackageOptions.appendChild(label);
    });

    bookingPackageOptions.querySelectorAll('input[name="paket_id"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        chosenPackageId = radio.value;
        updateBookingSummary();
      });
    });
  }

  function updateBookingQuotaFeedback() {
    const tgl = bookingDateInput.value;
    const today = CalendarDate.todayISO();
    bookingFormAlert.hidden = true;

    if (!tgl) {
      bookingQuotaStatus.textContent = '';
      return { valid: false, reason: 'Pilih tanggal kunjungan terlebih dahulu.' };
    }

    if (CalendarDate.compare(tgl, today) < 0) {
      bookingQuotaStatus.className = 'booking-quota-status is-err';
      bookingQuotaStatus.textContent = 'Tanggal kunjungan sudah berlalu.';
      return { valid: false, reason: 'Tanggal kunjungan tidak boleh di masa lalu.' };
    }

    const rec = getQuotaForDate(tgl);
    if (!rec || rec.status_operasional !== 'Buka') {
      bookingQuotaStatus.className = 'booking-quota-status is-err';
      bookingQuotaStatus.textContent = `Taman TUTUP pada tanggal ini (${rec?.keterangan || 'Libur operasional'}).`;
      return { valid: false, reason: 'Tanggal yang dipilih berstatus Tutup.' };
    }

    const qty = Number(bookingQtyInput.value) || 0;
    if (rec.kuota_tersedia <= 0) {
      bookingQuotaStatus.className = 'booking-quota-status is-err';
      bookingQuotaStatus.textContent = 'Kuota harian tanggal ini sudah penuh (0 tersisa).';
      return { valid: false, reason: 'Kuota harian pada tanggal tersebut sudah habis.' };
    }

    if (qty > rec.kuota_tersedia) {
      bookingQuotaStatus.className = 'booking-quota-status is-err';
      bookingQuotaStatus.textContent = `Jumlah tiket (${qty}) melebihi sisa kuota (${formatNumberID(rec.kuota_tersedia)}).`;
      return { valid: false, reason: `Sisa kuota hanya ${rec.kuota_tersedia} tiket.` };
    }

    bookingQuotaStatus.className = 'booking-quota-status is-ok';
    bookingQuotaStatus.textContent = `Tersedia ${formatNumberID(rec.kuota_tersedia)} kuota · Jam buka ${rec.jam_buka}–${rec.jam_tutup} WIB`;
    return { valid: true, record: rec };
  }

  function updateBookingSummary() {
    const pkg = getPackageById(chosenPackageId);
    const qty = Math.min(10, Math.max(1, Number(bookingQtyInput.value) || 1));
    const total = pkg.harga * qty;

    document.getElementById('booking-summary-detail').textContent = `${qty} × ${pkg.nama_paket}`;
    document.getElementById('booking-summary-slots').textContent = `Maks. ${pkg.jatah_antrean_aktif} wahana bersamaan`;
    document.getElementById('booking-total-price').textContent = formatRupiah(total);
    updateBookingQuotaFeedback();
  }

  function openBookingModal(packageId = null, preferredDate = null) {
    const user = getCurrentUser();
    const today = CalendarDate.todayISO();
    const targetDate = preferredDate || selectedQuotaDate || today;

    bookingSuccessView.hidden = true;
    bookingFormAlert.hidden = true;
    renderBookingPackages(packageId);

    bookingDateInput.min = today;
    bookingDateInput.value = CalendarDate.compare(targetDate, today) >= 0 ? targetDate : today;
    bookingQtyInput.value = '1';
    updateBookingSummary();

    if (!user) {
      bookingAuthGate.hidden = false;
      formBooking.hidden = true;
    } else {
      bookingAuthGate.hidden = true;
      formBooking.hidden = false;
    }

    modalBooking.showModal();
  }

  document.getElementById('btn-booking-go-auth').addEventListener('click', async () => {
    await closeDialogSmooth(modalBooking);
    openAuthModal('login', () => openBookingModal(chosenPackageId, bookingDateInput.value));
  });

  bookingDateInput.addEventListener('change', updateBookingSummary);
  bookingQtyInput.addEventListener('input', updateBookingSummary);

  document.getElementById('qty-minus').addEventListener('click', () => {
    const cur = Number(bookingQtyInput.value) || 1;
    if (cur > 1) {
      bookingQtyInput.value = String(cur - 1);
      updateBookingSummary();
    }
  });

  document.getElementById('qty-plus').addEventListener('click', () => {
    const cur = Number(bookingQtyInput.value) || 1;
    if (cur < 10) {
      bookingQtyInput.value = String(cur + 1);
      updateBookingSummary();
    }
  });

  formBooking.addEventListener('submit', (e) => {
    e.preventDefault();
    bookingFormAlert.hidden = true;

    const user = getCurrentUser();
    if (!user) {
      openBookingModal(chosenPackageId, bookingDateInput.value);
      return;
    }

    if (!markFormFieldsTouchedAndValidate(formBooking)) return;

    const quotaCheck = updateBookingQuotaFeedback();
    if (!quotaCheck.valid) {
      bookingFormAlert.textContent = quotaCheck.reason;
      bookingFormAlert.hidden = false;
      return;
    }

    const qty = Number(bookingQtyInput.value);
    if (qty < 1 || qty > 10) {
      bookingFormAlert.textContent = 'Jumlah tiket harus antara 1 hingga 10 per transaksi.';
      bookingFormAlert.hidden = false;
      return;
    }

    const tanggal = bookingDateInput.value;
    const quotaRecord = ensureQuotaRecord(tanggal);
    if (!quotaRecord || quotaRecord.kuota_tersedia < qty) {
      bookingFormAlert.textContent = 'Kuota harian tidak mencukupi untuk jumlah tiket tersebut.';
      bookingFormAlert.hidden = false;
      return;
    }

    const pkg = getPackageById(chosenPackageId);
    const metode = formBooking.querySelector('input[name="metode_pembayaran"]:checked')?.value || 'QRIS';
    const seq = db.sequence_counters.booking++;
    const dateCompact = tanggal.replace(/-/g, '');
    const kode_booking = `JLJ-${dateCompact}-${String(seq).padStart(3, '0')}`;
    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const kode_qr = `QR-${kode_booking}-${randomSuffix}`;

    // Kurangi kuota harian otomatis
    quotaRecord.kuota_tersedia = Math.max(0, quotaRecord.kuota_tersedia - qty);

    const reservation = {
      id: `rsv-${Date.now()}`,
      user_id: user.id,
      paket_id: pkg.id,
      kode_booking,
      kode_qr,
      tanggal_kunjungan: tanggal,
      jumlah_tiket: qty,
      total_harga: pkg.harga * qty,
      metode_pembayaran: metode,
      status_pembayaran: 'Lunas',
      status_kunjungan: 'Belum Check-in',
      created_at: new Date().toISOString(),
    };

    db.reservasi_tikets.unshift(reservation);
    saveDB();

    renderQuotaSection();
    updateHeaderUserState();

    formBooking.hidden = true;
    bookingSuccessView.hidden = false;
    document.getElementById('booking-success-code').textContent = kode_booking;
    showToast(`E-Ticket ${kode_booking} berhasil diterbitkan (Lunas via ${metode}).`, 'success');
  });

  document.getElementById('btn-success-open-eticket').addEventListener('click', async () => {
    await closeDialogSmooth(modalBooking);
    openETicketDrawer();
  });

  document.getElementById('btn-success-book-again').addEventListener('click', () => {
    bookingSuccessView.hidden = true;
    formBooking.hidden = false;
    updateBookingSummary();
  });

  /* ------------------------------------------------------------------------
     16. Drawer "E-Ticket & Antrean Saya"
     ------------------------------------------------------------------------ */
  const modalETicket = document.getElementById('modal-eticket');
  const eticketDrawerBody = document.getElementById('eticket-drawer-body');
  const eticketSubtitle = document.getElementById('eticket-drawer-subtitle');

  function renderETicketDrawer() {
    const user = getCurrentUser();
    eticketDrawerBody.innerHTML = '';

    if (!user) {
      eticketSubtitle.textContent = 'Masuk akun wisatawan untuk melihat E-Ticket QR & antrean virtual Anda.';
      eticketDrawerBody.innerHTML = `
        <div class="gate-notice-box">
          <h3>Belum Masuk Akun</h3>
          <p>Silakan masuk atau buat akun wisatawan agar E-Ticket dan antrean virtual tersimpan atas nama Anda.</p>
          <button type="button" class="btn btn-primary" id="btn-drawer-login">Masuk / Daftar Sekarang</button>
        </div>
      `;
      eticketDrawerBody.querySelector('#btn-drawer-login').addEventListener('click', async () => {
        await closeDialogSmooth(modalETicket);
        openAuthModal('login', () => openETicketDrawer());
      });
      return;
    }

    const tickets = getUserReservations(user.id);
    const activeTicket = getActiveParkTicket(user.id);
    const userQueues = db.antrean_virtuals.filter((q) => q.user_id === user.id);
    const activeQueues = getActiveQueuesForUser(user.id);

    eticketSubtitle.textContent = `Wisatawan: ${user.nama_lengkap}`;

    if (tickets.length === 0) {
      eticketDrawerBody.innerHTML = `
        <div class="gate-notice-box">
          <h3>Belum Ada E-Ticket</h3>
          <p>Anda belum memiliki tiket masuk Dufan. Pesan paket tiket sekarang untuk mendapatkan E-Ticket QR instan.</p>
          <button type="button" class="btn btn-primary" id="btn-drawer-book">Pesan Tiket Sekarang</button>
        </div>
      `;
      eticketDrawerBody.querySelector('#btn-drawer-book').addEventListener('click', async () => {
        await closeDialogSmooth(modalETicket);
        openBookingModal();
      });
      return;
    }

    // Ringkasan Jatah Antrean jika sudah check-in
    if (activeTicket) {
      const activePkg = getPackageById(activeTicket.paket_id);
      const meter = document.createElement('div');
      meter.className = 'queue-slot-meter';
      meter.textContent = `Tiket Aktif di Kawasan (${activeTicket.kode_booking}) · Antrean aktif: ${activeQueues.length} dari ${activePkg.jatah_antrean_aktif} jatah maksimal (${activePkg.nama_paket}).`;
      eticketDrawerBody.appendChild(meter);
    }

    const ticketSectionTitle = document.createElement('h3');
    ticketSectionTitle.className = 'drawer-section-title';
    ticketSectionTitle.textContent = `Daftar E-Ticket QR (${tickets.length})`;
    eticketDrawerBody.appendChild(ticketSectionTitle);

    tickets.forEach((ticket) => {
      const pkg = getPackageById(ticket.paket_id);
      const isCheckedIn = ticket.status_kunjungan === 'Aktif di Kawasan';

      const card = document.createElement('article');
      card.className = `eticket-card ${isCheckedIn ? 'is-active-park' : ''}`;
      card.innerHTML = `
        <div class="eticket-top">
          <div>
            <div class="eticket-booking-code">${escapeHTML(ticket.kode_booking)}</div>
            <strong>${escapeHTML(pkg.nama_paket)} (${ticket.jumlah_tiket} Tiket)</strong>
          </div>
          <span class="status-pill ${isCheckedIn ? 'status-pill-open' : 'status-pill-warn'}">
            <span class="pill-indicator" aria-hidden="true"></span>
            <span>${escapeHTML(ticket.status_kunjungan)}</span>
          </span>
        </div>

        <div class="eticket-qr-row">
          <div class="qr-svg-box">${generateQRSVG(ticket.kode_qr)}</div>
          <ul class="eticket-meta-list">
            <li><strong>Tanggal:</strong> ${escapeHTML(CalendarDate.formatFullID(ticket.tanggal_kunjungan))}</li>
            <li><strong>Pembayaran:</strong> ${escapeHTML(ticket.status_pembayaran)} (${escapeHTML(ticket.metode_pembayaran)})</li>
            <li><strong>Total:</strong> ${formatRupiah(ticket.total_harga)}</li>
            <li><strong>Kuota Antre:</strong> Maks. ${pkg.jatah_antrean_aktif} wahana aktif</li>
          </ul>
        </div>

        ${
          !isCheckedIn
            ? `<button type="button" class="btn btn-secondary btn-sm btn-full" data-simulate-checkin="${ticket.id}">
                 Simulasi Scan Gerbang (Aktif di Kawasan)
               </button>`
            : `<p class="ride-queue-note">Tiket aktif! Pilih wahana pada katalog untuk mengambil antrean virtual.</p>`
        }
      `;

      const simBtn = card.querySelector('[data-simulate-checkin]');
      if (simBtn) {
        simBtn.addEventListener('click', () => {
          // Pastikan hanya satu tiket aktif sekaligus untuk simulasi konsisten
          db.reservasi_tikets.forEach((r) => {
            if (r.user_id === user.id && r.status_kunjungan === 'Aktif di Kawasan') {
              r.status_kunjungan = 'Selesai';
            }
          });
          ticket.status_kunjungan = 'Aktif di Kawasan';
          saveDB();
          renderETicketDrawer();
          renderCatalog();
          updateHeaderUserState();
          showToast(`E-Ticket ${ticket.kode_booking} kini Aktif di Kawasan! Antrean virtual dibuka.`, 'success');
        });
      }

      eticketDrawerBody.appendChild(card);
    });

    // Daftar Antrean Virtual Saya
    const queueSectionTitle = document.createElement('h3');
    queueSectionTitle.className = 'drawer-section-title';
    queueSectionTitle.textContent = `Antrean Virtual Saya (${userQueues.length})`;
    eticketDrawerBody.appendChild(queueSectionTitle);

    if (userQueues.length === 0) {
      const emptyQ = document.createElement('p');
      emptyQ.className = 'modal-subtitle';
      emptyQ.textContent = 'Belum ada antrean virtual. Setelah tiket berstatus Aktif di Kawasan, pilih wahana di Katalog untuk mengantre.';
      eticketDrawerBody.appendChild(emptyQ);
    } else {
      userQueues.forEach((q) => {
        const ride = db.wahanas.find((w) => w.id === q.wahana_id);
        const item = document.createElement('article');
        item.className = 'vqueue-item';

        const statusClass =
          q.status_antrean === 'Menunggu'
            ? 'status-hijau'
            : q.status_antrean === 'Dipanggil'
              ? 'status-maintenance'
              : 'status-merah';

        item.innerHTML = `
          <div class="vqueue-head">
            <div>
              <span class="vqueue-number">${escapeHTML(q.nomor_antrean)}</span>
              <strong> · ${escapeHTML(ride ? ride.nama_wahana : 'Wahana')}</strong>
            </div>
            <span class="status-badge ${statusClass}">${escapeHTML(q.status_antrean)}</span>
          </div>
          <div class="vqueue-meta">
            <span>Kloter: <strong>#${q.nomor_kloter}</strong></span>
            <span>Estimasi Tunggu: <strong>~${q.estimasi_waktu_tunggu_menit} menit</strong></span>
            <span>Daftar: <strong>${escapeHTML(q.waktu_daftar)} WIB</strong></span>
          </div>
          ${
            q.status_antrean === 'Menunggu'
              ? `<button type="button" class="btn btn-outline-danger btn-sm" data-cancel-queue="${q.id}">Batalkan Antrean</button>`
              : ''
          }
        `;

        const cancelBtn = item.querySelector('[data-cancel-queue]');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => handleCancelVirtualQueue(q.id));
        }

        eticketDrawerBody.appendChild(item);
      });
    }
  }

  function openETicketDrawer() {
    renderETicketDrawer();
    modalETicket.showModal();
  }

  /* ------------------------------------------------------------------------
     17. Sinkronisasi Header & Navigasi Mobile
     ------------------------------------------------------------------------ */
  const btnOpenAuth = document.getElementById('btn-open-auth');
  const navQueueBadge = document.getElementById('nav-queue-badge');
  const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
  const btnMobileMenu = document.getElementById('btn-mobile-menu');

  function updateHeaderUserState() {
    const user = getCurrentUser();
    const btnMobileAuth = document.getElementById('btn-mobile-auth');

    if (user) {
      const firstName = user.nama_lengkap.split(/\s+/)[0];
      btnOpenAuth.textContent = `Halo, ${firstName}`;
      btnMobileAuth.textContent = `Akun: ${firstName}`;

      const activeQueues = getActiveQueuesForUser(user.id);
      const pendingTickets = getUserReservations(user.id).length;
      const count = activeQueues.length > 0 ? activeQueues.length : pendingTickets;

      if (count > 0) {
        navQueueBadge.hidden = false;
        navQueueBadge.textContent = String(count);
      } else {
        navQueueBadge.hidden = true;
      }
    } else {
      btnOpenAuth.textContent = 'Masuk / Daftar';
      btnMobileAuth.textContent = 'Masuk / Daftar Akun';
      navQueueBadge.hidden = true;
    }
  }

  btnOpenAuth.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-open-booking').addEventListener('click', () => openBookingModal());
  document.getElementById('btn-nav-eticket').addEventListener('click', () => openETicketDrawer());
  document.getElementById('btn-catalog-open-eticket').addEventListener('click', () => openETicketDrawer());
  document.getElementById('btn-footer-eticket').addEventListener('click', () => openETicketDrawer());

  btnMobileMenu.addEventListener('click', () => {
    btnMobileMenu.setAttribute('aria-expanded', 'true');
    mobileNavDrawer.showModal();
  });

  mobileNavDrawer.addEventListener('close', () => {
    btnMobileMenu.setAttribute('aria-expanded', 'false');
  });

  mobileNavDrawer.querySelectorAll('[data-mobile-nav]').forEach((link) => {
    link.addEventListener('click', () => closeDialogSmooth(mobileNavDrawer));
  });

  document.getElementById('btn-mobile-eticket').addEventListener('click', async () => {
    await closeDialogSmooth(mobileNavDrawer);
    openETicketDrawer();
  });

  document.getElementById('btn-mobile-auth').addEventListener('click', async () => {
    await closeDialogSmooth(mobileNavDrawer);
    openAuthModal('login');
  });

  document.getElementById('btn-mobile-book').addEventListener('click', async () => {
    await closeDialogSmooth(mobileNavDrawer);
    openBookingModal();
  });

  /* ------------------------------------------------------------------------
     18. Loading Start Intro (Perspective Tunnel Auto-Play + Judul "Jelajahin")
     ------------------------------------------------------------------------ */
  function interpolatePiecewise(val, inputs, outputs) {
    if (val <= inputs[0]) return outputs[0];
    const last = inputs.length - 1;
    if (val >= inputs[last]) return outputs[last];
    for (let i = 0; i < last; i++) {
      if (val >= inputs[i] && val <= inputs[i + 1]) {
        const span = inputs[i + 1] - inputs[i] || 1;
        const localT = (val - inputs[i]) / span;
        return outputs[i] + (outputs[i + 1] - outputs[i]) * localT;
      }
    }
    return outputs[last];
  }

  function initIntroLoader() {
    const loader = document.getElementById('intro-loader');
    const brandText = document.getElementById('intro-brand');
    const cardsHost = document.getElementById('intro-tunnel-cards');
    const navLogo = document.querySelector('.site-header .brand-wordmark');

    if (!loader || !brandText || !cardsHost) {
      if (loader) loader.hidden = true;
      document.body.classList.remove('is-intro-active', 'is-intro-revealing');
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof requestAnimationFrame !== 'function') {
      loader.hidden = true;
      document.body.classList.remove('is-intro-active', 'is-intro-revealing');
      return;
    }

    let introFinished = false;
    let rafId = null;
    let revealTimer = null;
    let finishTimer = null;
    let flyAnim = null;

    // Susun kartu wahana Dufan mengikuti spiral golden-angle 137.5° seperti Perspective Tunnel
    const ridesList = Array.isArray(db?.wahanas) ? db.wahanas : [];
    const totalCards = ridesList.length || 1;
    const cardsData = ridesList.map((w, idx) => {
      const theta = idx * 137.5 * (Math.PI / 180);
      const radiusFactorX = 0.28 + (idx % 3) * 0.08;
      const radiusFactorY = 0.26 + (idx % 2) * 0.09;
      const rotationZ = (idx % 2 === 0 ? 1 : -1) * (3 + (idx % 5) * 2);
      const start = (idx / totalCards) * 0.45;
      const end = start + 0.55;

      const cardEl = document.createElement('div');
      cardEl.className = 'intro-tunnel-card';
      cardEl.style.zIndex = String(idx + 1);
      cardEl.style.opacity = '0';

      const innerEl = document.createElement('div');
      innerEl.className = 'intro-tunnel-card-inner';
      innerEl.style.backgroundImage = w.gradasi_fallback;

      const img = document.createElement('img');
      img.src = w.gambar_url;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      img.setAttribute('draggable', 'false');

      const scrim = document.createElement('div');
      scrim.className = 'intro-tunnel-card-scrim';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'intro-tunnel-card-title';
      titleSpan.textContent = w.nama_wahana;
      scrim.appendChild(titleSpan);

      innerEl.appendChild(img);
      innerEl.appendChild(scrim);
      cardEl.appendChild(innerEl);
      cardsHost.appendChild(cardEl);

      return {
        el: cardEl,
        angleCos: Math.cos(theta),
        angleSin: Math.sin(theta),
        radiusFactorX,
        radiusFactorY,
        rotationZ,
        start,
        end,
      };
    });

    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerCurX = 0;
    let pointerCurY = 0;

    function onTunnelPointerMove(e) {
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 800;
      pointerTargetX = (e.clientX / w - 0.5) * 2;
      pointerTargetY = (e.clientY / h - 0.5) * 2;
    }

    function finishIntroNow() {
      if (introFinished) return;
      introFinished = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      flyAnim?.cancel?.();
      clearTimeout(revealTimer);
      clearTimeout(finishTimer);
      document.removeEventListener?.('keydown', onIntroEscape);
      loader.removeEventListener?.('pointermove', onTunnelPointerMove);
      document.body.classList.remove('is-intro-active', 'is-intro-revealing');
      loader.hidden = true;
      cardsHost.innerHTML = '';
    }

    function onIntroEscape(e) {
      if (e.key === 'Escape') finishIntroNow();
    }

    document.addEventListener('keydown', onIntroEscape);
    loader.addEventListener('pointermove', onTunnelPointerMove, { passive: true });

    const DURATION_MS = 2350;
    const FLY_AT_MS = 2280;
    const startTime = performance.now();

    function renderTunnelFrame(now) {
      if (introFinished) return;
      const elapsed = now - startTime;
      const rawT = Math.min(1, Math.max(0, elapsed / DURATION_MS));
      const easeSine = 0.5 - 0.5 * Math.cos(Math.PI * rawT);
      const progress = rawT * 0.38 + easeSine * 0.62;

      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      const isMobile = vw < 768;
      const cardWidth = isMobile
        ? Math.max(130, Math.min(180, vw * 0.38))
        : Math.max(185, Math.min(270, vw * 0.18));
      const zMin = isMobile ? -1200 : -1700;
      const zMax = isMobile ? 350 : 500;
      const parallaxAmp = isMobile ? 18 : 42;

      pointerCurX += (pointerTargetX - pointerCurX) * 0.1;
      pointerCurY += (pointerTargetY - pointerCurY) * 0.1;

      const textScale = interpolatePiecewise(progress, [0, 0.35, 1], [0.74, 0.96, 1]);
      const textOpacity = interpolatePiecewise(progress, [0, 0.14, 1], [0.3, 1, 1]);
      brandText.style.transform = `scale(${textScale.toFixed(4)})`;
      brandText.style.opacity = textOpacity.toFixed(3);

      cardsData.forEach((c) => {
        const localT = Math.min(1, Math.max(0, (progress - c.start) / (c.end - c.start)));
        const z = zMin + (zMax - zMin) * localT;
        const opacity = interpolatePiecewise(localT, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0]);
        const offsetX = c.angleCos * (vw * c.radiusFactorX) - pointerCurX * parallaxAmp;
        const offsetY = c.angleSin * (vh * c.radiusFactorY) - pointerCurY * parallaxAmp;

        c.el.style.width = `${cardWidth.toFixed(1)}px`;
        c.el.style.opacity = opacity.toFixed(3);
        c.el.style.transform = `translate3d(calc(-50% + ${offsetX.toFixed(1)}px), calc(-50% + ${offsetY.toFixed(1)}px), ${z.toFixed(1)}px) rotateZ(${c.rotationZ}deg)`;
      });

      if (rawT < 1) {
        rafId = requestAnimationFrame(renderTunnelFrame);
      } else {
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(renderTunnelFrame);

    // Tahap 2: Setelah tunnel selesai, teks "Jelajahin" terbang ke logo kiri atas navbar
    revealTimer = setTimeout(() => {
      if (introFinished) return;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      brandText.style.transform = 'scale(1)';
      brandText.style.opacity = '1';
      loader.classList.add('is-revealing');
      document.body.classList.add('is-intro-revealing');

      if (navLogo && typeof brandText.animate === 'function') {
        const fromRect = brandText.getBoundingClientRect();
        const toRect = navLogo.getBoundingClientRect();
        if (fromRect.width > 0 && toRect.width > 0) {
          const fromCenterX = fromRect.left + fromRect.width / 2;
          const fromCenterY = fromRect.top + fromRect.height / 2;
          const toCenterX = toRect.left + toRect.width / 2;
          const toCenterY = toRect.top + toRect.height / 2;
          const dx = toCenterX - fromCenterX;
          const dy = toCenterY - fromCenterY;
          const scaleRatio = toRect.height / fromRect.height;

          flyAnim = brandText.animate(
            [
              { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
              { transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scaleRatio.toFixed(4)})`, opacity: 1 },
            ],
            { duration: 920, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
          );
          flyAnim.onfinish = finishIntroNow;
          finishTimer = setTimeout(finishIntroNow, 980);
          return;
        }
      }

      finishTimer = setTimeout(finishIntroNow, 920);
    }, FLY_AT_MS);
  }

  /* ------------------------------------------------------------------------
     19. Inisialisasi Aplikasi
     ------------------------------------------------------------------------ */
  function init() {
    initDialogs();
    validationHelper = initAccessibleValidation();
    buildHeroCarousel();
    renderQuotaSection();
    updateHeightSliderProgress();
    renderCatalog();
    renderPackages();
    updateHeaderUserState();
    initIntroLoader();
  }

  init();
})();
