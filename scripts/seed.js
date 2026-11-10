'use strict';

const { openDb } = require('../src/db');
const { seed } = require('../src/seed');

const db = openDb(process.env.SIRUANG_DB);
const result = seed(db);
console.log(JSON.stringify(result, null, 2));
db.close();
