const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginScreen = document.getElementById('login-screen');
const app = document.getElementById('app');
const clockEl = document.getElementById('live-clock');

const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

const spindleTableBody = document.querySelector('#spindle-table tbody');
const yedekTableBody = document.querySelector('#yedek-table tbody');

const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
const modalTitle = document.getElementById('modal-title');
const modalCancel = document.getElementById('modal-cancel');

let spindleData = [];
let yedekData = [];
let activeTab = 'spindle';
let selectedSpindleId = null;
let selectedYedekId = null;

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleString('tr-TR');
}
setInterval(updateClock, 1000);
updateClock();

function switchTab(tabKey) {
  activeTab = tabKey;
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === `${tabKey}-tab`);
  });
  tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === `${tabKey}-tab`);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab.replace('-tab', '')));
});

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || 'İşlem başarısız');
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res;
}

function renderTable(tbody, data, columns, selectedId) {
  tbody.innerHTML = '';
  data.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.id === selectedId) {
      tr.classList.add('selected');
    }
    columns.forEach((col) => {
      const td = document.createElement('td');
      td.textContent = row[col] || '';
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => {
      if (tbody === spindleTableBody) {
        selectedSpindleId = row.id;
        renderTable(spindleTableBody, spindleData, spindleColumns, selectedSpindleId);
      } else {
        selectedYedekId = row.id;
        renderTable(yedekTableBody, yedekData, yedekColumns, selectedYedekId);
      }
    });
    tbody.appendChild(tr);
  });
}

const spindleColumns = [
  'id',
  'Referans ID',
  'Çalışma Saati',
  'Takılı Olduğu Makine',
  'Makinaya Takıldığı Tarih',
  'Son Güncelleme'
];

const yedekColumns = [
  'id',
  'Referans ID',
  'Açıklama',
  'Tamirde mi',
  'Bakıma Gönderilme',
  'Geri Dönme',
  'Söküldüğü Makine',
  'Sökülme Tarihi',
  'Son Güncelleme'
];

async function loadSpindle(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await apiRequest(`/api/spindle${query}`);
  spindleData = data;
  renderTable(spindleTableBody, spindleData, spindleColumns, selectedSpindleId);
}

async function loadYedek(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await apiRequest(`/api/yedek${query}`);
  yedekData = data;
  renderTable(yedekTableBody, yedekData, yedekColumns, selectedYedekId);
}

function openModal(type, mode, existing) {
  modalTitle.textContent = `${type === 'spindle' ? 'Spindle' : 'Yedek'} ${mode === 'add' ? 'Ekle' : 'Düzenle'}`;
  modalForm.innerHTML = '';
  const fields = type === 'spindle'
    ? [
        { label: 'Referans ID', name: 'referansId', required: true },
        { label: 'Çalışma Saati', name: 'calismaSaati' },
        { label: 'Takılı Olduğu Makine', name: 'makine' },
        { label: 'Makinaya Takıldığı Tarih', name: 'takilmaTarihi' }
      ]
    : [
        { label: 'Referans ID', name: 'referansId', required: true },
        { label: 'Açıklama', name: 'aciklama', type: 'textarea' },
        { label: 'Tamirde mi', name: 'tamirdeMi', type: 'select', options: ['Evet', 'Hayır'] },
        { label: 'Bakıma Gönderilme', name: 'bakimaGonderilme' },
        { label: 'Geri Dönme', name: 'geriDonme' },
        { label: 'Söküldüğü Makine', name: 'sokulduguMakine' },
        { label: 'Sökülme Tarihi', name: 'sokulmeTarihi' }
      ];

  fields.forEach((field) => {
    const label = document.createElement('label');
    label.setAttribute('for', field.name);
    label.textContent = field.label;
    modalForm.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
    } else if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = field.name;
    input.name = field.name;
    if (field.required) {
      input.required = true;
    }
    if (existing) {
      input.value = existing[field.name] || existing[field.label] || '';
    }
    modalForm.appendChild(input);
  });

  modal.hidden = false;
  setTimeout(() => modal.classList.remove('hidden'), 0);
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(modalForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      if (type === 'spindle') {
        if (mode === 'add') {
          await apiRequest('/api/spindle', { method: 'POST', body: JSON.stringify(payload) });
        } else if (selectedSpindleId) {
          await apiRequest(`/api/spindle/${selectedSpindleId}`, { method: 'PUT', body: JSON.stringify(payload) });
        }
        await loadSpindle(document.getElementById('spindle-search').value.trim());
      } else {
        if (mode === 'add') {
          await apiRequest('/api/yedek', { method: 'POST', body: JSON.stringify(payload) });
        } else if (selectedYedekId) {
          await apiRequest(`/api/yedek/${selectedYedekId}`, { method: 'PUT', body: JSON.stringify(payload) });
        }
        await loadYedek(document.getElementById('yedek-search').value.trim());
      }
      closeModal();
    } catch (err) {
      alert(err.message);
    }
  };
}

function closeModal() {
  modal.classList.add('hidden');
  modal.hidden = true;
}

modalCancel.addEventListener('click', (e) => {
  e.preventDefault();
  closeModal();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  try {
    const response = await apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (response.success) {
      document.title = 'STS-SpindleTakipSistemi';
      loginScreen.hidden = true;
      app.hidden = false;
      await loadSpindle();
      await loadYedek();
    }
  } catch (err) {
    loginError.textContent = 'Giriş başarısız. Bilgileri kontrol edin.';
  }
});

// Search events
const spindleSearchInput = document.getElementById('spindle-search');
const yedekSearchInput = document.getElementById('yedek-search');

document.getElementById('spindle-search-btn').addEventListener('click', () => {
  loadSpindle(spindleSearchInput.value.trim());
});

document.getElementById('yedek-search-btn').addEventListener('click', () => {
  loadYedek(yedekSearchInput.value.trim());
});

// Action buttons

document.getElementById('spindle-add').addEventListener('click', () => {
  openModal('spindle', 'add');
});

document.getElementById('spindle-edit').addEventListener('click', () => {
  if (!selectedSpindleId) {
    alert('Düzenlemek için bir kayıt seçin.');
    return;
  }
  const existing = spindleData.find((row) => row.id === selectedSpindleId);
  openModal('spindle', 'edit', existing);
});

document.getElementById('spindle-delete').addEventListener('click', async () => {
  if (!selectedSpindleId) {
    alert('Silmek için bir kayıt seçin.');
    return;
  }
  if (confirm('Seçili kaydı silmek istediğinize emin misiniz?')) {
    await apiRequest(`/api/spindle/${selectedSpindleId}`, { method: 'DELETE' });
    selectedSpindleId = null;
    loadSpindle(spindleSearchInput.value.trim());
  }
});

document.getElementById('yedek-add').addEventListener('click', () => {
  openModal('yedek', 'add');
});

document.getElementById('yedek-edit').addEventListener('click', () => {
  if (!selectedYedekId) {
    alert('Düzenlemek için bir kayıt seçin.');
    return;
  }
  const existing = yedekData.find((row) => row.id === selectedYedekId);
  openModal('yedek', 'edit', existing);
});

document.getElementById('yedek-delete').addEventListener('click', async () => {
  if (!selectedYedekId) {
    alert('Silmek için bir kayıt seçin.');
    return;
  }
  if (confirm('Seçili kaydı silmek istediğinize emin misiniz?')) {
    await apiRequest(`/api/yedek/${selectedYedekId}`, { method: 'DELETE' });
    selectedYedekId = null;
    loadYedek(yedekSearchInput.value.trim());
  }
});

document.getElementById('export-btn').addEventListener('click', () => {
  window.location.href = '/api/export';
});
