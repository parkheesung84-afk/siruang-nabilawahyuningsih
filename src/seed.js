'use strict';

const crypto = require('node:crypto');
const { nowIso, addDays, witaInputToUtc, todayWitaKey } = require('./time');
const { transaction } = require('./db');
const { audit } = require('./audit');

const WEEKDAYS = [
  null,
  ['08:30', '17:30'],
  ['08:30', '17:30'],
  ['08:30', '17:30'],
  ['08:30', '17:30'],
  ['08:30', '17:30'],
  ['08:30', '14:00']
];

function hoursFor(weekday, saturday = ['08:30', '14:00'], sunday = null) {
  const copy = WEEKDAYS.map((row) => (row ? [...row] : null));
  if (weekday) copy[1] = [...weekday];
  copy[6] = saturday ? [...saturday] : null;
  copy[0] = sunday ? [...sunday] : null;
  return JSON.stringify(copy);
}

function at(dateKey, time) {
  return witaInputToUtc(`${dateKey}T${time}`).toISOString();
}

function makeId() {
  return `RSV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function seed(db) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (existing.n > 0) return { seeded: false, users: existing.n };

  const today = todayWitaKey();
  const now = new Date();
  const createdAt = nowIso();

  transaction(db, () => {
    const org = db.prepare(
      'INSERT INTO organizations (name, kind, created_at) VALUES (?, ?, ?)'
    );
    const bem = Number(org.run('BEM IDB Bali', 'BEM', createdAt).lastInsertRowid);
    const hmj = Number(org.run('Himpunan Mahasiswa DKV', 'Himpunan', createdAt).lastInsertRowid);
    const ukm = Number(org.run('UKM Fotografi IDB', 'UKM', createdAt).lastInsertRowid);

    const addUser = db.prepare(
      `INSERT INTO users (name, email, nim, role, org_id, is_officer, unit, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const rani = Number(addUser.run('Rani Puspita', 'rani@student.idbbali.ac.id', '2215101001', 'pemohon', null, 0, 'Desain Komunikasi Visual', createdAt).lastInsertRowid);
    Number(addUser.run('Bagus Mahendra', 'bagus@idbbali.ac.id', '2215101006', 'pemohon', null, 0, 'Mahasiswa', createdAt).lastInsertRowid);
    const komang = Number(addUser.run('Komang Aditya', 'komang@idbbali.ac.id', '2315101002', 'pengurus', bem, 1, 'BEM IDB Bali', createdAt).lastInsertRowid);
    const ayu = Number(addUser.run('Ayu Lestari', 'ayu@idbbali.ac.id', '2315101003', 'pengurus', hmj, 1, 'Himpunan DKV', createdAt).lastInsertRowid);
    const dedi = Number(addUser.run('Dedi Setiawan', 'dedi@idbbali.ac.id', '1985103001', 'pengelola', null, 0, 'Biro Sarana Prasarana', createdAt).lastInsertRowid);
    const luh = Number(addUser.run('Luh Ayu Kirana', 'luh@idbbali.ac.id', '1985103002', 'pengelola', null, 0, 'Biro Sarana Prasarana', createdAt).lastInsertRowid);
    const admin = Number(addUser.run('Admin SiRuang', 'admin@idbbali.ac.id', '1985102001', 'admin', null, 0, 'Dosen', createdAt).lastInsertRowid);
    const made = Number(addUser.run('Made Sari', 'made@student.idbbali.ac.id', '2215101004', 'pemohon', null, 0, 'Desain Mode', createdAt).lastInsertRowid);
    const ketut = Number(addUser.run('Ketut Ardana', 'ketut@idbbali.ac.id', '2315101005', 'pengurus', ukm, 1, 'UKM Fotografi', createdAt).lastInsertRowid);

    const addRoom = db.prepare(
      `INSERT INTO rooms
        (slug, name, building, floor, capacity, facilities, rules, operating_hours,
         manager_id, mode, max_hours, description, photo, art, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    const room = (slug, name, building, floor, capacity, facilities, rules, hours, manager, mode, maxHours, description, art, photo) =>
      Number(addRoom.run(
        slug, name, building, floor, capacity,
        JSON.stringify(facilities), JSON.stringify(rules), hours,
        manager, mode, maxHours, description, photo, art, createdAt
      ).lastInsertRowid);

    const labKomputer = room(
      'lab-komputer', 'Lab Komputer', 'Gedung Kampus', 'Lantai 1', 36,
      ['36 PC', '12th Gen Intel', 'GPU NVIDIA', 'Jaringan LAN', 'AC', 'Proyektor'],
      ['Gunakan akun kampus untuk login', 'Dilarang membawa makanan dan minuman', 'Wajib meninggalkan ruangan rapi'],
      hoursFor(['08:30', '17:30']), dedi, 'persetujuan', 4,
      'Komputer dengan 12th gen Intel CPU dan GPU NVIDIA terbaru, terhubung jaringan lokal. Digunakan untuk kelas praktik desain dan bisnis, lantai 1.',
      'mainframe', '/images/rooms/lab-komputer.jpg'
    );
    const labImac = room(
      'lab-imac', 'Lab iMac', 'Gedung Kampus', 'Lantai 1', 30,
      ['30 iMac M1', 'AC', 'Proyektor', 'Meja kolaborasi'],
      ['Simpan pekerjaan di drive kampus', 'Jangan mengubah pengaturan sistem', 'Kembalikan perangkat ke posisi semula'],
      hoursFor(['08:30', '17:30']), dedi, 'persetujuan', 4,
      'Lab komputer berbasis macOS dengan iMac M1 untuk praktik desain, ilustrasi, dan produksi media digital. Berlokasi di lantai 1.',
      'imac', '/images/rooms/lab-imac.jpg'
    );
    const labFashion = room(
      'lab-fashion-design', 'Lab Fashion Design', 'Gedung Kampus', 'Lantai 1', 24,
      ['Mesin jahit', 'Meja pola', 'Manekin', 'AC', 'Ruang fitting'],
      ['Gunakan alat sesuai arahan teknisi', 'Bersihkan sisa kain setelah praktik', 'Alat tajam wajib dikembalikan'],
      hoursFor(['08:30', '17:30']), luh, 'persetujuan', 4,
      'Lab untuk mahasiswa Desain Mode mengembangkan produk secara digital dan manual: eksplorasi teknik, pola, dan produksi fashion. Berlokasi di lantai 1.',
      'fashion', '/images/rooms/lab-fashion-design.jpg'
    );
    const perpustakaan = room(
      'perpustakaan', 'Perpustakaan', 'Gedung Kampus', 'Lantai 3', 40,
      ['Koleksi buku', 'Jurnal online', 'WiFi', 'AC', 'Meja baca'],
      ['Jaga ketenangan', 'Kembalikan buku pada tempatnya', 'Tidak boleh memindahkan furnitur'],
      hoursFor(['08:00', '16:00'], ['08:00', '12:00']), luh, 'bebas', 4,
      'Koleksi buku internasional dan nasional, jurnal cetak dan online, majalah, serta materi penunjang perkuliahan. Berada di lantai 3.',
      'library', '/images/rooms/perpustakaan.jpg'
    );
    const aula = room(
      'aula', 'Aula', 'Gedung Kampus', 'Lantai 1', 200,
      ['Panggung', 'Sound system', 'Proyektor', 'AC', 'Kursi lipat'],
      ['Koordinasi teknis dengan Sarpras', 'Tidak menempel dekorasi permanen', 'Batas waktu bongkar 1 jam setelah acara'],
      JSON.stringify([
        ['08:00', '16:00'], ['07:00', '21:00'], ['07:00', '21:00'],
        ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00']
      ]), dedi, 'persetujuan', 6,
      'Hall/Aula dengan fasilitas lengkap untuk seminar, workshop, pelatihan, dan kegiatan UKM di lingkungan kampus IDB Bali.',
      'hall', '/images/rooms/aula.jpg'
    );
    const gallery = room(
      'creative-gallery', 'Creative Gallery', 'Gedung Kampus', 'Lantai 1', 80,
      ['Ruang pamer', 'Lighting', 'Panel modular', 'AC'],
      ['Kurasi karya oleh pengelola', 'Pemasangan karya maksimal H-1', 'Jaga karya mahasiswa'],
      hoursFor(['09:00', '18:00'], ['09:00', '15:00']), luh, 'persetujuan', 4,
      'Galeri hasil karya mahasiswa lintas program studi, menampilkan bakat, jiwa kewirausahaan, dan kreativitas. Berlokasi di lantai 1.',
      'gallery', '/images/rooms/creative-gallery.jpg'
    );
    const gedungSerbaguna = room(
      'gedung-serbaguna', 'Gedung Serbaguna', 'Gedung Serbaguna', 'Lantai 1', 300,
      ['Area luas', 'Parkir', 'Area olahraga', 'Kegiatan ekstrakurikuler'],
      ['Koordinasi teknis dengan Sarpras', 'Jaga kebersihan dan keamanan area', 'Tidak menempel dekorasi permanen'],
      JSON.stringify([
        ['08:00', '16:00'], ['07:00', '21:00'], ['07:00', '21:00'],
        ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00'], ['07:00', '21:00']
      ]), dedi, 'persetujuan', 6,
      'Gedung serbaguna dengan ruang luas untuk parkir yang aman, olahraga, kegiatan ekstrakurikuler, dan acara kampus yang membutuhkan tempat luas.',
      'hall', '/images/rooms/gedung-serbaguna.jpg'
    );

    const studioFoto = room(
      'studio-foto', 'Studio Foto', 'Gedung Kampus', 'Lantai 1', 10,
      ['Backdrop', 'Lighting', 'Properti', 'AC'],
      ['Gunakan properti sesuai arahan', 'Kembalikan properti ke tempatnya', 'Jaga kebersihan studio'],
      hoursFor(['09:00', '17:00'], ['09:00', '14:00']), luh, 'persetujuan', 2,
      'Studio untuk fotografi dan videografi dengan background serta properti penunjang. Dapat digunakan seluruh program studi dan berada di lantai 1.',
      'gallery', '/images/rooms/studio-foto.jpg'
    );
    const labSoftware = room(
      'lab-software-development', 'Lab Software Development', 'Gedung Kampus', 'Lantai 2', 30,
      ['PC performa tinggi', 'Internet cepat', 'Perangkat lunak terbaru', 'AC', 'Proyektor'],
      ['Gunakan akun kampus', 'Simpan pekerjaan di drive kampus', 'Jangan mengubah konfigurasi jaringan'],
      hoursFor(['08:30', '17:30']), dedi, 'persetujuan', 4,
      'Lab modern untuk praktikum, penelitian, dan pengembangan proyek teknologi informasi dan bisnis, dengan komputer performa tinggi dan jaringan internet cepat.',
      'mainframe', '/images/rooms/lab-software.jpg'
    );

    const addReservation = db.prepare(
      `INSERT INTO reservations
        (public_id, user_id, room_id, organization_id, start_at, end_at, purpose,
         activity_name, participants, notes, status, is_public, public_description,
         decision_reason, idempotency_key, request_hash, created_at, updated_at, decided_by, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const reservation = (data) => {
      const start = at(data.date, data.start);
      const end = at(data.date, data.end);
      const created = data.createdAt || new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
      const updated = data.updatedAt || created;
      const publicId = makeId();
      const inserted = addReservation.run(
        publicId, data.userId, data.roomId, data.orgId || null, start, end,
        data.orgId ? 'organisasi' : 'pribadi', data.title, data.participants,
        data.notes || '', data.status, data.isPublic ? 1 : 0,
        data.publicDescription || '', data.reason || null,
        `seed-${publicId}`, data.hash || crypto.createHash('sha256').update(publicId).digest('hex'),
        created, updated, data.decidedBy || null, data.decidedAt || null
      );
      const id = Number(inserted.lastInsertRowid);
      const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(data.userId);
      audit(db, {
        actor,
        action: 'reservation.seed',
        objectType: 'reservation',
        objectId: publicId,
        meta: { status: data.status, room: data.roomId }
      });
      if (data.event) {
        db.prepare(
          `INSERT INTO events (reservation_id, title, description, moderation_status, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(id, data.title, data.publicDescription || '', data.event, created);
      }
      return { id, publicId };
    };

    reservation({
      date: addDays(today, 1), start: '09:00', end: '11:00', userId: rani,
      roomId: labKomputer, title: 'Kerja kelompok DKV — riset visual',
      participants: 18, status: 'Disetujui', decidedBy: dedi, decidedAt: nowIso(),
      notes: 'Diskusi moodboard dan pembagian tugas.'
    });
    reservation({
      date: addDays(today, 1), start: '13:00', end: '15:00', userId: komang,
      orgId: bem, roomId: aula, title: 'Rapat kerja BEM — ORMAWA Expo',
      participants: 45, status: 'Diajukan', isPublic: true, event: 'menunggu',
      publicDescription: 'Koordinasi divisi acara dan pameran organisasi.',
      notes: 'Butuh sound system dan proyektor.'
    });
    reservation({
      date: addDays(today, 2), start: '10:00', end: '12:00', userId: ayu,
      orgId: hmj, roomId: labFashion, title: 'Workshop pola dasar mahasiswa baru',
      participants: 22, status: 'Disetujui', decidedBy: luh, decidedAt: nowIso(),
      isPublic: true, event: 'terbit',
      publicDescription: 'Workshop pola dasar untuk mahasiswa DKV dan Desain Mode.'
    });
    reservation({
      date: today, start: '15:00', end: '17:00', userId: made,
      roomId: perpustakaan, title: 'Diskusi buku desain Bali',
      participants: 10, status: 'Disetujui', decidedBy: luh, decidedAt: nowIso(),
      notes: 'Diskusi terbuka, membawa buku sendiri.'
    });
    reservation({
      date: addDays(today, 3), start: '08:30', end: '10:30', userId: komang,
      orgId: bem, roomId: gallery, title: 'Kurasi pameran ORMAWA',
      participants: 30, status: 'Diajukan', isPublic: true, event: 'menunggu',
      publicDescription: 'Penataan karya dan kurasi pameran organisasi mahasiswa.'
    });
    reservation({
      date: addDays(today, -1), start: '10:00', end: '12:00', userId: 2,
      roomId: aula, title: 'Kuliah tamu Desain Interior',
      participants: 120, status: 'Selesai', decidedBy: dedi,
      decidedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    });
    reservation({
      date: addDays(today, -3), start: '13:00', end: '15:00', userId: rani,
      roomId: labImac, title: 'Produksi video profil prodi',
      participants: 12, status: 'Ditolak', decidedBy: dedi,
      decidedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      reason: 'Beririsan dengan jadwal kelas praktik yang sudah terdaftar.'
    });
    reservation({
      date: addDays(today, -4), start: '09:00', end: '11:00', userId: made,
      roomId: labKomputer, title: 'Latihan presentasi tugas akhir',
      participants: 20, status: 'Dibatalkan',
      reason: 'Dibatalkan oleh pemohon'
    });
    reservation({
      date: addDays(today, -5), start: '14:00', end: '16:00', userId: 2,
      roomId: perpustakaan, title: 'Bedah jurnal desain',
      participants: 8, status: 'Kedaluwarsa',
      reason: 'Melewati batas keputusan 2 hari kerja atau waktu mulai.'
    });
    reservation({
      date: addDays(today, 4), start: '13:00', end: '15:00', userId: ayu,
      orgId: hmj, roomId: labImac, title: 'Kelas tambahan ilustrasi digital',
      participants: 25, status: 'Disetujui', decidedBy: dedi, decidedAt: nowIso()
    });
    reservation({
      date: addDays(today, 5), start: '09:00', end: '12:00', userId: ketut,
      orgId: ukm, roomId: aula, title: 'Pameran foto UKM Fotografi',
      participants: 90, status: 'Diajukan', isPublic: true, event: 'menunggu',
      publicDescription: 'Pameran karya fotografi mahasiswa dan sesi portofolio.'
    });

    reservation({
      date: addDays(today, -2), start: '13:00', end: '15:00', userId: ayu,
      orgId: hmj, roomId: gallery, title: 'Open Studio DKV',
      participants: 35, status: 'Selesai', decidedBy: luh, decidedAt: nowIso(),
      isPublic: true, event: 'terbit',
      publicDescription: 'Sesi terbuka karya mahasiswa DKV: ilustrasi, fotografi, dan media eksperimental.'
    });
    reservation({
      date: addDays(today, 9), start: '10:00', end: '12:00', userId: ketut,
      orgId: ukm, roomId: aula, title: 'Seminar Bisnis Digital',
      participants: 110, status: 'Disetujui', decidedBy: dedi, decidedAt: nowIso(),
      isPublic: true, event: 'terbit',
      publicDescription: 'Seminar terbuka tentang strategi merek dan kanal digital untuk bisnis kreatif.'
    });
    reservation({
      date: addDays(today, 12), start: '09:00', end: '13:00', userId: ayu,
      orgId: hmj, roomId: gallery, title: 'Pameran Tugas Akhir DKV',
      participants: 70, status: 'Disetujui', decidedBy: luh, decidedAt: nowIso(),
      isPublic: true, event: 'terbit',
      publicDescription: 'Pameran tugas akhir mahasiswa Desain Komunikasi Visual angkatan 2022.'
    });

    const addBlock = db.prepare(
      `INSERT INTO blocks (room_id, start_at, end_at, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    addBlock.run(labImac, at(addDays(today, 4), '15:00'), at(addDays(today, 4), '17:30'),
      'Perawatan perangkat dan pembaruan sistem', luh, createdAt);
    addBlock.run(aula, at(addDays(today, 6), '08:00'), at(addDays(today, 6), '12:00'),
      'Gladi resik Dies Natalis', dedi, createdAt);
    addBlock.run(gallery, at(addDays(today, -2), '09:00'), at(addDays(today, -2), '12:00'),
      'Instalasi pameran', luh, createdAt);

    const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(admin);
    audit(db, {
      actor: adminUser,
      action: 'seed.initialize',
      objectType: 'system',
      objectId: 'siruang',
      meta: { rooms: 7, users: 9, date: today }
    });

    return { seeded: true };
  });

  return { seeded: true, users: 9, rooms: 7, date: today };
}

module.exports = { seed };
