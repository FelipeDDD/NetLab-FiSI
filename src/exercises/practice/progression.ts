import { createQuestion, type Question } from './model';
import { randomPracticeSeed, retryPracticeSeed } from './seeds';

/** UI-only progression: preserve the generator contract and avoid consecutive duplicate problems. */
export function nextQuestion(current: Question, seed: string = randomPracticeSeed()): Question {
  // ND02 includes recipe metadata; a new seed alone is not new visible content.
  const content=(q:Question)=>JSON.stringify(q.kind==='boundaries'?q.data:q.problem);
  const previous = content(current);
  for (let i = 0; i < 32; i++) {
    const question = createQuestion(current.kind, retryPracticeSeed(seed,i), current.recipe.difficulty, current.recipe.version);
    if (question.id !== current.id && content(question) !== previous) return question;
  }
  throw Error('No distinct variant available');
}
