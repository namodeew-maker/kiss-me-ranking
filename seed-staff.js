const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const sql = `
INSERT INTO staffs (name, nickname, is_active) VALUES
('สมหญิง ใจดี', 'น้องมิ้นท์', TRUE),
('ปราณี รักสวย', 'น้องเบล', TRUE),
('สุดา ยิ้มหวาน', 'น้องแพร', TRUE),
('วรรณา สุขใจ', 'น้องเจน', TRUE),
('กัญญา ดาวเด่น', 'น้องแนน', TRUE)
ON CONFLICT DO NOTHING;
`;

pool.query(sql)
    .then(r => {
        console.log('SUCCESS: ' + r.rowCount + ' staff(s) inserted');
        pool.end();
    })
    .catch(err => {
        console.error('ERROR:', err.message);
        pool.end();
    });
