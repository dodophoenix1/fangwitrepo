/**
 * Google Apps Script - ระบบเช็คชื่อนักเรียนออนไลน์แบบ Real-time
 * นำโค้ดนี้ไปใส่ใน Apps Script ของ Google Sheets เพื่อใช้เป็นฐานข้อมูล Cloud
 * 
 * วิธีการติดตั้ง:
 * 1. เปิด Google Sheets -> ส่วนขยาย (Extensions) -> Apps Script
 * 2. ลบโค้ดเริ่มต้นออกทั้งหมด แล้ววางโค้ดไฟล์นี้ลงไป
 * 3. บันทึกโปรเจกต์ และกดปุ่ม "การทำให้ใช้งานได้" (Deploy) -> "การทำให้ใช้งานได้ใหม่" (New deployment)
 * 4. เลือกประเภทการทำงานเป็น "เว็บแอป" (Web app)
 * 5. ตั้งค่า:
 *    - Execute as: "Me" (บัญชี Google ของคุณ)
 *    - Who has access: "Anyone" (ทุกคน - เพื่อให้แอปพลิเคชันฝั่งหน้าบ้านสามารถยิง API คุยได้)
 * 6. กด Deploy แล้วคัดลอก Web App URL (ที่ลงท้ายด้วย /exec) นำมาใส่ใน Settings ของหน้าแอดมิน
 */

// ชื่อแผ่นงานใน Google Sheet
const LOGS_SHEET_NAME = "AttendanceLogs";
const STUDENTS_SHEET_NAME = "Students";

/**
 * ฟังก์ชันหลักในการรับข้อมูลแบบ POST (สำหรับบันทึกประวัติเช็คชื่อ หรือเพิ่มชื่อนักเรียน)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // ล็อคเพื่อป้องกันข้อมูลชนกันหากยิงเข้ามาพร้อมกัน
    lock.waitLock(15000);
    
    if (!e.postData || !e.postData.contents) {
      return createJsonResponse({ status: "error", message: "No post content" }, 400);
    }
    
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.payload;
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "saveAttendance") {
      return saveAttendanceLogs(sheet, payload);
    } else if (action === "addStudent") {
      return addIndividualStudent(sheet, payload);
    } else {
      return createJsonResponse({ status: "error", message: "Invalid action" }, 400);
    }
    
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() }, 500);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ฟังก์ชันหลักในการดึงข้อมูลแบบ GET (สำหรับดึงข้อมูลนักเรียน ประวัติ หรือผลวิเคราะห์สำหรับวาดกราฟ)
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "getStudents") {
      return getStudentsData(sheet);
    } else if (action === "getLogs") {
      const startDate = e.parameter.startDate;
      const endDate = e.parameter.endDate;
      const room = e.parameter.room;
      return getAttendanceLogs(sheet, startDate, endDate, room);
    } else if (action === "getAggregatedData") {
      const timeframe = e.parameter.timeframe || "daily";
      const room = e.parameter.room || "ALL";
      const currentDate = e.parameter.currentDate || formatDateString(new Date());
      return getAggregatedData(sheet, timeframe, room, currentDate);
    } else {
      return createJsonResponse({ status: "error", message: "Invalid action" }, 400);
    }
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() }, 500);
  }
}

/**
 * บันทึกข้อมูลการเช็คชื่อลงในแผ่นงาน "AttendanceLogs"
 */
function saveAttendanceLogs(spreadsheet, payload) {
  let sheet = spreadsheet.getSheetByName(LOGS_SHEET_NAME);
  
  // ถ้ายังไม่มีแผ่นงานให้สร้างใหม่
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOGS_SHEET_NAME);
    sheet.appendRow([
      "วันที่", "คาบเรียน", "ห้องเรียน", "เลขที่", 
      "รหัสประจำตัว", "ชื่อ-นามสกุล", "สถานะ", "เวลาเช็คชื่อ", "ผู้เช็ค"
    ]);
  }
  
  const date = payload.date;
  const period = payload.period;
  const room = payload.room;
  const checkedAt = payload.checkedAt;
  const checkedBy = payload.checkedBy;
  const records = payload.records; // Array ของ { no, id, name, status }
  
  // ก่อนทำการบันทึกห้องเรียนนั้นในวันและคาบเดียวกัน ให้เคลียร์ข้อมูลเดิมออกก่อน (เพื่อการอัปเดตแบบเขียนทับ)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const range = sheet.getRange(2, 1, lastRow - 1, 9);
    const values = range.getValues();
    const rowsToDelete = [];
    
    for (let i = 0; i < values.length; i++) {
      const rowDate = formatDateString(values[i][0]);
      const rowPeriod = parseInt(values[i][1].toString().replace("คาบที่ ", ""));
      const rowRoom = values[i][2].toString().replace("ม.", "");
      
      if (rowDate === date && rowPeriod === period && rowRoom === room) {
        // แถวที่ i ใน array ตรงกับแถวที่ i + 2 ใน Sheet
        rowsToDelete.push(i + 2);
      }
    }
    
    // ลบจากล่างขึ้นบนเพื่อไม่ให้ดัชนีแถวคลาดเคลื่อน
    for (let j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
    }
  }
  
  // เขียนบันทึกข้อมูลแถวใหม่ทั้งหมด
  records.forEach(r => {
    sheet.appendRow([
      date,
      `คาบที่ ${period}`,
      `ม.${room}`,
      r.no,
      r.id,
      r.name,
      r.status,
      checkedAt,
      checkedBy
    ]);
  });
  
  return createJsonResponse({ status: "success", message: `Saved ${records.length} logs successfully.` });
}

/**
 * บันทึกรายชื่อนักเรียนคนใหม่ลงในแผ่นงาน "Students"
 */
function addIndividualStudent(spreadsheet, payload) {
  let sheet = spreadsheet.getSheetByName(STUDENTS_SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STUDENTS_SHEET_NAME);
    sheet.appendRow(["ห้องเรียน", "เลขที่", "รหัสประจำตัว", "ชื่อ-นามสกุล", "เพศ"]);
  }
  
  const room = payload.room;
  const no = payload.no;
  const id = payload.id;
  const name = payload.name;
  const gender = payload.gender;
  
  // ตรวจสอบความซ้ำซ้อนใน Sheet
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const range = sheet.getRange(2, 1, lastRow - 1, 5);
    const values = range.getValues();
    for (let i = 0; i < values.length; i++) {
      const rowRoom = values[i][0].toString();
      const rowNo = parseInt(values[i][1]);
      const rowId = values[i][2].toString();
      
      if (rowRoom === room && (rowNo === no || rowId === id)) {
        return createJsonResponse({ status: "error", message: "เลขที่หรือรหัสประจำตัวนักเรียน ซ้ำกับในฐานข้อมูลแล้ว" }, 400);
      }
    }
  }
  
  sheet.appendRow([room, no, id, name, gender]);
  return createJsonResponse({ status: "success", message: `Added student ${name} successfully.` });
}

/**
 * ดึงรายการนักเรียนทั้งหมดแยกตามห้อง
 */
function getStudentsData(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(STUDENTS_SHEET_NAME);
  if (!sheet) {
    return createJsonResponse({ status: "success", students: {} });
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return createJsonResponse({ status: "success", students: {} });
  }
  
  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const students = {};
  
  values.forEach(row => {
    const room = row[0].toString();
    const no = parseInt(row[1]);
    const id = row[2].toString();
    const name = row[3].toString();
    const gender = row[4].toString();
    
    if (!students[room]) {
      students[room] = [];
    }
    
    students[room].push({ no, id, name, gender });
  });
  
  // เรียงลำดับเลขที่นักเรียนแต่ละห้อง
  Object.keys(students).forEach(room => {
    students[room].sort((a, b) => a.no - b.no);
  });
  
  return createJsonResponse({ status: "success", students: students });
}

/**
 * ดึงและกรองประวัติการเช็คชื่อทั้งหมด
 */
function getAttendanceLogs(spreadsheet, startDate, endDate, roomFilter) {
  const sheet = spreadsheet.getSheetByName(LOGS_SHEET_NAME);
  if (!sheet) {
    return createJsonResponse({ status: "success", logs: [] });
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return createJsonResponse({ status: "success", logs: [] });
  }
  
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const logs = [];
  
  values.forEach(row => {
    const rowDate = formatDateString(row[0]);
    const rowPeriod = parseInt(row[1].toString().replace("คาบที่ ", ""));
    const rowRoom = row[2].toString().replace("ม.", "");
    const no = parseInt(row[3]);
    const id = row[4].toString();
    const name = row[5].toString();
    const status = row[6].toString();
    const checkedAt = row[7].toString();
    const checkedBy = row[8].toString();
    
    // ตัวกรองช่วงวันที่
    if (startDate && rowDate < startDate) return;
    if (endDate && rowDate > endDate) return;
    
    // ตัวกรองห้องเรียน
    if (roomFilter && roomFilter !== "ALL" && rowRoom !== roomFilter) return;
    
    logs.push({
      date: rowDate,
      period: rowPeriod,
      room: rowRoom,
      no,
      id,
      name,
      status,
      checkedAt,
      checkedBy
    });
  });
  
  return createJsonResponse({ status: "success", logs: logs });
}

/**
 * ตัวช่วยจัดแปลงวันที่ใน JS ให้ตรงกัน (ป้องกันปัญหา Date format โซนเวลา หรือ String จาก Excel)
 */
function formatDateString(dateObj) {
  if (dateObj instanceof Date) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  // ในกรณีเป็น String อยู่แล้ว (เช่น "2026-06-11")
  const dateStr = String(dateObj).trim();
  if (dateStr.includes("T")) {
    return dateStr.split("T")[0];
  }
  return dateStr;
}

/**
 * ตัวช่วยส่งค่ากลับเป็น JSON และแก้ปัญหา CORS สำหรับการดึงผ่าน Ajax
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  
  // เพิ่ม HTTP status code ในโครงสร้างข้อมูลแทน เนื่องจาก Apps Script ไม่สนับสนุน Custom Response Header Status
  return output;
}

/**
 * ดึงข้อมูลการเช็คชื่อแบบ Aggregated สำหรับใช้วาดกราฟ Chart.js ทันที
 */
function getAggregatedData(spreadsheet, timeframe, roomFilter, currentDate) {
  const sheet = spreadsheet.getSheetByName(LOGS_SHEET_NAME);
  if (!sheet) {
    return createJsonResponse({
      status: "success",
      donutData: { labels: ["มาเรียน", "ขาดเรียน", "ลา", "สาย", "โดดเรียน"], values: [0, 0, 0, 0, 0] },
      lineData: { labels: [], datasets: { absent: [], late: [], skip: [] } },
      barData: { labels: [], datasets: { absent: [], late: [], skip: [] } }
    });
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return createJsonResponse({
      status: "success",
      donutData: { labels: ["มาเรียน", "ขาดเรียน", "ลา", "สาย", "โดดเรียน"], values: [0, 0, 0, 0, 0] },
      lineData: { labels: [], datasets: { absent: [], late: [], skip: [] } },
      barData: { labels: [], datasets: { absent: [], late: [], skip: [] } }
    });
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  
  // 1. คำนวณช่วงวันที่ตาม timeframe (daily, weekly, monthly)
  const today = parseDate(currentDate);
  const datesInRange = [];
  let daysToFetch = 1;
  if (timeframe === "weekly") daysToFetch = 7;
  else if (timeframe === "monthly") daysToFetch = 30;
  
  // หา dates ย้อนหลัง (ไม่รวมเสาร์อาทิตย์)
  let fetched = 0;
  let offset = 0;
  while (fetched < daysToFetch) {
    const checkDate = new Date(today.getTime());
    checkDate.setDate(today.getDate() - offset);
    offset++;
    
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // ข้ามเสาร์-อาทิตย์
    
    datesInRange.push(formatDateString(checkDate));
    fetched++;
  }
  datesInRange.reverse(); // เรียงจากเก่าไปใหม่
  
  // 2. กรองข้อมูล logs ที่ตรงตามเงื่อนไข
  const filteredLogs = [];
  values.forEach(row => {
    const rowDate = formatDateString(row[0]);
    const rowPeriod = parseInt(row[1].toString().replace("คาบที่ ", ""));
    const rowRoom = row[2].toString().replace("ม.", "");
    const no = parseInt(row[3]);
    const id = row[4].toString();
    const name = row[5].toString();
    const status = row[6].toString();
    
    // เช็คช่วงวันที่
    if (datesInRange.indexOf(rowDate) === -1) return;
    
    // เช็คห้อง
    if (roomFilter !== "ALL" && rowRoom !== roomFilter) return;
    
    filteredLogs.push({
      date: rowDate,
      period: rowPeriod,
      room: rowRoom,
      no: no,
      id: id,
      name: name,
      status: status
    });
  });

  // 3. ทำการ Aggregate ข้อมูลสำหรับ Donut Chart
  let present = 0, absent = 0, leave = 0, late = 0, skip = 0;
  filteredLogs.forEach(log => {
    if (log.status === "มา") present++;
    else if (log.status === "ขาด") absent++;
    else if (log.status === "ลา") leave++;
    else if (log.status === "สาย") late++;
    else if (log.status === "โดดเรียน") skip++;
  });

  // 4. ทำการ Aggregate ข้อมูลสำหรับ Line Chart (ตามคาบเรียนในวัน หรือตามวันที่ย้อนหลัง)
  let lineLabels = [];
  let lineAbsent = [];
  let lineLate = [];
  let lineSkip = [];

  if (timeframe === "daily") {
    // รายวัน -> แสดงเป็นคาบเรียนที่ 1-7
    for (let p = 1; p <= 7; p++) {
      lineLabels.push("คาบ " + p);
      let pAbsent = 0, pLate = 0, pSkip = 0;
      filteredLogs.forEach(log => {
        if (log.period === p) {
          if (log.status === "ขาด") pAbsent++;
          else if (log.status === "สาย") pLate++;
          else if (log.status === "โดดเรียน") pSkip++;
        }
      });
      lineAbsent.push(pAbsent);
      lineLate.push(pLate);
      lineSkip.push(pSkip);
    }
  } else {
    // รายสัปดาห์ / รายเดือน -> แสดงเป็นวันที่ย้อนหลัง
    datesInRange.forEach(d => {
      const parts = d.split('-');
      lineLabels.push(`${parts[2]}/${parts[1]}`);
      
      let dAbsent = 0, dLate = 0, dSkip = 0;
      filteredLogs.forEach(log => {
        if (log.date === d) {
          if (log.status === "ขาด") dAbsent++;
          else if (log.status === "สาย") dLate++;
          else if (log.status === "โดดเรียน") dSkip++;
        }
      });
      lineAbsent.push(dAbsent);
      lineLate.push(dLate);
      lineSkip.push(dSkip);
    });
  }

  // 5. ทำการ Aggregate ข้อมูลสำหรับ Bar Chart
  // ถ้าเลือก "ALL" -> แสดงเปรียบเทียบแต่ละห้องเรียน (24 ห้อง)
  // ถ้าเลือกห้องเฉพาะ -> แสดงเปรียบเทียบนิสิตเป็นรายคนในห้องนั้น
  let barLabels = [];
  let barAbsent = [];
  let barLate = [];
  let barSkip = [];

  if (roomFilter === "ALL") {
    const classrooms = [
      "1/1", "1/2", "1/3", "1/4", "1/5",
      "2/1", "2/2", "2/3", "2/4", "2/5",
      "3/1", "3/2", "3/3", "3/4", "3/5",
      "4/1", "4/2", "4/3",
      "5/1", "5/2", "5/3",
      "6/1", "6/2", "6/3"
    ];
    classrooms.forEach(room => {
      barLabels.push("ม." + room);
      let rAbsent = 0, rLate = 0, rSkip = 0;
      filteredLogs.forEach(log => {
        if (log.room === room) {
          if (log.status === "ขาด") rAbsent++;
          else if (log.status === "สาย") rLate++;
          else if (log.status === "โดดเรียน") rSkip++;
        }
      });
      barAbsent.push(rAbsent);
      barLate.push(rLate);
      barSkip.push(rSkip);
    });
  } else {
    // เฉพาะห้อง -> แสดงรายชื่อเด็กที่มีใน logs
    const studentNamesMap = {};
    filteredLogs.forEach(log => {
      studentNamesMap[log.id] = { no: log.no, name: log.name.split(' ')[0] };
    });
    
    const sortedStudents = Object.keys(studentNamesMap).map(id => ({
      id: id,
      no: studentNamesMap[id].no,
      label: `${studentNamesMap[id].no}. ${studentNamesMap[id].name}`
    })).sort((a, b) => a.no - b.no);

    sortedStudents.forEach(st => {
      barLabels.push(st.label);
      let sAbsent = 0, sLate = 0, sSkip = 0;
      filteredLogs.forEach(log => {
        if (log.id === st.id) {
          if (log.status === "ขาด") sAbsent++;
          else if (log.status === "สาย") sLate++;
          else if (log.status === "โดดเรียน") sSkip++;
        }
      });
      barAbsent.push(sAbsent);
      barLate.push(sLate);
      barSkip.push(sSkip);
    });
  }

  return createJsonResponse({
    status: "success",
    donutData: {
      labels: ["มาเรียน", "ขาดเรียน", "ลา", "สาย", "โดดเรียน"],
      values: [present, absent, leave, late, skip]
    },
    lineData: {
      labels: lineLabels,
      datasets: { absent: lineAbsent, late: lineLate, skip: lineSkip }
    },
    barData: {
      labels: barLabels,
      datasets: { absent: barAbsent, late: barLate, skip: barSkip }
    }
  });
}

/**
 * ตัวแปลง String "YYYY-MM-DD" เป็น Date Object ในระบบ Local
 */
function parseDate(dateStr) {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}
