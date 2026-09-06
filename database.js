const fs = require('node:fs/promises');

let pool;
let mysqlEnabled = false;
const schema = [
  "CREATE TABLE IF NOT EXISTS employees (id VARCHAR(32) PRIMARY KEY, name VARCHAR(160) NOT NULL, department VARCHAR(120) NOT NULL, designation VARCHAR(160) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', face_registered TINYINT(1) NOT NULL DEFAULT 0, face_image MEDIUMTEXT, face_signature TEXT, first_name VARCHAR(80), middle_name VARCHAR(80), last_name VARCHAR(80), gender VARCHAR(40), date_of_birth DATE NULL, date_of_joining DATE NULL, place_of_birth VARCHAR(120), nationality VARCHAR(80) DEFAULT 'Indian', company VARCHAR(160), site_office VARCHAR(160), reports_to VARCHAR(160), grade VARCHAR(80), employment_type VARCHAR(80), leave_approval_workflow VARCHAR(160), attendance_device_id VARCHAR(120), default_shift VARCHAR(120), expense_approver VARCHAR(160), user_id VARCHAR(160), project VARCHAR(160), personal_email VARCHAR(190), mobile VARCHAR(40), current_address TEXT, permanent_address TEXT, ctc DECIMAL(14,2) NULL, salary_currency VARCHAR(10) DEFAULT 'INR', job_applicant VARCHAR(160), offer_date DATE NULL, contract_end_date DATE NULL, notice_days INT NULL, retirement_date DATE NULL, emergency_contact VARCHAR(160), emergency_phone VARCHAR(40), payroll_cost_center VARCHAR(120), pan_number VARCHAR(40), aadhaar_number VARCHAR(40), marital_status VARCHAR(40), blood_group VARCHAR(20), family_background TEXT, health_details TEXT, biography TEXT, written_languages VARCHAR(255), spoken_languages VARCHAR(255), resignation_date DATE NULL, relieving_date DATE NULL, new_workplace VARCHAR(160), reason_for_leaving TEXT, exit_feedback TEXT)",
  'CREATE TABLE IF NOT EXISTS attendance (id BIGINT AUTO_INCREMENT PRIMARY KEY, attendance_date DATE NOT NULL UNIQUE, present_count INT NOT NULL DEFAULT 0, absent_count INT NOT NULL DEFAULT 0, leave_count INT NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS time_entries (id VARCHAR(32) PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, attendance_date DATE NOT NULL, check_in DATETIME NULL, check_out DATETIME NULL, duration_seconds INT NOT NULL DEFAULT 0, log_type VARCHAR(12) NOT NULL DEFAULT \'IN\', reason TEXT, location VARCHAR(160), project VARCHAR(160), description TEXT, break_seconds INT NOT NULL DEFAULT 0, status VARCHAR(40), late_minutes INT NOT NULL DEFAULT 0, early_checkout_minutes INT NOT NULL DEFAULT 0, overtime_minutes INT NOT NULL DEFAULT 0, working_hours DECIMAL(8,2) NOT NULL DEFAULT 0, shift_start VARCHAR(5), shift_end VARCHAR(5), location_validated TINYINT(1) NOT NULL DEFAULT 0, shift_validated TINYINT(1) NOT NULL DEFAULT 0, work_mode VARCHAR(30) NOT NULL DEFAULT \'Office\', face_image MEDIUMTEXT, face_verified TINYINT(1) NOT NULL DEFAULT 0, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)',
  "CREATE TABLE IF NOT EXISTS leave_requests (id VARCHAR(32) PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, leave_type VARCHAR(120) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, reason TEXT, half_day TINYINT(1) NOT NULL DEFAULT 0, half_day_session VARCHAR(32), status VARCHAR(32) NOT NULL DEFAULT 'pending', FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)",
  'CREATE TABLE IF NOT EXISTS payroll (id TINYINT PRIMARY KEY, payroll_month VARCHAR(7) NOT NULL, total_amount DECIMAL(14,2) NOT NULL, due_in_days INT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS documents (id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(32), document_name VARCHAR(160) NOT NULL, document_status VARCHAR(80) NOT NULL, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS celebrations (id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, celebration_kind VARCHAR(80) NOT NULL, celebration_date DATE NOT NULL, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)',
  "CREATE TABLE IF NOT EXISTS users (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(40) NOT NULL DEFAULT 'employee', employee_id VARCHAR(32) NULL, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL)",
  'CREATE TABLE IF NOT EXISTS role_permissions (role_key VARCHAR(40) NOT NULL, permission_key VARCHAR(100) NOT NULL, PRIMARY KEY (role_key, permission_key))',
  'CREATE TABLE IF NOT EXISTS attendance_regularizations (id VARCHAR(32) PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, attendance_date DATE NOT NULL, original_entry_id VARCHAR(32), requested_check_in DATETIME NULL, requested_check_out DATETIME NULL, reason TEXT NOT NULL, status VARCHAR(32) NOT NULL DEFAULT \'pending\', requested_by BIGINT NULL, reviewed_by BIGINT NULL, reviewed_at DATETIME NULL, review_reason TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE, FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL, expires_at DATETIME NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)',
  "CREATE TABLE IF NOT EXISTS departments (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, code VARCHAR(40) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'active')",
  "CREATE TABLE IF NOT EXISTS designations (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, department_id BIGINT NULL, level_name VARCHAR(80), status VARCHAR(32) NOT NULL DEFAULT 'active', FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL)",
  "CREATE TABLE IF NOT EXISTS job_openings (id BIGINT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(160) NOT NULL, department VARCHAR(120) NOT NULL, openings INT NOT NULL DEFAULT 1, status VARCHAR(32) NOT NULL DEFAULT 'draft')",
  "CREATE TABLE IF NOT EXISTS applicants (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL, job_opening_id BIGINT NULL, pipeline_stage VARCHAR(80) NOT NULL DEFAULT 'applied', FOREIGN KEY (job_opening_id) REFERENCES job_openings(id) ON DELETE SET NULL)",
  "CREATE TABLE IF NOT EXISTS expenses (id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, category VARCHAR(100) NOT NULL, amount DECIMAL(12,2) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'submitted', FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS assets (id BIGINT AUTO_INCREMENT PRIMARY KEY, asset_code VARCHAR(80) NOT NULL UNIQUE, asset_type VARCHAR(100) NOT NULL, employee_id VARCHAR(32) NULL, status VARCHAR(32) NOT NULL DEFAULT 'available', FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL)",
  "CREATE TABLE IF NOT EXISTS performance_goals (id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, title VARCHAR(180) NOT NULL, target VARCHAR(120), progress DECIMAL(5,2) NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'active', FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS employee_requests (id BIGINT AUTO_INCREMENT PRIMARY KEY, employee_id VARCHAR(32) NOT NULL, request_type VARCHAR(100) NOT NULL, description TEXT, status VARCHAR(32) NOT NULL DEFAULT 'submitted', FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NULL, action_name VARCHAR(160) NOT NULL, entity_type VARCHAR(80) NOT NULL, entity_id VARCHAR(80), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL)"
  ,"CREATE TABLE IF NOT EXISTS companies (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, abbr VARCHAR(20) NOT NULL UNIQUE, default_currency VARCHAR(10) NOT NULL DEFAULT 'INR', country VARCHAR(80) NOT NULL DEFAULT 'India', letter_head VARCHAR(160), tax_id VARCHAR(80), domain VARCHAR(160), establishment_date DATE NULL, gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00, parent_company VARCHAR(160), is_group TINYINT(1) NOT NULL DEFAULT 0, holiday_list VARCHAR(160), gstin VARCHAR(80), gst_category VARCHAR(80) NOT NULL DEFAULT 'Unregistered', enable_perpetual_inventory TINYINT(1) NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS site_offices (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, code VARCHAR(40) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS shift_types (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, holiday_list VARCHAR(160), start_time TIME NOT NULL, end_time TIME NOT NULL, roster_color VARCHAR(40) NOT NULL DEFAULT 'Blue', enable_auto_attendance TINYINT(1) NOT NULL DEFAULT 0, allow_overtime TINYINT(1) NOT NULL DEFAULT 0, shift_type VARCHAR(40) NOT NULL DEFAULT 'Regular', status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS work_locations (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, location_type VARCHAR(40) NOT NULL, address VARCHAR(255), latitude DECIMAL(10,7), longitude DECIMAL(10,7), radius_meters INT NOT NULL DEFAULT 200, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS employee_groups (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, code VARCHAR(40) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS employee_grades (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, level_name VARCHAR(80) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS leave_types (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, annual_days INT NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS leave_periods (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS leave_policies (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, description TEXT, status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS leave_block_lists (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, reason VARCHAR(255), status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS holiday_lists (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, holiday_date DATE NOT NULL, description VARCHAR(255), status VARCHAR(32) NOT NULL DEFAULT 'active')"
  ,"CREATE TABLE IF NOT EXISTS hr_settings (id BIGINT AUTO_INCREMENT PRIMARY KEY, setting_name VARCHAR(160) NOT NULL UNIQUE, setting_value TEXT NOT NULL)"
  ,"CREATE TABLE IF NOT EXISTS payroll_settings (id BIGINT AUTO_INCREMENT PRIMARY KEY, setting_name VARCHAR(160) NOT NULL UNIQUE, setting_value TEXT NOT NULL)"
  ,"CREATE TABLE IF NOT EXISTS work_summary_groups (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL UNIQUE, description TEXT, status VARCHAR(32) NOT NULL DEFAULT 'active')"
];

async function connectDatabase(fallbackPath) {
  if (process.env.DB_DRIVER === 'json') return;
  try {
    const mysql = require('mysql2/promise');
    const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', waitForConnections: true, connectionLimit: 5, dateStrings: true };
    const databaseName = process.env.DB_NAME || process.env.DB_DATABASE || 'html';
    if (process.env.DB_AUTO_CREATE === 'true' || process.env.NODE_ENV !== 'production') {
      const bootstrap = await mysql.createConnection(config);
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName.replace(/`/g, '')}\``);
      await bootstrap.end();
    }
    pool = mysql.createPool({ ...config, database: databaseName });
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_registered TINYINT(1) NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_image MEDIUMTEXT');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS face_signature TEXT');
    for (const column of ['first_name VARCHAR(80)', 'middle_name VARCHAR(80)', 'last_name VARCHAR(80)', 'gender VARCHAR(40)', 'date_of_birth DATE NULL', 'date_of_joining DATE NULL', 'place_of_birth VARCHAR(120)', 'nationality VARCHAR(80)', 'company VARCHAR(160)', 'site_office VARCHAR(160)', 'reports_to VARCHAR(160)', 'grade VARCHAR(80)', 'employment_type VARCHAR(80)', 'leave_approval_workflow VARCHAR(160)', 'attendance_device_id VARCHAR(120)', 'default_shift VARCHAR(120)', 'expense_approver VARCHAR(160)', 'user_id VARCHAR(160)', 'project VARCHAR(160)', 'personal_email VARCHAR(190)', 'mobile VARCHAR(40)', 'current_address TEXT', 'permanent_address TEXT', 'ctc DECIMAL(14,2) NULL', 'salary_currency VARCHAR(10)', 'job_applicant VARCHAR(160)', 'offer_date DATE NULL', 'contract_end_date DATE NULL', 'notice_days INT NULL', 'retirement_date DATE NULL', 'emergency_contact VARCHAR(160)', 'emergency_phone VARCHAR(40)', 'payroll_cost_center VARCHAR(120)', 'pan_number VARCHAR(40)', 'aadhaar_number VARCHAR(40)', 'marital_status VARCHAR(40)', 'blood_group VARCHAR(20)', 'family_background TEXT', 'health_details TEXT', 'biography TEXT', 'written_languages VARCHAR(255)', 'spoken_languages VARCHAR(255)', 'resignation_date DATE NULL', 'relieving_date DATE NULL', 'new_workplace VARCHAR(160)', 'reason_for_leaving TEXT', 'exit_feedback TEXT']) await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${column}`);
    await pool.query('ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS duration_seconds INT NOT NULL DEFAULT 0');
    for (const column of ['log_type VARCHAR(12) NOT NULL DEFAULT \'IN\'', 'reason TEXT', 'location VARCHAR(160)', 'project VARCHAR(160)', 'description TEXT']) await pool.query(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${column}`);
    for (const column of ['break_seconds INT NOT NULL DEFAULT 0', 'status VARCHAR(40)', 'late_minutes INT NOT NULL DEFAULT 0', 'early_checkout_minutes INT NOT NULL DEFAULT 0', 'overtime_minutes INT NOT NULL DEFAULT 0', 'working_hours DECIMAL(8,2) NOT NULL DEFAULT 0', 'shift_start VARCHAR(5)', 'shift_end VARCHAR(5)', 'location_validated TINYINT(1) NOT NULL DEFAULT 0', 'shift_validated TINYINT(1) NOT NULL DEFAULT 0', 'work_mode VARCHAR(30) NOT NULL DEFAULT \'Office\'']) await pool.query(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${column}`);
    await pool.query('ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS face_image MEDIUMTEXT');
    await pool.query('ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS face_verified TINYINT(1) NOT NULL DEFAULT 0');
    for (const column of ['grace_period_minutes INT NOT NULL DEFAULT 0', 'break_minutes INT NOT NULL DEFAULT 60', 'late_rule VARCHAR(40) NOT NULL DEFAULT \'Mark Late\'', 'early_checkout_rule VARCHAR(40) NOT NULL DEFAULT \'Mark Early\'', 'half_day_threshold DECIMAL(5,2) NOT NULL DEFAULT 4.5']) await pool.query(`ALTER TABLE shift_types ADD COLUMN IF NOT EXISTS ${column}`);
    await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reason TEXT');
    await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day TINYINT(1) NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_session VARCHAR(32)');
    for (const statement of schema) await pool.query(statement);
    const [rows] = await pool.query('SELECT id FROM employees LIMIT 1');
    try {
      await pool.query('ALTER TABLE time_entries DROP FOREIGN KEY time_entries_ibfk_1');
      await pool.query('ALTER TABLE time_entries DROP INDEX employee_day');
      await pool.query('ALTER TABLE time_entries ADD CONSTRAINT time_entries_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE');
    } catch (error) { if (!error.message.includes('check that it exists') && !error.message.includes('Can\'t DROP')) throw error; }
    if (!rows.length) await writeMysql(JSON.parse(await fs.readFile(fallbackPath, 'utf8')));
    mysqlEnabled = true;
    console.log('Database connected: MySQL tables ready');
  } catch (error) {
    if (process.env.NODE_ENV === 'production' || process.env.DB_REQUIRED === 'true') throw error;
    console.warn(`MySQL unavailable, using JSON fallback: ${error.message}`);
  }
}

async function readDatabase(fallbackPath) {
  if (!mysqlEnabled) return JSON.parse(await fs.readFile(fallbackPath, 'utf8'));
  const [employees] = await pool.query('SELECT id,name,department,designation,status,face_registered faceRegistered,face_signature faceSignature FROM employees ORDER BY name');
  const [attendance] = await pool.query('SELECT DATE_FORMAT(attendance_date, "%Y-%m-%d") date,present_count present,absent_count absent,leave_count AS `leave` FROM attendance ORDER BY attendance_date DESC');
  const [timeEntries] = await pool.query('SELECT id,employee_id employeeId,DATE_FORMAT(attendance_date, "%Y-%m-%d") date,check_in checkIn,check_out checkOut,duration_seconds durationSeconds,log_type logType,reason,location,project,description,break_seconds breakSeconds,status,late_minutes lateMinutes,early_checkout_minutes earlyCheckoutMinutes,overtime_minutes overtimeMinutes,working_hours workingHours,shift_start shiftStart,shift_end shiftEnd,location_validated locationValidated,shift_validated shiftValidated,work_mode workMode,face_verified faceVerified FROM time_entries ORDER BY attendance_date DESC');
  const [leaveRequests] = await pool.query('SELECT id,employee_id employeeId,leave_type type,DATE_FORMAT(start_date, "%Y-%m-%d") startDate,DATE_FORMAT(end_date, "%Y-%m-%d") endDate,reason,half_day halfDay,half_day_session halfDaySession,status FROM leave_requests');
  const [payroll] = await pool.query('SELECT payroll_month month,total_amount total,due_in_days dueInDays FROM payroll WHERE id=1');
  const [celebrations] = await pool.query('SELECT employee_id employeeId,celebration_kind kind,DATE_FORMAT(celebration_date, "%Y-%m-%d") date FROM celebrations');
  return { employees, attendance, timeEntries, leaveRequests, payroll: payroll[0] || { month: '', total: 0, dueInDays: 0 }, celebrations };
}

async function writeMysql(database) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const table of ['celebrations', 'documents', 'leave_requests', 'time_entries', 'attendance', 'payroll', 'employees']) await connection.query(`DELETE FROM ${table}`);
    for (const item of database.employees || []) await connection.query('INSERT INTO employees (id,name,department,designation,status,face_registered,face_image,face_signature) VALUES (?,?,?,?,?,?,?,?)', [item.id, item.name, item.department, item.designation, item.status || 'active', item.faceRegistered ? 1 : 0, item.faceImage || null, item.faceSignature || null]);
    for (const item of database.attendance || []) await connection.query('INSERT INTO attendance (attendance_date,present_count,absent_count,leave_count) VALUES (?,?,?,?)', [item.date, item.present, item.absent, item.leave]);
    for (const item of database.timeEntries || []) await connection.query('INSERT INTO time_entries (id,employee_id,attendance_date,check_in,check_out,duration_seconds,log_type,reason,location,project,description,break_seconds,status,late_minutes,early_checkout_minutes,overtime_minutes,working_hours,shift_start,shift_end,location_validated,shift_validated,work_mode,face_image,face_verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [item.id, item.employeeId, item.date, item.checkIn ? new Date(item.checkIn) : null, item.checkOut ? new Date(item.checkOut) : null, item.durationSeconds || 0, item.logType || 'IN', item.reason || '', item.location || '', item.project || '', item.description || '', item.breakSeconds || 0, item.status || null, item.lateMinutes || 0, item.earlyCheckoutMinutes || 0, item.overtimeMinutes || 0, item.workingHours || 0, item.shiftStart || null, item.shiftEnd || null, item.locationValidated ? 1 : 0, item.shiftValidated ? 1 : 0, item.workMode || 'Office', item.faceImage || null, item.faceVerified ? 1 : 0]);
    for (const item of database.leaveRequests || []) await connection.query('INSERT INTO leave_requests (id,employee_id,leave_type,start_date,end_date,reason,half_day,half_day_session,status) VALUES (?,?,?,?,?,?,?,?,?)', [item.id, item.employeeId, item.type, item.startDate, item.endDate, item.reason || '', item.halfDay ? 1 : 0, item.halfDaySession || null, item.status]);
    if (database.payroll) await connection.query('INSERT INTO payroll VALUES (1,?,?,?)', [database.payroll.month, database.payroll.total, database.payroll.dueInDays]);
    for (const item of database.celebrations || []) await connection.query('INSERT INTO celebrations (employee_id,celebration_kind,celebration_date) VALUES (?,?,?)', [item.employeeId, item.kind, item.date]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function writeDatabase(database, fallbackPath) {
  if (mysqlEnabled) return writeMysql(database);
  await fs.writeFile(fallbackPath, JSON.stringify(database, null, 2) + '\n');
}
function databaseStatus() { return { driver: mysqlEnabled ? 'mysql' : 'json-fallback', database: process.env.DB_NAME || process.env.DB_DATABASE || 'html', tables: mysqlEnabled ? schema.length : 0 }; }
async function query(sql, params) { if (!mysqlEnabled) throw new Error('MySQL is required for authentication'); return pool.query(sql, params); }
module.exports = { connectDatabase, readDatabase, writeDatabase, databaseStatus, query };
