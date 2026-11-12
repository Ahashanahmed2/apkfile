const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// --- কনফিগারেশন ---
const BOOKS_JSON_PATH = path.join(__dirname, 'src/data/books.json');
const QURANS_JSON_PATH = path.join(__dirname, 'src/data/qurans.json');
const SUBJECTS_JSON_PATH = path.join(__dirname, 'src/data/subjects.json');
const SQLITE_DB_PATH = path.join(__dirname, 'tafsir.db');

// ডেটাবেস তৈরি বা কানেক্ট করুন
const db = new Database(SQLITE_DB_PATH);
db.pragma('journal_mode = WAL');

// ১. টেবিল তৈরি করুন (আগের ডেটা থাকলে ডিলিট করে নতুন তৈরি করবে)
db.exec(`DROP TABLE IF EXISTS books;`);
db.exec(`DROP TABLE IF EXISTS qurans;`);
db.exec(`DROP TABLE IF EXISTS subjects;`);

db.exec(`
  CREATE TABLE books (
    _id TEXT PRIMARY KEY,
    book TEXT,
    Author_Introduction TEXT
  );
`);

db.exec(`
  CREATE TABLE qurans (
    _id TEXT PRIMARY KEY,
    book TEXT,
    name TEXT,
    number TEXT,
    verses TEXT,
    summary TEXT,
    ancillary_issue TEXT,
    versesNumber TEXT
  );
`);

db.exec(`
  CREATE TABLE subjects (
    _id TEXT PRIMARY KEY,
    book TEXT,
    subject_name TEXT
  );
`);

// ২. ডেটা ইনসার্ট করার ফাংশন
function processFile(filePath, tableName, columns) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ফাইল পাওয়া যায়নি: ${filePath}`);
    return;
  }

  console.log(`⏳ পড়া হচ্ছে: ${path.basename(filePath)}...`);
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`✅ মোট ${jsonData.length} টি রেকর্ড পাওয়া গেছে।`);

  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);

  // ট্রানজেকশন ব্যবহার করে দ্রুত ইনসার্ট
  const insertMany = db.transaction((data) => {
    let count = 0;
    for (const item of data) {
      // MongoDB $oid হ্যান্ডেল করা
      let id = item._id;
      if (typeof id === 'object' && id !== null && id.$oid) {
        id = id.$oid;
      }

      // কলাম অনুযায়ী ডেটা ম্যাপ করা
      const values = {
        _id: id,
        book: item.book || null,
        Author_Introduction: item.Author_Introduction || null,
        name: item.name || null,
        number: item.number || null,
        verses: item.verses || null,
        summary: item.summary || null,
        ancillary_issue: item.ancillary_issue || null,
        versesNumber: item.versesNumber || null,
        subject_name: item.subject_name || null,
      };

      const finalValues = columns.map(col => values[col]);
      
      try {
        stmt.run(...finalValues);
        count++;
      } catch (err) {
        console.warn(`⚠️ রেকর্ড স্কিপ করা হয়েছে: ${id}`);
      }
    }
    return count;
  });

  const insertedCount = insertMany(jsonData);
  console.log(`🎉 ${tableName} টেবিলে সফলভাবে ${insertedCount} টি রেকর্ড ইনসার্ট হয়েছে।\n`);
}

// ৩. স্ক্রিপ্ট রান করা
console.log("🚀 SQLite রূপান্তর শুরু হচ্ছে...\n");

try {
  // books.json প্রসেস করা
  processFile(BOOKS_JSON_PATH, 'books', ['_id', 'book', 'Author_Introduction']);
  
  // qurans.json প্রসেস করা
  processFile(QURANS_JSON_PATH, 'qurans', ['_id', 'book', 'name', 'number', 'verses', 'summary', 'ancillary_issue', 'versesNumber']);

  // subjects.json প্রসেস করা
  processFile(SUBJECTS_JSON_PATH, 'subjects', ['_id', 'book', 'subject_name']);

  console.log(`✅ সব ডেটা সফলভাবে ${SQLITE_DB_PATH} ফাইলে সেভ হয়েছে!`);
} catch (err) {
  console.error("❌ এরর হয়েছে:", err);
}

db.close();