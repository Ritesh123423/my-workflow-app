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

async function loadTeam() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/team`, { headers: { Authorization: `Bearer ${token}` } });
  const members = await res.json();
  const tbody = document.getElementById('team-body');

  if (members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">👥</div><p>No members yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => `
    <tr>
      <td><strong>${m.name}</strong></td>
      <td>${m.email}</td>
      <td>
        <select onchange="updateRole(${m.id}, this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid #e2e8f0;font-size:13px">
          <option value="auditor" ${m.role === 'auditor' ? 'selected' : ''}>Auditor</option>
          <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
        </select>
      </td>
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeMember(${m.id})">Remove</button>
      </td>
    </tr>
  `).join('');
}

async function updateRole(id, role) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/team/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role })
  });
  if (res.ok) showToast('Role updated!');
  else showToast('Failed to update role', 'error');
}

async function removeMember(id) {
  const currentUser = JSON.parse(localStorage.getItem('user'));
  if (currentUser.id === id) return showToast("You can't remove yourself.", 'error');
  if (!confirm('Remove this team member?')) return;
  const token = localStorage.getItem('token');
  await fetch(`${API}/team/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  showToast('Member removed.');
  loadTeam();
}

loadUser();
loadTeam();