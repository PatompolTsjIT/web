/**
 * ตัวสกัดข้อมูล "ชั้น B" — อ่านจากข้อความต้นฉบับของ ททท. แล้วยกประโยคต้นฉบับมาเป็นหลักฐานทุกครั้ง
 * กติกา Track 1: ห้ามสร้างข้อเท็จจริงขึ้นเอง ถ้าไม่พบให้บอกว่าไม่พบ
 */

const TAG_RE = /<[^>]*>/g;
const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function stripHtml(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input.replace(/<br\s*\/?>/gi, ' ').replace(TAG_RE, ' ');
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  return s.replace(/\s+/g, ' ').trim();
}

export function isEmpty(v) {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || s === '-' || s === 'null' || s === 'undefined';
}

/** ตัดหน้าต่างข้อความรอบคำที่พบ เพื่อใช้เป็น "ประโยคต้นฉบับ" ที่กดดูได้ */
function evidenceAround(text, index, keywordLength, pad = 110) {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + keywordLength + pad);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const EXTRACTORS = {
  season: {
    label: 'ฤดูกาลที่เหมาะ',
    keywords: [
      'ฤดูหนาว', 'ฤดูฝน', 'ฤดูร้อน', 'หน้าหนาว', 'หน้าฝน', 'หน้าร้อน',
      'ตลอดทั้งปี', 'ได้ตลอดทั้งปี', 'ช่วงเดือน', 'ระหว่างเดือน',
      ...MONTHS.map((m) => 'เดือน' + m),
    ],
  },
  food: {
    label: 'จุดอาหาร/ร้านค้า',
    keywords: ['ร้านอาหาร', 'ศูนย์อาหาร', 'ร้านกาแฟ', 'ตลาดนัด', 'ตลาดสด', 'ร้านค้าสวัสดิการ', 'ของกินพื้นถิ่น'],
  },
  facilities: {
    label: 'ห้องน้ำ/ที่จอดรถ',
    keywords: ['ห้องน้ำ', 'ห้องสุขา', 'ที่จอดรถ', 'ลานจอดรถ', 'จุดจอดรถ', 'ศาลาพักผ่อน', 'จุดบริการนักท่องเที่ยว'],
  },
  payment: {
    label: 'ช่องทางชำระเงิน',
    keywords: ['บัตรเครดิต', 'เงินสด', 'พร้อมเพย์', 'พร้อมเพ', 'สแกนจ่าย', 'คิวอาร์', 'QR', 'โอนเงิน'],
  },
  fee: {
    label: 'ค่าเข้าชม',
    keywords: ['ค่าเข้าชม', 'ค่าธรรมเนียม', 'ค่าเข้า', 'ไม่เสียค่าเข้าชม', 'เข้าชมฟรี', 'ไม่เก็บค่าเข้า'],
  },
  ev: {
    label: 'จุดชาร์จรถ EV',
    keywords: ['สถานีชาร์จ', 'จุดชาร์จ', 'ช่องชาร์จ', 'ชาร์จรถไฟฟ้า', 'EV Charger', 'ตู้ชาร์จ'],
  },
  accommodation: {
    label: 'ที่พัก/ลานกางเต็นท์',
    keywords: ['ลานกางเต็นท์', 'บ้านพัก', 'ที่พัก', 'โฮมสเตย์', 'รีสอร์ท'],
  },
};

/**
 * สกัดค่าหนึ่งเรื่องจากข้อความหลายฟิลด์
 * @returns {{tier:'B', value:string, field:string, evidence:string, keyword:string}|null}
 */
export function extractOne(kind, sourceTexts) {
  const spec = EXTRACTORS[kind];
  if (!spec) return null;
  for (const { field, text } of sourceTexts) {
    if (!text) continue;
    for (const kw of spec.keywords) {
      const idx = text.indexOf(kw);
      if (idx >= 0) {
        return {
          tier: 'B',
          value: kw,
          field,
          evidence: evidenceAround(text, idx, kw.length),
          keyword: kw,
          extractedBy: 'rule-extractor/v1',
        };
      }
    }
  }
  return null;
}

/** ตรวจว่าแหล่งนี้ "ค้นเจอออนไลน์" ไหม (แก้ปัญหา 62% ไม่มีตัวตนออนไลน์) */
export function hasOnlinePresence(row) {
  return ['ATT_WEBSITE', 'ATT_FACEBOOK', 'ATT_INSTAGRAM', 'ATT_TIKTOK', 'ATT_YOUTUBE', 'ATT_LINE']
    .some((f) => !isEmpty(row[f]));
}
