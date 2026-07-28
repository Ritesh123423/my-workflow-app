const API = 'https://my-workflow-app.onrender.com/api';

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

function loadUser() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user.id) return window.location.href = 'index.html';
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-role').textContent = user.role;
  document.getElementById('user-avatar').textContent = user.name[0].toUpperCase();
}

function statusBadge(s) {
  const map = { pending: 'badge-pending', 'in-progress': 'badge-in-progress', completed: 'badge-completed' };
  return `<span class="badge ${map[s] || ''}">${s}</span>`;
}
function priorityBadge(p) {
  return `<span class="badge badge-${p}">${p}</span>`;
}

async function loadDashboard() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API}/audits`, { headers: { Authorization: `Bearer ${token}` } });
    const audits = await res.json();

    document.getElementById('stat-total').textContent = audits.length;
    document.getElementById('stat-pending').textContent = audits.filter(a => a.status === 'pending').length;
    document.getElementById('stat-progress').textContent = audits.filter(a => a.status === 'in-progress').length;
    document.getElementById('stat-done').textContent = audits.filter(a => a.status === 'completed').length;

    const recent = audits.slice(0, 5);
    const tbody = document.getElementById('recent-audits-body');
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📭</div><p>No audits yet</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = recent.map(a => `
      <tr>
        <td><strong>${a.title}</strong></td>
        <td>${a.department || '—'}</td>
        <td>${priorityBadge(a.priority)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${a.created_by_name || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

loadUser();
loadDashboard();