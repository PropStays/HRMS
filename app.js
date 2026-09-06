const toast = document.getElementById('toast');
const content = document.querySelector('.content-wrap');
const overviewMarkup = content.innerHTML;
let currentRole = 'super_admin';
let currentAccess = null;
let loggedInUser = null;
let portalEmployeeId = null;
let workTimer;
const breadcrumbParents = {
  Employees: 'HR Setup',
  'Employees New': 'Employees',
  Company: 'HR Setup', 'Site Office': 'HR Setup', Departments: 'HR Setup', Designations: 'HR Setup', 'Employee Group': 'HR Setup', 'Employee Grade': 'HR Setup', 'Holiday List': 'HR Setup', 'Leave Type': 'HR Setup', 'Leave Period': 'HR Setup', 'Leave Policy': 'HR Setup', 'Leave Block List': 'HR Setup', 'HR Settings': 'HR Setup', 'Payroll Settings': 'HR Setup', 'Daily Work Summary Group': 'HR Setup',
  'Leave Application': 'Leave', 'Compensatory Leave Request': 'Leave', 'Leave Allocation': 'Leave', 'Leave Policy Assignment': 'Leave', 'Leave Control Panel': 'Leave', 'Leave Encashment': 'Leave', 'Employee Leave Balance': 'Leave', 'Employee Leave Balance Summary': 'Leave',
  'Job Opening': 'Recruitment', 'Job Applicant': 'Recruitment', 'Interview Type': 'Recruitment', Interview: 'Recruitment', 'Interview Feedback': 'Recruitment', 'Appointment Letter': 'Recruitment', 'Appointment Letter Template': 'Recruitment', 'Recruitment Analytics': 'Recruitment'
};
const breadcrumbLabels = { Employees: 'Employee', 'Employees New': 'New Employee' };
breadcrumbParents['Shift Type'] = 'Shift & Attendance';
breadcrumbParents.Attendance = 'Shift & Attendance';
breadcrumbParents['Employee Checkin'] = 'Shift & Attendance';
breadcrumbParents['Work Location'] = 'HR Setup';
breadcrumbParents['Attendance Request'] = 'Shift & Attendance';
['Monthly Attendance Sheet', 'Recruitment Analytics', 'Employee Analytics', 'Employee Leave Balance', 'Employee Leave Balance Summary', 'Employee Advance Summary', 'Employee Exits', 'Employee Information', 'Employee Birthday', 'Employees working on a holiday', 'Daily Work Summary Replies'].forEach((view) => { breadcrumbParents[view] = 'HR Setup'; });
function viewSlug(view) { return view.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function updateBreadcrumb(view) {
  const parent = breadcrumbParents[view];
  const title = breadcrumbLabels[view] || view;
  const parentLabel = parent === 'Employees' ? 'Employee' : parent;
  const items = parent ? `<button class="breadcrumb-link" data-breadcrumb-view="${parent}">${parent}</button><b>/</b>` : '';
  document.querySelector('.breadcrumbs').innerHTML = `<button class="breadcrumb-link" data-breadcrumb-view="Overview">Workspace</button><b>/</b>${items.replace(`>${parent}<`, `>${parentLabel}<`)}<strong id="pageTitle">${title}</strong>`;
  document.querySelectorAll('[data-breadcrumb-view]').forEach((link) => link.addEventListener('click', () => renderView(link.dataset.breadcrumbView)));
}
function routePath(view) {
  if (view === 'Overview') return '/';
  if (view === 'Employees New') return '/hr-setup/employee/new';
  const parent = breadcrumbParents[view];
  return parent ? `/${viewSlug(parent)}/${viewSlug(view)}` : `/${viewSlug(view)}`;
}
function viewFromPath() {
  const path = window.location.pathname.replace(/^\//, '');
  if (!path) return 'Overview';
  if (path === 'hr-setup/employee/new') return 'Employees New';
  const views = ['HR Setup', 'Employees', 'Attendance', 'Employee Checkin', 'Attendance Request', 'Work Location', 'Leave', 'Leave Application', 'Payroll', 'Documents', 'Departments', 'Reports', 'Employee Portal', 'Recruitment', 'Shift & Attendance', 'Shift Type', 'User Access', 'Hiring', 'Onboarding', 'Performance', 'Expenses', 'Assets', 'Exit', 'Compliance', 'AI Automation', 'Company', 'Designations', 'Site Office', 'Employee Group', 'Employee Grade', 'Holiday List', 'Leave Type', 'Leave Period', 'Leave Policy', 'Leave Block List', 'HR Settings', 'Payroll Settings', 'Daily Work Summary Group', 'Monthly Attendance Sheet', 'Recruitment Analytics', 'Employee Analytics', 'Employee Leave Balance', 'Employee Leave Balance Summary', 'Employee Advance Summary', 'Employee Exits', 'Employee Information', 'Employee Birthday', 'Employees working on a holiday', 'Daily Work Summary Replies'];
  return views.find((view) => routePath(view).slice(1) === path) || 'Overview';
}
let searchTimer;
function bindGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const results = document.getElementById('searchResults');
  const search = async () => {
    const query = input.value.trim();
    if (query.length < 2) { results.innerHTML = ''; results.classList.remove('open'); return; }
    try {
      const matches = await api(`/api/search?q=${encodeURIComponent(query)}`);
      results.innerHTML = matches.length ? matches.map((match) => `<button class="search-result" data-search-view="${match.view}"><b>${match.title}</b><small>${match.type} · ${match.subtitle}</small></button>`).join('') : '<p class="search-empty">No matching records</p>';
      results.classList.add('open');
      results.querySelectorAll('[data-search-view]').forEach((item) => item.addEventListener('click', () => { results.classList.remove('open'); input.value = ''; renderView(item.dataset.searchView); }));
    } catch (error) { showToast(error.message); }
  };
  input.addEventListener('input', () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(search, 220); });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); results.querySelector('.search-result')?.click(); } if (event.key === 'Escape') { results.classList.remove('open'); input.blur(); } });
  document.addEventListener('click', (event) => { if (!event.target.closest('.global-search')) results.classList.remove('open'); });
}

function applyViewPermissions() {
  if (!currentAccess) return;
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => { item.hidden = !currentAccess.modules.includes(item.dataset.view); });
  document.querySelectorAll('.module-tile[data-module]').forEach((item) => { item.hidden = !currentAccess.modules.includes(item.dataset.module); });
  document.getElementById('addEmployee')?.toggleAttribute('hidden', !currentAccess.actions.includes('employee:create'));
}
const api = (path, options = {}) => fetch(path, { ...options, headers: { ...options.headers, 'x-user-role': currentRole } }).then(async (response) => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}
function initials(name) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2); }
function formatDate(value) { return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
function formatCurrency(value) { return `₹${(value / 100000).toFixed(1)}L`; }
function formatDuration(seconds) { const total = Math.max(0, Math.floor(seconds)); return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map((value) => String(value).padStart(2, '0')).join(':'); }

async function applyAccess(role) {
  if (loggedInUser && loggedInUser.role !== 'super_admin') role = loggedInUser.role;
  const access = await api(`/api/access?role=${role}`);
  const roleSelect = document.getElementById('roleSelect');
  if (!roleSelect.options.length) {
    const allRoles = await api('/api/roles');
    roleSelect.innerHTML = Object.entries(allRoles).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('');
  }
  roleSelect.value = access.role;
  currentRole = access.role;
  currentAccess = access;
  applyViewPermissions();
  document.getElementById('userName').textContent = currentRole === 'employee' ? (loggedInUser?.name || 'Employee') : currentRole === 'hr_manager' ? 'Maya Iyer' : 'Ananya Shah';
  document.getElementById('userRole').textContent = access.label;
  document.getElementById('employeePortal')?.querySelector('.avatar')?.replaceChildren();
  document.querySelector('.role-switcher').hidden = !loggedInUser || loggedInUser.role !== 'super_admin';
}

function renderDashboard(data) {
  const totalEmployees = Math.max(1, data.metrics.totalEmployees);
  const values = document.querySelectorAll('.metric-value');
  values[0].textContent = data.metrics.totalEmployees;
  values[1].innerHTML = `${data.metrics.present} <small>/ ${data.metrics.totalEmployees}</small>`;
  values[2].textContent = data.metrics.onLeave;
  values[3].textContent = formatCurrency(data.metrics.payroll.total);
  document.querySelector('.nav-item[data-view="Employees"] .nav-count').textContent = data.metrics.totalEmployees;
  document.querySelector('.nav-item[data-view="Leave"] .nav-count').textContent = data.leaveRequests.length;
  document.querySelector('.metric-card:nth-child(2) .metric-foot').innerHTML = `↗ ${((data.metrics.present / totalEmployees) * 100).toFixed(1)}% <span>attendance rate</span>`;
  document.querySelector('.metric-card:nth-child(3) .metric-foot').innerHTML = `<span>${((data.metrics.onLeave / totalEmployees) * 100).toFixed(1)}% of workforce</span>`;
  document.querySelector('.metric-card:nth-child(4) .metric-foot').innerHTML = `<span>Due in ${data.metrics.payroll.dueInDays} days</span>`;
  const dashboardDate = new Date(`${data.today}T00:00:00`);
  const longDate = dashboardDate.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const upperDate = longDate.toUpperCase();
  document.querySelector('.top-date').textContent = longDate;
  document.querySelector('.welcome-row .eyebrow').textContent = upperDate;
  document.querySelector('.select-button').firstChild.textContent = dashboardDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const chartBars = document.querySelector('.bars');
  const chartMax = Math.max(1, ...data.attendance.map((item) => item.present || 0));
  chartBars.innerHTML = data.attendance.slice(0, 31).reverse().map((item) => `<div class="bar-group"><b class="bar present-bar" style="height:${((item.present || 0) / chartMax) * 100}%"></b><b class="bar absent-bar" style="height:${((item.absent || 0) / chartMax) * 100}%"></b><b class="bar leave-bar" style="height:${((item.leave || 0) / chartMax) * 100}%"></b><small>${item.date.slice(-2)}</small></div>`).join('');
  const requestList = document.querySelector('.request-list');
  requestList.innerHTML = data.leaveRequests.length ? data.leaveRequests.map((request) => `<div class="request-row"><span class="avatar avatar-blue">${initials(request.employeeName)}</span><div class="request-name"><b>${request.employeeName}</b><small>${request.type} · ${formatDate(request.startDate)}</small></div><span class="status-pill pending">${request.status}</span><button class="row-more approve-leave" data-leave-id="${request.id}" aria-label="Approve ${request.employeeName}">✓</button></div>`).join('') : '<p class="empty-state">No pending requests.</p>';
  requestList.querySelectorAll('.approve-leave').forEach((button) => button.addEventListener('click', async () => {
    try { await api(`/api/leave/${button.dataset.leaveId}/approve`, { method: 'POST' }); await loadDashboard(); showToast('Leave request approved.'); } catch (error) { showToast(error.message); }
  }));
  const celebrations = document.querySelector('.birthdays-panel');
  celebrations.querySelectorAll('.birthday').forEach((item) => item.remove());
  data.celebrations.forEach((item) => { celebrations.insertAdjacentHTML('beforeend', `<div class="birthday"><span class="avatar avatar-pink">${initials(item.employeeName)}</span><div><b>${item.employeeName}</b><small>${item.kind} · ${formatDate(item.date)}</small></div><button class="wish-button">${item.kind === 'Birthday' ? 'Send wishes' : 'Congratulate'}</button></div>`); });
}
async function loadDashboard() { try { renderDashboard(await api('/api/dashboard')); } catch (error) { showToast(`Could not load HR data: ${error.message}`); } }

function bindOverview() {
  document.getElementById('addEmployee')?.addEventListener('click', async () => {
    const name = window.prompt('Employee name');
    if (!name) return;
    try { await api('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, department: 'New department', designation: 'New employee' }) }); await loadDashboard(); showToast(`${name} added to employees.`); } catch (error) { showToast(error.message); }
  });
  document.getElementById('askAssistant')?.addEventListener('click', askAssistant);
  document.getElementById('assistantInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') askAssistant(); });
  loadDashboard();
}
function updateOverviewGreeting() {
  const heading = document.querySelector('.welcome-row h1');
  const firstName = loggedInUser?.name?.trim().split(/\s+/)[0];
  if (heading && firstName) heading.firstChild.textContent = `Good morning, ${firstName} `;
}
async function askAssistant() {
  const input = document.getElementById('assistantInput');
  const question = input.value.trim();
  if (!question) { input.focus(); showToast('Try asking: Who is absent today?'); return; }
  try { const result = await api('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) }); input.value = ''; showToast(result.answer); } catch (error) { showToast(error.message); }
}

function legacyEmployeePortalMarkup(data) {
  const { employee, today, leaveRequests, leaveBalance, payslip, documents } = data;
  const checkedIn = Boolean(today.checkIn && !today.checkOut);
  const checkedOut = Boolean(today.checkOut);
  return `<section class="portal-header"><div><p class="eyebrow">EMPLOYEE SELF-SERVICE</p><h1>Welcome back, ${employee.name.split(' ')[0]} <span>✦</span></h1><p class="subhead">Everything you need for your workday, in one place.</p></div><span class="portal-badge">${employee.id}</span></section><section class="portal-grid"><article class="panel checkin-panel"><div class="portal-card-title"><div><h2>Today’s attendance</h2><p>${formatDate(today.date)} · ${employee.designation}</p></div><span class="metric-icon mint">◷</span></div><div class="time-status"><div><small>CHECK IN</small><b>${today.checkIn ? new Date(today.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</b></div><div class="time-arrow">→</div><div><small>CHECK OUT</small><b>${today.checkOut ? new Date(today.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</b></div></div><div class="checkin-actions"><button class="button primary" id="checkIn" ${checkedIn ? 'disabled' : ''}>${checkedIn ? 'Checked in' : 'Check in now'}</button><button class="button outline" id="checkOut" ${!checkedIn || checkedOut ? 'disabled' : ''}>${checkedOut ? 'Checked out' : 'Check out'}</button></div></article><article class="panel profile-panel"><div class="portal-card-title"><div><h2>My profile</h2><p>Personal workspace details</p></div><span class="avatar avatar-purple">${initials(employee.name)}</span></div><div class="profile-details"><span><small>NAME</small><b>${employee.name}</b></span><span><small>DEPARTMENT</small><b>${employee.department}</b></span><span><small>ROLE</small><b>${employee.designation}</b></span></div></article></section><section class="portal-grid lower-portal"><article class="panel leave-balance"><div class="panel-heading"><div><h2>Leave balance</h2><p>Available days this year</p></div><button class="button outline" id="requestLeave">Request leave</button></div><div class="balance-items"><div><b>${leaveBalance.casual}</b><span>Casual</span></div><div><b>${leaveBalance.earned}</b><span>Earned</span></div><div><b>${leaveBalance.sick}</b><span>Sick</span></div></div><div class="portal-subheading">Recent requests</div>${leaveRequests.length ? leaveRequests.map((item) => `<div class="portal-list-row"><span>${item.type}<small>${formatDate(item.startDate)}${item.endDate !== item.startDate ? ` – ${formatDate(item.endDate)}` : ''}</small></span><em class="status-pill ${item.status === 'pending' ? 'pending' : 'approved'}">${item.status}</em></div>`).join('') : '<p class="empty-state">No leave requests yet.</p>'}</article><article class="panel payslip-panel"><div class="panel-heading"><div><h2>Latest payslip</h2><p>${payslip.month}</p></div><span class="metric-icon blue">₹</span></div><div class="payslip-amount">₹${payslip.netPay.toLocaleString('en-IN')}<small>Net pay</small></div><button class="button outline full-button" id="downloadPayslip">Download payslip ↓</button><div class="portal-subheading">My documents</div>${documents.map((document) => `<div class="portal-list-row"><span>▤ ${document.name}</span><em class="doc-status">${document.status}</em></div>`).join('')}</article></section>`;
}

function formatAttendanceTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
}

function employeePortalMarkup(data) {
  const { employee, today, leaveRequests, leaveBalance } = data;
  const checkedIn = Boolean(today.checkIn && !today.checkOut);
  const action = checkedIn ? 'check-out' : 'check-in';
  const actionLabel = checkedIn ? 'Check out' : 'Check in';
  const actionDisabled = false;
  return `<section class="portal-header"><div><p class="eyebrow">EMPLOYEE SELF-SERVICE</p><h1>Welcome back, ${employee.name.split(' ')[0]}</h1><p class="subhead">Everything you need for your workday, in one place.</p></div><span class="portal-badge">${employee.id}</span></section><section class="portal-grid"><article class="panel checkin-panel"><div class="portal-card-title"><div><h2>Today's attendance</h2><p>${formatDate(today.date)} · ${employee.designation}</p></div><span class="metric-icon mint">◷</span></div><div class="portal-status"><span class="status-dot ${checkedIn ? 'live' : today.checkOut ? 'done' : ''}"></span><span>${checkedIn ? 'Currently working' : today.checkOut ? 'Day completed' : 'Not checked in'}</span></div><div class="checkin-actions"><button class="button primary" id="attendanceAction" data-action="${action}" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>${!employee.faceRegistered ? '<button class="button outline" id="registerMyFace">Register face</button>' : ''}</div></article><article class="panel profile-panel"><div class="portal-card-title"><div><h2>My profile</h2><p>Personal workspace details</p></div><span class="avatar avatar-purple">${initials(employee.name)}</span></div><div class="profile-details"><span><small>NAME</small><b>${employee.name}</b></span><span><small>DEPARTMENT</small><b>${employee.department}</b></span><span><small>ROLE</small><b>${employee.designation}</b></span></div></article></section><section class="portal-grid lower-portal"><article class="panel leave-balance"><div class="panel-heading"><div><h2>Leave balance</h2><p>Available days this year</p></div><button class="button outline" id="requestLeave">Request leave</button></div><div class="balance-items"><div><b>${leaveBalance.casual}</b><span>Casual</span></div><div><b>${leaveBalance.earned}</b><span>Earned</span></div><div><b>${leaveBalance.sick}</b><span>Sick</span></div></div><div class="portal-subheading">Recent requests</div>${leaveRequests.length ? leaveRequests.map((item) => `<div class="portal-list-row"><span>${item.type}<small>${formatDate(item.startDate)}${item.endDate !== item.startDate ? ` - ${formatDate(item.endDate)}` : ''}</small></span><em class="status-pill ${item.status === 'pending' ? 'pending' : 'approved'}">${item.status}</em></div>`).join('') : '<p class="empty-state">No leave requests yet.</p>'}</article><article class="panel portal-summary"><div class="panel-heading"><div><h2>Workday summary</h2><p>Live attendance details</p></div><span class="metric-icon blue">◷</span></div><div class="summary-list"><span><small>CHECK IN</small><b>${today.checkIn ? new Date(today.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</b></span><span><small>CHECK OUT</small><b>${today.checkOut ? new Date(today.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</b></span><span><small>WORKING HOURS</small><b>${formatDuration(today.workingSeconds || 0)}</b></span></div></article></section>`;
}

async function loadEmployeePortal() {
  try {
    const endpoint = loggedInUser?.role === 'employee' ? '/api/employee/me/dashboard' : '/api/employee/EMP-001/dashboard';
    const data = await api(endpoint);
    portalEmployeeId = data.employee.id;
    content.innerHTML = employeePortalMarkup(data);
    clearInterval(workTimer);
    const clock = document.createElement('div');
    clock.className = 'working-clock';
    clock.innerHTML = `<small>WORKING HOURS</small><b id="workingClock">${formatDuration(data.today.workingSeconds || 0)}</b>`;
    document.querySelector('.portal-card-title').after(clock);
    const attendanceAction = document.getElementById('attendanceAction');
    const baseWorkingSeconds = data.today.workingSeconds || 0;
    const loadedAt = Date.now();
    if (data.today.checkIn && !data.today.checkOut) { workTimer = setInterval(() => { const currentClock = document.getElementById('workingClock'); if (currentClock) currentClock.textContent = formatDuration(baseWorkingSeconds + (Date.now() - loadedAt) / 1000); }, 1000); }
    attendanceAction.addEventListener('click', () => updateAttendance(attendanceAction.dataset.action));
    document.getElementById('registerMyFace')?.addEventListener('click', async () => { if (await registerEmployeeFace(data.employee.id, data.employee.name)) await loadEmployeePortal(); });
    document.getElementById('requestLeave').addEventListener('click', requestLeave);
  } catch (error) { content.innerHTML = `<section class="empty-workspace panel"><div class="empty-illustration">!</div><h2>Employee Portal unavailable</h2><p>${error.message}</p><button class="button outline" onclick="renderView('Overview')">Return to overview</button></section>`; showToast(`Could not load employee portal: ${error.message}`); }
}
async function captureFace(employeeId, purpose = 'Verify face') {
  const modal = document.createElement('div');
  modal.className = 'face-capture-modal';
  modal.innerHTML = `<div class="face-capture-card"><div class="panel-heading"><div><h2>${purpose}</h2><p>Center the employee face in the camera.</p></div><button class="icon-button" id="closeFaceCapture" aria-label="Close">×</button></div><video id="faceVideo" autoplay playsinline></video><canvas id="faceCanvas" width="160" height="120" hidden></canvas><p class="face-capture-note" id="faceCaptureNote">Camera permission is required.</p><div class="company-form-actions"><button class="button outline" id="cancelFaceCapture">Cancel</button><button class="button primary" id="captureFaceButton">Capture</button></div></div>`;
  document.body.appendChild(modal);
  const video = modal.querySelector('#faceVideo');
  let stream;
  const close = () => { stream?.getTracks().forEach((track) => track.stop()); modal.remove(); };
  modal.querySelector('#closeFaceCapture').addEventListener('click', close);
  modal.querySelector('#cancelFaceCapture').addEventListener('click', close);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
  } catch (error) { modal.querySelector('#faceCaptureNote').textContent = 'Camera could not be opened. Check browser permission.'; return null; }
  return new Promise((resolve) => modal.querySelector('#captureFaceButton').addEventListener('click', () => {
    const canvas = modal.querySelector('#faceCanvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const signature = [];
    for (let row = 0; row < 12; row += 1) for (let column = 0; column < 16; column += 1) { const index = ((row * 10) * canvas.width + column * 10) * 4; signature.push(Math.round((pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 2.55)); }
    const faceImage = canvas.toDataURL('image/jpeg', 0.45);
    close();
    resolve({ faceImage, faceSignature: signature.join(',') });
  }));
}
async function registerEmployeeFace(employeeId, employeeName) {
  const face = await captureFace(employeeId, `Register face: ${employeeName}`);
  if (!face) return false;
  try { await api(`/api/employee/${employeeId}/register-face`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(face) }); showToast('Employee face registered.'); return true; } catch (error) { showToast(error.message); return false; }
}
async function updateAttendance(action) { try { const employeeId = portalEmployeeId || loggedInUser?.employeeId; if (!employeeId) { showToast('No employee profile is linked to this user.'); return; } const face = await captureFace(employeeId, action === 'check-in' ? 'Verify face for check-in' : 'Verify face for check-out'); if (!face) return; await api(`/api/employee/${employeeId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(face) }); await loadEmployeePortal(); showToast(action === 'check-in' ? 'You are checked in.' : 'You are checked out.'); } catch (error) { showToast(error.message); } }
async function requestLeave() {
  const type = window.prompt('Leave type', 'Casual leave');
  if (!type) return;
  try { const employeeId = portalEmployeeId || loggedInUser?.employeeId; if (!employeeId) { showToast('No employee profile is linked to this user.'); return; } await api('/api/employee/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, type, startDate: '2026-09-08', endDate: '2026-09-08' }) }); await loadEmployeePortal(); showToast('Leave request submitted.'); } catch (error) { showToast(error.message); }
}

function legacyGenericPage(view) {
  const copy = { Employees: ['Employee directory', 'Manage profiles, departments, roles, and onboarding.', 'Browse employees'], Attendance: ['Attendance', 'Review check-ins, absences, and work patterns.', 'Export attendance'], Leave: ['Leave approvals', 'Review and action requests from your team.', 'Set leave policy'], Payroll: ['Payroll center', 'Track salary runs, payslips, and payroll readiness.', 'Prepare payroll'], Documents: ['Documents', 'Keep employee records verified and current.', 'Upload document'], Departments: ['Departments & designations', 'Organize your workforce structure.', 'Add department'], Reports: ['Reports', 'Turn workforce activity into decisions.', 'Build report'], Recruitment: ['Recruitment', 'Move candidates from opening to offer in one pipeline.', 'Add job opening'], Hiring: ['Hiring', 'Move candidates through screening, interviews, offer, and joining.', 'Add candidate'], Onboarding: ['Onboarding', 'Complete documents, verification, assets, and joining checklists.', 'Start onboarding'], Performance: ['Performance', 'Manage goals, KPIs, reviews, ratings, and increments.', 'Create goal'], Expenses: ['Expenses', 'Submit, approve, and reimburse employee claims.', 'New expense'], Assets: ['Assets', 'Track assignment, acknowledgement, repair, and return.', 'Add asset'], Exit: ['Exit management', 'Run resignation, clearance, settlement, and exit letters.', 'Start exit'], Compliance: ['Compliance', 'Monitor policy, document expiry, statutory, and audit activity.', 'View alerts'], 'AI Automation': ['AI automation', 'Automate HR answers, letters, reminders, and summaries.', 'Create automation'], 'HR Setup': ['HR Setup', 'Configure the masters that power your people workflows.', 'Add master'], 'Shift & Attendance': ['Shift & Attendance', 'Plan shifts and monitor daily time across the workforce.', 'Create shift'], 'User Access': ['User Access', 'Assign roles and module permissions to every account.', 'Invite user'] }[view] || ['Workspace', 'This workspace is ready for your next action.', 'Create new'];
  const cards = { 'HR Setup': [['Setup', 'Company', 'Site office', 'Department', 'Designation'], ['Employee', 'Employee', 'Employee group', 'Employee grade'], ['Settings', 'HR settings', 'Payroll settings', 'Work summary group']], Recruitment: [['Openings', 'Job openings', 'Hiring pipeline', 'Interview schedule'], ['Candidates', 'Applicants', 'Shortlisted', 'Offer letters'], ['Reports', 'Recruitment analytics', 'Time to hire', 'Source performance']], 'Shift & Attendance': [['Shifts', 'Shift type', 'Shift location', 'Shift assignment', 'Shift schedule'], ['Attendance', 'Attendance', 'Employee check-in', 'Attendance requests'], ['Reports', 'Monthly attendance', 'Shift attendance', 'Hours utilization']] }[view];
  const moduleBody = cards ? `<div class="module-card-grid">${cards.map(([title, ...links]) => `<article class="module-card"><h3>${title}</h3>${links.map((link) => `<button onclick="showToast('${link} opened.')">${link}<span>↗</span></button>`).join('')}</article>`).join('')}</div>` : `<div class="empty-workspace"><div class="empty-illustration">✦</div><h2>${copy[0]} is connected</h2><p>Your shared HR data is ready here. Use the action above to continue building this workflow.</p><button class="button outline" onclick="renderView('Overview')">Return to overview</button></div>`;
  return `<section class="page-hero"><div><p class="eyebrow">NORTHSTAR MODULE</p><h1>${copy[0]}</h1><p class="subhead">${copy[1]}</p></div><button class="button primary" onclick="showToast('${copy[2]} flow opened.')">＋ ${copy[2]}</button></section>${moduleBody}`;
}

const dynamicModuleFields = {
  Company: ['name', 'abbr', 'currency', 'country', 'letterHead', 'taxId', 'domain', 'establishmentDate', 'gstRate', 'parentCompany', 'isGroup', 'holidayList', 'gstin', 'gstCategory', 'perpetualInventory'], 'Site Office': ['name', 'code'], 'Shift Type': ['name', 'holidayList', 'startTime', 'endTime', 'rosterColor', 'autoAttendance', 'allowOvertime', 'shiftType', 'gracePeriod', 'breakMinutes', 'lateRule', 'earlyCheckoutRule', 'halfDayThreshold'], 'Work Location': ['name', 'locationType', 'address', 'latitude', 'longitude', 'radiusMeters'], Departments: ['name', 'code'], Designations: ['name', 'level'], 'Employee Group': ['name', 'code'], 'Employee Grade': ['name', 'level'], 'Holiday List': ['name', 'holidayDate', 'description'], 'Leave Type': ['name', 'annualDays'], 'Leave Period': ['name', 'startDate', 'endDate'], 'Leave Policy': ['name', 'description'], 'Leave Block List': ['name', 'startDate', 'endDate', 'reason'], 'HR Settings': ['name', 'value'], 'Payroll Settings': ['name', 'value'], 'Daily Work Summary Group': ['name', 'description'], Recruitment: ['title', 'department', 'openings'], Hiring: ['name', 'email'], Performance: ['employeeId', 'title', 'target'], Expenses: ['employeeId', 'category', 'amount'], Assets: ['assetCode', 'assetType', 'employeeId'], Onboarding: ['employeeId', 'type', 'description'], Exit: ['employeeId', 'type', 'description'], Compliance: ['employeeId', 'type', 'description'], 'AI Automation': ['employeeId', 'type', 'description'], Documents: ['employeeId', 'name']
};
const dynamicModuleLabels = { 'HR Setup': 'HR Setup', Departments: 'Departments', Recruitment: 'Recruitment', Hiring: 'Hiring', Performance: 'Performance', Expenses: 'Expenses', Assets: 'Assets', Onboarding: 'Onboarding', Exit: 'Exit management', Compliance: 'Compliance', 'AI Automation': 'AI automation', Documents: 'Documents', Payroll: 'Payroll center', Reports: 'Reports', 'Shift & Attendance': 'Shift & Attendance' };
const dynamicModuleRequired = { 'Work Location': ['name', 'locationType'] };
function dynamicModulePage(view) {
  const fields = dynamicModuleFields[view] || [];
  const required = view === 'Company' ? ['name', 'abbr', 'currency', 'country'] : dynamicModuleRequired[view] || fields;
  const form = fields.length && view !== 'Company' ? `<form class="module-form" id="moduleForm">${fields.map((field) => field === 'locationType' ? `<label>${field}<select name="${field}" ${required.includes(field) ? 'required' : ''}><option value="">Select type</option><option>Office</option><option>Branch</option><option>Remote</option><option>Client site</option><option>Field location</option></select></label>` : `<label>${field}<input name="${field}" placeholder="${field}" ${required.includes(field) ? 'required' : ''}></label>`).join('')}<button class="button primary" type="submit">Save</button></form>` : '';
  const action = view === 'Company' ? '<button class="button primary" id="addCompany">＋ Add Company</button>' : '';
  return `<section class="page-hero"><div><p class="eyebrow">NORTHSTAR MODULE</p><h1>${dynamicModuleLabels[view] || view}</h1><p class="subhead">Live records from your HR workspace.</p></div>${action}</section><section class="panel module-workspace"><div class="module-toolbar"><h2>Records</h2>${form}</div><div class="admin-table" id="moduleTable"><p class="empty-state">Loading records...</p></div></section>`;
}
const reportViews = ['Monthly Attendance Sheet', 'Recruitment Analytics', 'Employee Analytics', 'Employee Leave Balance', 'Employee Leave Balance Summary', 'Employee Advance Summary', 'Employee Exits', 'Employee Information', 'Employee Birthday', 'Employees working on a holiday', 'Daily Work Summary Replies'];
const reportDescriptions = {
  'Monthly Attendance Sheet': 'Review present, absent, leave, and attendance totals by day.', 'Recruitment Analytics': 'Review hiring pipeline records and open positions.', 'Employee Analytics': 'Review employee totals grouped by department and status.', 'Employee Leave Balance': 'Review leave applications and current employee leave activity.', 'Employee Leave Balance Summary': 'Summarize leave requests by employee and status.', 'Employee Advance Summary': 'Review employee expense and advance records.', 'Employee Exits': 'Review exit and separation requests.', 'Employee Information': 'Browse employee profiles and workforce details.', 'Employee Birthday': 'Review upcoming workforce celebrations.', 'Employees working on a holiday': 'Review attendance records that fall on working holidays.', 'Daily Work Summary Replies': 'Review attendance and daily workforce summary data.'
};
async function loadReportPage(view) {
  let records = [];
  if (view === 'Monthly Attendance Sheet' || view === 'Employees working on a holiday' || view === 'Daily Work Summary Replies') records = await api('/api/attendance-records');
  else if (view === 'Employee Information' || view === 'Employee Analytics') records = await api('/api/employees');
  else if (view === 'Employee Leave Balance' || view === 'Employee Leave Balance Summary') records = await api('/api/leave-requests');
  else if (view === 'Employee Advance Summary') records = await api('/api/modules/Expenses');
  else if (view === 'Employee Exits') records = await api('/api/modules/Exit');
  else if (view === 'Employee Birthday') records = await api('/api/dashboard').then((data) => data.celebrations || []);
  else if (view === 'Recruitment Analytics') records = await api('/api/modules/Recruitment');
  const columns = records.length ? Object.keys(records[0]) : [];
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">HR SETUP / REPORTS</p><h1>${view}</h1><p class="subhead">${reportDescriptions[view]}</p></div><div class="report-actions"><button class="button outline" id="refreshReport">↻ Refresh</button><button class="button primary" id="exportReport">↓ Export</button></div></section><section class="panel report-panel"><div class="report-toolbar"><h2>Report data</h2><span>${records.length} records</span></div>${records.length ? `<div class="admin-table report-table"><div class="admin-table-head">${columns.map((column) => `<span>${column}</span>`).join('')}</div>${records.map((record) => `<div class="admin-table-row">${columns.map((column) => `<span>${record[column] ?? '-'}</span>`).join('')}</div>`).join('')}</div>` : '<p class="empty-state">No data available for this report yet.</p>'}</section>`;
  document.getElementById('refreshReport').addEventListener('click', () => loadReportPage(view));
  document.getElementById('exportReport').addEventListener('click', () => { const csv = [columns.join(','), ...records.map((record) => columns.map((column) => JSON.stringify(record[column] ?? '')).join(','))].join('\n'); const link = document.createElement('a'); link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; link.download = `${view.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`; link.click(); });
}
function companyForm() {
  const fields = dynamicModuleFields.Company;
  const required = ['name', 'abbr', 'currency', 'country'];
  return `<form class="company-form" id="companyForm"><div class="company-form-grid">${fields.map((field) => { const type = field === 'establishmentDate' ? 'date' : field === 'isGroup' || field === 'perpetualInventory' ? 'checkbox' : 'text'; return `<label class="${type === 'checkbox' ? 'checkbox-field' : ''}">${type === 'checkbox' ? `<input type="checkbox" name="${field}" value="1">` : `<input type="${type}" name="${field}" placeholder="${field}" ${required.includes(field) ? 'required' : ''}>`}<span>${field.replace(/([A-Z])/g, ' $1')}</span></label>`; }).join('')}</div><div class="company-form-actions"><button type="button" class="button outline" id="cancelCompany">Cancel</button><button class="button primary" type="submit">Save</button></div></form>`;
}
function masterForm(view) {
  const title = view === 'Departments' ? 'Department' : view === 'Designations' ? 'Designation' : 'Site Office';
  const fields = view === 'Departments' ? [['name', 'Department Name'], ['code', 'Department Code']] : view === 'Designations' ? [['name', 'Designation Name'], ['level', 'Level']] : [['name', 'Site Office Name']];
  return `<form class="master-form" id="masterForm"><div class="master-form-grid">${fields.map(([field, label]) => `<label>${label}<input name="${field}" required></label>`).join('')}</div><div class="company-form-actions"><button type="button" class="button outline" id="cancelMaster">Cancel</button><button class="button primary" type="submit">Save ${title}</button></div></form>`;
}
function shiftTypeForm() {
  return `<form class="master-form" id="shiftTypeForm"><div class="employee-form-grid"><label>Name *<input name="name" required></label><label>Holiday List<input name="holidayList"></label><label>Start Time *<input type="time" name="startTime" required></label><label>End Time *<input type="time" name="endTime" required></label><label>Roster Color<select name="rosterColor"><option>Blue</option><option>Green</option><option>Orange</option><option>Purple</option></select></label><label>Shift Type<select name="shiftType"><option>Regular</option><option>Morning</option><option>Night</option><option>Flexible</option></select></label><label>Grace Period (minutes)<input type="number" name="gracePeriod" min="0" value="0"></label><label>Break (minutes)<input type="number" name="breakMinutes" min="0" value="60"></label><label>Half-day Threshold (hours)<input type="number" step="0.5" name="halfDayThreshold" min="0" value="4.5"></label><label>Late Rules<select name="lateRule"><option>Mark Late</option><option>Ignore</option></select></label><label>Early Checkout Rules<select name="earlyCheckoutRule"><option>Mark Early</option><option>Ignore</option></select></label><label class="checkbox-field"><input type="checkbox" name="autoAttendance" value="1"><span>Enable Auto Attendance</span></label><label class="checkbox-field"><input type="checkbox" name="allowOvertime" value="1"><span>Allow Overtime</span></label></div><div class="company-form-actions"><button type="button" class="button outline" id="cancelShiftType">Cancel</button><button class="button primary" type="submit">Save Shift Type</button></div></form>`;
}
async function loadShiftTypePage() {
  const records = await api('/api/modules/Shift%20Type');
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / SHIFT TYPE</p><h1>Shift Type</h1><p class="subhead">Define working hours, attendance rules, and overtime settings.</p></div><button class="button primary" id="addShiftType">＋ Add Shift Type</button></section><section class="panel module-workspace"><div class="module-toolbar"><h2>Records</h2></div><div id="shiftTypeFormSlot"></div><div class="admin-table master-table shift-type-table"><div class="admin-table-head"><span>Name</span><span>Start Time</span><span>End Time</span><span>Grace</span><span>Break</span><span>Half Day</span><span>Overtime</span></div>${records.length ? records.map((record) => `<div class="admin-table-row"><span><b>${record.name}</b><small>${record.shiftType}</small></span><span>${record.startTime}</span><span>${record.endTime}</span><span>${record.gracePeriod || 0}m</span><span>${record.breakMinutes || 0}m</span><span>${record.halfDayThreshold || 4.5}h</span><span>${record.allowOvertime ? 'Allowed' : 'Not allowed'}</span></div>`).join('') : '<p class="empty-state">No shift types yet.</p>'}</div></section>`;
  document.getElementById('addShiftType').addEventListener('click', () => { document.getElementById('shiftTypeFormSlot').innerHTML = shiftTypeForm(); document.getElementById('addShiftType').hidden = true; bindShiftTypeForm(); });
}
function bindShiftTypeForm() {
  document.getElementById('cancelShiftType').addEventListener('click', loadShiftTypePage);
  document.getElementById('shiftTypeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    values.autoAttendance = event.target.elements.autoAttendance.checked ? 1 : 0;
    values.allowOvertime = event.target.elements.allowOvertime.checked ? 1 : 0;
    try { await api('/api/modules/Shift%20Type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast('Shift type saved.'); await loadShiftTypePage(); } catch (error) { showToast(error.message); }
  });
}
async function loadMasterPage(view) {
  const records = await api(`/api/modules/${encodeURIComponent(view)}`);
  const title = view === 'Departments' ? 'Department' : view === 'Designations' ? 'Designation' : 'Site Office';
  const columns = view === 'Departments' || view === 'Site Office' ? ['id', 'name', 'code', 'status'] : ['id', 'name', 'level', 'status'];
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">HR SETUP / ${title.toUpperCase()}</p><h1>${title}</h1><p class="subhead">Manage ${title.toLowerCase()} masters for employee records.</p></div><button class="button primary" id="addMaster">＋ Add ${title}</button></section><section class="panel module-workspace"><div class="module-toolbar"><h2>Records</h2></div><div id="masterFormSlot"></div><div class="admin-table master-table"><div class="admin-table-head">${columns.map((column) => `<span>${column}</span>`).join('')}</div>${records.length ? records.map((record) => `<div class="admin-table-row">${columns.map((column) => `<span>${record[column] ?? '-'}</span>`).join('')}</div>`).join('') : '<p class="empty-state">No records yet.</p>'}</div></section>`;
  document.getElementById('addMaster').addEventListener('click', () => { document.getElementById('masterFormSlot').innerHTML = masterForm(view); document.getElementById('addMaster').hidden = true; bindMasterForm(view); });
}
function bindMasterForm(view) {
  document.getElementById('cancelMaster').addEventListener('click', () => loadMasterPage(view));
  document.getElementById('masterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    if (view === 'Site Office') values.name = values.name?.trim();
    try { await api(`/api/modules/${encodeURIComponent(view)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast(`${view.slice(0, -1)} saved.`); await loadMasterPage(view); } catch (error) { showToast(error.message); }
  });
}
function userAccessForm(roleOptions) {
  return `<form class="master-form" id="userAccessForm"><div class="master-form-grid"><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><label>Role<select name="role">${roleOptions.map(([role, value]) => `<option value="${role}">${value.label}</option>`).join('')}</select></label></div><div class="company-form-actions"><button type="submit" class="button primary">Save User</button></div></form>`;
}
async function loadUserAccessPage() {
  const [users, allRoles, permissionData] = await Promise.all([api('/api/users'), api('/api/roles'), api('/api/permissions')]);
  const roleOptions = Object.entries(allRoles);
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">HR SETUP / USER ACCESS</p><h1>User Access</h1><p class="subhead">Control access through roles, permissions, modules, and actions.</p></div><button class="button primary" id="addUser">＋ Add User</button></section><section class="panel module-workspace access-workspace"><div class="access-tabs"><button class="access-tab active" data-access-tab="users">Users</button><button class="access-tab" data-access-tab="permissions">Roles & Permissions</button></div><div id="userFormSlot"></div><div id="accessPanel"></div></section>`;
  const panel = document.getElementById('accessPanel');
  const renderUsers = () => {
    panel.innerHTML = `<div class="module-toolbar"><h2>Users</h2><span class="access-summary">${users.length} accounts</span></div><div class="admin-table access-users"><div class="admin-table-head"><span>User</span><span>Email</span><span>Employee</span><span>Role</span></div>${users.map((user) => `<div class="admin-table-row"><span><b>${user.name}</b></span><span>${user.email}</span><span>${user.employeeId || 'Unassigned'}</span><select class="role-control" data-user-id="${user.id}">${roleOptions.map(([role, value]) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${value.label}</option>`).join('')}</select></div>`).join('')}</div>`;
    panel.querySelectorAll('.role-control').forEach((control) => control.addEventListener('change', async () => { try { await api(`/api/users/${control.dataset.userId}/role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: control.value }) }); showToast('User role updated.'); } catch (error) { showToast(error.message); } }));
  };
  const renderPermissions = () => {
    const role = document.getElementById('permissionRole')?.value || 'super_admin';
    const definition = allRoles[role];
    panel.innerHTML = `<div class="module-toolbar"><div><h2>Role permissions</h2><p class="access-summary">Permissions control API actions and visible modules.</p></div><select class="role-control" id="permissionRole">${roleOptions.map(([key, value]) => `<option value="${key}" ${key === role ? 'selected' : ''}>${value.label}</option>`).join('')}</select></div><div class="permission-grid">${Object.entries(permissionData.catalog).map(([module, actions]) => `<article class="permission-group"><h3>${module.replace(/_/g, ' ')}</h3>${actions.map((action) => { const permission = `${module}.${action}`; return `<label><input type="checkbox" data-permission="${permission}" ${definition.permissions.includes(permission) ? 'checked' : ''}><span>${action.replace(/_/g, ' ')}</span></label>`; }).join('')}</article>`).join('')}</div><div class="company-form-actions"><button class="button primary" id="savePermissions">Save permissions</button></div>`;
    document.getElementById('permissionRole').addEventListener('change', renderPermissions);
    document.getElementById('savePermissions').addEventListener('click', async () => { const permissions = [...panel.querySelectorAll('[data-permission]:checked')].map((input) => input.dataset.permission); try { await api(`/api/roles/${role}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }) }); showToast('Role permissions saved.'); } catch (error) { showToast(error.message); } });
  };
  renderUsers();
  document.querySelectorAll('[data-access-tab]').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('[data-access-tab]').forEach((item) => item.classList.toggle('active', item === tab)); if (tab.dataset.accessTab === 'permissions') renderPermissions(); else renderUsers(); }));
  document.getElementById('addUser').addEventListener('click', () => { document.getElementById('userFormSlot').innerHTML = userAccessForm(roleOptions); document.getElementById('addUser').hidden = true; document.getElementById('userAccessForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showToast('User saved.'); await loadUserAccessPage(); } catch (error) { showToast(error.message); } }); });
}
const setupGroups = {
  Setup: [['Company', 'Company'], ['Site Office', 'Site Office'], ['Work Location', 'Work Location'], ['Department', 'Departments'], ['Designation', 'Designations']],
  Employee: [['Employee', 'Employees'], ['Employee Group', 'Employee Group'], ['Employee Grade', 'Employee Grade']],
  Leaves: [['Leave Application', 'Leave'], ['Compensatory Leave Request', 'Leave']],
  Settings: [['HR Settings', 'HR Settings'], ['Payroll Settings', 'Payroll Settings'], ['Daily Work Summary Group', 'Daily Work Summary Group']],
  Attendance: [['Attendance', 'Attendance'], ['Attendance Request', 'Attendance Request'], ['Employee Checkin', 'Employee Checkin']],
  'Expense Claim': [['Expense Claim', 'Expenses'], ['Employee Advance', 'Expenses'], ['Travel Request', 'Expenses']],
  'Key Reports': [['Monthly Attendance Sheet', 'Monthly Attendance Sheet'], ['Recruitment Analytics', 'Recruitment Analytics'], ['Employee Analytics', 'Employee Analytics'], ['Employee Leave Balance', 'Employee Leave Balance'], ['Employee Leave Balance Summary', 'Employee Leave Balance Summary'], ['Employee Advance Summary', 'Employee Advance Summary'], ['Employee Exits', 'Employee Exits']],
  'Other Reports': [['Employee Information', 'Employee Information'], ['Employee Birthday', 'Employee Birthday'], ['Employees Working on a Holiday', 'Employees working on a holiday'], ['Daily Work Summary Replies', 'Daily Work Summary Replies']]
};
const leaveGroups = {
  Setup: [['Holiday List', 'Attendance'], ['Leave Type', 'HR Setup'], ['Leave Period', 'HR Setup'], ['Leave Policy', 'HR Setup'], ['Leave Block List', 'HR Setup']],
  Allocation: [['Leave Allocation', 'Leave'], ['Leave Policy Assignment', 'HR Setup'], ['Leave Control Panel', 'Leave'], ['Leave Encashment', 'Payroll']],
  Application: [['Leave Application', 'Leave'], ['Compensatory Leave Request', 'Employee Portal']],
  Reports: [['Employee Leave Balance', 'Employee Leave Balance'], ['Employee Leave Balance Summary', 'Employee Leave Balance Summary'], ['Employees working on a holiday', 'Employees working on a holiday']]
};
const recruitmentGroups = {
  Jobs: [['Staffing Plan', 'Recruitment'], ['Job Requisition', 'Recruitment'], ['Job Opening', 'Recruitment'], ['Job Applicant', 'Hiring'], ['Job Offer', 'Hiring'], ['Employee Referral', 'Hiring']],
  Interviews: [['Interview Type', 'Hiring'], ['Interview', 'Hiring'], ['Interview Feedback', 'Hiring']],
  Appointment: [['Appointment Letter Template', 'Documents'], ['Appointment Letter', 'Documents']],
  Reports: [['Recruitment Analytics', 'Recruitment']]
};
const shiftGroups = {
  Shifts: [['Shift Type', 'Shift Type'], ['Shift Location', 'Site Office'], ['Shift Assignment', 'Employees'], ['Shift Schedule', 'Attendance'], ['Shift Schedule Assignment', 'Attendance'], ['Shift Request', 'Attendance'], ['Shift Assignment Tool', 'Attendance']],
  Attendance: [['Attendance', 'Attendance'], ['Attendance Request', 'Attendance Request'], ['Employee Checkin', 'Employee Checkin'], ['Employee Attendance Tool', 'Attendance'], ['Upload Attendance', 'Attendance']],
  Time: [['Timesheet', 'Attendance'], ['Activity Type', 'Reports']],
  Overtime: [['Overtime Type', 'HR Setup'], ['Overtime Slip', 'Payroll']],
  Reports: [['Monthly Attendance Sheet', 'Attendance'], ['Shift Attendance', 'Shift & Attendance'], ['Employee Hours Utilization Based On Timesheet', 'Reports'], ['Project Profitability', 'Reports'], ['Employees working on a holiday', 'Attendance']]
};
function hrSetupPage() {
  return `<section class="page-hero"><div><p class="eyebrow">NORTHSTAR MODULE</p><h1>HR Setup</h1><p class="subhead">Configure people masters, policies, and workforce reports.</p></div></section><div class="setup-groups">${Object.entries(setupGroups).map(([title, links]) => `<article class="module-card setup-group"><h2>${title}</h2>${links.map(([label, target]) => `<button class="setup-link" data-setup-label="${label}" data-setup-target="${target}">${label}<span>↗</span></button>`).join('')}</article>`).join('')}</div>`;
}
function leavesPage(data) {
  const today = data.attendance?.[0]?.date || new Date().toISOString().slice(0, 10);
  const approvedLeaves = data.approvedLeaves || data.leaveRequests.filter((item) => item.status === 'approved');
  const todayLeave = approvedLeaves.filter((item) => item.startDate <= today && item.endDate >= today).length;
  const month = today.slice(0, 7);
  const monthLeave = approvedLeaves.filter((item) => item.startDate.slice(0, 7) === month).length;
  return `<section class="leave-summary"><article class="panel"><span>Employees on leave today</span><b>${todayLeave}</b></article><article class="panel"><span>Employees on leave this month</span><b>${monthLeave}</b></article><article class="panel"><span>Holidays in this month</span><b>0</b></article></section><h2 class="section-title">Masters & Reports</h2><div class="setup-groups leave-groups">${Object.entries(leaveGroups).map(([title, links]) => `<article class="module-card setup-group"><h2>${title}</h2>${links.map(([label, target]) => `<button class="setup-link" data-leave-target="${label}" data-setup-target="${target}">${label}<span>↗</span></button>`).join('')}</article>`).join('')}</div>`;
}
function leaveApplicationForm(employees, defaultEmployeeId = '') {
  const selectedEmployee = employees.find((item) => item.id === defaultEmployeeId) || employees[0];
  return `<form class="leave-application-form" id="leaveApplicationForm"><section class="leave-form-section"><div class="leave-form-grid"><label>Series *<input value="HR-LAP-.YYYY.-" readonly></label><label>Leave Type *<select name="type" required><option value="">Select leave type</option><option>Casual leave</option><option>Earned leave</option><option>Sick leave</option><option>Work from home</option></select></label><label>Employee *<select name="employeeId" required>${employees.map((item) => `<option value="${item.id}" ${item.id === selectedEmployee?.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label><label>Company *<input value="Acme India" readonly></label></div></section><section class="leave-form-section"><h3>Dates & Reason</h3><div class="leave-form-grid leave-dates-grid"><label>From Date *<input type="date" name="startDate" required></label><label class="reason-field">Reason *<textarea name="reason" required></textarea></label><label>To Date *<input type="date" name="endDate" required></label><div class="half-day-control"><label class="checkbox-field"><input type="checkbox" name="halfDay" value="1"><span>Half Day</span></label><label class="half-day-session" hidden>Half Day Session *<select name="halfDaySession"><option value="">Select session</option><option value="First Half">First Half</option><option value="Second Half">Second Half</option></select></label></div></div></section><section class="leave-form-section"><h3>Approval</h3><div class="leave-form-grid"><label>Posting Date *<input type="date" name="postingDate" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Status *<input value="Open" readonly></label></div></section><div class="company-form-actions"><button type="button" class="button outline" id="cancelLeaveApplication">Cancel</button><button type="submit" class="button primary">Save</button></div></form>`;
}
async function loadLeaveApplicationPage() {
  const [requests, employees] = await Promise.all([api('/api/leave-requests'), api('/api/employees')]);
  const render = (items) => `<section class="page-hero"><div><p class="eyebrow">LEAVES / LEAVE APPLICATION</p><h1>Leave Application</h1><p class="subhead">Apply, review, and track employee leave requests.</p></div><button class="button primary" id="addLeaveApplication">＋ Add Leave Application</button></section><section class="panel leave-list-panel"><div class="leave-filters"><input id="leaveSearch" placeholder="Search employee"><select id="leaveStatus"><option value="">All statuses</option><option>pending</option><option>approved</option><option>rejected</option></select><span id="leaveCount">${items.length} applications</span></div><div class="admin-table leave-application-table"><div class="admin-table-head"><span>Employee Name</span><span>Status</span><span>From Date</span><span>Total Leave Days</span><span>ID</span></div>${items.length ? items.map((item) => { const days = Math.max(1, Math.round((new Date(`${item.endDate}T00:00:00`) - new Date(`${item.startDate}T00:00:00`)) / 86400000) + 1) / (item.halfDay ? 2 : 1); return `<div class="admin-table-row" data-leave-row="${item.employeeName} ${item.status} ${item.id}"><span><b>${item.employeeName}</b><small>${item.type}${item.reason ? ` · ${item.reason}` : ''}</small></span><em class="status-pill ${item.status === 'pending' ? 'pending' : item.status === 'approved' ? 'approved' : 'rejected'}">${item.status}</em><span>${formatDate(item.startDate)}</span><span>${days}</span><span>${item.id}</span></div>`; }).join('') : '<p class="empty-state">No leave applications yet.</p>'}</div></section>`;
  content.innerHTML = render(requests);
  const filterRows = () => { const query = document.getElementById('leaveSearch').value.toLowerCase(); const status = document.getElementById('leaveStatus').value; let visible = 0; document.querySelectorAll('[data-leave-row]').forEach((row) => { const match = row.dataset.leaveRow.toLowerCase().includes(query) && (!status || row.dataset.leaveRow.includes(status)); row.hidden = !match; if (match) visible += 1; }); document.getElementById('leaveCount').textContent = `${visible} applications`; };
  document.getElementById('leaveSearch').addEventListener('input', filterRows);
  document.getElementById('leaveStatus').addEventListener('change', filterRows);
  document.getElementById('addLeaveApplication').addEventListener('click', () => { content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">LEAVES / LEAVE APPLICATION</p><h1>New Leave Application</h1><p class="subhead">Submit leave for an employee and send it for approval.</p></div></section><section class="panel leave-form-panel">${leaveApplicationForm(employees, loggedInUser?.employeeId || '')}</section>`; bindLeaveApplicationForm(() => loadLeaveApplicationPage()); });
}
function bindLeaveApplicationForm(onCancel) {
  document.getElementById('cancelLeaveApplication').addEventListener('click', onCancel);
  const form = document.getElementById('leaveApplicationForm');
  const halfDay = form.elements.halfDay;
  const sessionField = form.querySelector('.half-day-session');
  const session = form.elements.halfDaySession;
  halfDay.addEventListener('change', () => { sessionField.hidden = !halfDay.checked; session.required = halfDay.checked; if (!halfDay.checked) session.value = ''; });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.halfDay = halfDay.checked; if (values.halfDay && !values.halfDaySession) { session.focus(); showToast('Select First Half or Second Half.'); return; } try { await api('/api/employee/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast('Leave application saved.'); await onCancel(); } catch (error) { showToast(error.message); } });
}
function recruitmentPage() {
  return `<section class="interview-panel panel"><div class="panel-heading"><h2>Interviews (This Week)</h2><div class="panel-actions"><button class="icon-button" data-recruitment-action="refresh" aria-label="Refresh interviews">↻</button><button class="icon-button" data-recruitment-action="open" aria-label="Add interview">＋</button></div></div><div class="interview-empty">No interviews scheduled.</div><button class="list-button" data-recruitment-action="open">View List</button></section><h2 class="section-title">Masters & Reports</h2><div class="setup-groups recruitment-groups">${Object.entries(recruitmentGroups).map(([title, links]) => `<article class="module-card setup-group"><h2>${title}</h2>${links.map(([label, target]) => `<button class="setup-link" data-recruitment-target="${target}">${label}<span>↗</span></button>`).join('')}</article>`).join('')}</div>`;
}
function shiftAttendancePage(data) {
  const records = data.attendance || [];
  const max = Math.max(1, ...records.map((item) => Math.max(item.present || 0, item.absent || 0, item.leave || 0)));
  const chart = records.slice(0, 31).reverse().map((item) => `<div class="attendance-point"><i class="absent-point" style="height:${((item.absent || 0) / max) * 100}%"></i><i class="present-point" style="height:${((item.present || 0) / max) * 100}%"></i><i class="leave-point" style="height:${((item.leave || 0) / max) * 100}%"></i><small>${formatDate(item.date).split(' ')[0]}</small></div>`).join('');
  return `<section class="attendance-chart-panel panel"><div class="panel-heading"><h2>Attendance Count</h2><button class="icon-button" aria-label="Filter attendance">⌯</button></div><div class="attendance-chart"><div class="attendance-axis"><span>${max}</span><span>${Math.ceil(max / 2)}</span><span>0</span></div><div class="attendance-plot">${chart || '<p class="empty-state">No attendance records yet.</p>'}</div></div><div class="attendance-legend"><span><i class="absent-point"></i>Absent</span><span><i class="present-point"></i>Present</span><span><i class="leave-point"></i>Leave</span></div></section><h2 class="section-title">Masters & Reports</h2><div class="setup-groups shift-groups">${Object.entries(shiftGroups).map(([title, links]) => `<article class="module-card setup-group"><h2>${title}</h2>${links.map(([label, target]) => `<button class="setup-link" data-shift-target="${target}">${label}<span>↗</span></button>`).join('')}</article>`).join('')}</div>`;
}
const shiftSubmoduleDescriptions = {
  'Shift Location': 'Manage the offices and locations available for shift planning.', 'Shift Assignment': 'Review employees assigned to shifts and their current work details.', 'Shift Schedule': 'Review attendance against the active shift schedule.', 'Shift Schedule Assignment': 'Review employee and shift assignment coverage.', 'Shift Request': 'Review attendance and leave requests related to shift changes.', 'Shift Assignment Tool': 'Use employee records when assigning shifts in bulk.', 'Attendance Request': 'Review requests that affect attendance and leave records.', 'Employee Checkin': 'Open employee self-service check-in and check-out records.', 'Employee Attendance Tool': 'Review attendance totals and daily workforce status.', 'Upload Attendance': 'Review attendance records before connecting an import workflow.', Timesheet: 'Review recorded time entries for employee work sessions.', 'Activity Type': 'Review report activity and workforce records.', 'Overtime Type': 'Configure the HR masters used by overtime workflows.', 'Overtime Slip': 'Review payroll records used for overtime processing.', 'Monthly Attendance Sheet': 'Review attendance totals by day for the current period.', 'Employee Hours Utilization Based On Timesheet': 'Review attendance and time data used for utilization reporting.', 'Project Profitability': 'Review workforce reports used for project cost analysis.', 'Employees working on a holiday': 'Review attendance records for holiday work.'
};
async function loadShiftSubmodule(label, target) {
  if (!shiftSubmoduleDescriptions[label]) return renderView(target);
  let records = [];
  if (target === 'Employees') records = await api('/api/employees');
  else if (target === 'Attendance' || target === 'Leave' || target === 'Reports') {
    const dashboard = await api('/api/dashboard');
    records = target === 'Leave' ? dashboard.leaveRequests : target === 'Reports' ? dashboard.attendance : dashboard.attendance;
  } else if (target === 'Employee Checkin') records = await api('/api/checkins');
  else if (target === 'Employee Portal') return renderView(target);
  else if (target === 'HR Setup') return renderView(target);
  else if (target === 'Payroll' || target === 'Site Office' || target === 'Shift Type') records = await api(`/api/modules/${encodeURIComponent(target)}`);
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / SUBMODULE</p><h1>${label}</h1><p class="subhead">${shiftSubmoduleDescriptions[label]}</p></div><button class="button primary" id="openSubmodule">Open ${target}</button></section><section class="panel module-workspace"><div class="module-toolbar"><h2>Connected records</h2><span class="access-summary">${records.length} records</span></div><div class="admin-table submodule-table">${records.length ? `<div class="admin-table-head">${Object.keys(records[0]).map((column) => `<span>${column}</span>`).join('')}</div>${records.map((record) => `<div class="admin-table-row">${Object.keys(records[0]).map((column) => `<span>${record[column] ?? '-'}</span>`).join('')}</div>`).join('')}` : '<p class="empty-state">No connected records yet.</p>'}</div></section>`;
  document.getElementById('openSubmodule').addEventListener('click', () => renderView(target));
}
function bindShiftAttendance() {
  document.querySelectorAll('[data-shift-target]').forEach((link) => link.addEventListener('click', () => {
    const label = link.textContent.replace('↗', '').trim();
    if (label === 'Employee Checkin' || label === 'Attendance') return renderView(link.dataset.shiftTarget);
    if (reportViews.includes(label)) return renderView(label);
    loadShiftSubmodule(label, link.dataset.shiftTarget).catch((error) => showToast(error.message));
  }));
}
function bindRecruitment() {
  document.querySelectorAll('[data-recruitment-target]').forEach((link) => link.addEventListener('click', () => {
    if (reportViews.includes(link.textContent.replace('↗', '').trim())) { renderView(link.textContent.replace('↗', '').trim()); return; }
    if (link.dataset.recruitmentTarget === 'Recruitment') { content.innerHTML = dynamicModulePage('Recruitment'); loadDynamicModule('Recruitment'); return; }
    renderView(link.dataset.recruitmentTarget);
  }));
  document.querySelectorAll('[data-recruitment-action]').forEach((button) => button.addEventListener('click', () => renderView('Hiring')));
}
function bindHrSetup() {
  document.querySelectorAll('.setup-link:not([data-leave-target])').forEach((link) => link.addEventListener('click', () => reportViews.includes(link.dataset.setupLabel) ? renderView(link.dataset.setupLabel) : renderView(link.dataset.setupTarget)));
}
async function loadLeavesPage() {
  const data = await api('/api/dashboard');
  content.innerHTML = leavesPage(data);
  bindHrSetup();
  document.querySelectorAll('[data-leave-target]').forEach((link) => link.addEventListener('click', () => link.dataset.leaveTarget === 'Leave Application' ? loadLeaveApplicationPage() : reportViews.includes(link.dataset.leaveTarget) ? renderView(link.dataset.leaveTarget) : renderView(link.dataset.setupTarget)));
}
function loadRecruitmentPage() {
  content.innerHTML = recruitmentPage();
  bindRecruitment();
}
async function loadShiftAttendancePage() {
  const data = await api('/api/dashboard');
  content.innerHTML = shiftAttendancePage(data);
  bindShiftAttendance();
}
function attendanceForm() {
  return `<form class="attendance-entry-form" id="attendanceEntryForm"><div class="attendance-form-grid"><label>Series *<input value="HR-ATT-.YYYY.-" readonly></label><label>Attendance Date *<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Present *<input type="number" name="present" min="0" value="0" required></label><label>Absent *<input type="number" name="absent" min="0" value="0" required></label><label>On Leave *<input type="number" name="leave" min="0" value="0" required></label><label>Status *<select><option>Present</option><option>Absent</option></select></label><label class="wide-field">Description<textarea name="description"></textarea></label></div><div class="company-form-actions"><button type="button" class="button outline" id="cancelAttendance">Cancel</button><button type="submit" class="button primary">Save</button></div></form>`;
}
async function loadAttendancePage() {
  const records = await api('/api/attendance-records');
  const render = (items) => `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / ATTENDANCE</p><h1>Attendance</h1><p class="subhead">Record and review daily attendance totals.</p></div><button class="button primary" id="addAttendance">＋ Add Attendance</button></section><section class="panel attendance-list-panel"><div class="attendance-filters"><input id="attendanceSearch" placeholder="Search date"><span id="attendanceCount">${items.length} records</span></div><div class="admin-table attendance-record-table"><div class="admin-table-head"><span>Attendance Date</span><span>Present</span><span>Absent</span><span>Half Day</span><span>On Leave</span><span>Late</span><span>Early Checkout</span><span>Overtime</span></div>${items.length ? items.map((item) => `<div class="admin-table-row" data-attendance-row="${item.date}"><span><b>${formatDate(item.date)}</b><small>${item.date}</small></span><span>${item.present || 0}</span><span>${item.absent || 0}</span><span>${item.halfDay || 0}</span><span>${item.leave || 0}</span><span>${item.late || 0}</span><span>${item.earlyCheckout || 0}</span><span>${item.overtime || 0}m</span></div>`).join('') : '<p class="empty-state">No attendance records yet.</p>'}</div></section>`;
  content.innerHTML = render(records);
  document.getElementById('attendanceSearch').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll('[data-attendance-row]').forEach((row) => { row.hidden = !row.dataset.attendanceRow.includes(query); }); });
  document.getElementById('addAttendance').addEventListener('click', () => { content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / ATTENDANCE</p><h1>New Attendance</h1><p class="subhead">Record the daily attendance summary.</p></div></section><section class="panel attendance-form-panel">${attendanceForm()}</section>`; document.getElementById('cancelAttendance').addEventListener('click', loadAttendancePage); document.getElementById('attendanceEntryForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/api/attendance-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showToast('Attendance saved.'); await loadAttendancePage(); } catch (error) { showToast(error.message); } }); });
}
function checkinForm(employees, shifts, locations) {
  const shiftOptions = shifts.length ? shifts.map((item) => `<option value="${item.startTime} - ${item.endTime}">${item.name} (${item.startTime} - ${item.endTime})</option>`).join('') : '<option value="09:30 - 18:30">General Shift (09:30 - 18:30)</option>';
  return `<form class="checkin-form" id="checkinForm"><div class="checkin-form-grid"><label>Employee *<select name="employeeId" required>${employees.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}</select></label><label>Time *<input type="datetime-local" name="time" value="${new Date().toISOString().slice(0, 16)}" required></label><label>Log Type<select name="logType"><option>IN</option><option>OUT</option><option>BREAK_START</option><option>BREAK_END</option></select></label><label>Shift *<select name="shift" required>${shiftOptions}</select></label><label>Work Mode<select name="workMode"><option>Office</option><option>Work From Home</option><option>On Duty</option></select></label><label>Work Location<select name="locationId"><option value="">Select location</option>${locations.map((item) => `<option value="${item.id}">${item.name} (${item.locationType})</option>`).join('')}</select></label><label>Latitude<input type="number" step="any" name="latitude"></label><label>Longitude<input type="number" step="any" name="longitude"></label><label>Break Minutes<input type="number" name="breakMinutes" min="0" value="0"></label><label>Reason<textarea name="reason"></textarea></label><label>Project<input name="project"></label><label class="checkbox-field"><input type="checkbox" name="holiday" value="1"><span>Holiday</span></label><label class="wide-field">Description<textarea name="description"></textarea></label></div><div class="company-form-actions"><button type="button" class="button outline" id="cancelCheckin">Cancel</button><button type="submit" class="button primary">Save</button></div></form>`;
}
async function loadEmployeeCheckinPage() {
  const [records, employees, shifts, locations] = await Promise.all([api('/api/checkins'), api('/api/employees'), api('/api/modules/Shift%20Type'), api('/api/modules/Work%20Location')]);
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / EMPLOYEE CHECKIN</p><h1>Employee Checkin</h1><p class="subhead">Track employee IN and OUT events with time, location, and reason.</p></div><button class="button primary" id="addCheckin">＋ Add Employee Checkin</button></section><section class="panel checkin-list-panel"><div class="checkin-filters"><input id="checkinSearch" placeholder="Search employee"><span>${records.length} records</span></div><div class="admin-table checkin-record-table"><div class="admin-table-head"><span>Employee Name</span><span>Log Type</span><span>Time</span><span>Project</span></div>${records.length ? records.map((item) => `<div class="admin-table-row"><span><b>${item.employeeName}</b></span><span><em class="log-pill">${item.logType || 'IN'}</em></span><span>${item.checkIn || item.checkOut ? new Date(item.checkIn || item.checkOut).toLocaleString('en-IN') : '-'}</span><span>${item.project || '-'}</span></div>`).join('') : '<p class="empty-state">No check-in records yet.</p>'}</div></section>`;
  document.getElementById('checkinSearch').addEventListener('input', (event) => document.querySelectorAll('.checkin-record-table .admin-table-row').forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.toLowerCase()); }));
  document.getElementById('addCheckin').addEventListener('click', () => { content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / EMPLOYEE CHECKIN</p><h1>New Employee Checkin</h1><p class="subhead">Create an employee time event.</p></div></section><section class="panel checkin-form-panel">${checkinForm(employees, shifts, locations)}</section>`; document.getElementById('cancelCheckin').addEventListener('click', loadEmployeeCheckinPage); document.getElementById('checkinForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const values = Object.fromEntries(new FormData(event.target)); const face = await captureFace(values.employeeId, values.logType === 'OUT' ? 'Verify face for check-out' : 'Verify face for check-in'); if (!face) return; await api('/api/checkins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, ...face }) }); showToast('Employee checkin saved.'); await loadEmployeeCheckinPage(); } catch (error) { showToast(error.message); } }); });
}
function regularizationForm(employees) {
  return `<form class="regularization-form" id="regularizationForm"><div class="attendance-form-grid"><label>Employee *<select name="employeeId" required>${employees.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}</select></label><label>Attendance Date *<input type="date" name="attendanceDate" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Correct Check In<input type="datetime-local" name="checkIn"></label><label>Correct Check Out<input type="datetime-local" name="checkOut"></label><label class="wide-field">Reason *<textarea name="reason" required placeholder="Explain the missing punch or correction"></textarea></label></div><div class="company-form-actions"><button type="button" class="button outline" id="cancelRegularization">Cancel</button><button type="submit" class="button primary">Request Correction</button></div></form>`;
}
async function loadRegularizationPage() {
  const [requests, employees] = await Promise.all([api('/api/attendance-regularizations'), api('/api/employees')]);
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">SHIFT & ATTENDANCE / ATTENDANCE REQUEST</p><h1>Attendance Regularization</h1><p class="subhead">Request corrections for missing punches and keep every approval decision auditable.</p></div><button class="button primary" id="addRegularization">＋ Request Correction</button></section><section class="panel regularization-panel"><div class="module-toolbar"><h2>Correction requests</h2><span class="access-summary">${requests.length} requests</span></div><div id="regularizationFormSlot"></div><div class="admin-table regularization-table"><div class="admin-table-head"><span>Employee</span><span>Date</span><span>Reason</span><span>Status</span><span>Review</span></div>${requests.length ? requests.map((item) => `<div class="admin-table-row"><span><b>${item.employeeName}</b><small>${item.id}</small></span><span>${formatDate(item.attendanceDate)}</span><span>${item.reason}</span><span><em class="status-pill ${item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending'}">${item.status}</em></span><span>${item.status === 'pending' && ['super_admin', 'company_owner', 'hr_admin', 'department_head', 'manager'].includes(loggedInUser?.role) ? `<button class="row-action approve-regularization" data-id="${item.id}" data-action="approve">Approve</button><button class="row-action reject-regularization" data-id="${item.id}" data-action="reject">Reject</button>` : item.reviewReason || '-'}</span></div>`).join('') : '<p class="empty-state">No regularization requests yet.</p>'}</div></section>`;
  document.getElementById('addRegularization').addEventListener('click', () => { document.getElementById('regularizationFormSlot').innerHTML = regularizationForm(employees); document.getElementById('addRegularization').hidden = true; document.getElementById('cancelRegularization').addEventListener('click', loadRegularizationPage); document.getElementById('regularizationForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/api/attendance-regularizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showToast('Correction request submitted.'); await loadRegularizationPage(); } catch (error) { showToast(error.message); } }); });
  document.querySelectorAll('.row-action').forEach((button) => button.addEventListener('click', async () => { const reviewReason = window.prompt(`${button.dataset.action === 'approve' ? 'Approval' : 'Rejection'} note`, 'Reviewed by manager'); try { await api(`/api/attendance-regularizations/${button.dataset.id}/${button.dataset.action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewReason }) }); showToast(`Request ${button.dataset.action}d.`); await loadRegularizationPage(); } catch (error) { showToast(error.message); } }));
}
async function loadDynamicModule(view) {
  const records = await api(`/api/modules/${encodeURIComponent(view)}`);
  const table = document.getElementById('moduleTable');
  if (view === 'Company') {
    document.getElementById('addCompany')?.addEventListener('click', () => { document.querySelector('.module-toolbar').insertAdjacentHTML('afterend', companyForm()); document.getElementById('addCompany').hidden = true; bindCompanyForm(); });
  }
  const form = document.getElementById('moduleForm');
  if (form && !form.dataset.bound) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    try { await api(`/api/modules/${encodeURIComponent(view)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast('Record created.'); await loadDynamicModule(view); event.target.reset(); } catch (error) { showToast(error.message); }
  }), form.dataset.bound = 'true';
  if (!records.length) { table.innerHTML = '<p class="empty-state">No records yet.</p>'; return; }
  const columns = Object.keys(records[0]);
  table.innerHTML = `<div class="admin-table-head">${columns.map((column) => `<span>${column}</span>`).join('')}</div>${records.map((record) => `<div class="admin-table-row">${columns.map((column) => `<span>${record[column] ?? '-'}</span>`).join('')}</div>`).join('')}`;
}
function bindCompanyForm() {
  document.getElementById('cancelCompany')?.addEventListener('click', () => document.getElementById('companyForm').remove());
  document.getElementById('companyForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    ['isGroup', 'perpetualInventory'].forEach((field) => { values[field] = event.target.elements[field].checked ? 1 : 0; });
    try { await api('/api/modules/Company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast('Company saved.'); await loadAdminPage('Company'); } catch (error) { showToast(error.message); }
  });
}
function optionList(items, valueKey = 'name', labelKey = 'name') {
  return items.map((item) => `<option value="${item[valueKey] || ''}">${item[labelKey] || item[valueKey] || ''}</option>`).join('');
}
function employeeForm(data) {
  const { companies, departments, designations, offices, grades, shifts = [] } = data;
  const tabs = [['Overview', 'overview'], ['Joining', 'joining'], ['Address & Contacts', 'contact'], ['Attendance & Leaves', 'attendance'], ['Salary', 'salary'], ['Personal Details', 'personal'], ['Profile', 'profile'], ['Exit', 'exit']];
  return `<section class="employee-form panel"><div class="form-tabs">${tabs.map(([label, target], index) => `<button type="button" class="${index === 0 ? 'active' : ''}" data-form-tab="${target}">${label}</button>`).join('')}</div><form id="employeeForm"><div class="employee-form-section" data-form-section="overview"><h2>Overview</h2><div class="employee-form-grid"><label>First Name *<input name="firstName" required></label><label>Middle Name<input name="middleName"></label><label>Last Name<input name="lastName"></label><label>Gender *<select name="gender" required><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Date of Birth<input type="date" name="dateOfBirth"></label><label>Place of Birth<input name="placeOfBirth"></label><label>Date of Joining *<input type="date" name="dateOfJoining" required></label><label>Status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label>Nationality<input name="nationality" value="Indian"></label><label>Project<input name="project"></label></div></div><div class="employee-form-section" data-form-section="joining"><h2>Joining Details</h2><div class="employee-form-grid"><label>Job Applicant<input name="jobApplicant"></label><label>Offer Date<input type="date" name="offerDate"></label><label>Contract End Date<input type="date" name="contractEndDate"></label><label>Notice (days)<input type="number" name="noticeDays" min="0"></label><label>Date of Retirement<input type="date" name="retirementDate"></label></div></div><div class="employee-form-section" data-form-section="contact"><h2>Address & Contacts</h2><div class="employee-form-grid"><label>Mobile *<input name="mobile" required></label><label>Personal Email<input type="email" name="personalEmail"></label><label>Current Address<textarea name="currentAddress"></textarea></label><label>Permanent Address<textarea name="permanentAddress"></textarea></label><label>Emergency Contact<input name="emergencyContact"></label><label>Emergency Phone<input name="emergencyPhone"></label></div></div><div class="employee-form-section" data-form-section="attendance"><h2>Attendance & Leaves</h2><div class="employee-form-grid"><label>Attendance Device ID<input name="attendanceDeviceId"></label><label>Default Shift<select name="defaultShift"><option value="">Select shift</option><option>General Shift</option><option>Morning Shift</option><option>Night Shift</option></select></label><label>Expense Approver<select name="expenseApprover"><option value="">Select approver</option>${optionList(data.employees, 'name', 'name')}</select></label><label>Leave Approval Workflow<input name="leaveApprovalWorkflow"></label></div></div><div class="employee-form-section" data-form-section="salary"><h2>Salary</h2><div class="employee-form-grid"><label>Cost to Company<input type="number" name="ctc" min="0"></label><label>Salary Currency<select name="salaryCurrency"><option>INR</option><option>USD</option><option>EUR</option></select></label><label>Payroll Cost Center<input name="payrollCostCenter"></label><label>PAN Number<input name="panNumber"></label><label>Aadhaar Number<input name="aadhaarNumber"></label></div></div><div class="employee-form-section" data-form-section="personal"><h2>Personal Details</h2><div class="employee-form-grid"><label>Marital Status<select name="maritalStatus"><option value="">Select status</option><option>Single</option><option>Married</option></select></label><label>Blood Group<input name="bloodGroup"></label><label>Family Background<textarea name="familyBackground"></textarea></label><label>Health Details<textarea name="healthDetails"></textarea></label></div></div><div class="employee-form-section" data-form-section="profile"><h2>Profile</h2><div class="employee-form-grid"><label>Biography<textarea name="biography"></textarea></label><label>Written Languages<textarea name="writtenLanguages"></textarea></label><label>Spoken Languages<textarea name="spokenLanguages"></textarea></label></div></div><div class="employee-form-section" data-form-section="exit"><h2>Exit</h2><div class="employee-form-grid"><label>Resignation Letter Date<input type="date" name="resignationDate"></label><label>Relieving Date<input type="date" name="relievingDate"></label><label>New Workplace<input name="newWorkplace"></label><label>Reason for Leaving<textarea name="reasonForLeaving"></textarea></label><label>Feedback<textarea name="exitFeedback"></textarea></label></div></div><div class="employee-form-section"><h2>Company Details</h2><div class="employee-form-grid"><label>Company *<select name="company" required><option value="">Select company</option>${optionList(companies)}</select></label><label>Designation *<select name="designation" required><option value="">Select designation</option>${optionList(designations)}</select></label><label>Site Office *<select name="siteOffice" required><option value="">Select site office</option>${optionList(offices)}</select></label><label>Department *<select name="department" required><option value="">Select department</option>${optionList(departments)}</select></label><label>Reports To<select name="reportsTo"><option value="">Select employee</option>${optionList(data.employees, 'name', 'name')}</select></label><label>Grade<select name="grade"><option value="">Select grade</option>${optionList(grades)}</select></label><label>Employment Type *<select name="employmentType" required><option value="">Select type</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></label></div></div><div class="form-actions"><button type="button" class="button outline" id="cancelEmployee">Cancel</button><button class="button primary" type="submit">Save Employee</button></div></form></section>`;
}
function bindEmployeeForm(employeeId = '') {
  const form = document.getElementById('employeeForm');
  form.noValidate = true;
  const tabs = document.querySelectorAll('[data-form-tab]');
  const activateTab = (target) => {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.formTab === target));
    document.querySelectorAll('.employee-form-section').forEach((section) => section.hidden = (section.dataset.formSection || 'overview') !== target);
  };
  tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.formTab)));
  activateTab('overview');
  document.getElementById('cancelEmployee')?.addEventListener('click', () => loadEmployeesPage());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const requiredFields = ['firstName', 'gender', 'dateOfJoining', 'mobile', 'company', 'designation', 'siteOffice', 'department', 'employmentType', 'userId'];
    const missingField = requiredFields.find((field) => !form.elements[field]?.value);
    if (missingField) {
      const section = form.elements[missingField].closest('[data-form-section]');
      activateTab(section.dataset.formSection);
      form.elements[missingField].focus();
      showToast('Please complete all required fields.');
      return;
    }
    const values = Object.fromEntries(new FormData(event.target));
    try { const employee = await api(employeeId ? `/api/employees/${encodeURIComponent(employeeId)}` : '/api/employees', { method: employeeId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); showToast(employeeId ? 'Employee details updated.' : 'Employee saved. Register the face to enable attendance.'); if (employeeId) await loadEmployeeDetails(employeeId); else { await registerEmployeeFace(employee.id, employee.name); await loadEmployeesPage(); } } catch (error) { showToast(error.message); }
  });
}
async function loadEmployeeForm(employeeId = '') {
  if (window.location.pathname !== routePath('Employees New')) window.history.pushState({ view: 'Employees New' }, '', routePath('Employees New'));
  const [companies, departments, designations, offices, grades, shifts, employees, users, existing] = await Promise.all(['Company', 'Departments', 'Designations', 'Site Office', 'Employee Grade', 'Shift Type'].map((module) => api(`/api/modules/${encodeURIComponent(module)}`)).concat(api('/api/employees'), api('/api/users'), employeeId ? api(`/api/employees/${encodeURIComponent(employeeId)}`) : Promise.resolve(null)));
  content.innerHTML = employeeForm({ companies, departments, designations, offices, grades, employees });
  const overviewGrid = document.querySelector('[data-form-section="overview"] .employee-form-grid');
  if (overviewGrid) overviewGrid.insertAdjacentHTML('beforeend', `<label>User Access *<select name="userId" required><option value="">Select user</option>${users.filter((user) => !user.employeeId || String(user.employeeId) === employeeId).map((user) => `<option value="${user.id}">${user.name} · ${user.email}</option>`).join('')}</select></label>`);
  const shiftSelect = document.querySelector('select[name="defaultShift"]');
  if (shiftSelect) shiftSelect.innerHTML = `<option value="">Select shift</option>${optionList(shifts, 'name', 'name')}`;
  if (existing) {
    const fieldMap = { firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name', gender: 'gender', dateOfBirth: 'date_of_birth', dateOfJoining: 'date_of_joining', placeOfBirth: 'place_of_birth', nationality: 'nationality', company: 'company', siteOffice: 'site_office', reportsTo: 'reports_to', grade: 'grade', employmentType: 'employment_type', leaveApprovalWorkflow: 'leave_approval_workflow', attendanceDeviceId: 'attendance_device_id', defaultShift: 'default_shift', expenseApprover: 'expense_approver', userId: 'user_id', project: 'project', personalEmail: 'personal_email', mobile: 'mobile', currentAddress: 'current_address', permanentAddress: 'permanent_address', ctc: 'ctc', salaryCurrency: 'salary_currency', jobApplicant: 'job_applicant', offerDate: 'offer_date', contractEndDate: 'contract_end_date', noticeDays: 'notice_days', retirementDate: 'retirement_date', emergencyContact: 'emergency_contact', emergencyPhone: 'emergency_phone', payrollCostCenter: 'payroll_cost_center', panNumber: 'pan_number', aadhaarNumber: 'aadhaar_number', maritalStatus: 'marital_status', bloodGroup: 'blood_group', familyBackground: 'family_background', healthDetails: 'health_details', biography: 'biography', writtenLanguages: 'written_languages', spokenLanguages: 'spoken_languages', resignationDate: 'resignation_date', relievingDate: 'relieving_date', newWorkplace: 'new_workplace', reasonForLeaving: 'reason_for_leaving', exitFeedback: 'exit_feedback' };
    Object.entries(fieldMap).forEach(([field, key]) => { if (document.querySelector(`[name="${field}"]`) && existing[key] != null) document.querySelector(`[name="${field}"]`).value = existing[key]; });
  }
  bindEmployeeForm(employeeId);
}
async function loadEmployeesPage() {
  if (window.location.pathname !== routePath('Employees')) window.history.pushState({ view: 'Employees' }, '', routePath('Employees'));
  const employees = await api('/api/employees');
  content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">HR SETUP / EMPLOYEE</p><h1>Employee</h1><p class="subhead">Manage employee profiles, joining details, and HR information.</p></div><button class="button primary" id="addEmployeePage">＋ Add Employee</button></section><section class="panel employee-list-panel"><div class="employee-filters"><input placeholder="Search employees" id="employeeSearch"><span>${employees.length} employees</span></div><div class="admin-table employee-table"><div class="admin-table-head"><span>Full Name</span><span>User ID</span><span>Department</span><span>Designation</span><span>Face</span><span>Actions</span></div>${employees.map((item) => `<div class="admin-table-row" data-employee-id="${item.id}"><span><b>${item.name}</b><small>${item.id}</small></span><span>${item.userId || item.name}</span><span>${item.department}</span><span>${item.designation}</span><span><em class="doc-status">${item.faceRegistered ? 'Registered' : 'Not registered'}</em></span><span><button class="row-action register-face" data-id="${item.id}" data-name="${item.name}">${item.faceRegistered ? 'Reset face' : 'Register face'}</button></span></div>`).join('')}</div></section>`;
  document.getElementById('addEmployeePage').addEventListener('click', loadEmployeeForm);
  document.getElementById('employeeSearch').addEventListener('input', (event) => document.querySelectorAll('.employee-table .admin-table-row').forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.toLowerCase()); }));
  document.querySelectorAll('.employee-table .admin-table-row').forEach((row) => row.addEventListener('click', () => loadEmployeeDetails(row.dataset.employeeId)));
  document.querySelectorAll('.register-face').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); if (button.textContent.includes('Reset')) { try { await api(`/api/employee/${button.dataset.id}/reset-face`, { method: 'POST' }); showToast('Registered face reset.'); await loadEmployeesPage(); } catch (error) { showToast(error.message); } } else { await registerEmployeeFace(button.dataset.id, button.dataset.name); await loadEmployeesPage(); } }));
}
async function loadEmployeeDetails(employeeId) {
  try {
    const employee = await api(`/api/employees/${encodeURIComponent(employeeId)}`);
    const valueOf = (...keys) => keys.map((key) => employee[key]).find((value) => value !== undefined && value !== null && value !== '');
    const sections = [
      ['Overview', [['Employee ID', ['id']], ['Full Name', ['name']], ['First Name', ['first_name', 'firstName']], ['Middle Name', ['middle_name', 'middleName']], ['Last Name', ['last_name', 'lastName']], ['Gender', ['gender']], ['Date of Birth', ['date_of_birth', 'dateOfBirth']], ['Place of Birth', ['place_of_birth', 'placeOfBirth']], ['Date of Joining', ['date_of_joining', 'dateOfJoining']], ['Status', ['status']], ['Nationality', ['nationality']], ['Project', ['project']]]],
      ['Joining Details', [['Company', ['company']], ['Site Office', ['site_office', 'siteOffice']], ['Department', ['department']], ['Designation', ['designation']], ['Reports To', ['reports_to', 'reportsTo']], ['Grade', ['grade']], ['Employment Type', ['employment_type', 'employmentType']], ['Job Applicant', ['job_applicant', 'jobApplicant']], ['Offer Date', ['offer_date', 'offerDate']], ['Contract End Date', ['contract_end_date', 'contractEndDate']], ['Notice Days', ['notice_days', 'noticeDays']], ['Date of Retirement', ['retirement_date', 'retirementDate']]]],
      ['Address & Contacts', [['Mobile', ['mobile']], ['Personal Email', ['personal_email', 'personalEmail']], ['Current Address', ['current_address', 'currentAddress']], ['Permanent Address', ['permanent_address', 'permanentAddress']], ['Emergency Contact', ['emergency_contact', 'emergencyContact']], ['Emergency Phone', ['emergency_phone', 'emergencyPhone']]]],
      ['Attendance & Leaves', [['Default Shift', ['default_shift', 'defaultShift']], ['Leave Approval Workflow', ['leave_approval_workflow', 'leaveApprovalWorkflow']], ['Attendance Device ID', ['attendance_device_id', 'attendanceDeviceId']], ['Expense Approver', ['expense_approver', 'expenseApprover']]]],
      ['Salary', [['CTC', ['ctc']], ['Salary Currency', ['salary_currency', 'salaryCurrency']], ['Payroll Cost Center', ['payroll_cost_center', 'payrollCostCenter']]]],
      ['Personal Details', [['Nationality', ['nationality']], ['Gender', ['gender']], ['Date of Birth', ['date_of_birth', 'dateOfBirth']], ['Place of Birth', ['place_of_birth', 'placeOfBirth']], ['Marital Status', ['marital_status', 'maritalStatus']], ['Blood Group', ['blood_group', 'bloodGroup']], ['PAN Number', ['pan_number', 'panNumber']], ['Aadhaar Number', ['aadhaar_number', 'aadhaarNumber']], ['Family Background', ['family_background', 'familyBackground']], ['Health Details', ['health_details', 'healthDetails']], ['Biography', ['biography']], ['Written Languages', ['written_languages', 'writtenLanguages']], ['Spoken Languages', ['spoken_languages', 'spokenLanguages']]]],
      ['Profile', [['User ID', ['user_id', 'userId']], ['Face Registered', ['faceRegistered']]]],
      ['Exit', [['Resignation Date', ['resignation_date', 'resignationDate']], ['Relieving Date', ['relieving_date', 'relievingDate']], ['New Workplace', ['new_workplace', 'newWorkplace']], ['Reason For Leaving', ['reason_for_leaving', 'reasonForLeaving']], ['Exit Feedback', ['exit_feedback', 'exitFeedback']]]]
    ];
    const tabs = sections.map(([label, fields], index) => `<button type="button" class="detail-tab ${index === 0 ? 'active' : ''}" data-detail-tab="detail-${index}">${label}</button>`).join('');
    const sectionMarkup = sections.map(([label, fields], index) => `<section class="employee-detail-section ${index === 0 ? 'active' : ''}" data-detail-section="detail-${index}"><h2>${label}</h2><div class="employee-detail-grid">${fields.map(([field, keys]) => { const value = valueOf(...keys); return `<div class="employee-detail-item"><small>${field}</small><b>${value === undefined ? '-' : value}</b></div>`; }).join('')}</div></section>`).join('');
    const canEdit = ['super_admin', 'hr_admin'].includes(loggedInUser?.role);
    const canReset = canEdit;
    content.innerHTML = `<section class="page-hero"><div><p class="eyebrow">HR SETUP / EMPLOYEE DETAILS</p><h1>${employee.name || employee.first_name || employeeId}</h1><p class="subhead">Complete employee information and face attendance setup.</p></div><div class="page-hero-actions">${canEdit ? '<button class="button primary" id="editEmployee">Edit employee</button>' : ''}<button class="button outline" id="backToEmployees">← Employees</button></div></section><section class="employee-detail-layout"><article class="panel employee-details-panel"><div class="detail-tabs">${tabs}</div>${sectionMarkup}</article><article class="panel face-setup-panel"><div class="panel-heading"><div><h2>Face attendance</h2><p>Required before check-in or check-out</p></div><span class="face-state ${employee.faceRegistered ? 'registered' : ''}">${employee.faceRegistered ? 'Registered' : 'Not registered'}</span></div><div class="face-preview">${employee.faceImage ? `<img src="${employee.faceImage}" alt="Registered employee face">` : '<span>No registered face yet</span>'}</div><button class="button primary" id="registerDetailFace">${employee.faceRegistered ? 'Re-register face' : 'Register face'}</button>${canReset && employee.faceRegistered ? '<button class="button outline" id="resetDetailFace">Reset registered face</button>' : ''}</article></section>`;
    document.getElementById('editEmployee')?.addEventListener('click', () => loadEmployeeForm(employee.id));
    document.getElementById('backToEmployees').addEventListener('click', loadEmployeesPage);
    document.querySelectorAll('[data-detail-tab]').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('[data-detail-tab]').forEach((item) => item.classList.toggle('active', item === tab)); document.querySelectorAll('[data-detail-section]').forEach((section) => section.classList.toggle('active', section.dataset.detailSection === tab.dataset.detailTab)); }));
    document.getElementById('registerDetailFace').addEventListener('click', async () => { if (await registerEmployeeFace(employee.id, employee.name)) await loadEmployeeDetails(employee.id); });
    document.getElementById('resetDetailFace')?.addEventListener('click', async () => { try { await api(`/api/employee/${employee.id}/reset-face`, { method: 'POST' }); showToast('Registered face reset.'); await loadEmployeeDetails(employee.id); } catch (error) { showToast(error.message); } });
  } catch (error) { showToast(error.message); }
}

async function loadAdminPage(view) {
  if (view === 'HR Setup') { content.innerHTML = hrSetupPage(); bindHrSetup(); return; }
  if (view === 'Employees') { await loadEmployeesPage(); return; }
  if (view === 'Employees New') { await loadEmployeeForm(); return; }
  if (view === 'Departments' || view === 'Designations' || view === 'Site Office') { await loadMasterPage(view); return; }
  if (view === 'Shift Type') { await loadShiftTypePage(); return; }
  if (view === 'User Access') { await loadUserAccessPage(); return; }
  if (view === 'Shift Type') { await loadShiftTypePage(); return; }
    if (view === 'Departments' || view === 'Designations' || view === 'Site Office') { await loadMasterPage(view); return; }
    if (view === 'Shift Type') { await loadShiftTypePage(); return; }
  if (view === 'Leave') { await loadLeavesPage(); return; }
  if (view === 'Leave Application') { await loadLeaveApplicationPage(); return; }
  if (view === 'Attendance') { await loadAttendancePage(); return; }
  if (view === 'Employee Checkin') { await loadEmployeeCheckinPage(); return; }
  if (view === 'Attendance Request') { await loadRegularizationPage(); return; }
  if (reportViews.includes(view)) { await loadReportPage(view); return; }
  if (view === 'Recruitment') { loadRecruitmentPage(); return; }
  if (view === 'Shift & Attendance') { await loadShiftAttendancePage(); return; }
  const specializedView = ['User Access', 'Attendance'].includes(view);
  content.innerHTML = specializedView ? legacyGenericPage(view) : dynamicModulePage(view);
  const body = document.querySelector('.empty-workspace');
  if (view === 'Employees') {
    const employees = await api('/api/employees');
    body.innerHTML = `<div class="admin-table"><div class="admin-table-head"><span>Employee</span><span>Department</span><span>Designation</span><span>Status</span></div>${employees.map((item) => `<div class="admin-table-row"><span><b>${item.name}</b><small>${item.id}</small></span><span>${item.department}</span><span>${item.designation}</span><em class="doc-status">${item.status}</em></div>`).join('')}</div>`;
  } else if (view === 'User Access') {
    const users = await api('/api/users');
    body.innerHTML = `<div class="admin-table"><div class="admin-table-head"><span>User</span><span>Email</span><span>Employee</span><span>Role</span></div>${users.map((user) => `<div class="admin-table-row"><span><b>${user.name}</b></span><span>${user.email}</span><span>${user.employeeId || 'Admin'}</span><select class="role-control" data-user-id="${user.id}">${['super_admin', 'hr_manager', 'employee'].map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${role.replace('_', ' ')}</option>`).join('')}</select></div>`).join('')}</div>`;
    body.querySelectorAll('.role-control').forEach((control) => control.addEventListener('change', async () => { try { await api(`/api/users/${control.dataset.userId}/role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: control.value }) }); showToast('User role updated.'); } catch (error) { showToast(error.message); } }));
  } else if (view === 'Attendance' || view === 'Leave') {
    const dashboard = await api('/api/dashboard');
    const records = view === 'Attendance' ? dashboard.attendance : dashboard.leaveRequests;
    body.innerHTML = `<div class="admin-table"><div class="admin-table-head"><span>${view === 'Attendance' ? 'Date' : 'Employee'}</span><span>${view === 'Attendance' ? 'Present' : 'Request'}</span><span>${view === 'Attendance' ? 'Absent' : 'Dates'}</span><span>${view === 'Attendance' ? 'On leave' : 'Status'}</span></div>${records.map((item) => `<div class="admin-table-row"><span><b>${view === 'Attendance' ? formatDate(item.date) : item.employeeName}</b></span><span>${view === 'Attendance' ? item.present : item.type}</span><span>${view === 'Attendance' ? item.absent : formatDate(item.startDate)}</span><em class="${view === 'Attendance' ? 'doc-status' : 'status-pill pending'}">${view === 'Attendance' ? item.leave : item.status}</em></div>`).join('')}</div>`;
  } else {
    await loadDynamicModule(view);
  }
}

async function renderView(view) {
  if (window.location.pathname !== routePath(view)) window.history.pushState({ view }, '', routePath(view));
  updateBreadcrumb(view);
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  if (view === 'Overview') { content.innerHTML = overviewMarkup; updateOverviewGreeting(); applyViewPermissions(); bindOverview(); bindModuleTiles(); return; }
  if (view === 'Employee Portal') { await loadEmployeePortal(); return; }
  await loadAdminPage(view);
}

document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => renderView(item.dataset.view)));
function bindModuleTiles() {
  document.querySelectorAll('.module-tile[data-module]').forEach((item) => item.addEventListener('click', () => {
    document.querySelectorAll('.module-tile').forEach((tile) => tile.classList.remove('active'));
    item.classList.add('active');
    renderView(item.dataset.module);
  }));
}
bindModuleTiles();
bindGlobalSearch();
document.getElementById('employeePortal')?.addEventListener('click', () => renderView('Employee Portal'));
document.getElementById('profileMenu').addEventListener('click', () => document.getElementById('profileMenuPanel').classList.toggle('open'));
document.getElementById('editProfile').addEventListener('click', async () => {
  const name = window.prompt('Name', loggedInUser?.name || '');
  if (!name) return;
  const email = window.prompt('Email', loggedInUser?.email || '');
  if (!email) return;
  try {
    loggedInUser = await api('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email }) });
    document.getElementById('userName').textContent = name;
    document.getElementById('profileMenuPanel').classList.remove('open');
    showToast('Profile updated.');
    if (currentRole === 'employee') await loadEmployeePortal();
  } catch (error) { showToast(error.message); }
});
document.getElementById('logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } finally { loggedInUser = null; document.querySelector('.app-shell').hidden = true; document.getElementById('authScreen').hidden = false; toggleAuth(false); document.getElementById('profileMenuPanel').classList.remove('open'); }
});
document.getElementById('roleSelect')?.addEventListener('change', async (event) => {
  try { await applyAccess(event.target.value); await renderView(currentRole === 'employee' ? 'Employee Portal' : 'Overview'); showToast(`${currentAccess.label} access applied.`); } catch (error) { showToast(error.message); }
});
document.querySelector('.mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
window.addEventListener('popstate', () => renderView(viewFromPath()));

async function authenticate(event) {
  event.preventDefault();
  const register = document.getElementById('authName').hidden === false;
  try {
    const endpoint = register ? '/api/register' : '/api/login';
    const body = { email: document.getElementById('authEmail').value, password: document.getElementById('authPassword').value };
    if (register) body.name = document.getElementById('authName').value;
    const result = await api(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (register) { document.getElementById('authNote').textContent = `${result.message} Please sign in.`; toggleAuth(false); return; }
    loggedInUser = result; document.getElementById('authScreen').hidden = true; document.querySelector('.app-shell').hidden = false; document.getElementById('roleSelect').value = result.role; await applyAccess(result.role); await renderView(viewFromPath() === 'Overview' ? (result.role === 'employee' ? 'Employee Portal' : 'Overview') : viewFromPath());
  } catch (error) { document.getElementById('authNote').textContent = error.message; }
}
function toggleAuth(register) { document.getElementById('authTitle').textContent = register ? 'Create your Northstar account' : 'Sign in to Northstar'; document.getElementById('authCopy').textContent = register ? 'Your first account becomes Super Admin.' : 'Manage your people, attendance, leave, and payroll.'; document.getElementById('authName').hidden = !register; document.getElementById('authName').required = register; document.getElementById('authPassword').autocomplete = register ? 'new-password' : 'current-password'; document.getElementById('authSubmit').textContent = register ? 'Register' : 'Sign in'; document.getElementById('authToggle').textContent = register ? 'Already have an account? Sign in' : 'Create a new account'; }
document.getElementById('authForm').addEventListener('submit', authenticate);
document.getElementById('authToggle').addEventListener('click', () => toggleAuth(document.getElementById('authName').hidden));
document.querySelector('.app-shell').hidden = true;
api('/api/me').then(async (user) => { loggedInUser = user; document.getElementById('authScreen').hidden = true; document.querySelector('.app-shell').hidden = false; document.getElementById('roleSelect').value = user.role; await applyAccess(user.role); await renderView(viewFromPath() === 'Overview' ? (user.role === 'employee' ? 'Employee Portal' : 'Overview') : viewFromPath()); }).catch(() => {});
