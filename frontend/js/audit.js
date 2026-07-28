const API = (typeof location !== 'undefined' && location.protocol.startsWith('http'))
  ? '/api'
  : 'https://my-workflow-app.onrender.com/api';

function logout() { localStorage.clear(); window.location.href = 'index.html'; }

function loadUser() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user.id) return window.location.href = 'index.html';
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-role').textContent = user.role;
  document.getElementById('user-avatar').textContent = user.name[0].toUpperCase();
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.className = 'toast', 3000);
}

function statusBadge(s) {
  const map = { pending: 'badge-pending', 'in-progress': 'badge-in-progress', completed: 'badge-completed' };
  return `<span class="badge ${map[s] || ''}">${s}</span>`;
}
function priorityBadge(p) { return `<span class="badge badge-${p}">${p}</span>`; }

let teamMembers = [];

async function loadTeam() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/team`, { headers: { Authorization: `Bearer ${token}` } });
  teamMembers = await res.json();
  const sel = document.getElementById('a-assigned');
  sel.innerHTML = '<option value="">— Unassigned —</option>';
  teamMembers.forEach(m => {
    sel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
  });
}

async function loadAudits() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/audits`, { headers: { Authorization: `Bearer ${token}` } });
  const audits = await res.json();
  const tbody = document.getElementById('audits-body');

  if (audits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📭</div><p>No audits yet. Create one!</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = audits.map(a => {
    const member = teamMembers.find(m => m.id === a.assigned_to);
    return `
      <tr>
        <td><strong>${a.title}</strong><br><small style="color:#64748b">${a.description || ''}</small></td>
        <td>${a.department || '—'}</td>
        <td>${priorityBadge(a.priority)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${member ? member.name : '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editAudit(${a.id})">Edit</button>
          <button class="btn btn-sm btn-danger" style="margin-left:6px" onclick="deleteAudit(${a.id})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openModal() {
  document.getElementById('modal-title').textContent = 'New Audit';
  document.getElementById('edit-id').value = '';
  document.getElementById('a-title').value = '';
  document.getElementById('a-desc').value = '';
  document.getElementById('a-dept').value = '';
  document.getElementById('a-priority').value = 'medium';
  document.getElementById('a-status').value = 'pending';
  document.getElementById('a-assigned').value = '';
  document.getElementById('audit-modal').classList.add('open');
}

function closeModal() { document.getElementById('audit-modal').classList.remove('open'); }

async function editAudit(id) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/audits/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const a = await res.json();
  document.getElementById('modal-title').textContent = 'Edit Audit';
  document.getElementById('edit-id').value = a.id;
  document.getElementById('a-title').value = a.title;
  document.getElementById('a-desc').value = a.description || '';
  document.getElementById('a-dept').value = a.department || '';
  document.getElementById('a-priority').value = a.priority;
  document.getElementById('a-status').value = a.status;
  document.getElementById('a-assigned').value = a.assigned_to || '';
  document.getElementById('audit-modal').classList.add('open');
}

async function saveAudit() {
  const token = localStorage.getItem('token');
  const id = document.getElementById('edit-id').value;
  const body = {
    title: document.getElementById('a-title').value.trim(),
    description: document.getElementById('a-desc').value.trim(),
    department: document.getElementById('a-dept').value.trim(),
    priority: document.getElementById('a-priority').value,
    status: document.getElementById('a-status').value,
    assigned_to: document.getElementById('a-assigned').value || null
  };
  if (!body.title) return showToast('Title is required', 'error');

  const url = id ? `${API}/audits/${id}` : `${API}/audits`;
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    closeModal();
    showToast(id ? 'Audit updated!' : 'Audit created!');
    loadAudits();
  } else {
    const err = await res.json();
    showToast(err.error, 'error');
  }
}

async function deleteAudit(id) {
  if (!confirm('Delete this audit?')) return;
  const token = localStorage.getItem('token');
  await fetch(`${API}/audits/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  showToast('Audit deleted.');
  loadAudits();
}

loadUser();
loadTeam();
loadAudits();