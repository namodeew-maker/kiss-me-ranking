const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');
const LATIN_NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

// ==================== RANK TIERS (same as profile.js) ====================
const RANK_TIERS = [
    { name: 'Unranked',  icon: '🔘', color: '#888888', minApproved: 0,  minPoints: 0    },
    { name: 'Bronze',    icon: '🥉', color: '#cd7f32', minApproved: 3,  minPoints: 0    },
    { name: 'Silver',    icon: '🥈', color: '#c0c0c0', minApproved: 10, minPoints: 50   },
    { name: 'Gold',      icon: '🥇', color: '#ffd700', minApproved: 25, minPoints: 150  },
    { name: 'Platinum',  icon: '💎', color: '#00f0ff', minApproved: 50, minPoints: 400  },
    { name: 'Diamond',   icon: '👑', color: '#b44aff', minApproved: 100,minPoints: 1000 },
    { name: 'Master',    icon: '🏆', color: '#ff3c3c', minApproved: 200,minPoints: 2500 },
];

function getCustomerRank(totalApproved, totalPoints) {
    let rank = RANK_TIERS[0];
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (totalApproved >= RANK_TIERS[i].minApproved && totalPoints >= RANK_TIERS[i].minPoints) {
            rank = RANK_TIERS[i];
            break;
        }
    }
    return rank;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text ?? ''));
    return div.innerHTML;
}

function resolveAssetUrl(value) {
    if (!value) return '';
    const normalized = String(value).trim();
    if (!normalized) return '';

    if (/^https?:\/\//i.test(normalized)) {
        try {
            const url = new URL(normalized);
            const uploadIndex = url.pathname.indexOf('/uploads/');
            if (uploadIndex >= 0) {
                return `${API_ROOT}${url.pathname.slice(uploadIndex)}`;
            }
        } catch {
            return normalized;
        }
        return normalized;
    }

    if (normalized.startsWith('/uploads/')) {
        return `${API_ROOT}${normalized}`;
    }

    if (normalized.startsWith('uploads/')) {
        return `${API_ROOT}/${normalized}`;
    }

    const embeddedUploadIndex = normalized.indexOf('/uploads/');
    if (embeddedUploadIndex >= 0) {
        return `${API_ROOT}${normalized.slice(embeddedUploadIndex)}`;
    }

    return `${API_ROOT}/uploads/${encodeURIComponent(normalized)}`;
}

const rankingImgModal = document.getElementById('ranking-img-modal');
const rankingImgModalImg = document.getElementById('ranking-img-modal-img');
const rankingImgModalClose = document.getElementById('ranking-img-modal-close');

function openRankingImageModal(src, alt = 'รูปพนักงาน') {
    if (!rankingImgModal || !rankingImgModalImg) return;
    rankingImgModalImg.src = src;
    rankingImgModalImg.alt = alt;
    rankingImgModal.hidden = false;
}

if (rankingImgModalClose) {
    rankingImgModalClose.addEventListener('click', () => {
        rankingImgModal.hidden = true;
    });
}

if (rankingImgModal) {
    rankingImgModal.addEventListener('click', (event) => {
        if (event.target === rankingImgModal) {
            rankingImgModal.hidden = true;
        }
    });
}

function getAvatarSrc(entry, fallbackName) {
    if (entry && entry.avatar_url) {
        return resolveAssetUrl(entry.avatar_url);
    }
    if (entry && entry.picture_url) {
        return resolveAssetUrl(entry.picture_url);
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'U')}&background=1a1a2e&color=00f0ff&size=160`;
}

function formatRank(rank) {
    return String(rank).padStart(2, '0');
}

function formatMetricNumber(value) {
    return LATIN_NUMBER_FORMATTER.format(Number(value || 0));
}

function renderLeaderboardBoard(list, options) {
    if (!list.length) {
        return '<div class="ranking-empty">ยังไม่มีข้อมูลอันดับ</div>';
    }

    const topThree = [0, 1, 2]
        .map(index => list[index])
        .filter(Boolean);
    const best = list[0];

    const podiumSlots = topThree.map((entry, index) => {
        const rank = index + 1;
        const avatarSrc = options.getAvatar(entry);
        const displayName = options.getDisplayName(entry);
        const avatarNode = avatarSrc
            ? `<button type="button" class="podium-avatar-btn" data-fullimg="${avatarSrc}" data-avatar-name="${escapeHtml(displayName)}" aria-label="ดูรูป ${escapeHtml(displayName)} เต็ม">
                <img class="podium-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=160'">
               </button>`
            : `<img class="podium-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=160'">`;
        return `<div class="podium-slot ${rank === 1 ? 'is-first' : ''}">
            <div class="podium-slot-rank">${formatRank(rank)}</div>
            ${avatarNode}
            <div class="podium-name">${escapeHtml(displayName)}</div>
            <div class="podium-meta">${escapeHtml(options.getSubtitle(entry))}</div>
            <div class="podium-points">${escapeHtml(options.getMetric(entry))}</div>
        </div>`;
    }).join('');

    const rows = list.map((entry, index) => {
        const rank = index + 1;
        const displayName = options.getDisplayName(entry);
        const avatarSrc = options.getAvatar(entry);
        const rowAvatar = avatarSrc
            ? `<button type="button" class="leaderboard-row-avatar-btn" data-fullimg="${avatarSrc}" data-avatar-name="${escapeHtml(displayName)}" aria-label="ดูรูป ${escapeHtml(displayName)} เต็ม">
                <img class="leaderboard-row-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96'">
               </button>`
            : `<img class="leaderboard-row-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96'">`;
        return `<div class="leaderboard-row ${rank === 1 ? 'is-top-1' : ''}">
            <div class="leaderboard-row-rank">${formatRank(rank)}</div>
            <div class="leaderboard-row-main">
                ${rowAvatar}
                <div>
                <div class="leaderboard-row-name">${escapeHtml(displayName)}</div>
                <div class="leaderboard-row-sub">${escapeHtml(options.getSubtitle(entry))}</div>
                </div>
            </div>
            <div class="leaderboard-row-points">${escapeHtml(options.getMetric(entry))}</div>
        </div>`;
    }).join('');

    const bestDisplayName = options.getDisplayName(best);
    const bestAvatarSrc = options.getAvatar(best);
    const bestAvatar = bestAvatarSrc
        ? `<button type="button" class="best-player-avatar-btn" data-fullimg="${bestAvatarSrc}" data-avatar-name="${escapeHtml(bestDisplayName)}" aria-label="ดูรูป ${escapeHtml(bestDisplayName)} เต็ม">
            <img class="best-player-avatar" src="${bestAvatarSrc}" alt="${escapeHtml(bestDisplayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(bestDisplayName)}&background=1a1a2e&color=00f0ff&size=160'">
           </button>`
        : `<img class="best-player-avatar" src="${bestAvatarSrc}" alt="${escapeHtml(bestDisplayName)}"
             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(bestDisplayName)}&background=1a1a2e&color=00f0ff&size=160'">`;

    return `<section class="leaderboard-card leaderboard-podium">
        <div class="leaderboard-card-header">
            <div>
                <h2 class="leaderboard-card-title">Leaderboard</h2>
                <p class="leaderboard-card-subtitle">Top 3 champions</p>
            </div>
            <span class="leaderboard-mini-label">${escapeHtml(options.boardLabel)}</span>
        </div>
        <div class="leaderboard-trophy-row">
            <div class="trophy-pill">🏆 1</div>
            <div class="trophy-pill">🥈 2</div>
            <div class="trophy-pill">🥉 3</div>
        </div>
        <div class="leaderboard-podium-grid">
            ${podiumSlots}
        </div>
    </section>

    <section class="leaderboard-card leaderboard-table-card">
        <div class="leaderboard-card-header">
            <div>
                <h2 class="leaderboard-card-title">Ranking Table</h2>
                <p class="leaderboard-card-subtitle">Live scoreboard</p>
            </div>
            <span class="leaderboard-mini-label">${escapeHtml(options.metricHeader)}</span>
        </div>
        <div class="leaderboard-table">
            <div class="leaderboard-table-head">
                <div>Rank</div>
                <div>Name</div>
                <div class="leaderboard-table-head-metric">${escapeHtml(options.metricHeader)}</div>
            </div>
            ${rows}
        </div>
    </section>

    <section class="leaderboard-card leaderboard-best-card">
        <div class="best-player-inner">
            <div class="leaderboard-card-header">
                <div>
                    <h2 class="leaderboard-card-title">Best Player</h2>
                    <p class="leaderboard-card-subtitle">Current No.1</p>
                </div>
            </div>
            <div class="best-player-top">
                <div class="best-player-rank-block">
                    <div class="best-player-rank">1</div>
                    <div class="best-player-label">Best<br>Player</div>
                </div>
                <div class="best-player-avatar-wrap">
                    ${bestAvatar}
                    <div class="best-player-avatar-caption">อันดับสูงสุดตอนนี้</div>
                </div>
            </div>
            <div class="best-player-score-wrap">
                <div class="best-player-score-label">${escapeHtml(options.metricHeader)}</div>
                <div class="best-player-score">${escapeHtml(options.getMetric(best))}</div>
            </div>
            <div class="best-player-name">${escapeHtml(bestDisplayName)}</div>
            <div class="best-player-meta">
                ${options.getBestMeta(best).map(meta => `<div class="best-player-chip"><span>${escapeHtml(meta.label)}</span><strong>${escapeHtml(meta.value)}</strong></div>`).join('')}
            </div>
        </div>
    </section>`;
}

function bindRankingImagePreview(container) {
    container.querySelectorAll('[data-fullimg]').forEach((button) => {
        button.addEventListener('click', () => {
            openRankingImageModal(button.dataset.fullimg, button.dataset.avatarName || 'รูปพนักงาน');
        });
    });
}

// ==================== PARTICLES ====================
function spawnParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (8 + Math.random() * 12) + 's';
        p.style.animationDelay = Math.random() * 10 + 's';
        p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
        container.appendChild(p);
    }
}

// ==================== TABS ====================
function initTabs() {
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.rank-tab-content').forEach(c => c.classList.add('rank-tab-hidden'));
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.classList.remove('rank-tab-hidden');
        });
    });
}

// ==================== STAFF RANKING ====================
async function loadStaffRanking() {
    const list = document.getElementById('staff-ranking-list');
    try {
        const res = await fetch(`${API_BASE}/ranking/staff`);
        const staffs = await res.json();
        if (!staffs.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        list.innerHTML = renderLeaderboardBoard(staffs, {
            boardLabel: 'Staff Leaderboard',
            metricHeader: 'Votes',
            getAvatar: (staff) => getAvatarSrc(staff, staff.nickname || staff.name),
            getDisplayName: (staff) => staff.nickname || staff.name || '—',
            getSubtitle: (staff) => {
                const realName = staff.name && staff.name !== staff.nickname ? `ชื่อจริง ${staff.name}` : 'พนักงานยอดนิยม';
                return `${realName} • เรต ${Number(staff.avg_overall || 0).toFixed(1)}/10`;
            },
            getMetric: (staff) => formatMetricNumber(staff.total_votes || 0),
            getBestMeta: (staff) => [
                { label: 'Votes', value: formatMetricNumber(staff.total_votes || 0) },
                { label: 'Avg Score', value: `${Number(staff.avg_overall || 0).toFixed(1)}/10` },
                { label: 'Service', value: `${Number(staff.avg_service || 0).toFixed(1)}/10` }
            ]
        });
        bindRankingImagePreview(list);
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

// ==================== CUSTOMER RANKING ====================
async function loadCustomerRanking() {
    const list = document.getElementById('customer-ranking-list');
    try {
        const res = await fetch(`${API_BASE}/ranking/customers`);
        const customers = await res.json();
        if (!customers.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        list.innerHTML = renderLeaderboardBoard(customers, {
            boardLabel: 'Customer Leaderboard',
            metricHeader: 'Points',
            getAvatar: (customer) => getAvatarSrc(customer, customer.display_name || 'U'),
            getDisplayName: (customer) => customer.display_name || '—',
            getSubtitle: (customer) => {
                const tierInfo = getCustomerRank(customer.total_approved, customer.total_points);
                return `${tierInfo.icon} ${tierInfo.name} • อนุมัติ ${formatMetricNumber(customer.total_approved || 0)} ครั้ง`;
            },
            getMetric: (customer) => formatMetricNumber(customer.total_points || 0),
            getBestMeta: (customer) => {
                const tierInfo = getCustomerRank(customer.total_approved, customer.total_points);
                return [
                    { label: 'Approved', value: formatMetricNumber(customer.total_approved || 0) },
                    { label: 'Tier', value: tierInfo.name },
                    { label: 'Points', value: formatMetricNumber(customer.total_points || 0) }
                ];
            }
        });
        bindRankingImagePreview(list);
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    spawnParticles();
    initTabs();
    loadStaffRanking();
    loadCustomerRanking();
});
