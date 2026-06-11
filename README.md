# ระบบเช็คชื่อนักเรียนออนไลน์ FANGWIT School

ระบบเช็คชื่อนักเรียนและติดตามสถานะนักเรียนรายคาบแบบ Real-time สำหรับโรงเรียนและสถาบันการศึกษา

## วิธีการอัปโหลดขึ้น GitHub

หากคุณต้องการอัปโหลดโปรเจกต์นี้ขึ้น GitHub ให้ทำตามขั้นตอนดังนี้:

1. เปิดโปรแกรม **Git Bash** หรือ **Terminal / Command Prompt**
2. ไปที่โฟลเดอร์นี้:
   ```bash
   cd C:\Users\dodo_\Desktop\fwgit
   ```
3. เริ่มต้นสร้าง Git repository (หากยังไม่ได้ติดตั้ง Git ให้ดาวน์โหลดและติดตั้งก่อน):
   ```bash
   git init
   ```
4. เพิ่มไฟล์ทั้งหมดเข้าในระบบ:
   ```bash
   git add .
   ```
5. Commit ไฟล์:
   ```bash
   git commit -m "Initial commit - Import FANGWIT School attendance system"
   ```
6. ไปสร้าง repository ใหม่บน GitHub (ไม่ต้องเลือกเพิ่ม README หรือ .gitignore บนเว็บตอนสร้าง)
7. คัดลอกลิงก์ Repository URL จาก GitHub (เช่น `https://github.com/your-username/your-repo-name.git`)
8. เชื่อมโยงโฟลเดอร์นี้กับ GitHub:
   ```bash
   git remote add origin <URL_REPOSITORY_บน_GITHUB>
   ```
9. ตั้งชื่อกิ่งหลักเป็น main:
   ```bash
   git branch -M main
   ```
10. อัปโหลดไฟล์ขึ้น GitHub:
    ```bash
    git push -u origin main
    ```

## วิธีรันภายในเครื่อง (Local Run)

เนื่องจากเป็นโปรเจกต์แบบ Static HTML, CSS, JS คุณสามารถ:
- ดับเบิ้ลคลิกเปิดไฟล์ `index.html` ด้วยเว็บเบราว์เซอร์ได้ทันที
- หรือใช้ Extension เช่น **Live Server** ใน VS Code เพื่อเปิดใช้งาน
