require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const { getVideoDuration, extractFrames, cutAndNormalizeSegment, addIntroOverlay, concatSegments, addBackgroundMusic } = require('./utils/ffmpegProcessor');
const { findBestSegment } = require('./utils/claudeAnalyzer');

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const TMP_ROOT = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT);

const upload = multer({
  dest: path.join(TMP_ROOT, 'uploads'),
  limits: { fileSize: 150 * 1024 * 1024, files: 5 }, // 150MB/vidéo max
  fileFilter: (req, file, cb) => {
    const ok = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'].includes(file.mimetype);
    cb(ok ? null : new Error('Format vidéo non supporté'), ok);
  }
});

// Nettoyage récursif d'un dossier temporaire
function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/generate-highlights', upload.array('videos', 5), async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TMP_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const { name = '', position = '', foot = '' } = req.body;

  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Aucune vidéo reçue.' });
    }

    const normalizedSegments = [];

    // 1. Pour chaque vidéo : extraction de frames -> analyse Claude Vision -> découpe du meilleur passage
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const videoPath = file.path;
      const framesDir = path.join(jobDir, `frames-${i}`);

      const { frames, duration } = await extractFrames(videoPath, framesDir);
      const best = await findBestSegment(frames, duration);

      const segPath = path.join(jobDir, `segment-${i}.mp4`);
      await cutAndNormalizeSegment(videoPath, best.start, best.duration, segPath);

      normalizedSegments.push({ path: segPath, reason: best.reason });
    }

    // 2. Ajout du texte d'intro (nom/poste/pied fort) sur le 1er segment
    let firstSegment = normalizedSegments[0].path;
    if (name) {
      const introPath = path.join(jobDir, 'segment-0-intro.mp4');
      await addIntroOverlay(firstSegment, introPath, { name, position, foot });
      normalizedSegments[0].path = introPath;
    }

    // 3. Concaténation finale (les clips s'enchaînent dans l'ordre d'ajout)
    let finalPath = path.join(jobDir, 'highlight-final.mp4');
    await concatSegments(normalizedSegments.map(s => s.path), finalPath, jobDir);

    // 3bis. Ajout de la musique de fond (si le fichier est présent dans backend/assets/music.mp3)
    const musicPath = path.join(__dirname, 'assets', 'music.mp3');
    if (fs.existsSync(musicPath)) {
      const withMusicPath = path.join(jobDir, 'highlight-final-music.mp4');
      await addBackgroundMusic(finalPath, musicPath, withMusicPath);
      finalPath = withMusicPath;
    }

    // 4. Upload Cloudinary
    const uploadResult = await cloudinary.uploader.upload(finalPath, {
      resource_type: 'video',
      folder: 'highlights',
      public_id: `highlight-${jobId}`
    });

    res.json({
      success: true,
      videoUrl: uploadResult.secure_url,
      breakdown: normalizedSegments.map((s, i) => ({ clip: i + 1, reason: s.reason }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erreur lors de la génération.' });
  } finally {
    // Nettoyage des fichiers temporaires (uploads + traitement)
    cleanup(jobDir);
    if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Serveur highlight lancé sur le port ${PORT}`));
