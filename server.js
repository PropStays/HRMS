const http = require('node:http');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { connectDatabase, readDatabase: readStore, writeDatabase: writeStore, databaseStatus, query } = require('./database');

function loadEnvironment() {
  try {
    const contents = syncFs.readFileSync(path.resolve('.env'), 'utf8');
    contents.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

loadEnvironment();
const port = Number(process.env.PORT || 3000);
const databasePath = path.resolve(process.env.DB_FILE || './data/hrms.json');
const publicFiles = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js' };

async function readDatabase() {
  return readStore(databasePath);
}

async function writeDatabase(database) {
  return writeStore(database, databasePath);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

async function requestBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw new Error('Request body must be valid JSON'); }
}

function employeeName(database, employeeId) {
  return database.employees.find((employee) => employee.id === employeeId)?.name || 'Unknown employee';
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function attendanceDayState(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const dateKey = localDateKey(date);
  const finalizeAt = new Date(dateKey);
  finalizeAt.setDate(finalizeAt.getDate() + 1);
  finalizeAt.setHours(12, 0, 0, 0);
  return { date: dateKey, finalizeAt, finalized: new Date() >= finalizeAt };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function distanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadius = 6371000;
  const radians = (value) => value * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validFacePayload(body) {
  return typeof body.faceImage === 'string' && body.faceImage.length <= 280000 && typeof body.faceSignature === 'string' && body.faceSignature.length > 20;
}

function faceMatches(employee, body) {
  if (!employee.faceRegistered || !employee.faceSignature || !validFacePayload(body)) return false;
  const registered = employee.faceSignature.split(',').map(Number);
  const captured = body.faceSignature.split(',').map(Number);
  if (registered.length !== captured.length || registered.some((value) => !Number.isFinite(value)) || captured.some((value) => !Number.isFinite(value))) return false;
  const distance = Math.sqrt(registered.reduce((total, value, index) => total + (value - captured[index]) ** 2, 0) / registered.length);
  return distance <= 28;
}

function faceError(response, employee) {
  return sendError(response, employee.faceRegistered ? 403 : 409, employee.faceRegistered ? 'Face does not match the registered face. Try again.' : 'Face is not registered. Register the employee face before checking in.');
}

function workflowResult(entry, employee, rules = {}) {
  const shiftStart = rules.shiftStart || employee.defaultShiftStart || '09:30';
  const shiftEnd = rules.shiftEnd || employee.defaultShiftEnd || '18:30';
  const checkIn = entry.checkIn ? new Date(entry.checkIn) : null;
  const checkOut = entry.checkOut ? new Date(entry.checkOut) : null;
  const checkInMinutes = checkIn ? checkIn.getHours() * 60 + checkIn.getMinutes() : null;
  const checkOutMinutes = checkOut ? checkOut.getHours() * 60 + checkOut.getMinutes() + (checkIn && checkOut.toDateString() !== checkIn.toDateString() ? 1440 : 0) : null;
  const startMinutes = timeToMinutes(shiftStart);
  const endMinutes = timeToMinutes(shiftEnd);
  const expectedEndMinutes = startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes ? endMinutes + 1440 : endMinutes;
  const weeklyOff = checkIn ? [0, 6].includes(checkIn.getDay()) : false;
  const holiday = Boolean(rules.holiday);
  const workMode = rules.workMode || entry.workMode || 'Office';
  const locationValidated = rules.locationValidated ?? (workMode !== 'Office' || Boolean(entry.location));
  const shiftValidated = startMinutes !== null && endMinutes !== null;
  const lateMinutes = checkInMinutes !== null && startMinutes !== null ? Math.max(0, checkInMinutes - startMinutes) : 0;
  const earlyCheckoutMinutes = checkOutMinutes !== null && expectedEndMinutes !== null ? Math.max(0, expectedEndMinutes - checkOutMinutes) : 0;
  const overtimeMinutes = checkOutMinutes !== null && expectedEndMinutes !== null ? Math.max(0, checkOutMinutes - expectedEndMinutes) : 0;
  const durationSeconds = checkIn && checkOut ? Math.max(0, Math.round((checkOut - checkIn) / 1000) - Number(entry.breakSeconds || 0)) : 0;
  const workingHours = Number((durationSeconds / 3600).toFixed(2));
  const halfDay = Boolean(checkOut && workingHours < 4.5);
  const status = holiday ? 'Holiday' : weeklyOff ? 'Weekly Off' : workMode === 'Work From Home' ? 'Work From Home' : workMode === 'On Duty' ? 'On Duty' : !checkIn ? 'Absent' : !checkOut ? 'Missing Punch' : halfDay ? 'Half Day' : 'Present';
  return { ...entry, date: entry.date || checkIn?.toISOString().slice(0, 10), durationSeconds, workingHours, status, lateMinutes, earlyCheckoutMinutes, overtimeMinutes, shiftStart, shiftEnd, locationValidated, shiftValidated, workMode, holiday, weeklyOff, halfDay };
}

function parseShift(value) {
  const match = String(value || '').match(/(\d{1,2}:\d{2})\s*[-_]\s*(\d{1,2}:\d{2})/);
  return match ? { shiftStart: match[1].padStart(5, '0'), shiftEnd: match[2].padStart(5, '0') } : {};
}

function refreshAttendanceSummary(database, date) {
  const entries = (database.timeEntries || []).filter((entry) => entry.date === date);
  const employeeStates = new Map();
  entries.forEach((entry) => employeeStates.set(entry.employeeId, entry.status || (entry.checkIn ? 'Present' : 'Absent')));
  const states = [...employeeStates.values()];
  const day = attendanceDayState(new Date(`${date}T00:00:00`));
  const record = { date, present: states.filter((state) => ['Present', 'Work From Home', 'On Duty'].includes(state)).length, absent: states.filter((state) => state === 'Absent').length, leave: states.filter((state) => state === 'Holiday' || state === 'Weekly Off').length, halfDay: states.filter((state) => state === 'Half Day').length, late: entries.filter((entry) => entry.lateMinutes > 0).length, earlyCheckout: entries.filter((entry) => entry.earlyCheckoutMinutes > 0).length, overtime: entries.reduce((total, entry) => total + (entry.overtimeMinutes || 0), 0), missingPunch: states.filter((state) => state === 'Missing Punch').length, dayWindow: '00:00-12:00', finalizesAt: day.finalizeAt.toISOString(), finalized: day.finalized };
  database.attendance = (database.attendance || []).filter((item) => item.date !== date);
  database.attendance.unshift(record);
}

async function auditLog(userId, action, entity, entityId) {
  await query('INSERT INTO audit_logs (user_id,action_name,entity_type,entity_id) VALUES (?,?,?,?)', [userId || null, action, entity, entityId || null]);
}

function employeeDashboard(database, employeeId) {
  const employee = database.employees.find((item) => item.id === employeeId);
  if (!employee) return null;
  const timeEntries = database.timeEntries || [];
  const today = attendanceDayState().date;
  const todayEntries = timeEntries.filter((entry) => entry.employeeId === employeeId && entry.date === today);
  const activeEntry = todayEntries.slice().reverse().find((entry) => entry.checkIn && !entry.checkOut);
  const latestCompleted = todayEntries.slice().reverse().find((entry) => entry.checkIn && entry.checkOut);
  const workingSeconds = todayEntries.reduce((total, entry) => total + (entry.durationSeconds || (entry.checkIn && entry.checkOut ? Math.max(0, (new Date(entry.checkOut) - new Date(entry.checkIn)) / 1000) : entry.checkIn ? Math.max(0, (Date.now() - new Date(entry.checkIn)) / 1000) : 0)), 0);
  return {
    employee,
    today: { date: today, checkIn: activeEntry?.checkIn || latestCompleted?.checkIn || null, checkOut: activeEntry ? null : latestCompleted?.checkOut || null, workingSeconds, faceRegistered: Boolean(employee.faceRegistered) },
    attendance: timeEntries.filter((entry) => entry.employeeId === employeeId).slice(-10).reverse(),
    leaveRequests: database.leaveRequests.filter((request) => request.employeeId === employeeId),
    leaveBalance: { casual: 8, earned: 14, sick: 6 },
    payslip: { month: database.payroll.month, netPay: 92000, status: 'Available' },
    documents: [
      { name: 'Employment contract', status: 'Verified' },
      { name: 'Government ID', status: 'Verified' },
      { name: 'Tax declaration', status: 'Due 30 Sep 2026' }
    ]
  };
}

function dashboard(database, user) {
  const activeEmployees = database.employees.filter((employee) => employee.status === 'active').length;
  const today = database.attendance.find((item) => item.date === attendanceDayState().date) || { date: attendanceDayState().date, present: 0, absent: 0, leave: 0 };
  const pendingLeave = database.leaveRequests.filter((request) => request.status === 'pending');
  if (user?.role === 'employee') {
    const ownTime = (database.timeEntries || []).slice().reverse().find((entry) => entry.employeeId === user.employeeId && entry.date === today.date && entry.checkIn);
    const ownLeaves = database.leaveRequests.filter((request) => request.employeeId === user.employeeId);
    return {
      metrics: { totalEmployees: 1, present: ownTime?.checkIn ? 1 : 0, absent: ownTime?.checkIn ? 0 : 1, onLeave: ownLeaves.some((request) => request.status === 'approved' && request.startDate <= today.date && request.endDate >= today.date) ? 1 : 0, payroll: database.payroll },
      attendance: ownTime ? [ownTime] : [],
      leaveRequests: ownLeaves.map((request) => ({ ...request, employeeName: employeeName(database, request.employeeId) })),
      today: today.date,
      celebrations: database.celebrations.filter((item) => item.employeeId === user.employeeId).map((item) => ({ ...item, employeeName: employeeName(database, item.employeeId) }))
    };
  }
  return {
    metrics: { totalEmployees: activeEmployees, present: today.present, absent: today.absent, onLeave: today.leave, payroll: database.payroll },
    attendance: database.attendance,
    today: today.date,
    leaveRequests: pendingLeave.map((request) => ({ ...request, employeeName: employeeName(database, request.employeeId) })),
    approvedLeaves: database.leaveRequests.filter((request) => request.status === 'approved'),
    celebrations: database.celebrations.map((item) => ({ ...item, employeeName: employeeName(database, item.employeeId) }))
  };
}

function integrationStatus() {
  const checks = [
    ['llm', 'LLM_API_KEY'], ['firebase', 'FIREBASE_PROJECT_ID'], ['storage', 'AWS_S3_BUCKET'],
    ['payments', 'RAZORPAY_KEY_ID'], ['whatsapp', 'WHATSAPP_PHONE_NUMBER_ID']
  ];
  return Object.fromEntries(checks.map(([name, key]) => [name, { configured: Boolean(process.env[key]), env: key }]));
}

const permissionCatalog = {
  employee: ['view', 'create', 'edit', 'delete', 'export', 'import', 'documents.manage'],
  attendance: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'correct', 'export'],
  leave: ['view', 'apply', 'edit', 'cancel', 'approve', 'reject', 'manage_policy'],
  payroll: ['view', 'create', 'calculate', 'edit', 'approve', 'lock', 'generate_payslip', 'export'],
  documents: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  recruitment: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export'],
  reports: ['view', 'export'],
  user_access: ['view', 'create', 'edit', 'delete', 'manage']
};
const permissionModules = {
  employee: ['Employees', 'Employee Portal'], attendance: ['Attendance', 'Shift & Attendance'], leave: ['Leave'],
  payroll: ['Payroll'], documents: ['Documents'], recruitment: ['Recruitment', 'Hiring', 'Onboarding'],
  reports: ['Reports'], user_access: ['User Access']
};
const allPermissions = Object.entries(permissionCatalog).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`));
const rolePermissionSets = {
  super_admin: allPermissions,
  company_owner: allPermissions.filter((permission) => !permission.startsWith('user_access.')),
  hr_admin: allPermissions.filter((permission) => !permission.startsWith('payroll.') && !permission.startsWith('user_access.')),
  hr_executive: ['employee.view', 'employee.create', 'employee.edit', 'attendance.view', 'attendance.create', 'attendance.edit', 'leave.view', 'leave.apply', 'leave.edit', 'documents.view', 'documents.create', 'reports.view'],
  payroll_admin: ['employee.view', 'attendance.view', 'leave.view', 'payroll.view', 'payroll.create', 'payroll.calculate', 'payroll.edit', 'payroll.approve', 'payroll.lock', 'payroll.generate_payslip', 'payroll.export', 'reports.view', 'reports.export'],
  finance: ['employee.view', 'payroll.view', 'payroll.export', 'reports.view', 'reports.export'],
  department_head: ['employee.view', 'attendance.view', 'leave.view', 'leave.approve', 'leave.reject', 'reports.view'],
  manager: ['employee.view', 'attendance.view', 'leave.view', 'leave.approve', 'leave.reject', 'reports.view'],
  team_lead: ['employee.view', 'attendance.view', 'leave.view', 'leave.approve'],
  recruiter: ['employee.view', 'employee.create', 'employee.edit', 'recruitment.view', 'recruitment.create', 'recruitment.edit', 'recruitment.export'],
  employee: ['employee.view', 'attendance.view', 'attendance.create', 'attendance.correct', 'leave.view', 'leave.apply', 'leave.cancel', 'payroll.view', 'payroll.generate_payslip', 'documents.view'],
  auditor: ['reports.view', 'reports.export', 'employee.view', 'attendance.view', 'leave.view', 'payroll.view', 'documents.view']
};
const roleLabels = {
  super_admin: 'Super Admin', company_owner: 'Company Owner', hr_admin: 'HR Admin', hr_executive: 'HR Executive', payroll_admin: 'Payroll Admin',
  finance: 'Finance', department_head: 'Department Head', manager: 'Manager', team_lead: 'Team Lead', recruiter: 'Recruiter', employee: 'Employee', auditor: 'Auditor'
};
const roleModuleExtras = {
  super_admin: ['HR Setup', 'Departments', 'Performance', 'Expenses', 'Assets', 'Exit', 'Compliance', 'AI Automation'],
  company_owner: ['HR Setup', 'Departments', 'Performance', 'Expenses', 'Assets', 'Exit', 'Compliance', 'AI Automation'],
  hr_admin: ['HR Setup', 'Departments', 'Performance', 'Expenses', 'Assets', 'Exit', 'Compliance', 'AI Automation'],
  hr_executive: ['HR Setup', 'Departments'], payroll_admin: ['HR Setup'], finance: ['Expenses'],
  department_head: ['Departments', 'Performance'], manager: ['Performance', 'Expenses', 'Assets'], team_lead: ['Performance'], recruiter: ['HR Setup'], auditor: ['Compliance']
};
const roles = Object.fromEntries(Object.entries(roleLabels).map(([key, label]) => {
  const permissions = rolePermissionSets[key] || [];
  const modules = ['Overview', ...new Set([...permissions.flatMap((permission) => permissionModules[permission.split('.')[0]] || []), ...(roleModuleExtras[key] || [])])];
  return [key, { label, permissions, modules, actions: permissions }];
}));

function requestRole(request) {
  return request.user?.role || (roles[request.headers['x-user-role']] ? request.headers['x-user-role'] : 'super_admin');
}

function can(request, action) {
  const permissionAliases = { 'employee:create': 'employee.create', 'leave:approve': 'leave.approve', 'leave:create': 'leave.apply', 'payroll:manage': 'payroll.edit', 'documents:manage': 'documents.manage', 'workflow:manage': 'user_access.manage', 'attendance:check': 'attendance.create' };
  return roles[requestRole(request)].permissions.includes(permissionAliases[action] || action);
}

const moduleSpecs = {
  Company: { table: 'companies', columns: 'id,name,abbr,default_currency currency,country,is_group isGroup,enable_perpetual_inventory perpetualInventory,status', fields: { name: 'name', abbr: 'abbr', currency: 'default_currency', country: 'country', letterHead: 'letter_head', taxId: 'tax_id', domain: 'domain', establishmentDate: 'establishment_date', gstRate: 'gst_rate', parentCompany: 'parent_company', isGroup: 'is_group', holidayList: 'holiday_list', gstin: 'gstin', gstCategory: 'gst_category', perpetualInventory: 'enable_perpetual_inventory' }, required: ['name', 'abbr', 'currency', 'country'], action: 'workflow:manage' },
  'Site Office': { table: 'site_offices', columns: 'id,name,code,status', fields: { name: 'name', code: 'code' }, required: ['name'], action: 'workflow:manage' },
  'Shift Type': { table: 'shift_types', columns: 'id,name,holiday_list holidayList,start_time startTime,end_time endTime,roster_color rosterColor,enable_auto_attendance autoAttendance,allow_overtime allowOvertime,shift_type shiftType,grace_period_minutes gracePeriod,break_minutes breakMinutes,late_rule lateRule,early_checkout_rule earlyCheckoutRule,half_day_threshold halfDayThreshold,status', fields: { name: 'name', holidayList: 'holiday_list', startTime: 'start_time', endTime: 'end_time', rosterColor: 'roster_color', autoAttendance: 'enable_auto_attendance', allowOvertime: 'allow_overtime', shiftType: 'shift_type', gracePeriod: 'grace_period_minutes', breakMinutes: 'break_minutes', lateRule: 'late_rule', earlyCheckoutRule: 'early_checkout_rule', halfDayThreshold: 'half_day_threshold' }, required: ['name', 'startTime', 'endTime'], action: 'workflow:manage' },
  'Employee Group': { table: 'employee_groups', columns: 'id,name,code,status', fields: { name: 'name', code: 'code' }, action: 'workflow:manage' },
  'Employee Grade': { table: 'employee_grades', columns: 'id,name,level_name level,status', fields: { name: 'name', level: 'level_name' }, action: 'workflow:manage' },
  'Holiday List': { table: 'holiday_lists', columns: 'id,name,holiday_date holidayDate,description,status', fields: { name: 'name', holidayDate: 'holiday_date', description: 'description' }, action: 'workflow:manage' },
  'Leave Type': { table: 'leave_types', columns: 'id,name,annual_days annualDays,status', fields: { name: 'name', annualDays: 'annual_days' }, action: 'workflow:manage' },
  'Leave Period': { table: 'leave_periods', columns: 'id,name,start_date startDate,end_date endDate,status', fields: { name: 'name', startDate: 'start_date', endDate: 'end_date' }, action: 'workflow:manage' },
  'Leave Policy': { table: 'leave_policies', columns: 'id,name,description,status', fields: { name: 'name', description: 'description' }, action: 'workflow:manage' },
  'Leave Block List': { table: 'leave_block_lists', columns: 'id,name,start_date startDate,end_date endDate,reason,status', fields: { name: 'name', startDate: 'start_date', endDate: 'end_date', reason: 'reason' }, action: 'workflow:manage' },
  'HR Settings': { table: 'hr_settings', columns: 'id,setting_name name,setting_value value', fields: { name: 'setting_name', value: 'setting_value' }, action: 'workflow:manage' },
  'Payroll Settings': { table: 'payroll_settings', columns: 'id,setting_name name,setting_value value', fields: { name: 'setting_name', value: 'setting_value' }, action: 'workflow:manage' },
  'Daily Work Summary Group': { table: 'work_summary_groups', columns: 'id,name,description,status', fields: { name: 'name', description: 'description' }, action: 'workflow:manage' },
  'HR Setup': { table: 'departments', columns: 'id,name,code,status', fields: { name: 'name', code: 'code' }, action: 'workflow:manage' },
  Departments: { table: 'departments', columns: 'id,name,code,status', fields: { name: 'name', code: 'code' }, action: 'workflow:manage' },
  Designations: { table: 'designations', columns: 'id,name,level_name level,status', fields: { name: 'name', level: 'level_name' }, action: 'workflow:manage' },
  Recruitment: { table: 'job_openings', columns: 'id,title,department,openings,status', fields: { title: 'title', department: 'department', openings: 'openings' }, action: 'workflow:manage' },
  Hiring: { table: 'applicants', columns: 'id,name,email,pipeline_stage stage', fields: { name: 'name', email: 'email' }, action: 'workflow:manage' },
  Performance: { table: 'performance_goals', columns: 'id,employee_id employeeId,title,target,progress,status', fields: { employeeId: 'employee_id', title: 'title', target: 'target' }, action: 'workflow:manage' },
  Expenses: { table: 'expenses', columns: 'id,employee_id employeeId,category,amount,status', fields: { employeeId: 'employee_id', category: 'category', amount: 'amount' }, action: 'workflow:manage' },
  Assets: { table: 'assets', columns: 'id,asset_code assetCode,asset_type assetType,employee_id employeeId,status', fields: { assetCode: 'asset_code', assetType: 'asset_type', employeeId: 'employee_id' }, action: 'workflow:manage' },
  Onboarding: { table: 'employee_requests', columns: 'id,employee_id employeeId,request_type type,description,status', fields: { employeeId: 'employee_id', type: 'request_type', description: 'description' }, action: 'workflow:manage' },
  Exit: { table: 'employee_requests', columns: 'id,employee_id employeeId,request_type type,description,status', fields: { employeeId: 'employee_id', type: 'request_type', description: 'description' }, action: 'workflow:manage' },
  Compliance: { table: 'employee_requests', columns: 'id,employee_id employeeId,request_type type,description,status', fields: { employeeId: 'employee_id', type: 'request_type', description: 'description' }, action: 'workflow:manage' },
  'AI Automation': { table: 'employee_requests', columns: 'id,employee_id employeeId,request_type type,description,status', fields: { employeeId: 'employee_id', type: 'request_type', description: 'description' }, action: 'workflow:manage' },
  Documents: { table: 'documents', columns: 'id,employee_id employeeId,document_name name,document_status status', fields: { employeeId: 'employee_id', name: 'document_name' }, action: 'documents:manage' },
  Payroll: { table: 'payroll', columns: 'id,payroll_month month,total_amount total,due_in_days dueInDays', fields: {}, action: 'payroll:manage' },
  Reports: { table: 'audit_logs', columns: 'id,action_name action,entity_type entity,created_at createdAt', fields: {}, action: null },
  'Shift & Attendance': { table: 'attendance', columns: 'id,DATE_FORMAT(attendance_date, "%Y-%m-%d") date,present_count present,absent_count absent,leave_count `leave`', fields: {}, action: 'workflow:manage' }
  , 'Work Location': { table: 'work_locations', columns: 'id,name,location_type locationType,address,latitude,longitude,radius_meters radiusMeters,status', fields: { name: 'name', locationType: 'location_type', address: 'address', latitude: 'latitude', longitude: 'longitude', radiusMeters: 'radius_meters' }, required: ['name', 'locationType'], action: 'workflow:manage' }
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)));
}
async function verifyPassword(password, stored) { const [salt, hash] = stored.split(':'); const candidate = await hashPassword(password, salt); return crypto.timingSafeEqual(Buffer.from(candidate.split(':')[1], 'hex'), Buffer.from(hash, 'hex')); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function cookies(request) { return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((item) => item.trim().split('='))); }
async function ensureMasterAdmin() {
  const email = (process.env.MASTER_ADMIN_EMAIL || 'admin@northstar.local').toLowerCase();
  const password = process.env.MASTER_ADMIN_PASSWORD || 'Northstar@2026';
  const [existing] = await query('SELECT id FROM users WHERE email=?', [email]);
  if (existing.length) {
    await query('UPDATE users SET role="super_admin", employee_id=NULL WHERE email=?', [email]);
    return;
  }
  const passwordHash = await hashPassword(password);
  await query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', ['Master Admin', email, passwordHash, 'super_admin']);
  console.log(`Master Super Admin created: ${email}`);
}
function nextEmployeeId(database) {
  const highest = Math.max(0, ...(database.employees || []).map((employee) => Number(String(employee.id).match(/(\d+)$/)?.[1] || 0)));
  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

function employeeIdFromRows(rows) {
  const highest = Math.max(0, ...(rows || []).map((row) => Number(String(row.id).match(/(\d+)$/)?.[1] || 0)));
  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

async function ensureSequentialEmployeeIds() {
  const [rows] = await query('SELECT id FROM employees ORDER BY id');
  const mappings = rows.map((row, index) => ({ oldId: row.id, newId: `EMP-${String(index + 1).padStart(3, '0')}` })).filter((item) => item.oldId !== item.newId);
  if (!mappings.length) return;
  const references = ['time_entries', 'leave_requests', 'documents', 'celebrations', 'attendance_regularizations', 'expenses', 'assets', 'performance_goals', 'employee_requests', 'users'];
  await query('SET FOREIGN_KEY_CHECKS=0');
  try {
    for (const [index, mapping] of mappings.entries()) {
      const temporaryId = `EMP-MIG-${Date.now()}-${index}`;
      for (const table of references) await query(`UPDATE ${table} SET employee_id=? WHERE employee_id=?`, [temporaryId, mapping.oldId]);
      await query('UPDATE employees SET id=? WHERE id=?', [temporaryId, mapping.oldId]);
      mapping.temporaryId = temporaryId;
    }
    for (const mapping of mappings) {
      for (const table of references) await query(`UPDATE ${table} SET employee_id=? WHERE employee_id=?`, [mapping.newId, mapping.temporaryId]);
      await query('UPDATE employees SET id=? WHERE id=?', [mapping.newId, mapping.temporaryId]);
    }
  } finally {
    await query('SET FOREIGN_KEY_CHECKS=1');
  }
  console.log(`Normalized ${mappings.length} employee IDs to sequential EMP numbers`);
}
async function ensureRolePermissions() {
  for (const [role, definition] of Object.entries(roles)) {
    const [existing] = await query('SELECT permission_key permission FROM role_permissions WHERE role_key=?', [role]);
    if (!existing.length) {
      for (const permission of definition.permissions) await query('INSERT IGNORE INTO role_permissions (role_key,permission_key) VALUES (?,?)', [role, permission]);
    } else {
      const storedPermissions = existing.map((item) => item.permission);
      if (role === 'employee' && !storedPermissions.includes('attendance.correct')) { storedPermissions.push('attendance.correct'); await query('INSERT IGNORE INTO role_permissions (role_key,permission_key) VALUES (?,?)', [role, 'attendance.correct']); }
      roles[role].permissions = storedPermissions;
      roles[role].actions = roles[role].permissions;
      roles[role].modules = ['Overview', ...new Set([...roles[role].permissions.flatMap((permission) => permissionModules[permission.split('.')[0]] || []), ...(roleModuleExtras[role] || [])])];
    }
  }
}
async function ensureAttendanceDefaults() {
  const shifts = [
    ['General Shift', '09:30', '18:30', 'Regular'],
    ['Morning Shift', '06:00', '14:00', 'Morning'],
    ['Night Shift', '22:00', '06:00', 'Night']
  ];
  for (const shift of shifts) await query('INSERT IGNORE INTO shift_types (name,start_time,end_time,shift_type,grace_period_minutes,break_minutes,allow_overtime) VALUES (?,?,?,?,?,?,?)', [shift[0], shift[1], shift[2], shift[3], 0, 60, 1]);
  const locations = [['Office', 'Office'], ['Branch', 'Branch'], ['Remote', 'Remote'], ['Client site', 'Client site'], ['Field location', 'Field location']];
  for (const location of locations) await query('INSERT IGNORE INTO work_locations (name,location_type,radius_meters) VALUES (?,?,?)', [location[0], location[1], 200]);
}
async function currentUser(request) {
  const token = cookies(request).hrms_session;
  if (!token) return null;
  const [rows] = await query('SELECT u.id,u.name,u.email,u.role,u.employee_id employeeId FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > NOW()', [tokenHash(token)]);
  const user = rows[0];
  if (user?.role === 'employee') {
    if (!user.employeeId) {
      const [employees] = await query('SELECT id FROM employees WHERE user_id=? OR personal_email=? OR name=? ORDER BY CASE WHEN user_id=? THEN 0 WHEN personal_email=? THEN 1 ELSE 2 END LIMIT 1', [String(user.id), user.email, user.name, String(user.id), user.email]);
      if (employees[0]) user.employeeId = employees[0].id;
    }
    if (user.employeeId) {
      await query('UPDATE users SET employee_id=? WHERE id=? AND (employee_id IS NULL OR employee_id<>?)', [user.employeeId, user.id, user.employeeId]);
      await query('UPDATE employees SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id="")', [String(user.id), user.employeeId]);
    }
  }
  return user || null;
}

async function ensureEmployeeUserLinks() {
  const [rows] = await query('SELECT u.id userId,u.employee_id employeeId FROM users u WHERE u.employee_id IS NOT NULL');
  for (const row of rows) await query('UPDATE employees SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id="")', [String(row.userId), row.employeeId]);
  const [unlinked] = await query('SELECT u.id userId,e.id employeeId FROM users u JOIN employees e ON e.user_id=CAST(u.id AS CHAR) WHERE u.employee_id IS NULL');
  for (const row of unlinked) await query('UPDATE users SET employee_id=? WHERE id=?', [row.employeeId, row.userId]);
}

async function handleApi(request, response, url) {
  const database = await readDatabase();
  if (request.method === 'POST' && url.pathname === '/api/register') {
    const body = await requestBody(request);
    if (!body.name || !body.email || !body.password) return sendError(response, 400, 'name, email and password are required');
    const [existing] = await query('SELECT id FROM users WHERE email=?', [body.email.toLowerCase()]);
    if (existing.length) return sendError(response, 409, 'Email is already registered');
    const [count] = await query('SELECT COUNT(*) count FROM users');
    const role = count[0].count === 0 ? 'super_admin' : 'employee';
    const [employeeRows] = await query('SELECT id FROM employees ORDER BY id');
    const employeeId = employeeIdFromRows(employeeRows);
    await query('INSERT INTO employees (id,name,department,designation,status) VALUES (?,?,?,?,?)', [employeeId, body.name, 'General', 'Employee', 'active']);
    const passwordHash = await hashPassword(body.password);
    await query('INSERT INTO users (name,email,password_hash,role,employee_id) VALUES (?,?,?,?,?)', [body.name, body.email.toLowerCase(), passwordHash, role, employeeId]);
    return sendJson(response, 201, { message: role === 'super_admin' ? 'Account created as Super Admin' : 'Account created. Ask a Super Admin for your final role.' });
  }
  if (request.method === 'POST' && url.pathname === '/api/login') {
    const body = await requestBody(request);
    const [rows] = await query('SELECT id,name,email,password_hash,role,employee_id employeeId FROM users WHERE email=?', [(body.email || '').toLowerCase()]);
    if (!rows.length || !(await verifyPassword(body.password || '', rows[0].password_hash))) return sendError(response, 401, 'Invalid email or password');
    const token = crypto.randomBytes(32).toString('hex');
    await query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))', [tokenHash(token), rows[0].id]);
    response.setHeader('Set-Cookie', `hrms_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    delete rows[0].password_hash;
    return sendJson(response, 200, rows[0]);
  }
  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const token = cookies(request).hrms_session;
    if (token) await query('DELETE FROM sessions WHERE token_hash=?', [tokenHash(token)]);
    response.setHeader('Set-Cookie', 'hrms_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return sendJson(response, 200, { message: 'Logged out' });
  }
  if (request.method === 'GET' && url.pathname === '/api/permissions') return sendJson(response, 200, { catalog: permissionCatalog, permissions: allPermissions });
  if (request.method === 'GET' && url.pathname === '/api/roles') return sendJson(response, 200, roles);
  if (request.method === 'GET' && url.pathname === '/api/access') {
    const role = roles[url.searchParams.get('role')] ? url.searchParams.get('role') : 'super_admin';
    return sendJson(response, 200, { role, ...roles[role] });
  }
  request.user = await currentUser(request);
  if (request.method === 'GET' && url.pathname === '/api/me') return request.user ? sendJson(response, 200, request.user) : sendError(response, 401, 'Not logged in');
  if (!request.user && url.pathname !== '/api/database-status') return sendError(response, 401, 'Login required');
  if (request.method === 'GET' && url.pathname === '/api/search') {
    const term = (url.searchParams.get('q') || '').trim();
    if (term.length < 2) return sendJson(response, 200, []);
    const like = `%${term}%`;
    const searches = [
      ['SELECT id,name,department,designation,status FROM employees WHERE name LIKE ? OR id LIKE ? OR department LIKE ? OR designation LIKE ? LIMIT 8', [like, like, like, like], 'Employees', 'Employee'],
      ['SELECT id,name,abbr,country,status FROM companies WHERE name LIKE ? OR abbr LIKE ? OR country LIKE ? LIMIT 8', [like, like, like], 'Company', 'Company'],
      ['SELECT id,name,code,status FROM departments WHERE name LIKE ? OR code LIKE ? LIMIT 8', [like, like], 'Departments', 'Department'],
      ['SELECT id,name,level_name level,status FROM designations WHERE name LIKE ? OR level_name LIKE ? LIMIT 8', [like, like], 'Designations', 'Designation'],
      ['SELECT id,title,department,status FROM job_openings WHERE title LIKE ? OR department LIKE ? LIMIT 8', [like, like], 'Recruitment', 'Job Opening'],
      ['SELECT id,name,email,pipeline_stage stage FROM applicants WHERE name LIKE ? OR email LIKE ? LIMIT 8', [like, like], 'Hiring', 'Applicant']
    ];
    const results = [];
    for (const [sql, params, view, type] of searches) {
      if (!roles[request.user.role].modules.includes(view) && !(view === 'Designations' && roles[request.user.role].modules.includes('HR Setup'))) continue;
      const [rows] = await query(sql, params);
      rows.forEach((row) => results.push({ ...row, view, type, title: row.name || row.title, subtitle: row.email || row.department || row.code || row.designation || row.country || '' }));
    }
    return sendJson(response, 200, results.slice(0, 12));
  }
  const moduleMatch = url.pathname.match(/^\/api\/modules\/(.+)$/);
  if (moduleMatch) {
    const moduleName = decodeURIComponent(moduleMatch[1]);
    const spec = moduleSpecs[moduleName];
    if (!spec) return sendError(response, 404, 'Module data not found');
    const setupModule = ['Company', 'Site Office', 'Work Location', 'Employee Group', 'Employee Grade', 'Holiday List', 'Leave Type', 'Leave Period', 'Leave Policy', 'Leave Block List', 'HR Settings', 'Payroll Settings', 'Daily Work Summary Group', 'Designations'].includes(moduleName);
    const attendanceChild = moduleName === 'Shift Type' && roles[request.user.role].modules.includes('Shift & Attendance');
    if (!roles[request.user.role].modules.includes(moduleName) && !(setupModule && roles[request.user.role].modules.includes('HR Setup')) && !attendanceChild) return sendError(response, 403, 'Your role cannot view this module');
    if (request.method === 'GET') {
      const [rows] = await query(`SELECT ${spec.columns} FROM ${spec.table} ORDER BY id DESC LIMIT 100`);
      return sendJson(response, 200, rows);
    }
    if (request.method === 'POST') {
      if (spec.action && !can(request, spec.action)) return sendError(response, 403, 'Your role cannot manage this module');
      const body = await requestBody(request);
      if (!Object.keys(spec.fields).length) return sendError(response, 400, 'This module is read-only');
      if (moduleName === 'Site Office') body.name = String(body.name || body.siteOfficeName || '').trim();
      if (moduleName === 'Site Office' && !body.code) body.code = `OFF-${crypto.randomInt(1000, 9999)}`;
      const required = spec.required || Object.keys(spec.fields);
      if (required.some((field) => body[field] === undefined || body[field] === '')) return sendError(response, 400, 'All required fields must be provided');
      const entries = Object.entries(spec.fields).filter(([field]) => body[field] !== undefined && body[field] !== '');
      const columns = entries.map(([, column]) => column);
      const values = entries.map(([field]) => body[field]);
      if (spec.table === 'employee_requests') columns.push('status'), values.push('submitted');
      if (spec.table === 'job_openings') columns.push('status'), values.push('draft');
      const placeholders = columns.map(() => '?').join(',');
      const [result] = await query(`INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${placeholders})`, values);
      return sendJson(response, 201, { id: result.insertId, ...body, status: body.status || 'submitted' });
    }
  }
  if (request.method === 'PATCH' && url.pathname === '/api/me') {
    const body = await requestBody(request);
    if (!body.name || !body.email) return sendError(response, 400, 'name and email are required');
    const [existing] = await query('SELECT id FROM users WHERE email=? AND id<>?', [body.email.toLowerCase(), request.user.id]);
    if (existing.length) return sendError(response, 409, 'Email is already in use');
    await query('UPDATE users SET name=?,email=? WHERE id=?', [body.name, body.email.toLowerCase(), request.user.id]);
    if (request.user.employeeId) await query('UPDATE employees SET name=? WHERE id=?', [body.name, request.user.employeeId]);
    return sendJson(response, 200, { ...request.user, name: body.name, email: body.email.toLowerCase() });
  }
  if (request.method === 'GET' && url.pathname === '/api/users') {
    if (request.user.role !== 'super_admin') return sendError(response, 403, 'Super Admin access required');
    const [users] = await query('SELECT id,name,email,role,employee_id employeeId FROM users ORDER BY name'); return sendJson(response, 200, users);
  }
  if (request.method === 'POST' && url.pathname === '/api/users') {
    if (request.user.role !== 'super_admin') return sendError(response, 403, 'Super Admin access required');
    const body = await requestBody(request);
    if (!body.name || !body.email || !body.password || !roles[body.role]) return sendError(response, 400, 'Name, email, password and a valid role are required');
    const [existing] = await query('SELECT id FROM users WHERE email=?', [body.email.toLowerCase()]);
    if (existing.length) return sendError(response, 409, 'Email is already registered');
    const passwordHash = await hashPassword(body.password);
    const [result] = await query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', [body.name, body.email.toLowerCase(), passwordHash, body.role]);
    return sendJson(response, 201, { id: result.insertId, name: body.name, email: body.email.toLowerCase(), role: body.role, employeeId: null });
  }
  const roleMatch = url.pathname.match(/^\/api\/users\/(\d+)\/role$/);
  if (request.method === 'POST' && roleMatch) {
    if (request.user.role !== 'super_admin') return sendError(response, 403, 'Super Admin access required');
    const body = await requestBody(request); if (!roles[body.role]) return sendError(response, 400, 'Invalid role');
    await query('UPDATE users SET role=? WHERE id=?', [body.role, roleMatch[1]]); return sendJson(response, 200, { message: 'Role updated' });
  }
  const rolePermissionsMatch = url.pathname.match(/^\/api\/roles\/([a-z_]+)\/permissions$/);
  if (request.method === 'PUT' && rolePermissionsMatch) {
    if (request.user.role !== 'super_admin') return sendError(response, 403, 'Super Admin access required');
    const role = rolePermissionsMatch[1];
    const body = await requestBody(request);
    if (!roles[role] || !Array.isArray(body.permissions) || body.permissions.some((permission) => !allPermissions.includes(permission))) return sendError(response, 400, 'Invalid role or permission');
    roles[role].permissions = [...new Set(body.permissions)];
    roles[role].actions = roles[role].permissions;
    roles[role].modules = ['Overview', ...new Set([...roles[role].permissions.flatMap((permission) => permissionModules[permission.split('.')[0]] || []), ...(roleModuleExtras[role] || [])])];
    await query('DELETE FROM role_permissions WHERE role_key=?', [role]);
    for (const permission of roles[role].permissions) await query('INSERT INTO role_permissions (role_key,permission_key) VALUES (?,?)', [role, permission]);
    return sendJson(response, 200, roles[role]);
  }
  if (request.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(response, 200, dashboard(database, request.user));
  if (request.method === 'GET' && url.pathname === '/api/employees') {
    if (request.user.role === 'employee') return sendJson(response, 200, database.employees.filter((employee) => employee.id === request.user.employeeId));
    const [employees] = await query('SELECT id,name,user_id userId,department,designation,reports_to reportsTo,site_office siteOffice,status,company,grade,employment_type employmentType,face_registered faceRegistered FROM employees ORDER BY name');
    return sendJson(response, 200, employees);
  }
  const employeeDetailMatch = url.pathname.match(/^\/api\/employees\/([^/]+)$/);
  if (request.method === 'PATCH' && employeeDetailMatch) {
    if (!can(request, 'employee.edit')) return sendError(response, 403, 'Your role cannot edit employee details');
    const body = await requestBody(request);
    const fieldMap = { firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name', gender: 'gender', dateOfBirth: 'date_of_birth', dateOfJoining: 'date_of_joining', placeOfBirth: 'place_of_birth', nationality: 'nationality', company: 'company', siteOffice: 'site_office', reportsTo: 'reports_to', grade: 'grade', employmentType: 'employment_type', leaveApprovalWorkflow: 'leave_approval_workflow', attendanceDeviceId: 'attendance_device_id', defaultShift: 'default_shift', expenseApprover: 'expense_approver', userId: 'user_id', project: 'project', personalEmail: 'personal_email', mobile: 'mobile', currentAddress: 'current_address', permanentAddress: 'permanent_address', ctc: 'ctc', salaryCurrency: 'salary_currency', jobApplicant: 'job_applicant', offerDate: 'offer_date', contractEndDate: 'contract_end_date', noticeDays: 'notice_days', retirementDate: 'retirement_date', emergencyContact: 'emergency_contact', emergencyPhone: 'emergency_phone', payrollCostCenter: 'payroll_cost_center', panNumber: 'pan_number', aadhaarNumber: 'aadhaar_number', maritalStatus: 'marital_status', bloodGroup: 'blood_group', familyBackground: 'family_background', healthDetails: 'health_details', biography: 'biography', writtenLanguages: 'written_languages', spokenLanguages: 'spoken_languages', resignationDate: 'resignation_date', relievingDate: 'relieving_date', newWorkplace: 'new_workplace', reasonForLeaving: 'reason_for_leaving', exitFeedback: 'exit_feedback' };
    const entries = Object.entries(fieldMap).filter(([field]) => field !== 'userId' && body[field] !== undefined);
    if (!entries.length) return sendError(response, 400, 'No employee fields were provided');
    if (body.userId) {
      const [selectedUser] = await query('SELECT id,employee_id employeeId FROM users WHERE id=?', [body.userId]);
      if (!selectedUser.length) return sendError(response, 400, 'Selected user was not found');
      if (selectedUser[0].employeeId && selectedUser[0].employeeId !== employeeDetailMatch[1]) return sendError(response, 409, 'Selected user is already linked to another employee');
    }
    const assignments = entries.map(([, column]) => `${column}=?`);
    const values = entries.map(([field]) => body[field] === '' ? null : body[field]);
    if (body.userId) { assignments.push('user_id=?'); values.push(String(body.userId)); }
    values.push(employeeDetailMatch[1]);
    await query(`UPDATE employees SET ${assignments.join(',')} WHERE id=?`, values);
    if (body.userId) await query('UPDATE users SET employee_id=? WHERE id=?', [employeeDetailMatch[1], body.userId]);
    const [rows] = await query('SELECT * FROM employees WHERE id=?', [employeeDetailMatch[1]]);
    return rows[0] ? sendJson(response, 200, { ...rows[0], faceRegistered: Boolean(rows[0].face_registered), faceImage: rows[0].face_image, faceSignature: rows[0].face_signature }) : sendError(response, 404, 'Employee not found');
  }
  if (request.method === 'GET' && employeeDetailMatch) {
    if (!can(request, 'employee.view')) return sendError(response, 403, 'Your role cannot view employee details');
    if (request.user.role === 'employee' && request.user.employeeId !== employeeDetailMatch[1]) return sendError(response, 403, 'You can only view your own employee details');
    const employee = database.employees.find((item) => item.id === employeeDetailMatch[1]);
    if (!employee) return sendError(response, 404, 'Employee not found');
    if (process.env.DB_DRIVER === 'json' || !employeeDetailMatch[1]) return sendJson(response, 200, employee);
    const [rows] = await query('SELECT * FROM employees WHERE id=?', [employeeDetailMatch[1]]);
    if (!rows[0]) return sendError(response, 404, 'Employee not found');
    const detail = { ...rows[0], faceRegistered: Boolean(rows[0].face_registered), faceImage: rows[0].face_image, faceSignature: rows[0].face_signature };
    return sendJson(response, 200, detail);
  }
  if (request.method === 'GET' && url.pathname === '/api/leave-requests') {
    if (!can(request, 'leave.view')) return sendError(response, 403, 'Your role cannot view leave applications');
    const requests = database.leaveRequests
      .filter((item) => request.user.role !== 'employee' || item.employeeId === request.user.employeeId)
      .map((item) => ({ ...item, employeeName: employeeName(database, item.employeeId) }));
    return sendJson(response, 200, requests);
  }
  if (request.method === 'GET' && url.pathname === '/api/attendance-records') {
    if (!can(request, 'attendance.view')) return sendError(response, 403, 'Your role cannot view attendance');
    return sendJson(response, 200, database.attendance || []);
  }
  if (request.method === 'GET' && url.pathname === '/api/attendance-day') {
    const day = attendanceDayState();
    return sendJson(response, 200, { date: day.date, windowStart: '00:00', windowEnd: '12:00', finalizesAt: day.finalizeAt.toISOString(), finalized: day.finalized });
  }
  if (request.method === 'POST' && url.pathname === '/api/attendance-records') {
    if (!can(request, 'attendance.create') && !can(request, 'attendance.edit')) return sendError(response, 403, 'Your role cannot save attendance');
    const body = await requestBody(request);
    if (!body.date) return sendError(response, 400, 'Attendance date is required');
    const record = { date: body.date, present: Number(body.present || 0), absent: Number(body.absent || 0), leave: Number(body.leave || 0) };
    database.attendance = (database.attendance || []).filter((item) => item.date !== record.date);
    database.attendance.unshift(record);
    await writeDatabase(database);
    return sendJson(response, 201, record);
  }
  if (request.method === 'GET' && url.pathname === '/api/checkins') {
    if (!can(request, 'attendance.view')) return sendError(response, 403, 'Your role cannot view check-ins');
    const records = (database.timeEntries || []).filter((item) => request.user.role !== 'employee' || item.employeeId === request.user.employeeId).slice().reverse().map((item) => { const employee = database.employees.find((candidate) => candidate.id === item.employeeId) || {}; const logType = item.logType || (item.checkOut && !item.checkIn ? 'OUT' : 'IN'); return { ...workflowResult(item, employee), status: logType === 'OUT' ? 'Check-out' : item.status || workflowResult(item, employee).status, employeeName: employee.name || 'Unknown employee', logType }; });
    return sendJson(response, 200, records);
  }
  if (request.method === 'POST' && url.pathname === '/api/checkins') {
    if (!can(request, 'attendance.create')) return sendError(response, 403, 'Your role cannot create check-ins');
    const body = await requestBody(request);
    if (!body.employeeId || !body.time) return sendError(response, 400, 'Employee and time are required');
    if (request.user.role === 'employee' && request.user.employeeId !== body.employeeId) return sendError(response, 403, 'You can only create your own check-in');
    const employee = database.employees.find((item) => item.id === body.employeeId);
    if (!employee) return sendError(response, 404, 'Employee not found');
    if (!faceMatches(employee, body)) return faceError(response, employee);
    database.timeEntries ||= [];
    const time = new Date(body.time);
    const date = attendanceDayState(time).date;
    const parsedShift = parseShift(body.shift || employee.defaultShift);
    let locationValidated = body.workMode !== 'Office' || Boolean(body.location);
    if (body.locationId && body.latitude && body.longitude) {
      const [locations] = await query('SELECT latitude,longitude,radius_meters radiusMeters FROM work_locations WHERE id=? AND status="active"', [body.locationId]);
      const location = locations[0];
      locationValidated = Boolean(location && distanceMeters(Number(body.latitude), Number(body.longitude), Number(location.latitude), Number(location.longitude)) <= Number(location.radiusMeters || 200));
    }
    if (body.logType === 'BREAK_START' || body.logType === 'BREAK_END') {
      const open = database.timeEntries.slice().reverse().find((entry) => entry.employeeId === body.employeeId && entry.date === date && entry.checkIn && !entry.checkOut);
      if (!open) return sendError(response, 409, 'An active check-in is required for a break');
      if (body.logType === 'BREAK_START') open.breakStartedAt = time.toISOString();
      else if (!open.breakStartedAt) return sendError(response, 409, 'No active break found');
      else { open.breakSeconds = (open.breakSeconds || 0) + Math.max(0, Math.round((time - new Date(open.breakStartedAt)) / 1000)); delete open.breakStartedAt; Object.assign(open, workflowResult(open, employee, { ...parsedShift, workMode: body.workMode, locationValidated })); }
      const breakEvent = { id: `BREAK-${crypto.randomInt(1000, 9999)}`, employeeId: body.employeeId, date, logType: body.logType, checkIn: time.toISOString(), checkOut: null, durationSeconds: 0, breakSeconds: open.breakSeconds || 0, status: 'Break', workMode: body.workMode || 'Office' };
      database.timeEntries.push(breakEvent);
      refreshAttendanceSummary(database, date);
      await writeDatabase(database);
      return sendJson(response, 201, { ...breakEvent, employeeName: employee.name });
    }
    const item = { id: `TIME-${crypto.randomInt(1000, 9999)}`, employeeId: body.employeeId, date, checkIn: body.logType === 'OUT' ? null : time.toISOString(), checkOut: body.logType === 'OUT' ? time.toISOString() : null, durationSeconds: 0, logType: body.logType || 'IN', reason: body.reason || '', location: body.location || '', project: body.project || '', description: body.description || '', breakSeconds: Number(body.breakMinutes || 0) * 60, workMode: body.workMode || 'Office', faceImage: body.faceImage, faceVerified: true };
    const openEntry = item.logType === 'OUT' ? database.timeEntries.slice().reverse().find((entry) => entry.employeeId === body.employeeId && entry.date === date && entry.checkIn && !entry.checkOut) : null;
    if (openEntry) { openEntry.checkOut = item.checkOut; openEntry.breakSeconds = item.breakSeconds; }
    Object.assign(item, workflowResult(item, employee, { ...parsedShift, holiday: body.holiday, workMode: body.workMode, locationValidated }));
    if (openEntry) Object.assign(openEntry, workflowResult(openEntry, employee, { ...parsedShift, holiday: body.holiday, workMode: body.workMode, locationValidated }));
    database.timeEntries.push(item);
    refreshAttendanceSummary(database, date);
    await writeDatabase(database);
    return sendJson(response, 201, { ...item, employeeName: employee.name });
  }
  if (request.method === 'GET' && url.pathname === '/api/attendance-regularizations') {
    if (!can(request, 'attendance.view')) return sendError(response, 403, 'Your role cannot view regularization requests');
    const [requests] = await query('SELECT ar.id,ar.employee_id employeeId,e.name employeeName,DATE_FORMAT(ar.attendance_date, "%Y-%m-%d") attendanceDate,ar.original_entry_id originalEntryId,ar.requested_check_in requestedCheckIn,ar.requested_check_out requestedCheckOut,ar.reason,ar.status,ar.review_reason reviewReason,ar.created_at createdAt FROM attendance_regularizations ar JOIN employees e ON e.id=ar.employee_id WHERE ? OR ar.employee_id=? ORDER BY ar.created_at DESC', [request.user.role !== 'employee', request.user.employeeId]);
    return sendJson(response, 200, requests);
  }
  if (request.method === 'POST' && url.pathname === '/api/attendance-regularizations') {
    if (!can(request, 'attendance.correct')) return sendError(response, 403, 'Your role cannot request attendance corrections');
    const body = await requestBody(request);
    const employeeId = request.user.role === 'employee' ? request.user.employeeId : body.employeeId;
    if (!employeeId || !body.attendanceDate || !body.reason) return sendError(response, 400, 'Employee, attendance date, and reason are required');
    const entry = (database.timeEntries || []).slice().reverse().find((item) => item.employeeId === employeeId && item.date === body.attendanceDate);
    const id = `REG-${crypto.randomInt(1000, 9999)}`;
    await query('INSERT INTO attendance_regularizations (id,employee_id,attendance_date,original_entry_id,requested_check_in,requested_check_out,reason,requested_by) VALUES (?,?,?,?,?,?,?,?)', [id, employeeId, body.attendanceDate, entry?.id || null, body.checkIn ? new Date(body.checkIn) : null, body.checkOut ? new Date(body.checkOut) : null, body.reason, request.user.id]);
    await auditLog(request.user.id, 'attendance.regularization.requested', 'attendance_regularization', id);
    return sendJson(response, 201, { id, employeeId, attendanceDate: body.attendanceDate, reason: body.reason, status: 'pending' });
  }
  const regularizationMatch = url.pathname.match(/^\/api\/attendance-regularizations\/([^/]+)\/(approve|reject)$/);
  if (request.method === 'POST' && regularizationMatch) {
    if (!['super_admin', 'company_owner', 'hr_admin', 'department_head', 'manager'].includes(request.user.role)) return sendError(response, 403, 'Manager approval is required');
    const [rows] = await query('SELECT * FROM attendance_regularizations WHERE id=?', [regularizationMatch[1]]);
    const regularization = rows[0];
    if (!regularization) return sendError(response, 404, 'Regularization request not found');
    const body = await requestBody(request);
    const status = regularizationMatch[2] === 'approve' ? 'approved' : 'rejected';
    await query('UPDATE attendance_regularizations SET status=?,reviewed_by=?,reviewed_at=NOW(),review_reason=? WHERE id=?', [status, request.user.id, body.reviewReason || '', regularization.id]);
    if (status === 'approved' && regularization.original_entry_id) {
      const employee = database.employees.find((item) => item.id === regularization.employee_id) || {};
      const entry = (database.timeEntries || []).find((item) => item.id === regularization.original_entry_id);
      if (entry) {
        if (regularization.requested_check_in) entry.checkIn = new Date(regularization.requested_check_in).toISOString();
        if (regularization.requested_check_out) entry.checkOut = new Date(regularization.requested_check_out).toISOString();
        Object.assign(entry, workflowResult(entry, employee));
        refreshAttendanceSummary(database, regularization.attendance_date);
        await writeDatabase(database);
      }
    }
    await auditLog(request.user.id, `attendance.regularization.${status}`, 'attendance_regularization', regularization.id);
    return sendJson(response, 200, { id: regularization.id, status });
  }
  if (request.method === 'GET' && url.pathname === '/api/attendance-audit') {
    if (!can(request, 'attendance.view')) return sendError(response, 403, 'Your role cannot view attendance audit');
    const [logs] = await query('SELECT id,action_name action,entity_type entity,entity_id entityId,created_at createdAt FROM audit_logs WHERE entity_type="attendance_regularization" ORDER BY created_at DESC');
    return sendJson(response, 200, logs);
  }
  if (request.method === 'GET' && url.pathname === '/api/employee/me/dashboard') {
    if (!request.user.employeeId) return sendError(response, 400, 'No employee profile is linked to this user');
    const result = employeeDashboard(database, request.user.employeeId);
    return result ? sendJson(response, 200, result) : sendError(response, 404, 'Employee profile not found');
  }
  const employeeDashboardMatch = url.pathname.match(/^\/api\/employee\/([^/]+)\/dashboard$/);
  if (request.method === 'GET' && employeeDashboardMatch) {
    if (request.user.role === 'employee' && request.user.employeeId !== employeeDashboardMatch[1]) return sendError(response, 403, 'You can only view your own employee data');
    const result = employeeDashboard(database, employeeDashboardMatch[1]);
    return result ? sendJson(response, 200, result) : sendError(response, 404, 'Employee not found');
  }
  if (request.method === 'GET' && url.pathname === '/api/integrations') return sendJson(response, 200, integrationStatus());
  if (request.method === 'GET' && url.pathname === '/api/database-status') return sendJson(response, 200, databaseStatus());

  const attendanceMatch = url.pathname.match(/^\/api\/employee\/([^/]+)\/(check-in|check-out)$/);
  if (request.method === 'POST' && attendanceMatch) {
    if (!can(request, 'attendance:check')) return sendError(response, 403, 'Your role cannot manage attendance');
    if (request.user.role === 'employee' && request.user.employeeId !== attendanceMatch[1]) return sendError(response, 403, 'You can only manage your own attendance');
    const employee = database.employees.find((item) => item.id === attendanceMatch[1]);
    if (!employee) return sendError(response, 404, 'Employee not found');
    const body = await requestBody(request);
    if (!faceMatches(employee, body)) return faceError(response, employee);
    database.timeEntries ||= [];
    const today = attendanceDayState().date;
    let entry = database.timeEntries.slice().reverse().find((item) => item.employeeId === employee.id && item.date === today && item.checkIn && !item.checkOut);
    if (attendanceMatch[2] === 'check-in') { if (entry) return sendError(response, 409, 'Already checked in. Check out before starting another session'); entry = workflowResult({ id: `TIME-${crypto.randomInt(100, 999)}`, employeeId: employee.id, date: today, checkIn: new Date().toISOString(), checkOut: null, durationSeconds: 0, logType: 'IN', workMode: 'Office', faceImage: body.faceImage, faceVerified: true }, employee); database.timeEntries.push(entry); }
    else {
      if (!entry) return sendError(response, 409, 'No active check-in found');
      entry.checkOut = new Date().toISOString();
      Object.assign(entry, workflowResult(entry, employee));
      database.timeEntries.push({ id: `TIME-${crypto.randomInt(100, 999)}`, employeeId: employee.id, date: today, checkIn: null, checkOut: entry.checkOut, durationSeconds: 0, logType: 'OUT', project: entry.project || '', status: 'Check-out', workMode: entry.workMode || 'Office', faceImage: body.faceImage, faceVerified: true });
    }
    refreshAttendanceSummary(database, today);
    await writeDatabase(database);
    return sendJson(response, 200, entry);
  }

  const faceMatch = url.pathname.match(/^\/api\/employee\/([^/]+)\/register-face$/);
  if (request.method === 'POST' && faceMatch) {
    if (request.user.role === 'employee' && request.user.employeeId !== faceMatch[1]) return sendError(response, 403, 'You can only register your own face');
    const employee = database.employees.find((item) => item.id === faceMatch[1]);
    if (!employee) return sendError(response, 404, 'Employee not found');
    const body = await requestBody(request);
    if (!validFacePayload(body)) return sendError(response, 400, 'A compressed face image and face signature are required');
    employee.faceImage = body.faceImage;
    employee.faceSignature = body.faceSignature;
    employee.faceRegistered = true;
    await writeDatabase(database);
    return sendJson(response, 200, { faceRegistered: true, faceSignature: body.faceSignature });
  }

  const faceResetMatch = url.pathname.match(/^\/api\/employee\/([^/]+)\/reset-face$/);
  if (request.method === 'POST' && faceResetMatch) {
    if (request.user.role !== 'super_admin' && request.user.role !== 'hr_admin') return sendError(response, 403, 'HR Admin access required');
    const employee = database.employees.find((item) => item.id === faceResetMatch[1]);
    if (!employee) return sendError(response, 404, 'Employee not found');
    employee.faceRegistered = false;
    employee.faceImage = null;
    employee.faceSignature = null;
    await writeDatabase(database);
    return sendJson(response, 200, { faceRegistered: false });
  }

  if (request.method === 'POST' && url.pathname === '/api/employee/leave') {
    if (!can(request, 'leave:create')) return sendError(response, 403, 'Your role cannot create leave requests');
    const body = await requestBody(request);
    if (request.user.role === 'employee' && request.user.employeeId !== body.employeeId) return sendError(response, 403, 'You can only create leave for yourself');
    if (!body.employeeId || !body.type || !body.startDate || !body.endDate) return sendError(response, 400, 'employeeId, type, startDate and endDate are required');
    if (body.halfDay && !['First Half', 'Second Half'].includes(body.halfDaySession)) return sendError(response, 400, 'Select First Half or Second Half for a half-day leave');
    const item = { id: `LV-${crypto.randomInt(100, 999)}`, employeeId: body.employeeId, type: body.type, startDate: body.startDate, endDate: body.endDate, reason: body.reason || '', halfDay: Boolean(body.halfDay), halfDaySession: body.halfDay ? body.halfDaySession : null, postingDate: body.postingDate || new Date().toISOString().slice(0, 10), status: 'pending' };
    database.leaveRequests.push(item);
    await writeDatabase(database);
    return sendJson(response, 201, item);
  }

  if (request.method === 'POST' && url.pathname === '/api/employees') {
    if (!can(request, 'employee:create')) return sendError(response, 403, 'Your role cannot add employees');
    const body = await requestBody(request);
    if (body.name && !body.firstName) { body.firstName = body.name; body.gender = 'Other'; body.dateOfJoining = new Date().toISOString().slice(0, 10); body.company = body.company || 'Default'; body.siteOffice = body.siteOffice || 'Main Office'; body.employmentType = 'Full-time'; body.mobile = 'N/A'; }
    if (!body.firstName || !body.gender || !body.dateOfJoining || !body.company || !body.department || !body.designation || !body.siteOffice || !body.employmentType) return sendError(response, 400, 'First name, gender, joining date, company, department, designation, site office and employment type are required');
    if (!body.userId) return sendError(response, 400, 'A User Access account must be selected');
    const [selectedUser] = await query('SELECT id,employee_id employeeId FROM users WHERE id=?', [body.userId]);
    if (!selectedUser.length) return sendError(response, 400, 'Selected user was not found');
    if (selectedUser[0].employeeId) return sendError(response, 409, 'Selected user is already linked to an employee');
    const [employeeRows] = await query('SELECT id FROM employees ORDER BY id');
    const employee = { id: employeeIdFromRows(employeeRows), name: [body.firstName, body.middleName, body.lastName].filter(Boolean).join(' '), department: body.department, designation: body.designation, status: body.status || 'active' };
    const fieldMap = { firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name', gender: 'gender', dateOfBirth: 'date_of_birth', dateOfJoining: 'date_of_joining', placeOfBirth: 'place_of_birth', nationality: 'nationality', company: 'company', siteOffice: 'site_office', reportsTo: 'reports_to', grade: 'grade', employmentType: 'employment_type', leaveApprovalWorkflow: 'leave_approval_workflow', attendanceDeviceId: 'attendance_device_id', defaultShift: 'default_shift', expenseApprover: 'expense_approver', userId: 'user_id', project: 'project', personalEmail: 'personal_email', mobile: 'mobile', currentAddress: 'current_address', permanentAddress: 'permanent_address', ctc: 'ctc', salaryCurrency: 'salary_currency', jobApplicant: 'job_applicant', offerDate: 'offer_date', contractEndDate: 'contract_end_date', noticeDays: 'notice_days', retirementDate: 'retirement_date', emergencyContact: 'emergency_contact', emergencyPhone: 'emergency_phone', payrollCostCenter: 'payroll_cost_center', panNumber: 'pan_number', aadhaarNumber: 'aadhaar_number', maritalStatus: 'marital_status', bloodGroup: 'blood_group', familyBackground: 'family_background', healthDetails: 'health_details', biography: 'biography', writtenLanguages: 'written_languages', spokenLanguages: 'spoken_languages', resignationDate: 'resignation_date', relievingDate: 'relieving_date', newWorkplace: 'new_workplace', reasonForLeaving: 'reason_for_leaving', exitFeedback: 'exit_feedback' };
    const entries = Object.entries(fieldMap).filter(([field]) => body[field] !== undefined && body[field] !== '');
    const columns = ['id', 'name', 'department', 'designation', 'status', ...entries.map(([, column]) => column)];
    const values = [employee.id, employee.name, employee.department, employee.designation, employee.status, ...entries.map(([field]) => body[field])];
    await query(`INSERT INTO employees (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
    if (body.userId) {
      await query('UPDATE employees SET user_id=? WHERE id=?', [String(body.userId), employee.id]);
      await query('UPDATE users SET employee_id=? WHERE id=? AND employee_id IS NULL', [employee.id, body.userId]);
    }
    return sendJson(response, 201, { ...employee, ...body });
  }

  const leaveMatch = url.pathname.match(/^\/api\/leave\/([^/]+)\/(approve|reject)$/);
  if (request.method === 'POST' && leaveMatch) {
    if (!can(request, 'leave:approve')) return sendError(response, 403, 'Your role cannot approve leave');
    const requestItem = database.leaveRequests.find((item) => item.id === leaveMatch[1]);
    if (!requestItem) return sendError(response, 404, 'Leave request not found');
    requestItem.status = leaveMatch[2] === 'approve' ? 'approved' : 'rejected';
    await writeDatabase(database);
    return sendJson(response, 200, { ...requestItem, employeeName: employeeName(database, requestItem.employeeId) });
  }

  if (request.method === 'POST' && url.pathname === '/api/assistant') {
    const { question = '' } = await requestBody(request);
    const normalized = question.toLowerCase();
    if (request.user.role === 'employee') return sendJson(response, 200, { answer: 'You can ask about your attendance, leave balance, payslip, documents, or profile.' });
    if (normalized.includes('absent')) {
      const absent = database.employees.filter((employee) => employee.status === 'active').slice(0, database.attendance[0].absent).map((employee) => employee.name);
      return sendJson(response, 200, { answer: `${database.attendance[0].absent} employees are absent today: ${absent.join(', ')}.` });
    }
    if (normalized.includes('leave')) return sendJson(response, 200, { answer: `${database.attendance[0].leave} employees are on leave today, with ${database.leaveRequests.filter((item) => item.status === 'pending').length} requests awaiting approval.` });
    return sendJson(response, 200, { answer: 'I can currently answer questions about absence, attendance, and leave. Connect an LLM_API_KEY to enable broader HR policy questions.' });
  }
  sendError(response, 404, 'API route not found');
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    const fileName = publicFiles[url.pathname];
    if (!fileName && !url.pathname.includes('.')) return fs.readFile(path.join(__dirname, 'index.html')).then((content) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(content); });
    if (!fileName) return sendError(response, 404, 'Page not found');
    const filePath = path.join(__dirname, fileName);
    const content = await fs.readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[path.extname(fileName)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    sendError(response, error.message.includes('JSON') ? 400 : 500, error.message);
  }
}

connectDatabase(databasePath).then(ensureMasterAdmin).then(ensureSequentialEmployeeIds).then(ensureEmployeeUserLinks).then(ensureRolePermissions).then(ensureAttendanceDefaults).then(() => http.createServer(handleRequest).listen(port, () => console.log(`Northstar HRMS running at http://localhost:${port}`))).catch((error) => { console.error(`HRMS startup failed: ${error.message}`); process.exitCode = 1; });
