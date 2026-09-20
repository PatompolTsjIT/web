import { seed } from './db.js';
import { DB_FILE } from './paths.js';

const force = process.argv.includes('--force');

console.log('── ไปไกลให้คุ้ม · seed ฐานข้อมูล ──');
const result = seed({ force });
if (result.seeded) {
  console.log(`เขียนไฟล์: ${DB_FILE}`);
  if (result.missing) console.log(`หมายเหตุ: ${result.missing} แหล่งใน pod ไม่พบใน attraction.json (ใช้ข้อมูลจาก pod แทน)`);
} else {
  console.log(result.reason);
  console.log('ต้องการสร้างใหม่ทั้งหมด ใช้:  npm run reseed');
}
