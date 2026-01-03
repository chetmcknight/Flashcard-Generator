/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type } from '@google/genai';

interface Flashcard {
  term: string;
  definition: string;
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

let selectedDifficulty = 'medium';
let selectedModel = 'gemini-3-flash-preview';
let viewedCards = new Set<number>();
let totalGeneratedCards = 0;

function updateProgress(percent: number) {
  if (!loadingCircle) return;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  loadingCircle.style.strokeDashoffset = offset.toString();
}

function updateStudyProgress() {
  if (totalGeneratedCards === 0) return;
  const percent = (viewedCards.size / totalGeneratedCards) * 100;
  updateProgress(percent);
  
  if (viewedCards.size === totalGeneratedCards) {
    errorMessage.textContent = 'All cards completed! 🎉';
    errorMessage.style.color = 'var(--accent-purple)';
  } else {
    errorMessage.textContent = `Study Progress: ${viewedCards.size} / ${totalGeneratedCards}`;
    errorMessage.style.color = 'var(--text-dim)';
  }
}

// Handle difficulty selection
difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    difficultyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = (btn as HTMLButtonElement).dataset.level || 'medium';
  });
});

// Handle model selection
modelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modelButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedModel = (btn as HTMLButtonElement).dataset.model || 'gemini-3-flash-preview';
    
    // Update UI badge
    const modelName = selectedModel.includes('pro') ? 'Gemini 3 Pro' : 'Gemini 3 Flash';
    if (activeModelBadge) activeModelBadge.textContent = modelName;
  });
});

generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  const quantity = quantitySelector?.value || "10";
  
  if (!topic) {
    errorMessage.textContent = 'Awaiting input...';
    errorMessage.style.color = 'var(--text-dim)';
    return;
  }

  errorMessage.textContent = `Generating ${quantity} cards...`;
  errorMessage.style.color = 'var(--text-dim)';
  flashcardsContainer.innerHTML = '';
  generateButton.disabled = true;
  viewedCards.clear();
  totalGeneratedCards = 0;
  updateProgress(5);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `You are a high-performance educational AI. Generate exactly ${quantity} high-quality, unique flashcards for the given topic.
      Adjust complexity for level: ${selectedDifficulty.toUpperCase()}.
      - EASY: Use simple analogies, avoid jargon, focus on core concepts.
      - MEDIUM: Standard academic level with precise terminology.
      - HARD: Deep-dive conceptual definitions, advanced jargon, and complex relationships.
      Return ONLY a JSON array with "term" and "definition" keys. Keep definitions concise.`;

    updateProgress(30);
    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: `Generate ${quantity} flashcards for: "${topic}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              definition: { type: Type.STRING }
            },
            required: ["term", "definition"]
          }
        }
      },
    });

    const responseText = result.text;
    updateProgress(80);
    if (!responseText) throw new Error("Connection failed");

    const flashcards: Flashcard[] = JSON.parse(responseText);

    if (flashcards.length > 0) {
      totalGeneratedCards = flashcards.length;
      flashcards.forEach((flashcard, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('flashcard');

        const cardInner = document.createElement('div');
        cardInner.classList.add('flashcard-inner');

        const cardFront = document.createElement('div');
        cardFront.classList.add('flashcard-front');
        cardFront.innerHTML = `
          <div class="card-top">
            <span class="card-date">${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <div class="card-icon"><span class="material-symbols-rounded" style="font-size:14px">school</span></div>
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
        `;

        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        cardDiv.appendChild(cardInner);
        flashcardsContainer.appendChild(cardDiv);

        cardDiv.addEventListener('click', () => {
          const isFlipped = cardDiv.classList.contains('flipped');
          cardDiv.classList.toggle('flipped');
          
          // Only count as viewed if it was flipped to show the back for the first time
          if (!isFlipped && !viewedCards.has(index)) {
            viewedCards.add(index);
            updateStudyProgress();
          }
        });
      });
      // Initialize study progress state at 0% after generation
      updateStudyProgress();
    } else {
      errorMessage.textContent = 'No cards generated.';
      updateProgress(0);
    }
  } catch (error: any) {
    errorMessage.textContent = `Error: ${error.message}`;
    errorMessage.style.color = 'var(--accent-orange)';
    updateProgress(0);
  } finally {
    generateButton.disabled = false;
  }
});