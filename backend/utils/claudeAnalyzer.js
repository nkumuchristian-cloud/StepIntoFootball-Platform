const fs = require('fs');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5'; // modèle vision actuel

/**
 * Envoie les frames extraites d'une vidéo à Claude et lui demande
 * d'identifier la meilleure séquence (geste technique, sprint, frappe...)
 * Retourne { start, duration, reason }
 */
async function findBestSegment(frames, videoDuration, targetDuration = 6) {
  // On limite à 12 frames max pour rester raisonnable en taille de requête
  const sampled = frames.length > 12
    ? frames.filter((_, i) => i % Math.ceil(frames.length / 12) === 0)
    : frames;

  const imageBlocks = sampled.map(f => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: fs.readFileSync(f.path).toString('base64')
    }
  }));

  const timestampsList = sampled.map(f => f.timestamp).join('s, ') + 's';
  const minSegDuration = Math.min(5, videoDuration);
  const maxSegDuration = Math.max(minSegDuration, Math.min(targetDuration, videoDuration));

  const prompt = `Voici une série d'images extraites d'une vidéo de foot amateur, prises aux instants suivants (en secondes depuis le début) : ${timestampsList}.
La vidéo dure ${videoDuration.toFixed(1)} secondes au total.

Analyse ces images et identifie le MEILLEUR moment technique visible (jonglage réussi, frappe puissante, sprint, dribble, contrôle, but...).

Réponds UNIQUEMENT avec un objet JSON, sans aucun texte autour, au format exact :
{"start": <nombre en secondes, début du meilleur passage>, "duration": <nombre en secondes entre ${minSegDuration.toFixed(1)} et ${maxSegDuration.toFixed(1)}>, "reason": "<courte explication en français>"}

Le "start" doit être cohérent avec les timestamps fournis et rester dans les limites de la vidéo (start + duration <= ${videoDuration.toFixed(1)}).`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur API Claude (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find(b => b.type === 'text');
  let parsed;
  try {
    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    // Fallback : si Claude ne répond pas en JSON pur, on prend le milieu de la vidéo
    parsed = { start: Math.max(0, videoDuration / 2 - 3), duration: Math.min(6, maxSegDuration), reason: 'Sélection par défaut' };
  }

  // Sécurisation des bornes : au moins 5 sec (ou la vidéo entière si plus courte), au plus 8 sec
  const duration = Math.min(Math.max(parsed.duration || 6, minSegDuration), maxSegDuration);
  const start = Math.min(Math.max(parsed.start || 0, 0), Math.max(0, videoDuration - duration));

  return { start, duration, reason: parsed.reason || '' };
}

/**
 * Calcule la durée cible du highlight final en fonction du cumul des vidéos sources.
 * Règle : ~75% du cumul total, avec un plancher de 20s.
 * (ex: 1min de vidéos sources -> ~45s de highlight, 2min -> ~1min30)
 */
function computeTargetHighlightDuration(totalInputDuration) {
  return Math.max(20, totalInputDuration * 0.75);
}

/**
 * Répartit la durée cible totale entre chaque clip. Si une vidéo est trop
 * courte pour sa part équitable, l'excédent est redistribué vers les vidéos
 * qui ont encore de la marge, pour se rapprocher au mieux de la cible totale.
 */
function computeClipTargets(durations, totalTarget) {
  const n = durations.length;
  const equalShare = Math.max(5, totalTarget / n);

  let deficit = 0;
  const capped = durations.map(d => {
    if (equalShare > d) { deficit += equalShare - d; return d; }
    return equalShare;
  });

  if (deficit > 0) {
    const capacities = durations.map((d, i) => Math.max(0, d - capped[i]));
    const totalCapacity = capacities.reduce((a, b) => a + b, 0);
    if (totalCapacity > 0) {
      const toDistribute = Math.min(deficit, totalCapacity);
      for (let i = 0; i < n; i++) {
        capped[i] += (capacities[i] / totalCapacity) * toDistribute;
      }
    }
  }

  return capped;
}

module.exports = { findBestSegment, computeTargetHighlightDuration, computeClipTargets };
