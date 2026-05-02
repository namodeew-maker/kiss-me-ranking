-- ============================================
-- Migration: Lottery Draws (announcement history)
-- ============================================
-- จุดประสงค์:
--   - เก็บประวัติการประกาศผลแต่ละงวด: round_label + winning_number + drawn_at + drawn_by
--   - ใช้แสดงในหน้า admin "📜 ประวัติงวด" — ดูเลขที่ออกย้อนหลังได้
--   - Idempotent: รันซ้ำได้ไม่พัง (IF NOT EXISTS)
-- ============================================

CREATE TABLE IF NOT EXISTS lottery_draws (
    id SERIAL PRIMARY KEY,
    round_label VARCHAR(20) NOT NULL,
    winning_number CHAR(2) NOT NULL,                       -- '00'..'99'
    drawn_at TIMESTAMP DEFAULT NOW(),
    drawn_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    note TEXT,
    CONSTRAINT uq_lottery_draws_round UNIQUE (round_label),
    CONSTRAINT chk_lottery_draws_winning_number CHECK (winning_number ~ '^[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_lottery_draws_drawn_at
    ON lottery_draws (drawn_at DESC);

-- Backfill: Round 2026-04-B closed on 2 พ.ค. 2569 — winning number 43
-- Use the draw moment as drawn_at. drawn_by NULL (no admin context recorded for retro).
INSERT INTO lottery_draws (round_label, winning_number, drawn_at, note)
VALUES ('2026-04-B', '43', '2026-05-02 14:00:00+07', 'Backfill — recovered after drawDateLabelToRoundLabel fix')
ON CONFLICT (round_label) DO NOTHING;
