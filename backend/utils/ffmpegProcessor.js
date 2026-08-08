const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

/**
 * Récupère la durée exacte d'une vidéo (en secondes).
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

/**
 * Extrait une frame par seconde (jpg) pour l'analyse par Claude Vision.
 * Retourne la liste des chemins des frames générées + leur timestamp.
 */
async function extractFrames(videoPath, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const duration = await getVideoDuration(videoPath);
  // On extrait ~1 frame/seconde, plafonné à 20 frames pour rester léger
  const frameCount = Math.min(Math.floor(duration), 20);
  const fps = frameCount / duration;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`, '-q:v 3'])
      .output(path.join(outputDir, 'frame-%03d.jpg'))
      .on('end', () => {
        const files = fs.readdirSync(outputDir)
          .filter(f => f.startsWith('frame-'))
          .sort();
        const step = duration / files.length;
        const frames = files.map((f, i) => ({
          path: path.join(outputDir, f),
          timestamp: Math.round(i * step * 10) / 10
        }));
        resolve({ frames, duration });
      })
      .on('error', reject)
      .run();
  });
}

/**
 * Découpe un segment [start, start+duration] d'une vidéo, normalise
 * résolution/codec pour que le concat final se passe sans accroc,
 * et applique un fade in/out doux.
 */
function cutAndNormalizeSegment(videoPath, start, duration, outputPath, { fadeIn = 0.3, fadeOut = 0.3 } = {}) {
  return new Promise((resolve, reject) => {
    const fadeOutStart = Math.max(0, duration - fadeOut);
    ffmpeg(videoPath)
      .setStartTime(start)
      .duration(duration)
      .videoFilters([
        'scale=1280:720:force_original_aspect_ratio=decrease',
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        `fade=t=in:st=0:d=${fadeIn}`,
        `fade=t=out:st=${fadeOutStart}:d=${fadeOut}`
      ])
      .audioFilters([
        `afade=t=in:st=0:d=${fadeIn}`,
        `afade=t=out:st=${fadeOutStart}:d=${fadeOut}`
      ])
      .outputOptions(['-c:v libx264', '-preset ultrafast', '-c:a aac', '-r 30'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Ajoute un texte d'intro (nom, poste, pied fort) sur les 3 premières secondes
 * du tout premier segment.
 */
function addIntroOverlay(segmentPath, outputPath, { name, position, foot }) {
  const text = `${name}${position ? '  |  ' + position : ''}${foot ? '  |  ' + foot : ''}`
    .replace(/'/g, "\\'").replace(/:/g, '\\:');

  return new Promise((resolve, reject) => {
    ffmpeg(segmentPath)
      .videoFilters([
        {
          filter: 'drawtext',
          options: {
            text,
            fontcolor: 'white',
            fontsize: 42,
            box: 1,
            boxcolor: 'black@0.5',
            boxborderw: 12,
            x: '(w-text_w)/2',
            y: 'h-th-40',
            enable: "lte(t,3)"
          }
        }
      ])
      .outputOptions(['-c:v libx264', '-preset ultrafast', '-c:a copy'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Concatène une liste de segments (déjà normalisés même résolution/codec)
 * en une seule vidéo finale via le concat demuxer.
 */
function concatSegments(segmentPaths, outputPath, tmpDir) {
  const listFile = path.join(tmpDir, 'concat-list.txt');
  const content = segmentPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(listFile, content);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Mixe une musique de fond (en boucle si besoin) avec la vidéo finale.
 * Le son original des clips est très atténué, la musique domine,
 * avec un fondu de sortie propre en fin de vidéo.
 */
function addBackgroundMusic(videoPath, musicPath, outputPath, { originalVolume = 0.05, fadeOutDuration = 2 } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = await getVideoDuration(videoPath);
      const fadeStart = Math.max(0, duration - fadeOutDuration);

      ffmpeg()
        .input(videoPath)
        .input(musicPath)
        .inputOptions(['-stream_loop -1']) // boucle la musique si elle est plus courte que la vidéo
        .complexFilter([
          `[0:a]volume=${originalVolume}[orig]`,
          `[1:a]afade=t=out:st=${fadeStart}:d=${fadeOutDuration}[musicfaded]`,
          `[orig][musicfaded]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        ])
        .outputOptions(['-map 0:v', '-map [aout]', '-c:v copy', '-c:a aac', '-shortest'])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  getVideoDuration,
  extractFrames,
  cutAndNormalizeSegment,
  addIntroOverlay,
  concatSegments,
  addBackgroundMusic
};
