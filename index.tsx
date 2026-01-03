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

interface GenerationResponse {
  overview: string;
  overviewSources: FlashcardSource[];
  flashcards: Flashcard[];
}

const topicInput = document.getElementById('topicInput') as HTMLInputElement;
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
const cardCountLabel = document.getElementById('cardCountLabel') as HTMLSpanElement;

// Overview elements
const overviewSection = document.getElementById('overviewSection') as HTMLElement;
const overviewToggle = document.getElementById('overviewToggle') as HTMLElement;
const overviewTitle = document.getElementById('overviewTitle') as HTMLHeadingElement;
const overviewText = document.getElementById('overviewText') as HTMLParagraphElement;
const overviewSources = document.getElementById('overviewSources') as HTMLDivElement;

let selectedDifficulty = 'medium';
let selectedModel = 'gemini-3-flash-preview';
let viewedCards = new Set<number>();
let totalGeneratedCards = 0;
let loadingInterval: number | null = null;

function updateProgress(percent: number) {
  if (!loadingCircle) return;
  const radius = 32;
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
    errorMessage.textContent = 'Deck Mastered! 🎉';
    errorMessage.style.color = 'var(--accent-purple)';
    ringLabel.textContent = 'Done';
  } else {
    errorMessage.textContent = `${viewedCards.size} / ${totalGeneratedCards} Reviewed`;
    errorMessage.style.color = 'var(--text-dim)';
  }
}

function startLoadingSimulation() {
  let progress = 0;
  const stages = [
    { threshold: 15, msg: "Initializing..." },
    { threshold: 35, msg: "Searching web..." },
    { threshold: 60, msg: "Synthesizing..." },
    { threshold: 85, msg: "Validating..." },
    { threshold: 99, msg: "Polishing..." }
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

// Toggle functionality for the overview section
overviewToggle.addEventListener('click', () => {
  overviewSection.classList.toggle('is-collapsed');
});

generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  const quantity = quantitySelector?.value || "10";
  
  if (!topic) {
    errorMessage.textContent = 'Enter a topic...';
    errorMessage.style.color = 'var(--accent-orange)';
    return;
  }

  flashcardsContainer.innerHTML = '';
  overviewSection.classList.add('hidden');
  overviewSection.classList.remove('is-collapsed'); // Reset collapse state for new content
  generateButton.disabled = true;
  viewedCards.clear();
  totalGeneratedCards = 0;
  errorMessage.style.color = 'var(--text-dim)';
  
  startLoadingSimulation();

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are a world-class educational AI. 
      Subject: "${topic}".
      Difficulty: ${selectedDifficulty.toUpperCase()}.

      TASK:
      1. Provide a comprehensive 'overview' of the subject. This should act as a "primer" for the student, covering the key context, significance, and core concepts. Use 2-4 rich paragraphs.
      2. Provide 'overviewSources' (2-3 links) that offer further deep reading on the subject overview.
      3. Generate exactly ${quantity} flashcards with verified 'term', 'definition', and specific verified 'sources'.

      LINK VALIDATION PROTOCOL:
      - ONLY use live, active URLs. No hallucinated links.
      - Display Text ('title'): Use the name of the website/journal (e.g. "Smithsonian", "MIT Technology Review").
      - Ensure the URL leads to the actual topic content.

      Format: JSON { "overview": string, "overviewSources": [{url, title}], "flashcards": [{term, definition, sources: [{url, title}]}] }`;

    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: `Generate a full learning session for: "${topic}".`,
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
              items: {
                type: Type.OBJECT,
                properties: {
                  url: { type: Type.STRING },
                  title: { type: Type.STRING }
                },
                required: ["url", "title"]
              }
            },
            flashcards: {
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
          required: ["overview", "overviewSources", "flashcards"]
        }
      },
    });

    const responseText = result.text;
    if (!responseText) throw new Error("Generation failed");

    const data: GenerationResponse = JSON.parse(responseText);

    stopLoadingSimulation();

    // Render Overview
    overviewTitle.textContent = topic;
    overviewText.textContent = data.overview;
    overviewSources.innerHTML = data.overviewSources.map(s => `
      <a href="${s.url}" target="_blank" class="source-link">
        <span class="material-symbols-rounded" style="font-size: 14px; margin-right: 4px;">link</span>
        ${s.title}
      </a>
    `).join('');
    overviewSection.classList.remove('hidden');

    // Render Cards
    if (data.flashcards.length > 0) {
      totalGeneratedCards = data.flashcards.length;
      cardCountLabel.textContent = totalGeneratedCards.toString();
      
      data.flashcards.forEach((flashcard, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('flashcard');

        const cardInner = document.createElement('div');
        cardInner.classList.add('flashcard-inner');

        const sourcesHtml = flashcard.sources && flashcard.sources.length > 0 
          ? `<div class="card-sources">
              <span class="source-label">Verification:</span>
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
