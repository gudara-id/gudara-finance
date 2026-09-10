/**
 * Utilitas tanggal periode akuntansi Gudara.
 *
 * Aturan tutup buku: buku ditutup setiap tanggal 1 di awal bulan.
 * Artinya satu periode bulan berjalan mulai tanggal 2 hingga tanggal 1
 * bulan berikutnya (bukan tanggal 1 - akhir bulan seperti kalender biasa).
 *
 * Contoh:
 * - 15 Agustus 2026 -> periode berjalan: 2 Agustus 2026 - 1 September 2026
 * - 1 September 2026 (hari tutup buku) -> masih bagian dari periode
 *   2 Agustus 2026 - 1 September 2026
 * - 2 September 2026 -> periode baru dimulai: 2 September 2026 - 1 Oktober 2026
 */
export function startOfAccountingPeriod(reference: Date = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const day = reference.getDate();

  // Tanggal 1 adalah hari tutup buku periode sebelumnya, jadi mundur satu bulan.
  const periodMonth = day === 1 ? month - 1 : month;

  return new Date(year, periodMonth, 2);
}

export function toDateInputValue(date: Date) {
  // Pakai komponen tanggal LOKAL, bukan toISOString() (yang mengonversi ke
  // UTC dan bisa mundur 1 hari untuk timezone WIB/UTC+7).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfAccountingPeriodString(reference: Date = new Date()) {
  return toDateInputValue(startOfAccountingPeriod(reference));
}

export function todayString() {
  return toDateInputValue(new Date());
}

/**
 * Rentang periode akuntansi SEBELUM periode berjalan saat ini, dipakai
 * untuk membandingkan (kenaikan/penurunan) pendapatan, beban, dan laba
 * bulan ini terhadap bulan lalu.
 *
 * Contoh: kalau periode berjalan 2 Sep - 1 Okt, ini mengembalikan
 * { start: "2026-08-02", end: "2026-09-01" }.
 */
export function previousAccountingPeriodRange(reference: Date = new Date()) {
  const currentStart = startOfAccountingPeriod(reference);

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);

  const previousStart = startOfAccountingPeriod(previousEnd);

  return {
    start: toDateInputValue(previousStart),
    end: toDateInputValue(previousEnd)
  };
}

const MONTH_LABELS_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des"
];

/**
 * Daftar `count` periode akuntansi terakhir, diurutkan dari yang paling
 * lama ke yang paling baru (periode berjalan ada di posisi terakhir).
 * Dipakai untuk grafik tren beberapa bulan di dashboard.
 */
export function lastAccountingPeriods(count: number, reference: Date = new Date()) {
  const periods: { start: string; end: string; label: string }[] = [];

  let cursorStart = startOfAccountingPeriod(reference);
  let cursorEnd = new Date(cursorStart);
  cursorEnd.setMonth(cursorEnd.getMonth() + 1);
  cursorEnd.setDate(cursorEnd.getDate() - 1);

  for (let i = 0; i < count; i += 1) {
    periods.unshift({
      start: toDateInputValue(cursorStart),
      end: toDateInputValue(cursorEnd),
      label: `${MONTH_LABELS_ID[cursorStart.getMonth()]} ${String(cursorStart.getFullYear()).slice(2)}`
    });

    const previousEnd = new Date(cursorStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    cursorStart = startOfAccountingPeriod(previousEnd);
    cursorEnd = new Date(previousEnd);
  }

  return periods;
}

/**
 * period_month ('YYYY-MM') untuk periode akuntansi saat ini, dipakai
 * sebagai key default di halaman Anggaran. Merujuk ke bulan MULAI
 * periode berjalan (konsisten dengan startOfAccountingPeriod).
 */
export function currentPeriodMonth(reference: Date = new Date()) {
  const start = startOfAccountingPeriod(reference);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
}

/** Geser period_month ('YYYY-MM') maju/mundur sejumlah `delta` bulan. */
export function shiftPeriodMonth(periodMonth: string, delta: number) {
  const [year, month] = periodMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS_ID_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

/** Label tampilan untuk period_month ('YYYY-MM') -> "September 2026". */
export function periodMonthLabel(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return `${MONTH_LABELS_ID_FULL[month - 1] ?? month} ${year}`;
}
