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
  sources?: FlashcardSource[];
}

const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const difficultyButtons = document.querySelectorAll('#difficultySelector .pill-btn');
const modelButtons = document.querySelectorAll('#modelSelector .pill-btn');
const quantitySelector = document.getElementById('quantitySelector') as HTMLSelectElement;
const activeModelBadge = document.getElementById('activeModelBadge') as HTMLDivElement;
const loadingCircle = document.getElementById('loadingCircle') as unknown as SVGCircleElement;
const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
const ringLabel = document.getElementById('ringLabel') as HTMLDivElement;

let selectedDifficulty = 'medium';
let selectedModel = 'gemini-3-flash-preview';
let viewedCards = new Set<number>();
let totalGeneratedCards = 0;
let loadingInterval: number | null = null;

function updateProgress(percent: number) {
  if (!loadingCircle) return;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  loadingCircle.style.strokeDashoffset = offset.toString();
}

function updateStudyProgress() {
  if (totalGeneratedCards === 0) {
    ringLabel.textContent = 'AI';
    return;
  }
  const percent = Math.round((viewedCards.size / totalGeneratedCards) * 100);
  updateProgress(percent);
  ringLabel.textContent = `${percent}%`;
  
  if (viewedCards.size === totalGeneratedCards) {
    errorMessage.textContent = 'All cards completed! 🎉';
    errorMessage.style.color = 'var(--accent-purple)';
    ringLabel.textContent = 'Done';
  } else {
    errorMessage.textContent = `Study Progress: ${viewedCards.size} / ${totalGeneratedCards}`;
    errorMessage.style.color = 'var(--text-dim)';
  }
}

function startLoadingSimulation() {
  let progress = 0;
  const stages = [
    { threshold: 15, msg: "Initializing Gemini..." },
    { threshold: 35, msg: "Verifying web sources..." },
    { threshold: 60, msg: "Synthesizing definitions..." },
    { threshold: 85, msg: "Validating link health..." },
    { threshold: 99, msg: "Finalizing deck..." }
  ];

  progressContainer.classList.add('is-loading');
  ringLabel.textContent = "0%";
  
  loadingInterval = window.setInterval(() => {
    const increment = progress < 80 ? Math.random() * 3 : Math.random() * 0.5;
    progress = Math.min(99, progress + increment);
    
    updateProgress(progress);
    ringLabel.textContent = `${Math.floor(progress)}%`;
    
    const stage = stages.find(s => progress <= s.threshold) || stages[stages.length - 1];
    errorMessage.textContent = stage.msg;
  }, 200);
}

function stopLoadingSimulation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  progressContainer.classList.remove('is-loading');
}

difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    difficultyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = (btn as HTMLButtonElement).dataset.level || 'medium';
  });
});

modelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modelButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedModel = (btn as HTMLButtonElement).dataset.model || 'gemini-3-flash-preview';
    
    const modelName = selectedModel.includes('pro') ? 'Gemini 3 Pro' : 'Gemini 3 Flash';
    if (activeModelBadge) activeModelBadge.textContent = modelName;
  });
});

generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  const quantity = quantitySelector?.value || "10";
  
  if (!topic) {
    errorMessage.textContent = 'Please enter a topic...';
    errorMessage.style.color = 'var(--text-dim)';
    return;
  }

  flashcardsContainer.innerHTML = '';
  generateButton.disabled = true;
  viewedCards.clear();
  totalGeneratedCards = 0;
  errorMessage.style.color = 'var(--text-dim)';
  
  startLoadingSimulation();

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are a high-fidelity academic AI specialized in verified knowledge retrieval. 
      Generate exactly ${quantity} flashcards for: "${topic}".
      Difficulty: ${selectedDifficulty.toUpperCase()}.

      LINK VALIDATION PROTOCOL:
      1. Use Google Search to find ACTUAL articles. 
      2. ABSOLUTELY NO HALLUCINATED URLS. If you cannot find a direct, functioning link for a specific term, omit the source for that card rather than providing a broken one.
      3. No generic root domains (e.g., just "google.com" or "wikipedia.org"). Links must be specific to the term.
      4. Display Text: The 'title' field MUST be the specific name of the website (e.g., "National Geographic", "NASA", "Stanford Encyclopedia of Philosophy").
      5. The links MUST NOT result in "Page Not Found". Favor long-standing educational institutions.

      Format: JSON array of objects with "term", "definition", and "sources" (array of {url, title} objects).`;

    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: `Generate ${quantity} flashcards for: "${topic}". Perform a deep search to ensure all source links are active and high-quality.`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              definition: { type: Type.STRING },
              sources: { 
                type: Type.ARRAY, 
                items: {
                  type: Type.OBJECT,
                  properties: {
                    url: { type: Type.STRING },
                    title: { type: Type.STRING }
                  },
                  required: ["url", "title"]
                }
              }
            },
            required: ["term", "definition", "sources"]
          }
        }
      },
    });

    const responseText = result.text;
    if (!responseText) throw new Error("Connection failed");

    const flashcards: Flashcard[] = JSON.parse(responseText);

    stopLoadingSimulation();

    if (flashcards.length > 0) {
      totalGeneratedCards = flashcards.length;
      flashcards.forEach((flashcard, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('flashcard');

        const cardInner = document.createElement('div');
        cardInner.classList.add('flashcard-inner');

        const sourcesHtml = flashcard.sources && flashcard.sources.length > 0 
          ? `<div class="card-sources">
              <span class="source-label">Sources:</span>
              ${flashcard.sources.map(s => `
                <a href="${s.url}" target="_blank" class="source-link" onclick="event.stopPropagation()">
                  ${s.title}
                </a>`).join('')}
             </div>`
          : '';

        const cardFront = document.createElement('div');
        cardFront.classList.add('flashcard-front');
        cardFront.innerHTML = `
          <div class="card-top">
            <span></span>
            <div class="card-status-indicator">
              <span class="material-symbols-rounded status-check">check_circle</span>
            </div>
          </div>
          <div class="term">${flashcard.term}</div>
        `;

        const cardBack = document.createElement('div');
        cardBack.classList.add('flashcard-back');
        cardBack.innerHTML = `
          <div class="card-top">
             <span class="def-label">Definition</span>
          </div>
          <div class="definition">${flashcard.definition}</div>
          ${sourcesHtml}
        `;

        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        cardDiv.appendChild(cardInner);
        flashcardsContainer.appendChild(cardDiv);

        cardDiv.addEventListener('click', () => {
          const currentlyFlipped = cardDiv.classList.contains('flipped');
          cardDiv.classList.toggle('flipped');
          
          if (!currentlyFlipped && !viewedCards.has(index)) {
            viewedCards.add(index);
            cardDiv.classList.add('is-viewed');
            updateStudyProgress();
          }
        });
      });
      
      updateStudyProgress();
    } else {
      errorMessage.textContent = 'No cards generated.';
      updateProgress(0);
      ringLabel.textContent = 'AI';
    }
  } catch (error: any) {
    console.error(error);
    stopLoadingSimulation();
    errorMessage.textContent = `Error: ${error.message}`;
    errorMessage.style.color = 'var(--accent-orange)';
    updateProgress(0);
    ringLabel.textContent = 'Err';
  } finally {
    generateButton.disabled = false;
  }
});
