const API = (typeof location !== 'undefined' && location.protocol.startsWith('http'))
  ? '/api'
  : 'https://my-workflow-app.onrender.com/api';

function redirectAfterAuth() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  window.location.href = next || 'dashboard.html';
}

function switchTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';

  if (!email || !password) return document.getElementById('login-error').textContent = 'Please fill all fields.';

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    redirectAfterAuth();
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  document.getElementById('reg-error').textContent = '';

  if (!name || !email || !password) return document.getElementById('reg-error').textContent = 'Please fill all fields.';
  if (password.length < 6) return document.getElementById('reg-error').textContent = 'Password must be at least 6 characters.';

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    redirectAfterAuth();
  } catch (err) {
    document.getElementById('reg-error').textContent = err.message;
  }
}

if (localStorage.getItem('token')) redirectAfterAuth();
