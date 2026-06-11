// Global error handler to capture and display any runtime/syntax issues instantly for debugging
window.onerror = function(message, source, lineno, colno, error) {
    const errMsg = `❌ JavaScript Error:\nMessage: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error ? error.stack : 'No stack trace'}`;
    console.error(errMsg);
    
    // สร้างแบนเนอร์แสดงความผิดพลาดบนหน้าจอโดยไม่พึ่ง alert dialog ของบราวเซอร์ (เพื่อหลบการบล็อกของ Safari)
    const errContainer = document.getElementById('error-overlay-banner');
    if (!errContainer) {
        const div = document.createElement('div');
        div.id = 'error-overlay-banner';
        div.style.position = 'fixed';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100%';
        div.style.backgroundColor = '#dc2626';
        div.style.color = '#ffffff';
        div.style.padding = '16px';
        div.style.fontSize = '13px';
        div.style.fontFamily = 'monospace';
        div.style.zIndex = '999999';
        div.style.whiteSpace = 'pre-wrap';
        div.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
        div.style.borderBottom = '4px solid #991b1b';
        div.innerText = errMsg;
        document.body.appendChild(div);
    }
    return false;
};

/**
 * School Student Attendance System - Application Logic
 * Implements State Management, LocalStorage caching, Real-time simulations, CSV/Excel parsers and exports.
 */

// คาบเรียนมาตรฐาน
const PERIODS = [
    { id: 1, name: "คาบที่ 1 (08:30 - 09:20)" },
    { id: 2, name: "คาบที่ 2 (09:20 - 10:10)" },
    { id: 3, name: "คาบที่ 3 (10:10 - 11:00)" },
    { id: 4, name: "คาบที่ 4 (11:00 - 11:50)" },
    { id: 5, name: "คาบที่ 5 (12:40 - 13:30)" },
    { id: 6, name: "คาบที่ 6 (13:30 - 14:20)" },
    { id: 7, name: "คาบที่ 7 (14:20 - 15:10)" }
];

class AttendanceApp {
    constructor() {
        this.students = {};      // { room: [ { no, id, name, gender } ] }
        this.attendance = {};    // { "YYYY-MM-DD_period_room": { date, period, room, checkedAt, checkedBy, records: [ { no, status }, ... ] } }
        this.trackedSkips = {};   // { "YYYY-MM-DD_period_room_studentId": true } (เก็บว่าตามตัวเด็กโดดเรียนแล้วหรือยัง)
        
        // สถานะการกรองปัจจุบัน
        this.currentDate = this.getTodayDateString();
        this.currentPeriod = 1; // คาบปัจจุบัน
        this.selectedRoom = "1/1"; // ห้องที่กำลังเช็คชื่อ
        this.activeTab = "check-in"; // แท็บปัจจุบัน: check-in, dashboard, admin
        
        // สำหรับอัปเกรด Analytics & Google Sheets
        this.donutChart = null;
        this.lineChart = null;
        this.barChart = null;
        this.syncEnabled = false;
        this.sheetsUrl = "";
        this.isLoggedIn = false; // สถานะการล็อกอินแอดมิน
        
        this.init();
    }

    init() {
        try {
            // 0. ตรวจสอบสิทธิ์การเข้าใช้งาน
            this.checkLoginState();

            // 1. โหลดข้อมูลการเชื่อมต่อ Sheets
            this.loadSettings();
            
            // 2. โหลดหรือสร้างข้อมูลนักเรียนเริ่มต้น
            this.loadStudentsData();
            
            // 3. โหลดข้อมูลการเช็คชื่อ
            this.loadAttendanceData();
            
            // 3.1 ล้างประวัติจำลองเก่าที่บวมโควตาของระบบก่อนหน้าออก (เพื่อความปลอดภัยทางหน่วยความจำ)
            this.cleanOldBloatedHistory();
            
            // 4. จำลองประวัติย้อนหลัง 30 วันการเรียน (เพื่อใช้วาดกราฟสถิติ)
            this.generateHistoricalMockData();
            
            // 5. กำหนดค่าเริ่มต้นคาบเรียนตามเวลาจริง
            this.detectCurrentPeriod();
            
            // 6. ตั้งค่า Event Listeners และกรอกฟอร์มเริ่มต้น
            this.setupDOM();
            this.switchTab('check-in'); // Explicitly switch tab on startup to sync screen visibility
            
            // 7. จำลองข้อมูลสำหรับห้องอื่นๆ (เพื่อความสมจริงใน Dashboard)
            this.populateSimulatedData();
        } catch (error) {
            console.error("Critical initialization error:", error);
            if (window.onerror) {
                window.onerror(error.message, "app.js", 0, 0, error);
            } else {
                alert("เกิดข้อผิดพลาดในการโหลดระบบ: " + error.message + "\n\nกรุณากด 'รีเซ็ตระบบเริ่มต้น' หรือล้างข้อมูลแคชในเบราว์เซอร์");
            }
        }
    }

    checkLoginState() {
        const loggedIn = sessionStorage.getItem('ATTENDANCE_LOGGED_IN') === 'true' || localStorage.getItem('ATTENDANCE_LOGGED_IN') === 'true';
        const loginCard = document.getElementById('admin-login-card');
        const adminContent = document.getElementById('admin-content');
        const btnLogout = document.getElementById('btn-logout');
        
        if (loggedIn) {
            this.isLoggedIn = true;
            if (loginCard) loginCard.classList.add('hidden');
            if (adminContent) adminContent.classList.remove('hidden');
            if (btnLogout) btnLogout.classList.remove('hidden');
        } else {
            this.isLoggedIn = false;
            if (loginCard) loginCard.classList.remove('hidden');
            if (adminContent) adminContent.classList.add('hidden');
            if (btnLogout) btnLogout.classList.add('hidden');
        }
    }

    handleLoginSubmit() {
        const userIn = (document.getElementById('login-username')?.value || "").trim();
        const passIn = document.getElementById('login-password')?.value || "";
        const rememberMe = document.getElementById('login-remember')?.checked || false;
        
        if (userIn === 'admin' && passIn === '1234') {
            this.showToast("เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ!", "success");
            
            // เก็บสถานะการเข้าระบบ
            sessionStorage.setItem('ATTENDANCE_LOGGED_IN', 'true');
            if (rememberMe) {
                localStorage.setItem('ATTENDANCE_LOGGED_IN', 'true');
            }
            
            this.isLoggedIn = true;
            this.checkLoginState();
            this.renderAll();
        } else {
            this.showToast("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "error");
            alert("❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        }
    }

    handleLogout() {
        if (confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) {
            sessionStorage.removeItem('ATTENDANCE_LOGGED_IN');
            localStorage.removeItem('ATTENDANCE_LOGGED_IN');
            this.isLoggedIn = false;
            
            this.checkLoginState();
            this.switchTab('check-in'); // กลับไปยังแท็บเช็คชื่อ
            this.showToast("ออกจากระบบเรียบร้อยแล้ว", "info");
        }
    }

    generateHistoricalMockData() {
        if (localStorage.getItem('ATTENDANCE_DASHBOARD_CLEARED') === 'true') {
            console.log("Mock history generation skipped (Dashboard is cleared).");
            return;
        }
        const cached = localStorage.getItem('ATTENDANCE_HISTORY_GENERATED');
        if (cached) return; // สร้างประวัติแค่ครั้งแรกครั้งเดียว

        const today = new Date(this.currentDate);
        let generatedDays = 0;
        let dayOffset = 1;

        // วนลูปสร้างย้อนหลัง 30 วันการเรียน (เว้นวันเสาร์-อาทิตย์)
        while (generatedDays < 30) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - dayOffset);
            dayOffset++;

            const dayOfWeek = checkDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                // ข้ามเสาร์-อาทิตย์
                continue;
            }

            const yyyy = checkDate.getFullYear();
            const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
            const dd = String(checkDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;

            // สร้างสถิติเช็คชื่อคาบที่ 1-7 สำหรับทุกๆ 24 ห้อง
            window.SCHOOL_DB.classrooms.forEach((room, roomIdx) => {
                const roomStudents = this.students[room] || [];
                
                for (let period = 1; period <= 1; period++) {
                    const key = `${dateStr}_${period}_${room}`;
                    
                    const records = roomStudents.map(student => {
                        let status = 'มา';
                        
                        // สร้างพฤติกรรมกลุ่มเสี่ยงจำลอง (มีเด็กบางคนขาด/โดดประจำเพื่อความสมจริงใน Top 10)
                        if (room === '1/1' && student.no === 1) {
                            const rand = (generatedDays * 7 + period) % 10;
                            if (rand < 3) status = 'ขาด';
                            else if (rand < 5) status = 'โดดเรียน';
                            else if (rand < 6) status = 'สาย';
                        }
                        else if (room === '4/1' && student.no === 2) {
                            const rand = (generatedDays * 11 + period) % 10;
                            if (rand < 4) status = 'โดดเรียน';
                            else if (rand < 5) status = 'ลา';
                        }
                        else if (room === '2/3' && student.no === 4) {
                            const rand = (generatedDays * 3 + period) % 10;
                            if (rand < 3) status = 'สาย';
                            else if (rand < 5) status = 'ลา';
                        }
                        else if (room === '6/3' && student.no === 11) {
                            const rand = (generatedDays * 5 + period) % 10;
                            if (rand < 4) status = 'ขาด';
                        }
                        else {
                            const rand = (student.no * 17 + roomIdx * 5 + period * 3 + generatedDays * 13) % 100;
                            if (rand < 2) status = 'โดดเรียน';
                            else if (rand < 5) status = 'ขาด';
                            else if (rand < 7) status = 'ลา';
                            else if (rand < 10) status = 'สาย';
                        }
                        
                        return {
                            no: student.no,
                            id: student.id,
                            name: student.name,
                            status: status
                        };
                    });

                    this.attendance[key] = {
                        date: dateStr,
                        period: period,
                        room: room,
                        checkedAt: new Date(checkDate.getTime() + (8 * 3600000) + (period * 50 * 60000)).toISOString(),
                        checkedBy: "หัวหน้าห้องจำลอง",
                        records: records
                    };
                }
            });

            generatedDays++;
        }

        this.saveAttendanceData();
        localStorage.setItem('ATTENDANCE_HISTORY_GENERATED', 'true');
    }

    getTodayDateString() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    detectCurrentPeriod() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const timeVal = hours * 60 + minutes; // แปลงเวลาปัจจุบันเป็นนาทีทั้งหมดของวัน
        
        // ค้นหาว่าอยู่ในช่วงเวลาของคาบใด
        // คาบ 1: 08:30 (510 นาที) - 09:20 (560 นาที)
        // คาบ 7: 14:20 (860 นาที) - 15:10 (910 นาที)
        const periodTimes = [
            { id: 1, start: 510, end: 560 },
            { id: 2, start: 560, end: 610 },
            { id: 3, start: 610, end: 660 },
            { id: 4, start: 660, end: 710 },
            { id: 5, start: 760, end: 810 }, // คาบ 5 เริ่ม 12:40 (760 นาที)
            { id: 6, start: 810, end: 860 },
            { id: 7, start: 860, end: 910 }
        ];

        const match = periodTimes.find(pt => timeVal >= pt.start && timeVal < pt.end);
        if (match) {
            this.currentPeriod = match.id;
        } else {
            // ถ้านอกเวลาเรียน ให้ดูว่าก่อนเริ่มเรียนหรือหลังเลิกเรียน
            if (timeVal < 510) {
                this.currentPeriod = 1;
            } else {
                this.currentPeriod = 7;
            }
        }
    }

    loadStudentsData() {
        if (localStorage.getItem('SCHOOL_STUDENTS_CLEARED') === 'true') {
            this.students = {};
            return;
        }

        // Check if script assets loaded
        if (!window.IMPORTED_STUDENTS) {
            console.warn("Warning: window.IMPORTED_STUDENTS is not defined. check if importedStudentsData.js loaded successfully.");
        }
        if (!window.SCHOOL_DB) {
            console.error("Error: window.SCHOOL_DB is not defined. check if mockData.js loaded successfully.");
            alert("❌ ไม่สามารถโหลดไฟล์รายชื่อนักเรียนได้ กรุณารีเฟรชหน้าเว็บ หรือตรวจสอบไฟล์ในโฟลเดอร์");
            return;
        }

        let loaded = false;
        try {
            const cached = localStorage.getItem('SCHOOL_STUDENTS');
            if (cached && cached !== "null" && cached !== "undefined") {
                const parsed = JSON.parse(cached);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    this.students = parsed;
                    loaded = true;
                }
            }
        } catch (e) {
            console.error("Error parsing SCHOOL_STUDENTS from localStorage", e);
        }

        if (!loaded) {
            this.students = {};
            
            // 1. นำเข้าจากข้อมูลโรงเรียนที่โหลดไว้ในตัวแปร IMPORTED_STUDENTS
            if (window.IMPORTED_STUDENTS) {
                Object.keys(window.IMPORTED_STUDENTS).forEach(room => {
                    const list = window.IMPORTED_STUDENTS[room];
                    if (list && list.length > 0) {
                        this.students[room] = JSON.parse(JSON.stringify(list));
                    }
                });
            }
            
            // 2. ถ้าห้องเรียนไหนไม่มีข้อมูลโรงเรียนจริง ให้สุ่มห้องเรียนจำลอง (Mock)
            const mockStudents = window.SCHOOL_DB.getMockStudents();
            window.SCHOOL_DB.classrooms.forEach(room => {
                if (!this.students[room] || this.students[room].length === 0) {
                    this.students[room] = mockStudents[room] || [];
                }
            });
            
            this.saveStudentsData();
        }
    }

    saveStudentsData() {
        localStorage.setItem('SCHOOL_STUDENTS', JSON.stringify(this.students));
    }

    loadAttendanceData() {
        try {
            const cached = localStorage.getItem('ATTENDANCE_RECORDS');
            if (cached) {
                this.attendance = JSON.parse(cached);
            }
        } catch (e) {
            console.error("Failed to parse ATTENDANCE_RECORDS", e);
        }
        
        if (!this.attendance || typeof this.attendance !== 'object') {
            this.attendance = {};
            this.saveAttendanceData();
        }

        try {
            const cachedSkips = localStorage.getItem('TRACKED_SKIPS');
            if (cachedSkips) {
                this.trackedSkips = JSON.parse(cachedSkips);
            }
        } catch (e) {
            console.error("Failed to parse TRACKED_SKIPS", e);
        }

        if (!this.trackedSkips || typeof this.trackedSkips !== 'object') {
            this.trackedSkips = {};
            this.saveTrackedSkips();
        }
    }

    cleanOldBloatedHistory() {
        try {
            let hasOldBloatedData = false;
            Object.keys(this.attendance).forEach(key => {
                // key format: YYYY-MM-DD_period_room
                const parts = key.split('_');
                if (parts.length >= 3) {
                    const period = parseInt(parts[1]);
                    if (period > 1) {
                        const record = this.attendance[key];
                        if (record && record.date !== this.currentDate && record.checkedBy === "หัวหน้าห้องจำลอง") {
                            hasOldBloatedData = true;
                        }
                    }
                }
            });

            if (hasOldBloatedData) {
                console.warn("Wiping bloated old mock historical records to free localStorage space.");
                // ล้างเฉพาะตัวที่สร้างจำลองในประวัติอดีต
                Object.keys(this.attendance).forEach(key => {
                    const record = this.attendance[key];
                    if (record && record.date !== this.currentDate && record.checkedBy === "หัวหน้าห้องจำลอง") {
                        delete this.attendance[key];
                    }
                });
                localStorage.removeItem('ATTENDANCE_HISTORY_GENERATED');
                this.saveAttendanceData();
            }
        } catch (e) {
            console.error("Error cleaning old history", e);
        }
    }

    saveAttendanceData() {
        try {
            localStorage.setItem('ATTENDANCE_RECORDS', JSON.stringify(this.attendance));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.error("LocalStorage Quota Exceeded! Clearing attendance records and retrying with smaller dataset.", e);
                localStorage.removeItem('ATTENDANCE_RECORDS');
                localStorage.removeItem('ATTENDANCE_HISTORY_GENERATED');
                this.attendance = {};
                alert("⚠️ หน่วยความจำบราวเซอร์เต็ม ระบบได้ทำการรีเซ็ตข้อมูลการเช็คชื่อย้อนหลังอัตโนมัติเพื่อให้ใช้งานต่อไปได้");
                location.reload();
            } else {
                throw e;
            }
        }
    }

    saveTrackedSkips() {
        localStorage.setItem('TRACKED_SKIPS', JSON.stringify(this.trackedSkips));
    }

    // ฟังก์ชันจำลองการเช็คชื่อของห้องอื่นเพื่อสร้าง Real-time Dashboard
    populateSimulatedData() {
        if (localStorage.getItem('ATTENDANCE_DASHBOARD_CLEARED') === 'true') {
            console.log("Simulated room data population skipped (Dashboard is cleared).");
            return;
        }
        const keyPrefix = `${this.currentDate}_${this.currentPeriod}_`;
        let updated = false;

        // วนลูปห้องเรียนทั้งหมด 24 ห้อง
        window.SCHOOL_DB.classrooms.forEach((room, idx) => {
            // ไม่จำลองทับห้องเรียนที่กำลังเลือกเช็คชื่อ และห้องเรียนที่มีประวัติแล้ว
            const key = `${keyPrefix}${room}`;
            if (room !== this.selectedRoom && !this.attendance[key]) {
                // จำลองว่าห้องเรียน 80% ถูกเช็คชื่อแล้ว
                const shouldCheck = (idx * 17) % 10 < 8; 
                
                if (shouldCheck) {
                    const roomStudents = this.students[room] || [];
                    const records = roomStudents.map(student => {
                        let status = 'มา';
                        // สุ่มสร้างสถิติขาด/ลา/สาย/โดดเรียน
                        const rand = (student.no * 13 + idx * 7) % 100;
                        if (rand < 5) {
                            status = 'โดดเรียน';
                        } else if (rand < 12) {
                            status = 'ขาด';
                        } else if (rand < 18) {
                            status = 'ลา';
                        } else if (rand < 25) {
                            status = 'สาย';
                        }
                        return {
                            no: student.no,
                            id: student.id,
                            name: student.name,
                            status: status
                        };
                    });

                    this.attendance[key] = {
                        date: this.currentDate,
                        period: this.currentPeriod,
                        room: room,
                        checkedAt: new Date(new Date().getTime() - (idx * 5 * 60000)).toISOString(),
                        checkedBy: "หัวหน้าห้องจำลอง",
                        records: records
                    };
                    updated = true;
                }
            }
        });

        if (updated) {
            this.saveAttendanceData();
        }
    }

    setupDOM() {
        // อัปเดต Dropdowns คาบเรียน/วันที่ ที่ Top Bar
        const dateInput = document.getElementById('global-date');
        const periodSelect = document.getElementById('global-period');
        
        if (dateInput) {
            dateInput.value = this.currentDate;
            dateInput.addEventListener('change', (e) => {
                this.currentDate = e.target.value;
                this.populateSimulatedData();
                this.renderAll();
            });
        }
        
        if (periodSelect) {
            periodSelect.innerHTML = PERIODS.map(p => `<option value="${p.id}" ${p.id === this.currentPeriod ? 'selected' : ''}>${p.name}</option>`).join('');
            periodSelect.addEventListener('change', (e) => {
                this.currentPeriod = parseInt(e.target.value);
                this.populateSimulatedData();
                this.renderAll();
            });
        }

        // แท็บ Navigation
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // ฟอร์มสำหรับเช็คชื่อ (ระดับชั้น และ ห้อง)
        const gradeSelect = document.getElementById('checkin-grade');
        const roomSelect = document.getElementById('checkin-room');

        if (gradeSelect && roomSelect) {
            // เมื่อระดับชั้นเปลี่ยน ให้เปลี่ยนรายการห้อง
            gradeSelect.addEventListener('change', () => {
                this.updateRoomOptions();
                this.updateSelectedRoom();
            });

            roomSelect.addEventListener('change', () => {
                this.updateSelectedRoom();
            });
        }

        // ปุ่มบันทึกการเช็คชื่อ
        const btnSave = document.getElementById('btn-save-attendance');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.saveCurrentAttendance());
        }

        // ปุ่มนำเข้า Excel/CSV
        const btnImport = document.getElementById('btn-trigger-import');
        const fileInput = document.getElementById('excel-file-input');
        if (btnImport && fileInput) {
            btnImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleImportFile(e));
        }

        // ปุ่มดาวน์โหลด Template CSV
        const btnTemplate = document.getElementById('btn-download-template');
        if (btnTemplate) {
            btnTemplate.addEventListener('click', () => this.downloadCSVTemplate());
        }

        // ปุ่มเพิ่มรายชื่อนักเรียนรายบุคคล
        const btnAddStudent = document.getElementById('btn-trigger-add-student');
        if (btnAddStudent) {
            btnAddStudent.addEventListener('click', () => this.openAddStudentModal());
        }

        // ฟอร์มบันทึกการเพิ่มนักเรียนรายคน
        const formAddStudent = document.getElementById('form-add-student');
        if (formAddStudent) {
            formAddStudent.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveIndividualStudent();
            });
        }

        // ค้นหาหน้าแอดมิน
        const adminRoomFilter = document.getElementById('admin-filter-room');
        if (adminRoomFilter) {
            adminRoomFilter.addEventListener('change', () => {
                this.renderAdminTable();
                this.calculateRiskStudents();
            });
        }

        const btnExport = document.getElementById('btn-export-excel');
        if (btnExport) {
            btnExport.addEventListener('click', () => this.exportToExcel());
        }

        // ปุ่มลบรายชื่อนักเรียนทั้งหมด
        const btnClearStudents = document.getElementById('btn-clear-students');
        if (btnClearStudents) {
            btnClearStudents.addEventListener('click', () => {
                if (confirm("คุณต้องการลบรายชื่อนักเรียนและประวัติการเช็คชื่อทั้งหมดออกจากระบบใช่หรือไม่?\n\n⚠️ คำเตือน: หลังจากลบแล้ว รายชื่อนักเรียนจะว่างเปล่าทั้งหมด (รวมถึงข้อมูลจำลองและข้อมูลที่นำเข้าด้วย) คุณต้องทำการนำเข้าไฟล์ใหม่เพื่อใช้งานต่อไป")) {
                    localStorage.setItem('SCHOOL_STUDENTS_CLEARED', 'true');
                    localStorage.setItem('ATTENDANCE_DASHBOARD_CLEARED', 'true');
                    localStorage.removeItem('SCHOOL_STUDENTS');
                    localStorage.removeItem('ATTENDANCE_RECORDS');
                    localStorage.removeItem('TRACKED_SKIPS');
                    localStorage.removeItem('ATTENDANCE_HISTORY_GENERATED');
                    this.students = {};
                    this.attendance = {};
                    this.trackedSkips = {};
                    this.saveStudentsData();
                    this.saveAttendanceData();
                    this.saveTrackedSkips();
                    location.reload();
                }
            });
        }

        // ปุ่มล้างข้อมูล Dashboard
        const btnClearDash = document.getElementById('btn-clear-dashboard');
        if (btnClearDash) {
            btnClearDash.addEventListener('click', () => {
                if (confirm("คุณต้องการล้างข้อมูล Dashboard และประวัติการเช็คชื่อทั้งหมดเป็นศูนย์ใช่หรือไม่? (จะแสดงผลสถิติเป็น 0 จนกว่าจะมีการเช็คชื่อใหม่)")) {
                    localStorage.setItem('ATTENDANCE_DASHBOARD_CLEARED', 'true');
                    localStorage.removeItem('ATTENDANCE_RECORDS');
                    localStorage.removeItem('TRACKED_SKIPS');
                    localStorage.removeItem('ATTENDANCE_HISTORY_GENERATED');
                    this.attendance = {};
                    this.trackedSkips = {};
                    this.saveAttendanceData();
                    this.saveTrackedSkips();
                    location.reload();
                }
            });
        }

        // ปุ่มรีเซ็ตฐานข้อมูลและสถิติทั้งหมด
        const btnReset = document.getElementById('btn-reset-db');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (confirm("คุณต้องการรีเซ็ตข้อมูลและประวัติสถิติทั้งหมดกลับเป็นค่าเริ่มต้น (มีข้อมูลจำลองสถิติย้อนหลัง 30 วันสำหรับทดสอบ) ใช่หรือไม่?")) {
                    localStorage.removeItem('SCHOOL_STUDENTS_CLEARED');
                    localStorage.removeItem('ATTENDANCE_DASHBOARD_CLEARED');
                    localStorage.removeItem('SCHOOL_STUDENTS');
                    localStorage.removeItem('ATTENDANCE_RECORDS');
                    localStorage.removeItem('TRACKED_SKIPS');
                    localStorage.removeItem('ATTENDANCE_HISTORY_GENERATED');
                    location.reload();
                }
            });
        }

        // ฟอร์มเข้าสู่ระบบ
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLoginSubmit();
            });
        }

        // ปุ่มออกจากระบบ
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                this.handleLogout();
            });
        }
        // ตั้งค่าตัวเลือกในหน้า Dashboard
        const dashTimeframe = document.getElementById('dashboard-filter-timeframe');
        const dashScope = document.getElementById('dashboard-filter-scope');
        const dashRoomSelect = document.getElementById('dashboard-filter-room');
        const dashRoomWrapper = document.getElementById('dashboard-room-select-wrapper');

        if (dashTimeframe) {
            dashTimeframe.addEventListener('change', () => this.renderDashboardTab());
        }

        if (dashScope && dashRoomSelect && dashRoomWrapper) {
            dashRoomSelect.innerHTML = window.SCHOOL_DB.classrooms.map(room => `<option value="${room}">ม.${room}</option>`).join('');
            
            dashScope.addEventListener('change', (e) => {
                if (e.target.value === 'room') {
                    dashRoomWrapper.classList.remove('hidden');
                } else {
                    dashRoomWrapper.classList.add('hidden');
                }
                this.renderDashboardTab();
            });

            dashRoomSelect.addEventListener('change', () => this.renderDashboardTab());
        }

        // ตัวเลือกการส่งออกช่วงวันที่ในหน้าแอดมิน
        const expStart = document.getElementById('admin-export-start');
        const expEnd = document.getElementById('admin-export-end');
        if (expStart) {
            expStart.value = this.currentDate;
            expStart.addEventListener('change', () => {
                this.renderAdminTable();
                this.calculateRiskStudents();
            });
        }
        if (expEnd) {
            expEnd.value = this.currentDate;
            expEnd.addEventListener('change', () => {
                this.renderAdminTable();
                this.calculateRiskStudents();
            });
        }

        // บันทึกการเชื่อมต่อ Google Sheets Settings
        const btnSaveSettings = document.getElementById('btn-save-settings');
        if (btnSaveSettings) {
            btnSaveSettings.addEventListener('click', () => this.saveSettings());
        }

        this.updateRoomOptions();
        this.updateSelectedRoom();
    }

    updateRoomOptions() {
        const gradeSelect = document.getElementById('checkin-grade');
        const roomSelect = document.getElementById('checkin-room');
        if (!gradeSelect || !roomSelect) return;

        const grade = gradeSelect.value; // "M1", "M2", "M3", "M4", "M5", "M6"
        let maxRoom = 5; // ม.ต้น มี 5 ห้อง
        
        if (["M4", "M5", "M6"].includes(grade)) {
            maxRoom = 3; // ม.ปลาย มี 3 ห้อง
        }

        let optionsHtml = '';
        for (let i = 1; i <= maxRoom; i++) {
            optionsHtml += `<option value="${i}">ห้อง ${i}</option>`;
        }
        roomSelect.innerHTML = optionsHtml;
    }

    updateSelectedRoom() {
        const gradeSelect = document.getElementById('checkin-grade');
        const roomSelect = document.getElementById('checkin-room');
        if (!gradeSelect || !roomSelect) return;

        // แปลงเกรด M1-M6 + ห้อง เช่น "M1" และ "1" => "1/1"
        const gradeNum = gradeSelect.value.replace('M', '');
        const roomNum = roomSelect.value;
        this.selectedRoom = `${gradeNum}/${roomNum}`;
        
        this.renderCheckinTab();
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        
        // สลับไฮไลท์แท็บ
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('tab-active');
            } else {
                tab.classList.remove('tab-active');
            }
        });

        // สลับเนื้อหาหน้าจอ
        const screens = document.querySelectorAll('.tab-screen');
        screens.forEach(screen => {
            if (screen.id === `screen-${tabName}`) {
                screen.classList.remove('hidden');
            } else {
                screen.classList.add('hidden');
            }
        });

        // เรนเดอร์แท็บนั้นๆ ใหม่
        this.renderAll();
    }

    renderAll() {
        // อัปเดตส่วนหัวของคาบเรียนและวันเรียนปัจจุบัน
        const statusTimeInfo = document.getElementById('status-time-info');
        if (statusTimeInfo) {
            const pObj = PERIODS.find(p => p.id === this.currentPeriod);
            statusTimeInfo.textContent = `วันที่: ${this.formatThaiDate(this.currentDate)} | คาบเรียน: ${pObj ? pObj.name : '-'}`;
        }

        if (this.activeTab === "check-in") {
            this.renderCheckinTab();
        } else if (this.activeTab === "dashboard") {
            this.renderDashboardTab();
        } else if (this.activeTab === "admin") {
            this.renderAdminTab();
        }
    }

    formatThaiDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const thaiMonths = [
            "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
            "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
        ];
        return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
    }

    // ==========================================
    // TAB 1: เช็คชื่อ
    // ==========================================
    renderCheckinTab() {
        const studentListContainer = document.getElementById('student-checkin-list');
        if (!studentListContainer) return;

        const currentRoomStudents = this.students[this.selectedRoom] || [];
        
        // ค้นหาข้อมูลเดิมที่เคยเช็คชื่อไว้ (หากมี)
        const key = `${this.currentDate}_${this.currentPeriod}_${this.selectedRoom}`;
        const savedRecord = this.attendance[key];
        
        // กำหนดหัวข้อการเช็คห้องปัจจุบัน
        const checkinTitle = document.getElementById('checkin-title-room');
        if (checkinTitle) {
            checkinTitle.innerHTML = `<i class="fas fa-graduation-cap text-blue-600 mr-2"></i>รายชื่อนักเรียน ชั้นมัธยมศึกษาปีที่ ${this.selectedRoom}`;
        }

        const checkinHeaderStatus = document.getElementById('checkin-header-status');
        if (checkinHeaderStatus) {
            if (savedRecord) {
                checkinHeaderStatus.innerHTML = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>บันทึกแล้วเมื่อ ${this.formatTime(savedRecord.checkedAt)} น.
                </span>`;
            } else {
                checkinHeaderStatus.innerHTML = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                    <span class="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span>ยังไม่ได้รับการเช็คชื่อ
                </span>`;
            }
        }

        if (currentRoomStudents.length === 0) {
            studentListContainer.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400">
                    <i class="fas fa-users-slash text-5xl mb-3"></i>
                    <p class="font-medium">ไม่พบข้อมูลนักเรียนในห้องเรียนนี้</p>
                    <p class="text-xs mt-1">กรุณานำเข้าข้อมูลผ่านปุ่ม "นำเข้าไฟล์นักเรียน"</p>
                </div>
            `;
            return;
        }

        let html = '';
        currentRoomStudents.forEach(student => {
            // หาสถานะเดิมหรือให้เป็น "มา" (Default)
            let status = 'มา';
            if (savedRecord && savedRecord.records) {
                const sRec = savedRecord.records.find(r => r.id === student.id);
                if (sRec) status = sRec.status;
            }

            const avatarBg = student.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700';
            const genderIcon = student.gender === 'male' ? 'fa-user' : 'fa-user';

            html += `
                <div class="glass-card p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4" data-student-id="${student.id}">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold ${avatarBg} text-sm flex-shrink-0">
                            ${student.no}
                        </div>
                        <div>
                            <div class="font-bold text-slate-800">${student.name}</div>
                            <div class="text-xs text-slate-500">รหัสประจำตัว: ${student.id}</div>
                        </div>
                    </div>
                    
                    <!-- 1-Tap Toggle Status Buttons -->
                    <div class="flex flex-wrap gap-1.5 items-center">
                        <button onclick="window.app.updateStudentStatus('${student.id}', 'มา')" 
                            class="status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all ${status === 'มา' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                            data-status="มา">มา</button>
                        <button onclick="window.app.updateStudentStatus('${student.id}', 'ขาด')" 
                            class="status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all ${status === 'ขาด' ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                            data-status="ขาด">ขาด</button>
                        <button onclick="window.app.updateStudentStatus('${student.id}', 'ลา')" 
                            class="status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all ${status === 'ลา' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                            data-status="ลา">ลา</button>
                        <button onclick="window.app.updateStudentStatus('${student.id}', 'สาย')" 
                            class="status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all ${status === 'สาย' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                            data-status="สาย">สาย</button>
                        <button onclick="window.app.updateStudentStatus('${student.id}', 'โดดเรียน')" 
                            class="status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all ${status === 'โดดเรียน' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                            data-status="โดดเรียน">โดดเรียน</button>
                    </div>
                </div>
            `;
        });

        studentListContainer.innerHTML = html;
    }

    updateStudentStatus(studentId, newStatus) {
        // เมื่อคลิกปุ่มสถานะ จะอัปเดตปุ่มใน UI ทันที
        const studentCard = document.querySelector(`[data-student-id="${studentId}"]`);
        if (!studentCard) return;

        const buttons = studentCard.querySelectorAll('.status-btn-pill');
        buttons.forEach(btn => {
            const status = btn.getAttribute('data-status');
            if (status === newStatus) {
                // อัปเดตสไตล์ปุ่มที่ถูกเลือก
                if (status === 'มา') {
                    btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-emerald-600 text-white border-emerald-600 shadow-sm";
                } else if (status === 'ขาด') {
                    btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-red-600 text-white border-red-600 shadow-sm";
                } else if (status === 'ลา') {
                    btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-blue-600 text-white border-blue-600 shadow-sm";
                } else if (status === 'สาย') {
                    btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-amber-500 text-white border-amber-500 shadow-sm";
                } else if (status === 'โดดเรียน') {
                    btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-purple-600 text-white border-purple-600 shadow-sm";
                }
            } else {
                // รีเซ็ตสไตล์ปุ่มอื่นๆ
                btn.className = "status-btn-pill px-3 py-1.5 text-xs font-semibold rounded-lg btn-tap-effect border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100";
            }
        });
    }

    saveCurrentAttendance() {
        const studentCardElements = document.querySelectorAll('#student-checkin-list [data-student-id]');
        if (studentCardElements.length === 0) {
            this.showToast("ไม่พบข้อมูลนักเรียนในการบันทึก", "error");
            return;
        }

        // แสดง Loading UI บนปุ่มบันทึก
        const btnSave = document.getElementById('btn-save-attendance');
        const originalBtnHtml = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fas fa-spinner animate-spin mr-2"></i>กำลังบันทึกและส่งข้อมูลแบบ Real-time...`;

        // รวบรวมข้อมูลสถานะ
        const records = [];
        studentCardElements.forEach(card => {
            const studentId = card.getAttribute('data-student-id');
            const student = this.students[this.selectedRoom].find(s => s.id === studentId);
            
            // ค้นหาปุ่มที่ถูกเลือกอยู่
            const activeBtn = card.querySelector('.bg-emerald-600, .bg-red-600, .bg-blue-600, .bg-amber-500, .bg-purple-600');
            const status = activeBtn ? activeBtn.getAttribute('data-status') : 'มา';

            records.push({
                no: student.no,
                id: student.id,
                name: student.name,
                status: status
            });
        });

        // จำลองเครือข่ายดีเลย์ 700ms เพื่อความสวยงามของ Animation
        setTimeout(() => {
            const key = `${this.currentDate}_${this.currentPeriod}_${this.selectedRoom}`;
            this.attendance[key] = {
                date: this.currentDate,
                period: this.currentPeriod,
                room: this.selectedRoom,
                checkedAt: new Date().toISOString(),
                checkedBy: "หัวหน้าห้อง",
                records: records
            };

            this.saveAttendanceData();
            
            // ซิงก์ขึ้น Google Sheets ในเบื้องหลัง (ถ้าเปิดใช้งาน)
            this.syncToCloud("saveAttendance", this.attendance[key]);

            // คืนค่าปุ่ม
            btnSave.disabled = false;
            btnSave.innerHTML = originalBtnHtml;

            // แสดง Toast ความสำเร็จ
            this.showToast(`บันทึกและส่งข้อมูลห้อง ม.${this.selectedRoom} เรียบร้อยแล้ว!`, "success");
            
            // รีเรนเดอร์หน้าเช็คชื่อ เพื่อแสดงสถานะ "บันทึกแล้ว"
            this.renderCheckinTab();
        }, 700);
    }

    // ฟังก์ชันนำเข้าไฟล์ Excel/CSV ผ่าน SheetJS
    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            try {
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // แปลงเป็น JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    this.showToast("ไฟล์นี้ไม่มีข้อมูลใน Sheet แรก", "error");
                    return;
                }

                // ค้นหาคอลัมน์ เลขที่, รหัสประจำตัว, ชื่อ-นามสกุล
                // รองรับทั้งภาษาไทยและอังกฤษ
                const mapKeys = (item) => {
                    const keys = Object.keys(item);
                    const noKey = keys.find(k => k.includes("เลขที่") || k.toLowerCase().includes("no") || k.includes("เลข"));
                    const idKey = keys.find(k => k.includes("รหัส") || k.toLowerCase().includes("id") || k.includes("ประจำตัว"));
                    const nameKey = keys.find(k => k.includes("ชื่อ") || k.toLowerCase().includes("name") || k.includes("สกุล"));
                    
                    return {
                        no: noKey ? parseInt(item[noKey]) : null,
                        id: idKey ? String(item[idKey]).trim() : null,
                        name: nameKey ? String(item[nameKey]).trim() : null
                    };
                };

                const importedStudents = [];
                let currentNo = 1;
                
                jsonData.forEach(item => {
                    const mapped = mapKeys(item);
                    if (mapped.name) {
                        importedStudents.push({
                            no: mapped.no || currentNo++,
                            id: mapped.id || `ST${Math.floor(10000 + Math.random() * 90000)}`,
                            name: mapped.name,
                            gender: (mapped.no % 2 === 0) ? 'female' : 'male' // จำลองเพศ
                        });
                    }
                });

                if (importedStudents.length === 0) {
                    this.showToast("ไม่พบข้อมูลตามคอลัมน์: เลขที่, รหัสนักเรียน, ชื่อ-นามสกุล", "error");
                    return;
                }

                // เรียงลำดับตามเลขที่
                importedStudents.sort((a, b) => a.no - b.no);

                // บันทึกลงในฐานข้อมูลสำหรับห้องเรียนที่เลือก
                this.students[this.selectedRoom] = importedStudents;
                this.saveStudentsData();
                this.showToast(`นำเข้าข้อมูลนักเรียนห้อง ${this.selectedRoom} สำเร็จ (${importedStudents.length} คน)`, "success");
                
                // รีเรนเดอร์แท็บเช็คชื่อ
                this.renderCheckinTab();

            } catch (err) {
                console.error(err);
                this.showToast("เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาใช้ไฟล์ Excel หรือ CSV", "error");
            }
        };
        reader.readAsArrayBuffer(file);
        // เคลียร์ค่า input
        event.target.value = '';
    }

    downloadCSVTemplate() {
        const headers = ["เลขที่", "รหัสนักเรียน", "ชื่อ-นามสกุล"];
        const rows = [
            [1, "ST10001", "นายสมชาย ใจดี"],
            [2, "ST10002", "นางสาวสมหญิง ดีใจ"],
            [3, "ST10003", "เด็กชายปกรณ์ รักไทย"]
        ];

        let csvContent = "\uFEFF"; // ป้องกันภาษาไทยเพี้ยนใน Excel (BOM)
        csvContent += headers.join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `template_students_room_${this.selectedRoom.replace('/', '_')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ==========================================
    // TAB 2: Dashboard
    // ==========================================
    renderDashboardTab() {
        const timeframe = document.getElementById('dashboard-filter-timeframe')?.value || 'daily';
        const scope = document.getElementById('dashboard-filter-scope')?.value || 'ALL';
        const roomFilter = document.getElementById('dashboard-filter-room')?.value || '1/1';
        const activeRangeDisplay = document.getElementById('analytics-active-range-display');

        // จัดการอัปเดตป้ายบอกช่วงวันที่เปิดใช้งานในแผงควบคุม
        if (activeRangeDisplay) {
            if (timeframe === 'daily') {
                activeRangeDisplay.textContent = `แสดงข้อมูล: คาบที่ ${this.currentPeriod} วันที่ ${this.formatThaiDate(this.currentDate)}`;
            } else if (timeframe === 'weekly') {
                activeRangeDisplay.textContent = `แสดงสถิติสะสมย้อนหลัง 7 วันทำการ`;
            } else if (timeframe === 'monthly') {
                activeRangeDisplay.textContent = `แสดงสถิติสะสมย้อนหลัง 30 วันทำการ`;
            }
        }

        // หาวันที่อยู่ในช่วงการฟิลเตอร์
        const datesRange = this.getDatesInRange(timeframe);
        
        let totalStudents = 0;
        let presentCount = 0;
        let absentCount = 0;
        let leaveCount = 0;
        let lateCount = 0;
        let skipCount = 0;

        // คำนวณจำนวนเด็กทั้งหมดตามสโคป
        if (scope === 'ALL') {
            window.SCHOOL_DB.classrooms.forEach(room => {
                totalStudents += (this.students[room] || []).length;
            });
        } else {
            totalStudents = (this.students[roomFilter] || []).length;
        }

        // วนลูปนับจำนวนสถิติตามเวลาและห้องเรียนที่เลือก
        datesRange.forEach(date => {
            const periodsToCheck = timeframe === 'daily' ? [this.currentPeriod] : [1,2,3,4,5,6,7];
            
            periodsToCheck.forEach(period => {
                const roomsToCheck = scope === 'ALL' ? window.SCHOOL_DB.classrooms : [roomFilter];
                
                roomsToCheck.forEach(room => {
                    const key = `${date}_${period}_${room}`;
                    const record = this.attendance[key];
                    if (record && record.records) {
                        record.records.forEach(r => {
                            if (r.status === 'มา') presentCount++;
                            else if (r.status === 'ขาด') absentCount++;
                            else if (r.status === 'ลา') leaveCount++;
                            else if (r.status === 'สาย') lateCount++;
                            else if (r.status === 'โดดเรียน') skipCount++;
                        });
                    }
                });
            });
        });

        // อัปเดตตัวเลขการวิเคราะห์ใน UI
        const cardTotal = document.getElementById('stat-total-students');
        const cardPresent = document.getElementById('stat-present');
        const cardAbsent = document.getElementById('stat-absent');
        const cardLeave = document.getElementById('stat-leave');
        const cardLate = document.getElementById('stat-late');
        const cardSkip = document.getElementById('stat-skip');

        if (cardTotal) cardTotal.textContent = totalStudents;
        if (cardPresent) cardPresent.textContent = presentCount;
        if (cardAbsent) cardAbsent.textContent = absentCount;
        if (cardLeave) cardLeave.textContent = leaveCount;
        if (cardLate) cardLate.textContent = lateCount;
        if (cardSkip) cardSkip.textContent = skipCount;

        // เรนเดอร์แผนภูมิ (Chart.js)
        this.renderCharts(timeframe, scope, roomFilter, datesRange);

        // เรนเดอร์ Status Grid (24 ห้อง)
        this.renderStatusGrid();

        // เรนเดอร์ Hot Section นักเรียนโดดเรียน
        this.renderHotSection();
    }

    getDatesInRange(timeframe) {
        const dates = [];
        const today = new Date(this.currentDate);
        let daysToFetch = 1;
        if (timeframe === 'weekly') daysToFetch = 7;
        else if (timeframe === 'monthly') daysToFetch = 30;

        let fetched = 0;
        let offset = 0;
        while (fetched < daysToFetch) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - offset);
            offset++;
            
            const dayOfWeek = checkDate.getDay();
            // ข้ามเสาร์-อาทิตย์สำหรับการเรียน
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const yyyy = checkDate.getFullYear();
            const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
            const dd = String(checkDate.getDate()).padStart(2, '0');
            dates.push(`${yyyy}-${mm}-${dd}`);
            fetched++;
        }
        return dates.reverse();
    }

    renderCharts(timeframe, scope, roomFilter, datesRange) {
        // --- 1. แผนภูมิวงกลม Donut Chart (สัดส่วน) ---
        const donutCtx = document.getElementById('chart-donut')?.getContext('2d');
        if (donutCtx) {
            let present = 0, absent = 0, leave = 0, late = 0, skip = 0;
            datesRange.forEach(date => {
                const periods = timeframe === 'daily' ? [this.currentPeriod] : [1,2,3,4,5,6,7];
                periods.forEach(p => {
                    const rooms = scope === 'ALL' ? window.SCHOOL_DB.classrooms : [roomFilter];
                    rooms.forEach(r => {
                        const rec = this.attendance[`${date}_${p}_${r}`];
                        if (rec && rec.records) {
                            rec.records.forEach(student => {
                                if (student.status === 'มา') present++;
                                else if (student.status === 'ขาด') absent++;
                                else if (student.status === 'ลา') leave++;
                                else if (student.status === 'สาย') late++;
                                else if (student.status === 'โดดเรียน') skip++;
                            });
                        }
                    });
                });
            });

            const total = present + absent + leave + late + skip;
            const dataVals = total > 0 ? [present, absent, leave, late, skip] : [100, 0, 0, 0, 0];
            const labels = total > 0 ? ['มาเรียน', 'ขาดเรียน', 'ลา', 'สาย', 'โดดเรียน'] : ['ไม่มีข้อมูลการเช็คชื่อ', 'ขาดเรียน', 'ลา', 'สาย', 'โดดเรียน'];

            if (this.donutChart) this.donutChart.destroy();
            this.donutChart = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataVals,
                        backgroundColor: ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Sarabun', size: 10 },
                                boxWidth: 10
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }

        // --- 2. แผนภูมิเส้น Line Chart (แนวโน้มพฤติกรรมทางวินัยเชิงเวลา) ---
        const lineCtx = document.getElementById('chart-line')?.getContext('2d');
        if (lineCtx) {
            let labels = [];
            let datasetAbsent = [];
            let datasetLate = [];
            let datasetSkip = [];

            if (timeframe === 'daily') {
                labels = PERIODS.map(p => `คาบ ${p.id}`);
                PERIODS.forEach(p => {
                    let absent = 0, late = 0, skip = 0;
                    const rooms = scope === 'ALL' ? window.SCHOOL_DB.classrooms : [roomFilter];
                    rooms.forEach(r => {
                        const rec = this.attendance[`${this.currentDate}_${p.id}_${r}`];
                        if (rec && rec.records) {
                            rec.records.forEach(student => {
                                if (student.status === 'ขาด') absent++;
                                else if (student.status === 'สาย') late++;
                                else if (student.status === 'โดดเรียน') skip++;
                            });
                        }
                    });
                    datasetAbsent.push(absent);
                    datasetLate.push(late);
                    datasetSkip.push(skip);
                });
                document.getElementById('line-chart-legend-label').textContent = 'ขาด | สาย | โดด ย่อยตามคาบเรียนวันนี้';
            } else {
                labels = datesRange.map(d => {
                    const parts = d.split('-');
                    return `${parts[2]}/${parts[1]}`;
                });

                datesRange.forEach(date => {
                    let absent = 0, late = 0, skip = 0;
                    for (let p = 1; p <= 7; p++) {
                        const rooms = scope === 'ALL' ? window.SCHOOL_DB.classrooms : [roomFilter];
                        rooms.forEach(r => {
                            const rec = this.attendance[`${date}_${p}_${r}`];
                            if (rec && rec.records) {
                                rec.records.forEach(student => {
                                    if (student.status === 'ขาด') absent++;
                                    else if (student.status === 'สาย') late++;
                                    else if (student.status === 'โดดเรียน') skip++;
                                });
                            }
                        });
                    }
                    datasetAbsent.push(absent);
                    datasetLate.push(late);
                    datasetSkip.push(skip);
                });
                document.getElementById('line-chart-legend-label').textContent = 'ขาด | สาย | โดด ย่อยตามวันเรียน';
            }

            if (this.lineChart) this.lineChart.destroy();
            this.lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'ขาดเรียน',
                            data: datasetAbsent,
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: 'สาย',
                            data: datasetLate,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.05)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: 'โดดเรียน',
                            data: datasetSkip,
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.05)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { family: 'Sarabun', size: 9 }, boxWidth: 9 }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' },
                            ticks: { font: { family: 'Sarabun', size: 9 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: 'Sarabun', size: 9 } }
                        }
                    }
                }
            });
        }

        // --- 3. แผนภูมิแท่งเปรียบเทียบ Grouped Bar Chart ---
        const barCtx = document.getElementById('chart-bar')?.getContext('2d');
        if (barCtx) {
            let labels = [];
            let datasetAbsent = [];
            let datasetLate = [];
            let datasetSkip = [];

            if (scope === 'ALL') {
                labels = window.SCHOOL_DB.classrooms.map(room => `ม.${room}`);
                
                window.SCHOOL_DB.classrooms.forEach(room => {
                    let absent = 0, late = 0, skip = 0;
                    datesRange.forEach(date => {
                        const periods = timeframe === 'daily' ? [this.currentPeriod] : [1,2,3,4,5,6,7];
                        periods.forEach(p => {
                            const rec = this.attendance[`${date}_${p}_${room}`];
                            if (rec && rec.records) {
                                rec.records.forEach(student => {
                                    if (student.status === 'ขาด') absent++;
                                    else if (student.status === 'สาย') late++;
                                    else if (student.status === 'โดดเรียน') skip++;
                                });
                            }
                        });
                    });
                    datasetAbsent.push(absent);
                    datasetLate.push(late);
                    datasetSkip.push(skip);
                });
            } else {
                const roomStudents = this.students[roomFilter] || [];
                labels = roomStudents.map(s => `${s.no}. ${s.name.split(' ')[0]}`);

                roomStudents.forEach(student => {
                    let absent = 0, late = 0, skip = 0;
                    datesRange.forEach(date => {
                        const periods = timeframe === 'daily' ? [this.currentPeriod] : [1,2,3,4,5,6,7];
                        periods.forEach(p => {
                            const rec = this.attendance[`${date}_${p}_${roomFilter}`];
                            if (rec && rec.records) {
                                const sRec = rec.records.find(r => r.id === student.id);
                                if (sRec) {
                                    if (sRec.status === 'ขาด') absent++;
                                    else if (sRec.status === 'สาย') late++;
                                    else if (sRec.status === 'โดดเรียน') skip++;
                                }
                            }
                        });
                    });
                    datasetAbsent.push(absent);
                    datasetLate.push(late);
                    datasetSkip.push(skip);
                });
            }

            if (this.barChart) this.barChart.destroy();
            this.barChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'ขาดเรียน',
                            data: datasetAbsent,
                            backgroundColor: '#ef4444',
                            borderRadius: 4
                        },
                        {
                            label: 'สาย',
                            data: datasetLate,
                            backgroundColor: '#f59e0b',
                            borderRadius: 4
                        },
                        {
                            label: 'โดดเรียน',
                            data: datasetSkip,
                            backgroundColor: '#8b5cf6',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { family: 'Sarabun', size: 9 }, boxWidth: 9 }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' },
                            ticks: { font: { family: 'Sarabun', size: 9 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: 'Sarabun', size: 8 }, autoSkip: false }
                        }
                    }
                }
            });
        }
    }

    renderStatusGrid() {
        const gridContainer = document.getElementById('dashboard-status-grid');
        if (!gridContainer) return;

        let html = '';
        window.SCHOOL_DB.classrooms.forEach(room => {
            const key = `${this.currentDate}_${this.currentPeriod}_${room}`;
            const record = this.attendance[key];
            
            let cardBg = 'bg-white border-slate-200';
            let statusBadge = '<span class="text-slate-500 bg-slate-100 text-xs font-semibold px-2 py-0.5 rounded-full">ยังไม่เช็ค</span>';
            let detailText = '<span class="text-slate-400 text-xs">-</span>';
            
            let skipInRoom = 0;
            let absentInRoom = 0;
            let totalInRoom = this.students[room] ? this.students[room].length : 0;

            if (record && record.records) {
                record.records.forEach(r => {
                    if (r.status === 'โดดเรียน') skipInRoom++;
                    else if (r.status === 'ขาด') absentInRoom++;
                });

                statusBadge = '<span class="text-emerald-700 bg-emerald-100 text-xs font-semibold px-2 py-0.5 rounded-full">เช็คแล้ว</span>';
                
                // ตรวจสอบเงื่อนไขแจ้งเตือน
                if (skipInRoom > 0) {
                    cardBg = 'alert-pulse-skip border-red-500 shadow-md';
                    statusBadge = '<span class="text-red-700 bg-red-100 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full animate-bounce">โดดเรียน!</span>';
                } else if (absentInRoom > 0) {
                    cardBg = 'alert-pulse-absent border-amber-500 shadow-sm';
                    statusBadge = '<span class="text-amber-800 bg-amber-100 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full">ขาดเรียน</span>';
                } else {
                    cardBg = 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300';
                }

                detailText = `
                    <div class="flex justify-between items-center text-xs mt-2 text-slate-600">
                        <span>มา: ${record.records.filter(r=>r.status==='มา').length}/${totalInRoom}</span>
                        ${absentInRoom > 0 ? `<span class="text-amber-700 font-semibold">ขาด: ${absentInRoom}</span>` : ''}
                        ${skipInRoom > 0 ? `<span class="text-purple-700 font-bold">โดด: ${skipInRoom}</span>` : ''}
                    </div>
                `;
            }

            // แยก ม.ต้น และ ม.ปลาย
            const isJunior = room.startsWith('1/') || room.startsWith('2/') || room.startsWith('3/');
            const levelLabel = isJunior ? 'ม.ต้น' : 'ม.ปลาย';

            html += `
                <div class="room-card-status border glass-panel p-3.5 flex flex-col justify-between ${cardBg}">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${levelLabel}</span>
                            <h3 class="text-lg font-bold text-slate-800 leading-tight">ม.${room}</h3>
                        </div>
                        ${statusBadge}
                    </div>
                    ${detailText}
                </div>
            `;
        });

        gridContainer.innerHTML = html;
    }

    renderHotSection() {
        const hotContainer = document.getElementById('dashboard-hot-skips');
        if (!hotContainer) return;

        const skippingStudents = [];

        // ค้นหาเด็กโดดเรียน
        window.SCHOOL_DB.classrooms.forEach(room => {
            const key = `${this.currentDate}_${this.currentPeriod}_${room}`;
            const record = this.attendance[key];
            if (record && record.records) {
                record.records.forEach(r => {
                    if (r.status === 'โดดเรียน') {
                        skippingStudents.push({
                            room: room,
                            no: r.no,
                            id: r.id,
                            name: r.name,
                            time: record.checkedAt
                        });
                    }
                });
            }
        });

        if (skippingStudents.length === 0) {
            hotContainer.innerHTML = `
                <div class="py-8 text-center text-slate-400">
                    <i class="fas fa-check-circle text-4xl text-emerald-400 mb-2"></i>
                    <p class="font-medium text-slate-600">ไม่มีรายชื่อนักเรียนโดดเรียนในคาบนี้</p>
                    <p class="text-xs mt-0.5">ทุกห้องเรียบร้อยดี</p>
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-3.5">';
        skippingStudents.forEach(st => {
            const skipKey = `${this.currentDate}_${this.currentPeriod}_${st.room}_${st.id}`;
            const isTracked = this.trackedSkips[skipKey] === true;

            html += `
                <div class="border rounded-xl p-3.5 flex items-center justify-between gap-3 transition-all ${isTracked ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-red-50/70 border-red-200 shadow-sm'}" id="skip-card-${st.id}">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">
                            ม.${st.room}
                        </div>
                        <div>
                            <div class="font-bold ${isTracked ? 'line-through text-slate-500' : 'text-slate-800'}">${st.name}</div>
                            <div class="text-xs text-slate-500">เลขที่ ${st.no} • รหัส: ${st.id} • รายงานเมื่อ ${this.formatTime(st.time)} น.</div>
                        </div>
                    </div>
                    <div>
                        <button onclick="window.app.toggleTrackSkip('${st.room}', '${st.id}')"
                            class="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all btn-tap-effect ${isTracked ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-xs'}">
                            ${isTracked ? '<i class="fas fa-check mr-1.5"></i>ตามตัวแล้ว' : 'แจ้งตามตัว'}
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        hotContainer.innerHTML = html;
    }

    toggleTrackSkip(room, studentId) {
        const skipKey = `${this.currentDate}_${this.currentPeriod}_${room}_${studentId}`;
        
        if (this.trackedSkips[skipKey]) {
            delete this.trackedSkips[skipKey];
            this.showToast("ยกเลิกสถานะตามตัว", "info");
        } else {
            this.trackedSkips[skipKey] = true;
            this.showToast("บันทึกสถานะตามตัวเด็กแล้ว ฝ่ายปกครองรับทราบ", "success");
        }

        this.saveTrackedSkips();
        this.renderDashboardTab();
    }

    // ==========================================
    // TAB 3: Admin & Export
    // ==========================================
    renderAdminTab() {
        this.checkLoginState();
        if (!this.isLoggedIn) return;

        const selectFilter = document.getElementById('admin-filter-room');
        if (!selectFilter) return;

        // เติมตัวกรองห้องเรียนในหน้าแอดมิน
        const currentFilterVal = selectFilter.value;
        let selectHtml = '<option value="ALL">ทุกห้องเรียน (รวม 24 ห้อง)</option>';
        window.SCHOOL_DB.classrooms.forEach(room => {
            selectHtml += `<option value="${room}" ${room === currentFilterVal ? 'selected' : ''}>มัธยมศึกษาปีที่ ${room}</option>`;
        });
        selectFilter.innerHTML = selectHtml;

        // อัปเดตตารางสรุปผลแอดมินและสถิติสะสม
        this.renderAdminTable();
        this.calculateRiskStudents();
        this.calculateOutstandingRooms();
    }

    renderAdminTable() {
        const tableBody = document.getElementById('admin-table-body');
        const selectFilter = document.getElementById('admin-filter-room');
        const expStartInput = document.getElementById('admin-export-start');
        const expEndInput = document.getElementById('admin-export-end');
        if (!tableBody || !selectFilter) return;

        const filterRoom = selectFilter.value;
        const startDate = expStartInput ? expStartInput.value : this.currentDate;
        const endDate = expEndInput ? expEndInput.value : this.currentDate;
        let html = '';

        // รวบรวมประวัติการเช็คชื่อทั้งหมดภายใต้ช่วงวันที่ระบุ
        const allLogs = [];
        
        Object.keys(this.attendance).forEach(key => {
            const record = this.attendance[key];
            if (record && record.date && Array.isArray(record.records)) {
                // กรองด้วยช่วงวันที่เลือก
                if (record.date >= startDate && record.date <= endDate) {
                    // กรองด้วยห้องเรียน
                    if (filterRoom === 'ALL' || record.room === filterRoom) {
                        record.records.forEach(r => {
                            if (r) {
                                allLogs.push({
                                    date: record.date || "",
                                    period: record.period || 1,
                                    room: record.room || "",
                                    no: r.no || 0,
                                    id: r.id || "",
                                    name: r.name || "ไม่ระบุชื่อ",
                                    status: r.status || "มา",
                                    checkedAt: record.checkedAt || "",
                                    checkedBy: record.checkedBy || ""
                                });
                            }
                        });
                    }
                }
            }
        });

        // เรียงประวัติการเช็คชื่อตาม ห้องเรียน -> คาบ -> เลขที่
        allLogs.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.room !== b.room) return a.room.localeCompare(b.room);
            if (a.period !== b.period) return a.period - b.period;
            return a.no - b.no;
        });

        if (allLogs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                        <i class="fas fa-folder-open text-4xl mb-2"></i>
                        <p class="font-medium text-slate-600">ไม่มีข้อมูลการเช็คชื่อสำหรับช่วงเวลาที่เลือก</p>
                        <p class="text-xs">ลองเลือกช่วงเวลากว้างขึ้น หรือเช็คชื่อนักเรียนในวันนี้</p>
                    </td>
                </tr>
            `;
            return;
        }

        allLogs.forEach(log => {
            let statusPill = '';
            if (log.status === 'มา') statusPill = '<span class="status-present px-2.5 py-1 text-xs font-semibold rounded-full">มา</span>';
            else if (log.status === 'ขาด') statusPill = '<span class="status-absent px-2.5 py-1 text-xs font-semibold rounded-full">ขาด</span>';
            else if (log.status === 'ลา') statusPill = '<span class="status-leave px-2.5 py-1 text-xs font-semibold rounded-full">ลา</span>';
            else if (log.status === 'สาย') statusPill = '<span class="status-late px-2.5 py-1 text-xs font-semibold rounded-full">สาย</span>';
            else if (log.status === 'โดดเรียน') statusPill = '<span class="status-skip px-2.5 py-1 text-xs font-semibold rounded-full">โดดเรียน</span>';

            html += `
                <tr class="hover:bg-slate-50 transition-all border-b border-slate-100">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">ม.${log.room} (${this.formatThaiDate(log.date)})</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">คาบที่ ${log.period}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${log.no}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${log.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">${log.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${statusPill}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-400">${this.formatTime(log.checkedAt)} น.</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;
    }

    calculateRiskStudents() {
        const riskTableBody = document.getElementById('risk-students-table-body');
        const selectFilter = document.getElementById('admin-filter-room');
        if (!riskTableBody) return;

        const filterRoom = selectFilter ? selectFilter.value : 'ALL';

        // โครงสร้างสำหรับเก็บสถิติเด็กสะสม: { id: { name, room, no, absents, skips } }
        const studentStats = {};

        // โหลดข้อมูลนักเรียนของห้องที่เลือกมาตั้งต้นในลิสต์ (หรือทั้งหมดถ้าเป็น ALL)
        if (this.students) {
            Object.keys(this.students).forEach(room => {
                if (filterRoom === 'ALL' || room === filterRoom) {
                    const roomList = this.students[room];
                    if (Array.isArray(roomList)) {
                        roomList.forEach(s => {
                            if (s && s.id) {
                                studentStats[s.id] = {
                                    id: s.id,
                                    name: s.name || "ไม่ระบุชื่อ",
                                    room: room,
                                    no: s.no || 0,
                                    absents: 0,
                                    skips: 0
                                };
                            }
                        });
                    }
                }
            });
        }

        // วนลูปอ่านข้อมูลประวัติทั้งหมดที่เคยบันทึก
        if (this.attendance) {
            Object.keys(this.attendance).forEach(key => {
                const record = this.attendance[key];
                if (record && Array.isArray(record.records)) {
                    if (filterRoom === 'ALL' || record.room === filterRoom) {
                        record.records.forEach(r => {
                            if (r && r.id && studentStats[r.id]) {
                                if (r.status === 'ขาด') studentStats[r.id].absents++;
                                else if (r.status === 'โดดเรียน') studentStats[r.id].skips++;
                            }
                        });
                    }
                }
            });
        }

        // คำนวณคะแนนความเสี่ยง (ขาด = 2 คะแนน, โดดเรียน = 3 คะแนน)
        const riskList = Object.values(studentStats).map(s => {
            const score = (s.absents * 2) + (s.skips * 3);
            return { ...s, score };
        });

        // กรองเฉพาะเด็กที่มีพฤติกรรม ขาด หรือ โดด (คะแนนมากกว่า 0) และเรียงลำดับความเสี่ยงสูงสุด
        const topRisk = riskList
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score || b.skips - a.skips)
            .slice(0, 10);

        if (topRisk.length === 0) {
            riskTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-4 py-8 text-center text-xs text-slate-400">
                        <i class="fas fa-smile text-2xl text-emerald-400 mb-1.5"></i>
                        <p class="font-medium">ไม่พบเด็กที่มีสถิติความเสี่ยงสะสมทางวินัย</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        topRisk.forEach(s => {
            // ตั้งค่าระดับความรุนแรง
            let scoreColor = 'text-amber-600 bg-amber-50';
            if (s.score >= 15) {
                scoreColor = 'text-red-700 bg-red-100 font-extrabold animate-pulse';
            } else if (s.score >= 8) {
                scoreColor = 'text-red-600 bg-red-50 font-bold';
            }

            html += `
                <tr class="hover:bg-slate-50 transition-all border-b border-slate-100 text-xs">
                    <td class="px-4 py-3 font-semibold text-slate-700">ม.${s.room}</td>
                    <td class="px-4 py-3 text-slate-500">${s.no}</td>
                    <td class="px-4 py-3 font-bold text-slate-800">${s.name}</td>
                    <td class="px-4 py-3 text-center text-red-600 font-bold">${s.absents} ครั้ง</td>
                    <td class="px-4 py-3 text-center text-purple-700 font-bold">${s.skips} ครั้ง</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2.5 py-1 rounded-full text-[10px] ${scoreColor}">${s.score} คะแนน</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="window.app.triggerRiskAlert('${s.name}', '${s.room}', ${s.absents}, ${s.skips})"
                            class="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all font-semibold btn-tap-effect text-[10px]">
                            <i class="fas fa-bell mr-1"></i>แจ้งเตือน
                        </button>
                    </td>
                </tr>
            `;
        });

        riskTableBody.innerHTML = html;
    }

    triggerRiskAlert(studentName, room, absents, skips) {
        // จำลองกล่องข้อความผู้ปกครองด่วน
        alert(`🚨 ระบบส่งข้อความแจ้งเตือนอัตโนมัติ (จำลอง)\n\nถึง: ผู้ปกครองของเด็กนักเรียน ม.${room} ${studentName}\n\nพฤติกรรมสะสม: ขาดเรียน ${absents} ครั้ง และโดดเรียน ${skips} ครั้ง ในภาคเรียนนี้\n\nระบบได้รับการตอบรับแล้ว ส่งข้อมูลไปยังเบอร์ผู้ปกครองที่ลงทะเบียนสำเร็จ!`);
        this.showToast(`ส่งข้อความแจ้งเตือนผู้ปกครอง ${studentName} เรียบร้อย`, "success");
    }

    calculateOutstandingRooms() {
        const container = document.getElementById('outstanding-rooms-container');
        if (!container) return;

        const roomAttendanceStats = [];

        // วนลูปหาห้องที่ได้สถิติดีที่สุดในประวัติ 7 วันการเรียนล่าสุด
        const dates = this.getDatesInRange('weekly');
        
        if (window.SCHOOL_DB && Array.isArray(window.SCHOOL_DB.classrooms)) {
            window.SCHOOL_DB.classrooms.forEach(room => {
                let totalChecks = 0;
                let presentCount = 0;

                dates.forEach(date => {
                    for (let p = 1; p <= 7; p++) {
                        const rec = this.attendance ? this.attendance[`${date}_${p}_${room}`] : null;
                        if (rec && Array.isArray(rec.records)) {
                            rec.records.forEach(r => {
                                if (r) {
                                    totalChecks++;
                                    if (r.status === 'มา' || r.status === 'สาย' || r.status === 'ลา') {
                                        // นับว่าไม่ขาดเรียน/โดด ถือว่าอัตราการเข้าเรียนรักษามาตรฐานระเบียบวินัยได้ดี
                                        presentCount++;
                                    }
                                }
                            });
                        }
                    }
                });

                const rate = totalChecks > 0 ? (presentCount / totalChecks) * 100 : 0;
                roomAttendanceStats.push({ room, rate, totalChecks });
            });
        }

        // จัดอันดับสถิติสูงสุด
        roomAttendanceStats.sort((a, b) => b.rate - a.rate || b.totalChecks - a.totalChecks);
        const topRooms = roomAttendanceStats.slice(0, 5);

        let html = '';
        topRooms.forEach((r, idx) => {
            const isTop = idx === 0;
            const rankIcon = isTop 
                ? '<div class="w-7 h-7 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-600 flex items-center justify-center flex-shrink-0 animate-bounce"><i class="fas fa-trophy text-xs"></i></div>'
                : `<div class="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">${idx + 1}</div>`;
            
            const badgeBg = isTop ? 'bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300' : 'bg-slate-100 text-slate-700';

            html += `
                <div class="flex items-center justify-between border-b border-slate-50 pb-2.5 last:border-b-0 last:pb-0">
                    <div class="flex items-center gap-3">
                        ${rankIcon}
                        <div>
                            <div class="font-bold text-slate-800 text-sm">มัธยมศึกษาปีที่ ${r.room}</div>
                            <div class="text-[10px] text-slate-400">อิงประวัติ 7 วันการเรียนล่าสุด</div>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badgeBg}">
                        ${r.rate.toFixed(1)}%
                    </span>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    exportToExcel() {
        const selectFilter = document.getElementById('admin-filter-room');
        const expStartInput = document.getElementById('admin-export-start');
        const expEndInput = document.getElementById('admin-export-end');
        
        const filterRoom = selectFilter ? selectFilter.value : 'ALL';
        const startDate = expStartInput ? expStartInput.value : this.currentDate;
        const endDate = expEndInput ? expEndInput.value : this.currentDate;
        
        const exportData = [];

        Object.keys(this.attendance).forEach(key => {
            const record = this.attendance[key];
            
            // กรองตามช่วงวันที่เลือก
            if (record.date >= startDate && record.date <= endDate) {
                if (filterRoom === 'ALL' || record.room === filterRoom) {
                    record.records.forEach(r => {
                        exportData.push({
                            "วันที่": record.date,
                            "คาบเรียน": `คาบที่ ${record.period}`,
                            "ห้องเรียน": `ม.${record.room}`,
                            "เลขที่": r.no,
                            "รหัสประจำตัว": r.id,
                            "ชื่อ-นามสกุล": r.name,
                            "สถานะเช็คชื่อ": r.status,
                            "เวลาเช็คชื่อ": this.formatTime(record.checkedAt) + " น.",
                            "ผู้เช็คชื่อ": record.checkedBy
                        });
                    });
                }
            }
        });

        if (exportData.length === 0) {
            this.showToast("ไม่มีข้อมูลประวัติเช็คชื่อในช่วงเวลาที่เลือก", "error");
            return;
        }

        // เรียงลำดับข้อมูลสำหรับสเปรดชีต
        exportData.sort((a, b) => {
            if (a["วันที่"] !== b["วันที่"]) return a["วันที่"].localeCompare(b["วันที่"]);
            if (a["ห้องเรียน"] !== b["ห้องเรียน"]) return a["ห้องเรียน"].localeCompare(b["ห้องเรียน"]);
            if (a["คาบเรียน"] !== b["คาบเรียน"]) return a["คาบเรียน"].localeCompare(b["คาบเรียน"]);
            return a["เลขที่"] - b["เลขที่"];
        });

        try {
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Log");
            
            const fileName = `Attendance_Report_From_${startDate}_To_${endDate}_Room_${filterRoom.replace('/', '_')}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            this.showToast("ส่งออกข้อมูลประวัติเช็คชื่อช่วงเวลาสำเร็จ!", "success");
        } catch (err) {
            console.error(err);
            this.showToast("เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel", "error");
        }
    }

    markAllAs(status) {
        const studentCards = document.querySelectorAll('#student-checkin-list [data-student-id]');
        if (studentCards.length === 0) {
            this.showToast("ไม่พบรายชื่อนักเรียนที่จะเปลี่ยนสถานะ", "error");
            return;
        }
        studentCards.forEach(card => {
            const studentId = card.getAttribute('data-student-id');
            this.updateStudentStatus(studentId, status);
        });
        this.showToast(`เปลี่ยนสถานะนักเรียนทั้งหมดเป็น "${status}" ชั่วคราว (กรุณากดบันทึก)`, "info");
    }

    openAddStudentModal() {
        const modal = document.getElementById('modal-add-student');
        const displayRoom = document.getElementById('add-student-room-display');
        const inputNo = document.getElementById('add-student-no');
        const inputId = document.getElementById('add-student-id');
        const inputName = document.getElementById('add-student-name');
        
        if (!modal) return;
        
        // ตั้งค่าห้องปัจจุบัน
        if (displayRoom) displayRoom.value = `มัธยมศึกษาปีที่ ${this.selectedRoom}`;
        
        // คำนวณเลขที่ถัดไปโดยอัตโนมัติ
        const currentRoomStudents = this.students[this.selectedRoom] || [];
        const nextNo = currentRoomStudents.length > 0 
            ? Math.max(...currentRoomStudents.map(s => s.no)) + 1 
            : 1;
        if (inputNo) inputNo.value = nextNo;
        
        // แนะนำรหัสประจำตัวถัดไป
        if (inputId) {
            let maxId = 10000;
            Object.keys(this.students).forEach(r => {
                this.students[r].forEach(s => {
                    const num = parseInt(s.id.replace('ST', ''));
                    if (!isNaN(num) && num > maxId) maxId = num;
                });
            });
            inputId.value = `ST${maxId + 1}`;
        }
        
        if (inputName) inputName.value = '';
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.transform').classList.remove('scale-95');
        }, 50);
    }

    closeAddStudentModal() {
        const modal = document.getElementById('modal-add-student');
        if (!modal) return;
        
        modal.classList.add('opacity-0');
        modal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }

    saveIndividualStudent() {
        const inputNo = document.getElementById('add-student-no');
        const inputGender = document.getElementById('add-student-gender');
        const inputId = document.getElementById('add-student-id');
        const inputName = document.getElementById('add-student-name');
        
        if (!inputNo || !inputGender || !inputId || !inputName) return;
        
        const no = parseInt(inputNo.value);
        const gender = inputGender.value;
        const id = inputId.value.trim();
        const name = inputName.value.trim();
        
        if (!id || !name) {
            this.showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
            return;
        }
        
        const currentRoomStudents = this.students[this.selectedRoom] || [];
        if (currentRoomStudents.some(s => s.id === id)) {
            this.showToast(`รหัสประจำตัวนักเรียน ${id} มีอยู่ในห้องเรียนนี้แล้ว`, "error");
            return;
        }
        if (currentRoomStudents.some(s => s.no === no)) {
            this.showToast(`เลขที่ ${no} มีอยู่ในห้องเรียนนี้แล้ว`, "error");
            return;
        }
        
        const newStudent = { no, id, name, gender };
        currentRoomStudents.push(newStudent);
        currentRoomStudents.sort((a, b) => a.no - b.no);
        
        this.students[this.selectedRoom] = currentRoomStudents;
        this.saveStudentsData();
        
        // ซิงก์รายชื่อเด็กไป Google Sheets ในเบื้องหลัง (ถ้าเปิดใช้งาน)
        this.syncToCloud("addStudent", { room: this.selectedRoom, no, id, name, gender });

        this.showToast(`เพิ่มรายชื่อ ${name} สำเร็จ!`, "success");
        this.closeAddStudentModal();
        
        this.renderCheckinTab();
    }

    loadSettings() {
        const enabled = localStorage.getItem('SETTINGS_SHEETS_ENABLED') === 'true';
        const url = localStorage.getItem('SETTINGS_SHEETS_URL') || '';
        
        this.syncEnabled = enabled;
        this.sheetsUrl = url;

        // อัปเดตอินพุตในหน้าเว็บ
        const chkEnabled = document.getElementById('settings-sheets-enabled');
        const txtUrl = document.getElementById('settings-sheets-url');
        
        if (chkEnabled) chkEnabled.checked = enabled;
        if (txtUrl) txtUrl.value = url;
    }

    saveSettings() {
        const chkEnabled = document.getElementById('settings-sheets-enabled');
        const txtUrl = document.getElementById('settings-sheets-url');

        const enabled = chkEnabled ? chkEnabled.checked : false;
        const url = txtUrl ? txtUrl.value.trim() : '';

        if (enabled && !url) {
            this.showToast("กรุณากรอก Web App URL หากต้องการเปิดซิงก์ Sheets", "error");
            return;
        }

        localStorage.setItem('SETTINGS_SHEETS_ENABLED', enabled ? 'true' : 'false');
        localStorage.setItem('SETTINGS_SHEETS_URL', url);

        this.syncEnabled = enabled;
        this.sheetsUrl = url;

        this.showToast("บันทึกการตั้งค่า Google Sheets สำเร็จ!", "success");
    }

    syncToCloud(action, payload) {
        if (!this.syncEnabled || !this.sheetsUrl) return;

        // แสดงแจ้งเตือนขนาดเล็กที่คอนโซล
        console.log(`[Google Sheets Cloud Sync] Action: ${action}`, payload);

        // ยิง API แบบเบื้องหลัง (ใช้วิธี POST)
        fetch(this.sheetsUrl, {
            method: 'POST',
            mode: 'no-cors', // เพื่อหลีกเลี่ยงข้อจำกัดเรื่อง CORS ของเบราว์เซอร์
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, payload })
        })
        .then(() => {
            console.log(`[Google Sheets Cloud Sync] ซิงก์ข้อมูลสำเร็จ (${action})`);
            this.showToast("ซิงก์ข้อมูลไป Google Sheets สำเร็จ!", "info");
        })
        .catch(err => {
            console.error("[Google Sheets Cloud Sync] Error:", err);
            this.showToast("การเชื่อมต่อ Google Sheets ผิดพลาด", "error");
        });
    }

    // ==========================================
    // Utilities
    // ==========================================
    formatTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    showToast(message, type = "success") {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        let iconClass = 'fa-check-circle text-emerald-500';
        let borderClass = 'border-emerald-200';
        let bgClass = 'bg-white';
        
        if (type === 'error') {
            iconClass = 'fa-exclamation-circle text-red-500';
            borderClass = 'border-red-200';
        } else if (type === 'info') {
            iconClass = 'fa-info-circle text-blue-500';
            borderClass = 'border-blue-200';
        }

        toast.className = `flex items-center gap-3 px-4 py-3 border rounded-xl shadow-lg ${borderClass} ${bgClass} transition-all duration-300 transform translate-y-4 opacity-0 max-w-sm w-full`;
        toast.innerHTML = `
            <i class="fas ${iconClass} text-xl flex-shrink-0"></i>
            <span class="text-sm font-medium text-slate-800">${message}</span>
        `;

        container.appendChild(toast);
        
        // Trigger transition
        setTimeout(() => {
            toast.classList.remove('translate-y-4', 'opacity-0');
        }, 10);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('translate-y-4', 'opacity-0');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3500);
    }
}

// เริ่มต้นแอปพลิเคชัน
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AttendanceApp();
});
