const fs = require('fs');

const fixFile = (filePath) => {
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);

    const cleanMongo = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(cleanMongo);
      } else if (obj !== null && typeof obj === 'object') {
        if (obj.$oid) return obj.$oid;
        if (obj.$date) return obj.$date;
        
        const newObj = {};
        for (const key in obj) {
          if (key === '$oid' || key === '$date') {
            newObj[key] = obj[key];
          } else {
            newObj[key] = cleanMongo(obj[key]);
          }
        }
        return newObj;
      }
      return obj;
    };

    const fixedData = cleanMongo(data);
    fs.writeFileSync(filePath, JSON.stringify(fixedData, null, 2), 'utf8');
    console.log(`✅ সফলভাবে ঠিক করা হয়েছে: ${filePath}`);
  } catch (err) {
    console.error(`❌ এরর: ${filePath} - ${err.message}`);
  }
};

fixFile('src/data/books.json');
fixFile('src/data/subjects.json');
fixFile('src/data/qurans.json');
