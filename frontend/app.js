// ⚠️ Remplace cette URL par celle de ton backend une fois déployé sur Render
const API_BASE_URL = 'https://stepintofootball-platform.onrender.com';

const MAX_SLOTS = 5;
const MIN_DURATION = 5;
const MAX_DURATION = 45;

const slotsContainer = document.getElementById('slots');
const errorMsg = document.getElementById('errorMsg');
const generateBtn = document.getElementById('generateBtn');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultArea = document.getElementById('resultArea');
const resultVideo = document.getElementById('resultVideo');
const downloadLink = document.getElementById('downloadLink');
const breakdownList = document.getElementById('breakdownList');

// État des 5 emplacements : null si vide, sinon { file, url }
const slots = Array(MAX_SLOTS).fill(null);

function renderSlots() {
  slotsContainer.innerHTML = '';
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (slots[i] ? ' filled' : '');

    if (slots[i]) {
      const video = document.createElement('video');
      video.src = slots[i].url;
      video.muted = true;
      slot.appendChild(video);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(slots[i].url);
        slots[i] = null;
        renderSlots();
      };
      slot.appendChild(removeBtn);
    }

    const number = document.createElement('div');
    number.className = 'slot-number';
    number.textContent = String(i + 1).padStart(2, '0');
    slot.appendChild(number);

    if (!slots[i]) {
      const label = document.createElement('div');
      label.className = 'slot-label';
      label.textContent = 'Ajouter une séquence';
      slot.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/webm,video/x-matroska';
    input.onchange = (e) => handleFileSelect(e, i);
    slot.appendChild(input);

    slot.onclick = () => input.click();
    slotsContainer.appendChild(slot);
  }
  updateGenerateButton();
}

function handleFileSelect(e, index) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const tempVideo = document.createElement('video');
  tempVideo.src = url;

  tempVideo.onloadedmetadata = () => {
    const duration = tempVideo.duration;
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      errorMsg.textContent = `La séquence ${index + 1} dure ${duration.toFixed(0)}s — elle doit durer entre ${MIN_DURATION} et ${MAX_DURATION} secondes.`;
      URL.revokeObjectURL(url);
      return;
    }
    errorMsg.textContent = '';
    slots[index] = { file, url };
    renderSlots();
  };
}

function updateGenerateButton() {
  const filledCount = slots.filter(Boolean).length;
  generateBtn.disabled = filledCount === 0;
}

function setProgress(percent, text) {
  progressFill.style.width = percent + '%';
  progressText.textContent = text;
}

async function generateHighlights() {
  const filled = slots.filter(Boolean);
  if (filled.length === 0) return;

  generateBtn.disabled = true;
  progressArea.classList.remove('hidden');
  resultArea.classList.add('hidden');
  errorMsg.textContent = '';

  const formData = new FormData();
  filled.forEach(s => formData.append('videos', s.file));
  formData.append('name', document.getElementById('playerName').value.trim());
  formData.append('position', document.getElementById('playerPosition').value.trim());
  formData.append('foot', document.getElementById('playerFoot').value);

  // Simulation de progression pendant le traitement (le vrai traitement peut prendre 1-3 min)
  const steps = [
    [15, 'Envoi des séquences…'],
    [35, 'Analyse des meilleurs moments (IA)…'],
    [60, 'Découpe et montage…'],
    [85, 'Assemblage final…']
  ];
  let stepIndex = 0;
  const interval = setInterval(() => {
    if (stepIndex < steps.length) {
      setProgress(...steps[stepIndex]);
      stepIndex++;
    }
  }, 4000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-highlights`, {
      method: 'POST',
      body: formData
    });

    clearInterval(interval);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erreur serveur (${response.status})`);
    }

    const data = await response.json();
    setProgress(100, 'Terminé !');

    resultVideo.src = data.videoUrl;
    downloadLink.href = data.videoUrl;
    breakdownList.innerHTML = '';
    (data.breakdown || []).forEach(b => {
      const li = document.createElement('li');
      li.textContent = `Séquence ${b.clip} : ${b.reason}`;
      breakdownList.appendChild(li);
    });

    setTimeout(() => {
      progressArea.classList.add('hidden');
      resultArea.classList.remove('hidden');
      resultArea.scrollIntoView({ behavior: 'smooth' });
    }, 500);

  } catch (err) {
    clearInterval(interval);
    progressArea.classList.add('hidden');
    errorMsg.textContent = `Erreur : ${err.message}`;
  } finally {
    updateGenerateButton();
  }
}

generateBtn.addEventListener('click', generateHighlights);
renderSlots();
