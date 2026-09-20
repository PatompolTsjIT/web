import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const SOURCES_DIR = path.join(ROOT, 'sources');

/** ไฟล์ข้อมูลตั้งต้น (read-only) — ใช้ seed ครั้งแรกครั้งเดียว */
export const ATTRACTION_FILE = path.join(SOURCES_DIR, 'attraction.json');
export const PODS_FILE = path.join(SOURCES_DIR, 'faraway_pods.json');

/** ฐานข้อมูลของแอป — ทุกการบันทึกจากหน้าเว็บลงที่ไฟล์นี้ */
export const DB_FILE = path.join(SOURCES_DIR, 'database-attraction.json');
