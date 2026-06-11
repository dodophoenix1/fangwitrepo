/**
 * School Student Attendance System - Mock Database Initialization
 * Contains classroom list and generates mock student records.
 */

const CLASSROOMS = [
    // มัธยมศึกษาตอนต้น (15 ห้อง)
    "1/1", "1/2", "1/3", "1/4", "1/5",
    "2/1", "2/2", "2/3", "2/4", "2/5",
    "3/1", "3/2", "3/3", "3/4", "3/5",
    // มัธยมศึกษาตอนปลาย (9 ห้อง)
    "4/1", "4/2", "4/3",
    "5/1", "5/2", "5/3",
    "6/1", "6/2", "6/3"
];

// รายการชื่อจริงภาษาไทยสำหรับสุ่มสร้างฐานข้อมูล
const THAI_FIRSTNAMES_MALE = [
    "สมชาย", "กิตติ", "ณัฐพล", "พีรพล", "ปกรณ์", "อภิสิทธิ์", "ธนากร", "ชาญชัย", 
    "เกียรติศักดิ์", "เจษฎา", "อัครพล", "ธีรภัทร์", "ปรมินทร์", "วีรยุทธ", "ภาณุพงศ์", 
    "ธนภัทร", "ชยพล", "ชลสิทธิ์", "สรวิชญ์", "ศรัณย์", "พงศกร", "นราธิป"
];

const THAI_FIRSTNAMES_FEMALE = [
    "สมหญิง", "สุชาดา", "ณิชา", "ปรียาภรณ์", "ธัญญารัตน์", "กนกวรรณ", "อภิสรา", "พัชราภา", 
    "สุดารัตน์", "ศิริพร", "รัตนา", "ศิริลักษณ์", "อริสรา", "วรัญญา", "กนกพร", 
    "พรพิมล", "ณัฐนิชา", "พิมพ์ชนก", "ชลดา", "ธัญชนก", "สุพิชชา", "พัชรินทร์"
];

const THAI_LASTNAMES = [
    "รักไทย", "รักดี", "ใจดี", "ดีใจ", "รุ่งเรือง", "เจริญสุข", "แสงทอง", "มั่นคง", 
    "ศรีสุข", "นามดี", "สุขใจ", "ยิ้มแย้ม", "รวยรุ่งเรือง", "เลิศวิจิตร", "งามขำ", 
    "แก้วมณี", "สมบูรณ์ทรัพย์", "สิทธิประเสริฐ", "ปัญญาเลิศ", "วรโชติ", "สุขสวัสดิ์"
];

/**
 * ฟังก์ชันสร้างรายชื่อนักเรียนจำลองสำหรับแต่ละห้อง
 * @returns {Object} แมปห้องเรียนไปยังรายการนักเรียน
 */
function generateMockStudents() {
    const studentsByRoom = {};
    let globalIdCounter = 10001;

    CLASSROOMS.forEach((room, roomIdx) => {
        const students = [];
        // แต่ละห้องมีนักเรียนประมาณ 12 คน
        const studentCount = 12;

        for (let i = 1; i <= studentCount; i++) {
            const isMale = i % 2 !== 0; // เลขคี่เป็นชาย เลขคู่เป็นหญิง
            const firstNames = isMale ? THAI_FIRSTNAMES_MALE : THAI_FIRSTNAMES_FEMALE;
            
            // สุ่มอย่างเป็นระบบเพื่อไม่ให้ชื่อซ้ำกันสำหรับห้องเดียวกัน
            const firstNameIdx = (roomIdx * 7 + i * 3) % firstNames.length;
            const lastNameIdx = (roomIdx * 11 + i * 5) % THAI_LASTNAMES.length;
            
            const name = `${firstNames[firstNameIdx]} ${THAI_LASTNAMES[lastNameIdx]}`;
            const studentId = `ST${globalIdCounter.toString()}`;
            globalIdCounter++;

            students.push({
                no: i,
                id: studentId,
                name: name,
                gender: isMale ? 'male' : 'female'
            });
        }
        studentsByRoom[room] = students;
    });

    return studentsByRoom;
}

// นำเข้าฐานข้อมูลหลัก
window.SCHOOL_DB = {
    classrooms: CLASSROOMS,
    getMockStudents: generateMockStudents
};
