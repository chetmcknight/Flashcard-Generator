/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';

interface FlashcardSource {
  url: string;
  title: string;
}

interface Flashcard {
  term: string;
  definition: string;
  sources: FlashcardSource[];
}

interface GenerationResponse {
  overview: string;
  overviewSources: FlashcardSource[];
  flashcards: Flashcard[];
}

// Global UI References
const topicInput = document.getElementById('topicInput') as HTMLInputElement;
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const difficultyButtons = document.querySelectorAll('#difficultySelector .pill-btn');
const quantitySelector = document.getElementById('quantitySelector') as HTMLSelectElement;
const loadingCircle = document.getElementById('loadingCircle') as unknown as SVGCircleElement;
const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
const ringLabel = document.getElementById('ringLabel') as HTMLDivElement;
const cardCountLabel = document.getElementById('cardCountLabel') as HTMLSpanElement;
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
const moreInfoButton = document.getElementById('moreInfoButton') as HTMLButtonElement;
const tenMoreButton = document.getElementById('tenMoreButton') as HTMLButtonElement;
const regenerateCardsButton = document.getElementById('regenerateCardsButton') as HTMLButtonElement;
const clearSubjectButton = document.getElementById('clearSubjectButton') as HTMLButtonElement;

const overviewSection = document.getElementById('overviewSection') as HTMLElement;
const overviewToggle = document.getElementById('overviewToggle') as HTMLElement;
const overviewTitle = document.getElementById('overviewTitle') as HTMLElement;
const overviewText = document.getElementById('overviewText') as HTMLDivElement;
const overviewSources = document.getElementById('overviewSources') as HTMLDivElement;

const resultsSection = document.getElementById('resultsSection') as HTMLElement;
const resultsToggle = document.getElementById('resultsToggle') as HTMLElement;

// App State
let selectedDifficulty = 'medium';
let selectedModel = 'gemini-3-flash-preview';
let viewedCards = new Set<number>();
let currentDeck: GenerationResponse | null = null;
let currentTopic = "";
let loadingInterval: number | null = null;
let usedTerms = new Set<string>();

/**
 * Robustly resets the entire application state and UI.
 */
function performDeepClear() {
  console.log("Performing deep clear...");
  
  // 1. Storage Purge
  localStorage.removeItem('study_deck_session');
  localStorage.removeItem('study_deck_viewed');
  localStorage.removeItem('study_deck_used_terms');
  
  // 2. State Reset
  viewedCards.clear();
  usedTerms.clear();
  currentDeck = null;
  currentTopic = "";
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  
  // 3. UI Cleanup
  flashcardsContainer.innerHTML = '';
  overviewText.innerHTML = 'Ready for a subject entry...';
  overviewTitle.textContent = 'Topic Summary';
  overviewSources.innerHTML = '';
  cardCountLabel.textContent = '0';
  topicInput.value = '';
  
  // 4. Status/Feedback Reset
  errorMessage.textContent = 'Ready to learn';
  errorMessage.style.color = 'var(--text-dim)';
  ringLabel.textContent = 'AI';
  
  // Progress Ring Reset
  if (loadingCircle) {
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    loadingCircle.style.strokeDashoffset = circumference.toString();
  }
  
  // 5. Visibility Reset
  progressContainer.classList.remove('is-loading');
  regenerateCardsButton.classList.add('hidden');
  tenMoreButton.classList.add('hidden');
  overviewSection.classList.add('is-collapsed');
  resultsSection.classList.add('is-collapsed');
  
  // 6. Focus restoration
  generateButton.disabled = false;
  topicInput.focus();
}

function init() {
  // Theme Restoration
  const savedTheme = localStorage.getItem('study_deck_theme') || 'dark-mode';
  document.body.className = savedTheme;
  updateThemeIcon(savedTheme);

  // Session Restoration
  const saved = localStorage.getItem('study_deck_session');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const savedViewed = localStorage.getItem('study_deck_viewed');
      if (savedViewed) viewedCards = new Set(JSON.parse(savedViewed));
      
      const savedUsedTerms = localStorage.getItem('study_deck_used_terms');
      if (savedUsedTerms) usedTerms = new Set(JSON.parse(savedUsedTerms));
      
      currentDeck = data.deck;
      currentTopic = data.topic;
      renderDeck(data.deck, data.topic);
      regenerateCardsButton.classList.remove('hidden');
      tenMoreButton.classList.remove('hidden');
      
      // Auto-expand on restoration if content exists
      overviewSection.classList.remove('is-collapsed');
      resultsSection.classList.remove('is-collapsed');
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }
}

function updateThemeIcon(theme: string) {
  const icon = themeToggle.querySelector('.material-symbols-rounded');
  if (icon) icon.textContent = theme === 'dark-mode' ? 'light_mode' : 'dark_mode';
}

function saveSession(topic: string) {
  if (currentDeck) {
    localStorage.setItem('study_deck_session', JSON.stringify({ topic, deck: currentDeck }));
    localStorage.setItem('study_deck_viewed', JSON.stringify(Array.from(viewedCards)));
    localStorage.setItem('study_deck_used_terms', JSON.stringify(Array.from(usedTerms)));
  }
}

function updateProgress(percent: number) {
  if (!loadingCircle) return;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  loadingCircle.style.strokeDashoffset = offset.toString();
}

function updateStudyProgress() {
  if (!currentDeck) return;
  const total = currentDeck.flashcards.length;
  const percent = Math.round((viewedCards.size / total) * 100);
  updateProgress(percent);
  ringLabel.textContent = `${percent}%`;
  
  if (viewedCards.size === total) {
    errorMessage.textContent = 'Mastery Achieved! 🎉';
    errorMessage.style.color = 'var(--accent-purple)';
  } else {
    errorMessage.textContent = `${viewedCards.size} / ${total} Reviewed`;
    errorMessage.style.color = 'var(--text-dim)';
  }
}

function startLoadingSimulation() {
  let progress = 0;
  const stages = [
    { threshold: 15, msg: "Connecting..." },
    { threshold: 35, msg: "Searching..." },
    { threshold: 60, msg: "Reasoning..." },
    { threshold: 85, msg: "Verifying..." },
    { threshold: 99, msg: "Polishing..." }
  ];

  progressContainer.classList.add('is-loading');
  ringLabel.textContent = "0%";
  
  loadingInterval = window.setInterval(() => {
    const increment = progress < 80 ? Math.random() * 2 : Math.random() * 0.3;
    progress = Math.min(99, progress + increment);
    
    updateProgress(progress);
    ringLabel.textContent = `${Math.floor(progress)}%`;
    
    const stage = stages.find(s => progress <= s.threshold) || stages[stages.length - 1];
    errorMessage.textContent = stage.msg;
  }, 150);
}

function stopLoadingSimulation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  progressContainer.classList.remove('is-loading');
}

// Helper to ensure URLs are absolute and functional
function sanitizeUrl(url: string): string {
  try {
    if (!url) return '#';
    // Check if it starts with http:// or https://
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    // Assume https if protocol missing
    return `https://${url}`;
  } catch (e) {
    return '#';
  }
}

function createCardElement(card: Flashcard, index: number, topic: string) {
  const cardEl = document.createElement('div');
  cardEl.className = `flashcard ${viewedCards.has(index) ? 'is-viewed' : ''}`;
  
  const sourcesHtml = (card.sources || []).map(s => `
    <a href="${sanitizeUrl(s.url)}" target="_blank" rel="noopener noreferrer" class="source-link" onclick="event.stopPropagation()">
      ${s.title}
    </a>
  `).join('');

  cardEl.innerHTML = `
    <div class="flashcard-inner">
      <div class="flashcard-front">
        <div class="card-top">
          <span class="card-label">CARD ${index + 1}</span>
          <span class="material-symbols-rounded status-check">check_circle</span>
        </div>
        <div class="term"><div>${card.term}</div></div>
      </div>
      <div class="flashcard-back">
        <div class="card-top"><span class="def-label">${card.term}</span></div>
        <div class="definition"><div>${card.definition}</div></div>
        ${sourcesHtml ? `<div class="card-sources"><span class="card-label" style="width: 100%;">Sources</span>${sourcesHtml}</div>` : ''}
      </div>
    </div>
  `;

  cardEl.addEventListener('click', () => {
    cardEl.classList.toggle('flipped');
    if (!viewedCards.has(index)) {
      viewedCards.add(index);
      cardEl.classList.add('is-viewed');
      updateStudyProgress();
      saveSession(topic);
    }
  });

  return cardEl;
}

function renderDeck(data: GenerationResponse, topic: string) {
  flashcardsContainer.innerHTML = '';
  
  // Render Overview
  overviewTitle.textContent = topic;
  overviewText.innerHTML = data.overview;
  overviewSources.innerHTML = (data.overviewSources || []).map(s => `
    <a href="${sanitizeUrl(s.url)}" target="_blank" rel="noopener noreferrer" class="source-link">
      <span class="material-symbols-rounded" style="font-size: 14px; margin-right: 4px;">link</span>
      ${s.title}
    </a>
  `).join('');
  
  // Render Cards
  cardCountLabel.textContent = data.flashcards.length.toString();
  data.flashcards.forEach((card, index) => {
    flashcardsContainer.appendChild(createCardElement(card, index, topic));
  });
  
  updateStudyProgress();
}

async function handleGenerate(isRegenerate = false) {
  const topic = topicInput.value.trim() || currentTopic;
  const quantity = quantitySelector.value;
  
  if (!topic) return alert("Enter a subject first.");
  if (generateButton.disabled || regenerateCardsButton.disabled) return;

  if (isRegenerate) {
    regenerateCardsButton.disabled = true;
  } else {
    generateButton.disabled = true;
    usedTerms.clear(); // Fresh start for new subject
  }
  
  startLoadingSimulation();
  currentTopic = topic;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Construct avoid list
    const avoidListStr = Array.from(usedTerms).length > 0 
      ? `DO NOT use or repeat the following terms as they have already been generated for this user: ${Array.from(usedTerms).join(', ')}.`
      : "";

    const systemInstruction = `You are a world-class academic expert. 
      Subject: "${topic}".
      Difficulty: ${selectedDifficulty.toUpperCase()}.

      CRITICAL TASK: 
      1. Provide a comprehensive 'overview' summary of the subject grounded EXCLUSIVELY in factual, verified research. 
      2. Provide 'overviewSources' (2-3 links) to reliable academic or established news sources.
      3. Generate exactly ${quantity} info cards with verified 'term', 'definition', and specific verified 'sources' for EACH.
      
      ACCURACY WARNING: 
      Strictly avoid hallucinations. If you are unsure about a specific detail or source, omit it rather than providing incorrect information. All content must be educational and accurate.

      ${avoidListStr}
      Focus on fresh content, alternative perspectives, or deeper concepts related to the subject.

      Format: JSON { "overview": string, "overviewSources": [{url, title}], "flashcards": [{term, definition, sources: [{url, title}]}] }`;

    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: `Generate ${isRegenerate ? 'a fresh set of' : 'a mastery'} deck for: ${topic}`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overview: { type: Type.STRING },
            overviewSources: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, title: { type: Type.STRING } }, required: ["url", "title"] }
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, title: { type: Type.STRING } }, required: ["url", "title"] } }
                },
                required: ["term", "definition", "sources"]
              }
            }
          },
          required: ["overview", "overviewSources", "flashcards"]
        }
      },
    });

    const data: GenerationResponse = JSON.parse(result.text || '{}');
    
    // Add new terms to usedTerms
    data.flashcards.forEach(card => usedTerms.add(card.term.toLowerCase()));

    currentDeck = data;
    viewedCards.clear();
    renderDeck(data, topic);
    saveSession(topic);
    stopLoadingSimulation();
    regenerateCardsButton.classList.remove('hidden');
    tenMoreButton.classList.remove('hidden');
    
    // Uncollapse panels once content is ready
    overviewSection.classList.remove('is-collapsed');
    resultsSection.classList.remove('is-collapsed');
    
  } catch (error: any) {
    console.error(error);
    stopLoadingSimulation();
    errorMessage.textContent = `API Error: ${error.message}`;
    errorMessage.style.color = 'var(--accent-orange)';
  } finally {
    generateButton.disabled = false;
    regenerateCardsButton.disabled = false;
  }
}

async function handleMoreInfo() {
  if (!currentTopic || moreInfoButton.disabled) return;
  
  moreInfoButton.disabled = true;
  const originalHtml = moreInfoButton.innerHTML;
  moreInfoButton.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s infinite linear;">sync</span> Researching...`;
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: `Provide more advanced or niche historical/technical information about: ${currentTopic}. Focus on depth and factual verification.`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are extending a study overview. Provide only the new, verified information. Keep it under 150 words."
      }
    });

    const newText = response.text || "";
    const container = document.createElement('div');
    container.style.marginTop = "20px";
    container.style.paddingTop = "10px";
    container.innerHTML = `<strong>Extended Insights:</strong><br>${newText}`;
    overviewText.appendChild(container);
    
    // Save updated overview text in session
    if (currentDeck) {
      currentDeck.overview = overviewText.innerHTML;
      saveSession(currentTopic);
    }
  } catch (e) {
    console.error("Failed to fetch more info", e);
  } finally {
    moreInfoButton.disabled = false;
    moreInfoButton.innerHTML = originalHtml;
  }
}

async function handleTenMore() {
  if (!currentTopic || !currentDeck || tenMoreButton.disabled) return;
  
  tenMoreButton.disabled = true;
  const originalHtml = tenMoreButton.innerHTML;
  tenMoreButton.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s infinite linear;">sync</span> Growing Deck...`;
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const avoidListStr = `DO NOT use or repeat any of these terms: ${Array.from(usedTerms).join(', ')}.`;

    const systemInstruction = `You are extending a study deck. 
      Subject: "${currentTopic}".
      Difficulty: ${selectedDifficulty.toUpperCase()}.

      CRITICAL TASK: 
      Generate exactly 10 NEW info cards that were NOT in the previous set. 
      Focus on more specific details, niche sub-topics, or advanced applications.
      
      ${avoidListStr}

      Format: JSON { "flashcards": [{term, definition, sources: [{url, title}]}] }`;

    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: `Generate 10 additional cards for the ${currentTopic} deck.`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, title: { type: Type.STRING } }, required: ["url", "title"] } }
                },
                required: ["term", "definition", "sources"]
              }
            }
          },
          required: ["flashcards"]
        }
      },
    });

    const data = JSON.parse(result.text || '{}');
    const newCards: Flashcard[] = data.flashcards || [];

    // Append to existing deck state
    const startIndex = currentDeck.flashcards.length;
    newCards.forEach((card, i) => {
      const actualIndex = startIndex + i;
      currentDeck!.flashcards.push(card);
      usedTerms.add(card.term.toLowerCase());
      flashcardsContainer.appendChild(createCardElement(card, actualIndex, currentTopic));
    });

    cardCountLabel.textContent = currentDeck.flashcards.length.toString();
    updateStudyProgress();
    saveSession(currentTopic);
    
  } catch (e) {
    console.error("Failed to fetch 10 more cards", e);
  } finally {
    tenMoreButton.disabled = false;
    tenMoreButton.innerHTML = originalHtml;
  }
}

// Global Event Listeners
themeToggle.addEventListener('click', () => {
  const current = document.body.className;
  const next = current === 'dark-mode' ? 'light-mode' : 'dark_mode';
  document.body.className = next;
  localStorage.setItem('study_deck_theme', next);
  updateThemeIcon(next);
});

difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    difficultyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = (btn as HTMLButtonElement).dataset.level || 'medium';
  });
});

overviewToggle.addEventListener('click', () => overviewSection.classList.toggle('is-collapsed'));
resultsToggle.addEventListener('click', () => resultsSection.classList.toggle('is-collapsed'));

generateButton.addEventListener('click', () => handleGenerate(false));
regenerateCardsButton.addEventListener('click', () => handleGenerate(true));

if (moreInfoButton) {
  moreInfoButton.addEventListener('click', handleMoreInfo);
}

if (tenMoreButton) {
  tenMoreButton.addEventListener('click', handleTenMore);
}

if (clearSubjectButton) {
  clearSubjectButton.addEventListener('click', () => {
    performDeepClear();
  });
}

topicInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    // Provide visual feedback for the generate button
    generateButton.classList.add('active-feedback');
    setTimeout(() => {
      generateButton.classList.remove('active-feedback');
      handleGenerate(false);
    }, 150);
  }
});

// Initialize app
init();