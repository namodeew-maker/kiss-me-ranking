const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', async () => {

    // ==================== TERMS GATE ====================
    const termsOverlay = document.getElementById('terms-overlay');
    const mainContent = document.getElementById('main-content');
    const termsAgree = document.getElementById('terms-agree');
    const btnAccept = document.getElementById('btn-terms-accept');

    // Check if already accepted this session
    if (sessionStorage.getItem('terms_accepted')) {
        termsOverlay.classList.add('hidden');
        mainContent.style.display = '';
    }

    termsAgree.addEventListener('change', () => {
        btnAccept.disabled = !termsAgree.checked;
        btnAccept.classList.toggle('enabled', termsAgree.checked);
    });

    btnAccept.addEventListener('click', () => {
        sessionStorage.setItem('terms_accepted', 'true');
        termsOverlay.classList.add('hidden');
        mainContent.style.display = '';
    });

    // "View terms" button from main page
    const btnViewTerms = document.getElementById('btn-view-terms');
    if (btnViewTerms) {
        btnViewTerms.addEventListener('click', () => {
            termsOverlay.classList.remove('hidden');
            mainContent.style.display = 'none';
            termsAgree.checked = true;
            btnAccept.disabled = false;
            btnAccept.classList.add('enabled');
        });
    }

    // ==================== ROUND INFO ====================
    function getCurrentRound() {
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth(); // 0-indexed
        const year = now.getFullYear();

        if (day >= 2 && day <= 14) {
            return {
                round: 1,
                label: 'รอบที่ 1',
                period: `วันที่ 2 – 14 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: `16 ${getThaiMonth(month)} ${year + 543}`,
                open: true
            };
        } else if (day >= 17 && day <= 29) {
            return {
                round: 2,
                label: 'รอบที่ 2',
                period: `วันที่ 17 – 29 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: getNextDrawDate(month, year),
                open: true
            };
        } else {
            // Outside active period
            let nextRound, nextPeriod, nextDraw;
            if (day === 1 || day >= 30) {
                nextRound = 'รอบถัดไป: รอบ 1';
                const nm = day === 1 ? month : (month + 1) % 12;
                const ny = day === 1 ? year : (month === 11 ? year + 1 : year);
                nextPeriod = `เปิดรับ: วันที่ 2 – 14 ${getThaiMonth(nm)} ${ny + 543}`;
                nextDraw = `16 ${getThaiMonth(nm)} ${ny + 543}`;
            } else {
                // day 15 or 16
                nextRound = 'รอบถัดไป: รอบ 2';
                nextPeriod = `เปิดรับ: วันที่ 17 – 29 ${getThaiMonth(month)} ${year + 543}`;
                nextDraw = getNextDrawDate(month, year);
            }
            return {
                round: 0,
                label: nextRound,
                period: nextPeriod,
                drawDate: nextDraw,
                open: false
            };
        }
    }

    function getThaiMonth(m) {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                         'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return months[m];
    }

    function getNextDrawDate(month, year) {
        const nextMonth = (month + 1) % 12;
        const nextYear = month === 11 ? year + 1 : year;
        return `1 ${getThaiMonth(nextMonth)} ${nextYear + 543}`;
    }

    const roundInfo = getCurrentRound();
    const roundBadge = document.getElementById('round-badge');
    const roundPeriod = document.getElementById('round-period');
    const roundDrawDate = document.getElementById('round-draw-date');

    if (roundBadge) {
        roundBadge.textContent = roundInfo.label;
        if (!roundInfo.open) roundBadge.classList.add('round-closed');
    }
    if (roundPeriod) roundPeriod.textContent = roundInfo.period;
    if (roundDrawDate) roundDrawDate.textContent = roundInfo.drawDate;

    // ==================== MAIN LOGIC ====================
    const lottoGrid = document.getElementById('lotto-grid');
    const selectedNumber = document.getElementById('selected-number');

    // --- Background Particles ---
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (8 + Math.random() * 12) + 's';
            p.style.animationDelay = Math.random() * 10 + 's';
            p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
            particlesContainer.appendChild(p);
        }
    }

    // --- Step Progress ---
    const stepItems = document.querySelectorAll('.step-item');
    function setActiveStep(num) {
        stepItems.forEach(s => {
            const step = parseInt(s.dataset.step, 10);
            s.classList.toggle('active', step <= num);
        });
    }

    // Load sold-out numbers from database
    let soldOutNumbers = [];
    try {
        const res = await fetch(`${API_BASE}/sold-out`);
        soldOutNumbers = await res.json();
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูล sold out:', err);
    }

    // Generate 100 Lotto numbers (00-99)
    for (let i = 0; i <= 99; i++) {
        const numDiv = document.createElement('div');
        numDiv.className = 'lotto-num';
        const formattedNum = i.toString().padStart(2, '0');
        numDiv.textContent = formattedNum;

        if (soldOutNumbers.includes(i)) {
            numDiv.classList.add('sold-out');
            numDiv.textContent = formattedNum + ' SOLD OUT';
        }

        numDiv.addEventListener('click', () => {
            if (!numDiv.classList.contains('sold-out')) {
                const prev = document.querySelector('.lotto-num.selected');
                if (prev) prev.classList.remove('selected');
                numDiv.classList.add('selected');
                selectedNumber.textContent = formattedNum;
                setActiveStep(3);
            }
        });

        lottoGrid.appendChild(numDiv);
    }

    // Handle Form submission - send to database
    const form = document.getElementById('submission-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selected = document.querySelector('.lotto-num.selected');
        if (!selected) {
            alert('กรุณาเลือกเลขที่ต้องการทายก่อนครับ!');
            return;
        }

        const name = document.getElementById('username').value.trim();
        if (!name) {
            alert('กรุณากรอกชื่อผู้ใช้ครับ!');
            return;
        }

        const number = selected.textContent.substring(0, 2);
        const fileInput = document.getElementById('proof');

        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('number', number);
            if (fileInput.files.length > 0) {
                formData.append('proof', fileInput.files[0]);
            }

            const res = await fetch(`${API_BASE}/history`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                setActiveStep(4);
                alert(`ยืนยันการทายเลข ${number} สำเร็จ!`);
                document.getElementById('username').value = '';
                selected.classList.remove('selected');
                selectedNumber.textContent = '--';
                // Reset preview
                const preview = document.getElementById('upload-preview');
                const uploadBox = document.getElementById('upload-box');
                if (preview) preview.hidden = true;
                if (uploadBox) uploadBox.hidden = false;
                setActiveStep(1);
            } else {
                const err = await res.json();
                alert('เกิดข้อผิดพลาด: ' + err.error);
            }
        } catch (err) {
            alert('ไม่สามารถเชื่อมต่อ Server ได้');
        }
    });

    // Upload Box interaction with preview
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('proof');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const btnRemoveImg = document.getElementById('btn-remove-img');

    uploadBox.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                uploadPreview.hidden = false;
                uploadBox.hidden = true;
            };
            reader.readAsDataURL(file);
        }
    });

    if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', () => {
            fileInput.value = '';
            uploadPreview.hidden = true;
            uploadBox.hidden = false;
        });
    }

    // Username input — advance step
    const usernameInput = document.getElementById('username');
    usernameInput.addEventListener('input', () => {
        if (usernameInput.value.trim()) {
            setActiveStep(2);
        }
    });
});
